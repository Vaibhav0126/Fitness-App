import type { Metadata } from "next";
import { ResendVerification } from "@/components/auth/resend-verification";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyPage({ searchParams }: PageProps<"/verify">) {
  const { email, error } = await searchParams;
  const addr = typeof email === "string" ? email : "";
  return (
    <>
      <h1 className="text-xl font-semibold">Check your inbox</h1>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          That verification link is invalid or has expired. Request a new one below.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          We sent a verification link{addr ? ` to ${addr}` : ""}. Click it to activate your account. Syncing
          and imports unlock once your email is verified.
        </p>
      )}
      <ResendVerification email={addr} />
    </>
  );
}
