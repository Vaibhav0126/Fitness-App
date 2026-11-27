import Link from "next/link";
import { signOut } from "@/server/actions/auth";

const links = [
  { href: "/app", label: "Today" },
  { href: "/app/next", label: "Next" },
  { href: "/app/runs", label: "Runs" },
  { href: "/app/strength", label: "Strength" },
  { href: "/app/recovery", label: "Recovery" },
  { href: "/app/log", label: "Log" },
  { href: "/app/import", label: "Import" },
  { href: "/app/settings", label: "Settings" },
] as const;

export function AppNav({ isDemo }: { isDemo: boolean }) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
      {isDemo ? (
        <p className="bg-primary px-4 py-1 text-center text-xs text-primary-foreground">
          Demo account: read-only synthetic data.{" "}
          <Link href="/signup" className="underline">
            Sign up
          </Link>{" "}
          to use your own.
        </p>
      ) : null}
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-3xl items-center gap-1 overflow-x-auto px-4 py-2 text-sm"
      >
        <Link href="/app" className="mr-2 font-bold">
          Train
        </Link>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-md px-2 py-1.5 hover:bg-muted">
            {l.label}
          </Link>
        ))}
        <form action={signOut} className="ml-auto">
          <button type="submit" className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-muted">
            Sign out
          </button>
        </form>
      </nav>
    </header>
  );
}
