import { redirect } from "next/navigation";
import { AppNav } from "@/components/app/nav";
import { requireUser } from "@/server/dal";
import { getSettings } from "@/server/queries/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const settings = await getSettings(user.id);
  if (!settings.onboardingDone && !user.isDemo) redirect("/onboarding");
  return (
    <>
      <AppNav isDemo={Boolean(user.isDemo)} />
      <main className="mx-auto max-w-3xl px-4 pt-6 pb-24 sm:pb-10">{children}</main>
    </>
  );
}
