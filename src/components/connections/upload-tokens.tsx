"use client";
import { useActionState, useState, useTransition } from "react";
import { FormError } from "@/components/auth/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createUploadToken, revokeUploadToken } from "@/server/actions/connections";
import { CopyButton } from "./copy-button";

export interface TokenRow {
  id: string;
  name: string;
  lastFour: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never";

export function UploadTokens({ tokens, readOnly }: { tokens: TokenRow[]; readOnly: boolean }) {
  const [state, formAction, pending] = useActionState(createUploadToken, null);
  const [revoking, startRevoke] = useTransition();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const created = state?.ok ? state.data : null;

  return (
    <div className="grid gap-4">
      {created ? (
        <div role="status" className="grid gap-2 rounded-md border border-good/40 bg-good/10 p-3 text-sm">
          <p className="font-medium">
            Token &ldquo;{created.name}&rdquo; created. Copy it now: it won&apos;t be shown again.
          </p>
          <div className="flex min-w-0 items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded bg-background px-2 py-1.5 text-xs whitespace-nowrap">
              {created.token}
            </code>
            <CopyButton value={created.token} />
          </div>
        </div>
      ) : null}

      {tokens.length ? (
        <ul className="grid gap-2">
          {tokens.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <div className="grid min-w-0">
                <span className="font-medium">
                  {t.name} <span className="font-normal text-muted-foreground">…{t.lastFour}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  Created {fmt(t.createdAt)} · last used {fmt(t.lastUsedAt)}
                </span>
              </div>
              {confirm === t.id ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-danger/50 text-danger"
                    disabled={revoking}
                    onClick={() =>
                      startRevoke(async () => {
                        const r = await revokeUploadToken(t.id);
                        setRevokeError(r.ok ? null : r.error);
                        setConfirm(null);
                      })
                    }
                  >
                    {revoking ? "Revoking…" : "Revoke now"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" disabled={readOnly} onClick={() => setConfirm(t.id)}>
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No tokens yet.</p>
      )}
      <FormError message={revokeError} />

      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-48 flex-1 gap-2">
          <Label htmlFor="token-name">New token name</Label>
          <Input
            id="token-name"
            name="name"
            placeholder="iPhone Shortcut"
            maxLength={60}
            required
            disabled={readOnly}
          />
        </div>
        <Button type="submit" disabled={pending || readOnly}>
          {pending ? "Creating…" : "Create token"}
        </Button>
      </form>
      <FormError message={state && !state.ok ? state.error : null} />
      {readOnly ? <p className="text-sm text-muted-foreground">Demo is read-only.</p> : null}
    </div>
  );
}
