"use client";
import { useActionState } from "react";
import type { ActionResult } from "@/server/actions/result";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/auth/form-field";
import { cn } from "@/lib/utils";

/** A form bound to a server action returning ActionResult, with pending and result states. */
export function ActionForm({
  action,
  submit,
  children,
  className,
  variant,
}: {
  action: (prev: unknown, form: FormData) => Promise<ActionResult>;
  submit: string;
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "outline" | "secondary";
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={cn("grid gap-4", className)}>
      {children}
      <FormError message={state && !state.ok ? state.error : null} />
      {state?.ok && state.message ? (
        <p role="status" className="text-sm text-good">
          {state.message}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending} variant={variant}>
          {pending ? "Working…" : submit}
        </Button>
      </div>
    </form>
  );
}
