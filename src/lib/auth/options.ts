import type { BetterAuthOptions } from "better-auth";
import { sendEmail } from "../email/send";
import { demoGuard } from "./demo-guard";
import { resetPasswordTemplate, verifyEmailTemplate } from "../email/templates";

/**
 * Better Auth options without the database adapter, so the schema check
 * (test/unit/auth-schema.test.ts) can derive the expected tables without a DB.
 */
export function authOptions() {
  const githubConfigured = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
  return {
    appName: "Train",
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    telemetry: { enabled: false },
    hooks: { before: demoGuard },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({ to: user.email, ...resetPasswordTemplate(url) });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail({ to: user.email, ...verifyEmailTemplate(url) });
      },
    },
    socialProviders: githubConfigured
      ? {
          github: {
            clientId: process.env.GITHUB_CLIENT_ID ?? "",
            clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
          },
        }
      : undefined,
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        // Implicit linking needs GitHub to report the email as verified AND the local
        // row to be verified (Better Auth's requireLocalEmailVerified default).
        allowDifferentEmails: false,
      },
    },
    user: {
      additionalFields: {
        isDemo: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/request-password-reset": { window: 300, max: 3 },
        "/send-verification-email": { window: 300, max: 3 },
      },
    },
    advanced: {
      useSecureCookies: process.env.NODE_ENV === "production",
    },
  } satisfies Omit<BetterAuthOptions, "database">;
}
