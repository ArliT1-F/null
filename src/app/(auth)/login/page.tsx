import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { Alert } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; redirectTo?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const params = await searchParams;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-400">
        Sign in to keep working on your profile.
      </p>

      {params.reset === "1" && (
        <Alert tone="success" className="mt-5">
          Password updated. Sign in with your new password.
        </Alert>
      )}

      <div className="mt-7">
        <LoginForm redirectTo={params.redirectTo} />
      </div>

      <p className="mt-6 text-center text-sm text-ink-500 dark:text-ink-400">
        No account yet?{" "}
        <Link href="/register" className="font-medium text-ink-950 link-underline dark:text-white">
          Create one
        </Link>
      </p>
    </div>
  );
}
