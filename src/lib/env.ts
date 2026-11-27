import { z } from "zod";

const base64Key = z
  .string()
  .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64-encoded");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32, "use at least 32 characters (openssl rand -base64 32)"),
  BETTER_AUTH_URL: z.url(),
  APP_URL: z.url(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Train <noreply@example.com>"),
  /** Log emails instead of sending them, even in a production build (local `next start`, CI e2e). */
  ALLOW_CONSOLE_EMAIL: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  ENCRYPTION_KEY: base64Key,
  ENCRYPTION_KEY_PREVIOUS: base64Key.optional(),
  CRON_SECRET: z.string().min(16).optional(),
  ADMIN_EMAILS: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/**
 * Validated server environment. Parsed lazily so `next build` can import modules
 * without every secret present; the first runtime access fails loudly if misconfigured.
 */
export function env(): Env {
  if (cached) return cached;
  const raw = Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v]));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
