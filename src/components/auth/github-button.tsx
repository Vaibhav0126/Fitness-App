"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

export function GitHubButton({ callbackURL = "/app" }: { callbackURL?: string }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signIn.social({ provider: "github", callbackURL });
        setPending(false);
      }}
    >
      Continue with GitHub
    </Button>
  );
}
