import type { Metadata } from "next";
import Link from "next/link";
import { GitHubButton } from "@/components/auth/github-button";
import { LoginForm } from "@/components/auth/login-form";
import { githubEnabled } from "@/lib/auth/features";

export const metadata: Metadata = { title: "Log in" };

const safeNext = (n: string | string[] | undefined) =>
  typeof n === "string" && n.startsWith("/app") && !n.startsWith("//") ? n : "/app";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = safeNext((await searchParams).next);
  return (
    <>
      <h1 className="text-xl font-semibold">Log in</h1>
      {githubEnabled() ? (
        <>
          <GitHubButton callbackURL={next} />
          <p className="text-center text-xs text-muted-foreground">or with email</p>
        </>
      ) : null}
      <LoginForm next={next} />
      <p className="text-sm text-muted-foreground">
        New here?{" "}
        <Link className="underline" href="/signup">
          Create an account
        </Link>
      </p>
    </>
  );
}
