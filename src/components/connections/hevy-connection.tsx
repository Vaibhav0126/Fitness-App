"use client";
import { useActionState, useState, useTransition } from "react";
import { FormError } from "@/components/auth/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { connectHevy, disconnectHevyAction, syncHevyNow } from "@/server/actions/connections";
import type { ActionResult } from "@/server/actions/result";

export interface HevyView {
  connected: boolean;
  lastFour: string | null;
  status: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  syncing: boolean;
}

export function HevyConnection({ hevy, readOnly }: { hevy: HevyView; readOnly: boolean }) {
  const [state, formAction, pending] = useActionState(connectHevy, null);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [replacing, setReplacing] = useState(false);

  const act = (fn: () => Promise<ActionResult<{ message: string }> | ActionResult>) =>
    start(async () => {
      const r = await fn();
      setMsg(
        r.ok
          ? { ok: true, text: (r.data && "message" in r.data ? r.data.message : r.message) ?? "Done." }
          : { ok: false, text: r.error },
      );
    });

  const keyForm = (
    <form action={formAction} className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor="hevy-key">Hevy API key</Label>
        <Input
          id="hevy-key"
          name="apiKey"
          type="password"
          autoComplete="off"
          spellCheck={false}
          required
          disabled={readOnly}
          aria-describedby="hevy-key-hint"
        />
        <p id="hevy-key-hint" className="text-xs text-muted-foreground">
          Needs Hevy Pro. Get it at hevy.com → Settings → Developer (developers.hevy.com → API key). Checked
          with one request, stored encrypted, and only the last 4 characters are ever shown.
        </p>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || readOnly}>
          {pending ? "Checking and syncing…" : hevy.connected ? "Replace key" : "Connect Hevy"}
        </Button>
        {replacing ? (
          <Button type="button" variant="ghost" onClick={() => setReplacing(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
      <FormError message={state && !state.ok ? state.error : null} />
    </form>
  );

  if (!hevy.connected) return keyForm;

  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Key</dt>
        <dd>…{hevy.lastFour}</dd>
        <dt className="text-muted-foreground">Status</dt>
        <dd className={hevy.status === "active" ? "text-good" : "text-danger"}>
          {hevy.status === "active" ? "Connected" : hevy.status === "invalid_key" ? "Key rejected" : "Error"}
          {hevy.syncing ? " · first sync in progress" : ""}
        </dd>
        <dt className="text-muted-foreground">Last sync</dt>
        <dd>
          {hevy.lastSyncAt
            ? new Date(hevy.lastSyncAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
            : "not yet"}
        </dd>
      </dl>
      {hevy.lastError ? <FormError message={hevy.lastError} /> : null}
      {state?.ok ? (
        <p role="status" className="text-sm text-good">
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || readOnly} onClick={() => act(syncHevyNow)}>
          {busy ? "Syncing…" : "Sync now"}
        </Button>
        <Button variant="outline" disabled={busy || readOnly} onClick={() => setReplacing(true)}>
          Replace key
        </Button>
        <Button variant="outline" disabled={busy || readOnly} onClick={() => act(disconnectHevyAction)}>
          Disconnect
        </Button>
      </div>
      {msg ? (
        msg.ok ? (
          <p role="status" className="text-sm text-good">
            {msg.text}
          </p>
        ) : (
          <FormError message={msg.text} />
        )
      ) : null}
      {replacing ? keyForm : null}
      <p className="text-xs text-muted-foreground">
        Syncs automatically once a day. Deleting a workout in Hevy deletes it here on the next sync.
      </p>
    </div>
  );
}
