import type { Metadata } from "next";
import Link from "next/link";
import { GitHubButton } from "@/components/auth/github-button";
import { SignupForm } from "@/components/auth/signup-form";
import { githubEnabled } from "@/lib/auth/features";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Create your account</h1>
      {githubEnabled() ? (
        <>
          <GitHubButton />
          <p className="text-center text-xs text-muted-foreground">or with email</p>
        </>
      ) : null}
      <SignupForm />
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link className="underline" href="/login">
          Log in
        </Link>
      </p>
    </>
  );
}
