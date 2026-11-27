"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

export function ResendVerification({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "pending" | "sent" | "error">("idle");
  return (
    <div className="grid gap-2">
      <Button
        variant="outline"
        disabled={state === "pending" || state === "sent" || !email}
        onClick={async () => {
          setState("pending");
          const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/app" });
          setState(error ? "error" : "sent");
        }}
      >
        {state === "sent" ? "Sent. Check your inbox" : "Resend verification email"}
      </Button>
      {state === "error" ? (
        <p role="alert" className="text-sm text-danger">
          Couldn&apos;t send right now. Try again in a few minutes.
        </p>
      ) : null}
    </div>
  );
}
