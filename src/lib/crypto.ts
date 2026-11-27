import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/*
 * AES-256-GCM for third-party credentials at rest, with key rotation.
 * Ciphertext format: `${keyId}:${iv}:${tag}:${data}` (base64url parts).
 * keyId is the first 8 hex chars of SHA-256(key), so any configured key
 * (current or previous) can be selected for decryption.
 */

export interface KeyRing {
  current: string;
  previous?: string | undefined;
}

const keyBytes = (b64: string): Buffer => {
  const k = Buffer.from(b64, "base64");
  if (k.length !== 32) throw new Error("encryption key must be 32 bytes (base64)");
  return k;
};
const keyId = (k: Buffer) => createHash("sha256").update(k).digest("hex").slice(0, 8);

export function keyRingFromEnv(): KeyRing {
  const current = process.env.ENCRYPTION_KEY;
  if (!current) throw new Error("ENCRYPTION_KEY is not set");
  return { current, previous: process.env.ENCRYPTION_KEY_PREVIOUS || undefined };
}

export function encrypt(plaintext: string, ring: KeyRing = keyRingFromEnv()): string {
  const key = keyBytes(ring.current);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [keyId(key), iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(
    ":",
  );
}

export function decrypt(payload: string, ring: KeyRing = keyRingFromEnv()): string {
  const [id, iv, tag, data] = payload.split(":");
  if (!id || !iv || !tag || data === undefined) throw new Error("malformed ciphertext");
  const candidates = [ring.current, ring.previous].filter((k): k is string => Boolean(k)).map(keyBytes);
  const key = candidates.find((k) => keyId(k) === id);
  if (!key) throw new Error("no configured key matches this ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** True when the ciphertext was made with a key other than the current one. */
export function needsReencrypt(payload: string, ring: KeyRing = keyRingFromEnv()): boolean {
  return payload.split(":")[0] !== keyId(keyBytes(ring.current));
}

/** Upload tokens: 32 random bytes, shown once; only the SHA-256 is stored. */
export function generateToken(prefix = "trn"): { token: string; hash: string; lastFour: string } {
  const token = `${prefix}_${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashToken(token), lastFour: token.slice(-4) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
