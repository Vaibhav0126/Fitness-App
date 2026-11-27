import type { Metadata } from "next";
import Link from "next/link";
import { CsvImport } from "@/components/import/csv-import";
import { HaeImport } from "@/components/import/hae-import";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/dal";
import { listJobs } from "@/server/importers/jobs";
import { getSettings } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Import" };

const TABS = [
  { id: "csv", label: "Strength CSV" },
  { id: "hae", label: "Health Auto Export" },
] as const;

const fmtCounts = (c: Record<string, number>) =>
  Object.entries(c)
    .filter(([k, v]) => k.endsWith("Inserted") && v > 0)
    .map(([k, v]) => `${v} ${k.replace("Inserted", "")}`)
    .join(", ") || "no new rows";

export default async function ImportPage(props: PageProps<"/app/import">) {
  const { tab: rawTab } = await props.searchParams;
  const tab = rawTab === "hae" ? "hae" : "csv";
  const user = await requireUser();
  const [settings, jobs] = await Promise.all([getSettings(user.id), listJobs(user.id)]);
  const readOnly = Boolean(user.isDemo);
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-bold">Import</h1>
        <p className="text-muted-foreground">
          Re-importing the same file is safe: existing rows are matched and only changes are applied.
        </p>
      </header>
      <Card className="grid gap-4">
        <nav aria-label="Import type" className="flex gap-1 border-b text-sm">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={`/app/import?tab=${t.id}`}
              aria-current={tab === t.id ? "page" : undefined}
              className="-mb-px border-b-2 border-transparent px-3 py-2 aria-[current=page]:border-primary aria-[current=page]:font-medium"
            >
              {t.label}
            </Link>
          ))}
        </nav>
        {tab === "csv" ? (
          <CsvImport timeZone={settings.timeZone} readOnly={readOnly} />
        ) : (
          <HaeImport
            timeZone={settings.timeZone}
            runClassification={settings.config.runClassification}
            readOnly={readOnly}
          />
        )}
      </Card>
      <Card className="grid gap-3">
        <CardTitle>History</CardTitle>
        {jobs.length === 0 ? (
          <CardDescription>No imports yet.</CardDescription>
        ) : (
          <ul className="divide-y text-sm">
            {jobs.map((j) => (
              <li key={j.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                <span className="font-medium">{j.kind}</span>
                <span className="text-muted-foreground">
                  {j.startedAt.toLocaleString("en-GB", {
                    timeZone: settings.timeZone,
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
                <span className="w-full text-xs text-muted-foreground">
                  {j.status === "failed" ? (
                    <span className="text-danger">Failed: {j.error}</span>
                  ) : j.status === "running" ? (
                    "Incomplete (interrupted)"
                  ) : (
                    fmtCounts(j.counts as Record<string, number>)
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
