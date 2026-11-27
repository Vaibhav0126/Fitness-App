import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "@/lib/auth/server";

/** The current Better Auth session (deduplicated per render pass). */
export const getSession = cache(async () => getAuth().api.getSession({ headers: await headers() }));

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSession>>>["user"];

/** Verified, signed-in user or a redirect to /login. Use in every app page, action and route. */
export const requireUser = cache(async (): Promise<SessionUser> => {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.user.emailVerified) redirect(`/verify?email=${encodeURIComponent(session.user.email)}`);
  return session.user;
});

export class DemoReadOnlyError extends Error {
  constructor() {
    super("The demo account is read-only. Sign up to save your own data.");
    this.name = "DemoReadOnlyError";
  }
}

/** Like requireUser, but rejects the read-only demo user (spec §7: block all demo writes server-side). */
export async function requireWriter(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.isDemo) throw new DemoReadOnlyError();
  return user;
}
