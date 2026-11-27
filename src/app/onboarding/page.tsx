import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/app/action-form";
import { TimeZoneSelect } from "@/components/app/time-zone-select";
import { Label } from "@/components/ui/label";
import { completeOnboarding } from "@/server/actions/settings";
import { requireUser } from "@/server/dal";
import { getSettings } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Get started" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const settings = await getSettings(user.id);
  if (settings.onboardingDone || user.isDemo) redirect("/app");
  return (
    <main className="mx-auto grid max-w-xl gap-6 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold">Welcome, {user.name.split(" ")[0]}</h1>
        <p className="text-muted-foreground">
          Two choices and you&apos;re in. You can change both later in Settings.
        </p>
      </header>
      <ActionForm action={completeOnboarding} submit="Continue">
        <fieldset className="grid gap-3">
          <legend className="mb-2 font-medium">Start from</legend>
          <label className="flex cursor-pointer gap-3 rounded-lg border p-4 has-checked:border-primary has-checked:bg-muted">
            <input type="radio" name="start" value="template" defaultChecked className="mt-1" />
            <span>
              <span className="block font-medium">Upper/Lower 4-day + 8-week run-walk</span>
              <span className="text-sm text-muted-foreground">
                Four lifting days with rep ranges, two run-walk sessions a week that progress when your shins
                are happy. Recommended.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer gap-3 rounded-lg border p-4 has-checked:border-primary has-checked:bg-muted">
            <input type="radio" name="start" value="scratch" className="mt-1" />
            <span>
              <span className="block font-medium">Start from scratch</span>
              <span className="text-sm text-muted-foreground">
                An empty week. You&apos;ll build your schedule and routines in the plan editor.
              </span>
            </span>
          </label>
        </fieldset>
        <div className="grid gap-2">
          <Label htmlFor="timeZone">Time zone</Label>
          <TimeZoneSelect id="timeZone" defaultValue={settings.timeZone} detect />
          <p className="text-xs text-muted-foreground">
            Days, weeks and &ldquo;today&rdquo; are calculated in this zone. Detected from your browser.
          </p>
        </div>
      </ActionForm>
    </main>
  );
}
