import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "../db/client";
import * as schema from "../db/schema";
import { demoPlugin } from "./demo-plugin";
import { authOptions } from "./options";

function createAuth() {
  const options = authOptions();
  return betterAuth({
    ...options,
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),
    // nextCookies must stay last so Server Actions can set cookies.
    plugins: [demoPlugin(), nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { __trainAuth?: Auth };

/** Lazily constructed so importing this module (e.g. during `next build`) needs no env. */
export function getAuth(): Auth {
  globalForAuth.__trainAuth ??= createAuth();
  return globalForAuth.__trainAuth;
}

export type Session = Auth["$Infer"]["Session"];
