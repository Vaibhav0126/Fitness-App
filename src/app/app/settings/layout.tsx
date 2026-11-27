import Link from "next/link";

const tabs = [
  { href: "/app/settings", label: "Profile" },
  { href: "/app/settings/plan", label: "Plan" },
  { href: "/app/settings/connections", label: "Connections" },
  { href: "/app/settings/data", label: "Data" },
] as const;

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-6">
      <header className="grid gap-3">
        <h1 className="text-2xl font-bold">Settings</h1>
        <nav aria-label="Settings" className="flex gap-1 border-b text-sm">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="-mb-px border-b-2 border-transparent px-3 py-2 hover:border-border"
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
