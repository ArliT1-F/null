import type { Metadata } from "next";
import Link from "next/link";
import { PasswordForm } from "@/components/password-form";
import { Alert } from "@/components/ui";
import { resetPasswordAction } from "../actions";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-400">
        All other sessions will be signed out once it is changed.
      </p>

      <div className="mt-7">
        {token ? (
          <PasswordForm action={resetPasswordAction} token={token} submitLabel="Update password" />
        ) : (
          <Alert tone="error">
            This page needs a valid reset link.{" "}
            <Link href="/forgot-password" className="underline">
              Request a new one
            </Link>
            .
          </Alert>
        )}
      </div>
    </div>
  );
}
