import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";

/**
 * Better Auth endpoints that change the account. The read-only demo user may not call
 * any of them (spec §7); app-level writes are blocked separately in src/server/dal.ts.
 * (`setPassword` is server-only in Better Auth, so it has no HTTP path to guard.)
 */
export const DEMO_BLOCKED_PATHS: ReadonlySet<string> = new Set([
  "/update-user",
  "/change-email",
  "/change-password",
  "/link-social",
  "/unlink-account",
  "/delete-user",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
]);

export const DEMO_READ_ONLY_MESSAGE = "The demo account is read-only. Sign up to use your own.";

/** hooks.before: rejects account-changing requests from a demo session with 403. */
export const demoGuard = createAuthMiddleware(async (ctx) => {
  if (!DEMO_BLOCKED_PATHS.has(ctx.path)) return;
  const session = await getSessionFromCtx(ctx);
  if ((session?.user as { isDemo?: boolean | null } | undefined)?.isDemo) {
    throw new APIError("FORBIDDEN", { message: DEMO_READ_ONLY_MESSAGE });
  }
});
