import { AppNav } from "@/components/app/nav";
import { requireUser } from "@/server/dal";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <AppNav isDemo={Boolean(user.isDemo)} />
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </>
  );
}
