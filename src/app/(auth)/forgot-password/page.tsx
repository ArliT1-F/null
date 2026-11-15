import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-400">
        Enter the email on your account and we will send a reset link.
      </p>

      <div className="mt-7">
        <ForgotPasswordForm />
      </div>

      <p className="mt-6 text-center text-sm text-ink-500 dark:text-ink-400">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-ink-950 link-underline dark:text-white">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
