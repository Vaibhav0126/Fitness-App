import type { Metadata } from "next";
import { RequestResetForm, SetPasswordForm } from "@/components/auth/reset-forms";

export const metadata: Metadata = { title: "Reset password" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token, error } = await searchParams;
  return (
    <>
      <h1 className="text-xl font-semibold">Reset your password</h1>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          That reset link is invalid or has expired. Request a new one.
        </p>
      ) : null}
      {typeof token === "string" && !error ? <SetPasswordForm token={token} /> : <RequestResetForm />}
    </>
  );
}
