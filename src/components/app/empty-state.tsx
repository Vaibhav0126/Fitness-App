import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export function EmptyState({
  title,
  text,
  href = "/app/import",
  cta = "Import data",
  secondary,
}: {
  title: string;
  text: string;
  href?: string;
  cta?: string;
  secondary?: { href: string; label: string };
}) {
  return (
    <div className="grid justify-items-start gap-3 rounded-lg border border-dashed p-6">
      <h2 className="font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{text}</p>
      <div className="flex flex-wrap gap-2">
        <Link href={href} className={buttonVariants({ size: "sm" })}>
          {cta}
        </Link>
        {secondary ? (
          <Link href={secondary.href} className={buttonVariants({ size: "sm", variant: "outline" })}>
            {secondary.label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
