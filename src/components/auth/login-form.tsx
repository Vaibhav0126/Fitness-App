"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { FormError, FormField } from "./form-field";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const email = String(form.get("email") ?? "");
        setPending(true);
        setError(null);
        const { error } = await authClient.signIn.email({
          email,
          password: String(form.get("password") ?? ""),
          callbackURL: next,
        });
        setPending(false);
        if (error) {
          if (error.status === 403) {
            setUnverified(email);
            setError("Please verify your email first. We've sent you a new link.");
          } else setError(error.message ?? "Couldn't log in. Check your email and password.");
          return;
        }
        router.push(next);
        router.refresh();
      }}
    >
      <FormField id="email" label="Email" type="email" autoComplete="email" required />
      <FormField id="password" label="Password" type="password" autoComplete="current-password" required />
      <FormError message={error} />
      {unverified ? (
        <Link className="text-sm underline" href={`/verify?email=${encodeURIComponent(unverified)}`}>
          Didn&apos;t get it? Resend the verification email
        </Link>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </Button>
      <Link href="/reset-password" className="text-sm text-muted-foreground underline">
        Forgot your password?
      </Link>
    </form>
  );
}
