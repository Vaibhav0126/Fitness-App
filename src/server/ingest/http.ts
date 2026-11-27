import "server-only";
import { DemoReadOnlyError } from "../dal";
import { hit, rateLimitHeaders, type RateLimitResult, tooManyRequests } from "../rate-limit";
import { resolveToken, type TokenOwner } from "../tokens";

/*
 * Shared plumbing for the Bearer-token ingest endpoints:
 *   1. a per-IP limit on failed authentication (slows token guessing and junk traffic);
 *   2. token → user (revoked tokens, unverified users and the demo user are refused);
 *   3. a per-token, per-endpoint request limit;
 *   4. a hard body-size cap, enforced while reading (Content-Length can be absent or wrong).
 */

export const AUTH_FAIL_LIMIT = { limit: 20, windowSeconds: 600 };

export interface IngestLimits {
  /** Endpoint name, part of the rate-limit key. */
  name: string;
  perToken: { limit: number; windowSeconds: number };
  maxBytes: number;
}

export interface IngestContext {
  owner: TokenOwner;
  body: unknown;
  rate: RateLimitResult;
}

const json = (status: number, body: Record<string, unknown>, headers?: Record<string, string>) =>
  Response.json(body, { status, ...(headers ? { headers } : {}) });

function clientIp(req: Request): string {
  // Vercel sets x-forwarded-for (first hop is the client); fall back to a shared bucket.
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown"
  );
}

export function bearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  const m = h?.match(/^Bearer\s+(\S+)\s*$/i);
  return m?.[1] ?? null;
}

/** Reads at most `maxBytes` of the body; returns null if it's larger. */
export async function readLimited(req: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Authenticates, rate-limits and reads a JSON body. Returns a Response on any failure. */
export async function ingestRequest(req: Request, limits: IngestLimits): Promise<IngestContext | Response> {
  const token = bearer(req);
  const owner = token ? await resolveToken(token) : null;
  if (!owner) {
    const r = await hit(
      `ingest-auth:ip:${clientIp(req)}`,
      AUTH_FAIL_LIMIT.limit,
      AUTH_FAIL_LIMIT.windowSeconds,
    );
    if (!r.ok) return tooManyRequests(r, "Too many failed attempts. Try again later.");
    return json(
      401,
      { error: token ? "Invalid or revoked token" : "Missing Authorization: Bearer <token>" },
      { "WWW-Authenticate": 'Bearer realm="train"' },
    );
  }
  if (owner.isDemo) return json(403, { error: new DemoReadOnlyError().message });
  if (!owner.emailVerified) return json(403, { error: "Verify your email before syncing data" });

  const rate = await hit(
    `${limits.name}:token:${owner.tokenId}`,
    limits.perToken.limit,
    limits.perToken.windowSeconds,
  );
  if (!rate.ok) return tooManyRequests(rate);

  const text = await readLimited(req, limits.maxBytes);
  if (text == null)
    return json(
      413,
      { error: `Body larger than ${Math.round(limits.maxBytes / 1024)} KB` },
      rateLimitHeaders(rate),
    );
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, { error: "Body is not valid JSON" }, rateLimitHeaders(rate));
  }
  return { owner, body, rate };
}
