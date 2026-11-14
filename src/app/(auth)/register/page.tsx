import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RegisterForm } from "./register-form";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Create your profile" };

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Claim your name</h1>
      <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-400">
        One account, one profile, one URL that is yours.
      </p>

      <div className="mt-7">
        <RegisterForm />
      </div>

      <p className="mt-6 text-center text-sm text-ink-500 dark:text-ink-400">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-ink-950 link-underline dark:text-white">
          Sign in
        </Link>
      </p>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-400">
        By creating an account you agree to the{" "}
        <Link href="/legal/terms" className="link-underline">
          terms
        </Link>{" "}
        and{" "}
        <Link href="/legal/privacy" className="link-underline">
          privacy policy
        </Link>
        .
      </p>
    </div>
  );
}
