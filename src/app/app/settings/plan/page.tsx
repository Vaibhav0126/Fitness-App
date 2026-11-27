import type { Metadata } from "next";
import { PlanEditor } from "@/components/settings/plan-editor";
import { requireUser } from "@/server/dal";
import { getSettings } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Plan" };

export default async function PlanSettings() {
  const user = await requireUser();
  const settings = await getSettings(user.id);
  return <PlanEditor initial={settings.config} readOnly={Boolean(user.isDemo)} />;
}
