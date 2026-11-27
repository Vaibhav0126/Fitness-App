"use client";
import { useEffect, useState } from "react";
import { Select } from "@/components/ui/select";

const zones = (): string[] => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
};

/** IANA time zone picker. With `detect`, preselects the browser's zone after hydration. */
export function TimeZoneSelect({
  id,
  defaultValue,
  detect,
}: {
  id: string;
  defaultValue: string;
  detect?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const [list] = useState(() => {
    const all = zones();
    return all.includes(defaultValue) ? all : [defaultValue, ...all];
  });
  useEffect(() => {
    if (!detect) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the browser zone is only known on the client
    if (tz) setValue(tz);
  }, [detect]);
  return (
    <Select id={id} name={id} value={value} onChange={(e) => setValue(e.target.value)}>
      {(list.includes(value) ? list : [value, ...list]).map((z) => (
        <option key={z} value={z}>
          {z.replaceAll("_", " ")}
        </option>
      ))}
    </Select>
  );
}
