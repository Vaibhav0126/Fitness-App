import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { DEMO_EMAIL } from "../demo/constants";

/**
 * POST /api/auth/demo/sign-in: starts a browser-session-only session for the seeded,
 * read-only demo user. The demo user has no password; this endpoint is the only way in.
 * Writes are blocked server-side for `isDemo` users (src/server/dal.ts).
 */
export const demoPlugin = () =>
  ({
    id: "demo",
    endpoints: {
      demoSignIn: createAuthEndpoint("/demo/sign-in", { method: "POST" }, async (ctx) => {
        const found = await ctx.context.internalAdapter.findUserByEmail(DEMO_EMAIL);
        if (!found || !(found.user as { isDemo?: boolean }).isDemo) {
          throw new APIError("NOT_FOUND", { message: "The demo account isn't set up. Run pnpm db:seed." });
        }
        const session = await ctx.context.internalAdapter.createSession(found.user.id, true);
        await setSessionCookie(ctx, { session, user: found.user }, true);
        return ctx.json({ ok: true });
      }),
    },
    rateLimit: [{ pathMatcher: (path) => path === "/demo/sign-in", window: 60, max: 10 }],
  }) satisfies BetterAuthPlugin;
