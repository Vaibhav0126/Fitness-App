import type { Metadata } from "next";
import { ActionForm } from "@/components/app/action-form";
import { TimeZoneSelect } from "@/components/app/time-zone-select";
import { FormField } from "@/components/auth/form-field";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { saveProfile } from "@/server/actions/settings";
import { requireUser } from "@/server/dal";
import { getSettings } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Settings" };

export default async function ProfileSettings() {
  const user = await requireUser();
  const settings = await getSettings(user.id);
  return (
    <Card>
      <ActionForm action={saveProfile} submit="Save profile">
        <FormField id="name" label="Name" defaultValue={user.name} required autoComplete="name" />
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <p id="email" className="text-sm text-muted-foreground">
            {user.email}
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="timeZone">Time zone</Label>
          <TimeZoneSelect id="timeZone" defaultValue={settings.timeZone} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="units">Units</Label>
          <Select id="units" name="units" defaultValue={settings.units}>
            <option value="metric">Metric (kg, km)</option>
            <option value="imperial">Imperial (lb, mi)</option>
          </Select>
          <p className="text-xs text-muted-foreground">
            Data is stored in metric. Imperial converts weights and distances for display.
          </p>
        </div>
      </ActionForm>
    </Card>
  );
}
