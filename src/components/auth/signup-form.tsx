"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { FormError, FormField } from "./form-field";

export function SignupForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
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
        const { error } = await authClient.signUp.email({
          name: String(form.get("name") ?? ""),
          email,
          password: String(form.get("password") ?? ""),
          callbackURL: "/app",
        });
        setPending(false);
        if (error) {
          setError(error.message ?? "Couldn't create your account.");
          return;
        }
        router.push(`/verify?email=${encodeURIComponent(email)}`);
      }}
    >
      <FormField id="name" label="Name" autoComplete="name" required />
      <FormField id="email" label="Email" type="email" autoComplete="email" required />
      <FormField
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        hint="At least 10 characters."
      />
      <FormError message={error} />
      <Button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
