"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { FormError, FormField } from "./form-field";

export function RequestResetForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (sent) {
    return (
      <p className="text-sm">
        If an account exists for that email, a reset link is on its way. It expires in one hour.
      </p>
    );
  }
  return (
    <form
      method="post"
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const email = String(new FormData(e.currentTarget).get("email") ?? "");
        const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
        if (error && error.status !== 404) setError(error.message ?? "Something went wrong.");
        else setSent(true);
      }}
    >
      <FormField id="email" label="Email" type="email" autoComplete="email" required />
      <FormError message={error} />
      <Button type="submit">Send reset link</Button>
    </form>
  );
}

export function SetPasswordForm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (done) {
    return (
      <p className="text-sm">
        Password updated. You can now{" "}
        <Link className="underline" href="/login">
          log in
        </Link>
        .
      </p>
    );
  }
  return (
    <form
      method="post"
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const newPassword = String(new FormData(e.currentTarget).get("password") ?? "");
        const { error } = await authClient.resetPassword({ newPassword, token });
        if (error) setError(error.message ?? "This link is invalid or has expired.");
        else setDone(true);
      }}
    >
      <FormField
        id="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        hint="At least 10 characters."
      />
      <FormError message={error} />
      <Button type="submit">Set new password</Button>
    </form>
  );
}
