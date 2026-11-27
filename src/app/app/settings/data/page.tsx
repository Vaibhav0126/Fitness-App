import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/app/action-form";
import { FormField } from "@/components/auth/form-field";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { deleteAccount } from "@/server/actions/settings";
import { requireUser } from "@/server/dal";

export const metadata: Metadata = { title: "Your data" };

export default async function DataSettings() {
  const user = await requireUser();
  return (
    <div className="grid gap-4">
      <Card className="grid gap-3">
        <CardTitle>Export</CardTitle>
        <CardDescription>
          Everything Train stores about you (settings, metrics, workouts with intervals, sets, run feedback
          and import history) as one JSON file. Credentials are never included.
        </CardDescription>
        <div>
          <a href="/api/export" className={buttonVariants({ variant: "outline" })} download>
            Download my data
          </a>
        </div>
      </Card>
      <Card className="grid gap-3">
        <CardTitle>Import</CardTitle>
        <CardDescription>
          Add data from Hevy, Strong, any strength CSV, or Health Auto Export.
        </CardDescription>
        <div>
          <Link href="/app/import" className={buttonVariants({ variant: "outline" })}>
            Go to import
          </Link>
        </div>
      </Card>
      <Card className="grid gap-3 border-danger/40">
        <CardTitle className="text-danger">Delete account</CardTitle>
        <CardDescription>
          Permanently deletes your account and all of your data. This can&apos;t be undone. Export first if
          you want a copy.
        </CardDescription>
        {user.isDemo ? (
          <p className="text-sm text-muted-foreground">The demo account can&apos;t be deleted.</p>
        ) : (
          <ActionForm action={deleteAccount} submit="Delete my account forever" variant="outline">
            <FormField id="confirm" label={`Type ${user.email} to confirm`} autoComplete="off" required />
          </ActionForm>
        )}
      </Card>
    </div>
  );
}
