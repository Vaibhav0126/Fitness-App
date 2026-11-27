import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "@/components/connections/copy-button";
import { HevyConnection } from "@/components/connections/hevy-connection";
import { UploadTokens } from "@/components/connections/upload-tokens";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/dal";
import { getHevyConnection } from "@/server/integrations/hevy";
import { listTokens } from "@/server/tokens";

export const metadata: Metadata = { title: "Connections" };

function Endpoint({ label, url }: { label: string; url: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded bg-muted px-2 py-1.5 text-xs whitespace-nowrap">
          {url}
        </code>
        <CopyButton value={url} />
      </div>
    </div>
  );
}

export default async function ConnectionsSettings() {
  const user = await requireUser();
  const [tokens, hevy] = await Promise.all([listTokens(user.id), getHevyConnection(user.id)]);
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return (
    <div className="grid gap-4">
      <Card className="grid gap-4">
        <div className="grid gap-1">
          <CardTitle>Upload tokens</CardTitle>
          <CardDescription>
            For the iOS Shortcut and Health Auto Export&apos;s REST automation. Send as{" "}
            <code className="text-xs">Authorization: Bearer &lt;token&gt;</code>. Each token is shown once and
            stored only as a hash; revoke it if a phone is lost.
          </CardDescription>
        </div>
        <div className="grid gap-3">
          <Endpoint label="iOS Shortcut" url={`${base}/api/ingest/shortcut`} />
          <Endpoint label="Health Auto Export (REST API automation)" url={`${base}/api/ingest/hae`} />
        </div>
        <UploadTokens
          readOnly={Boolean(user.isDemo)}
          tokens={tokens.map((t) => ({
            ...t,
            createdAt: t.createdAt.toISOString(),
            lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
          }))}
        />
        <p className="text-sm">
          <Link
            href="https://github.com/Vaibhav0126/Fitness-App/blob/main/docs/shortcut.md"
            className="underline underline-offset-2"
          >
            How to build the Shortcut
          </Link>
        </p>
      </Card>
      <Card className="grid gap-4">
        <div className="grid gap-1">
          <CardTitle>Hevy</CardTitle>
          <CardDescription>Strength workouts from the Hevy API, synced daily and on demand.</CardDescription>
        </div>
        <HevyConnection
          readOnly={Boolean(user.isDemo)}
          hevy={{
            ...hevy,
            lastSyncAt: hevy.lastSyncAt?.toISOString() ?? null,
          }}
        />
      </Card>
    </div>
  );
}
