import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

// Placeholder landing page; the full landing page is Phase 4.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6">
      <h1 className="text-4xl font-bold tracking-tight">Train</h1>
      <p className="text-lg text-muted-foreground">
        Your strength, run-walk and recovery data in one place, with a rule-based coach that tells you exactly
        what to do next.
      </p>
      <div className="flex gap-3">
        <Link href="/signup" className={buttonVariants()}>
          Create account
        </Link>
        <Link href="/login" className={buttonVariants({ variant: "outline" })}>
          Log in
        </Link>
      </div>
    </main>
  );
}
