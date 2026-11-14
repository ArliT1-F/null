import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { verifyEmailAction } from "../actions";

export const metadata: Metadata = { title: "Email verification" };

/** Tokens are single-use and short-lived; the check runs server-side only. */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = token
    ? await verifyEmailAction(token)
    : { ok: false, message: "No verification token was provided." };

  return (
    <div className="text-center">
      <div
        className={`mx-auto mb-5 grid size-14 place-items-center rounded-2xl ${
          result.ok
            ? "bg-brand-50 text-brand-600 dark:bg-brand-400/10 dark:text-brand-300"
            : "bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-300"
        }`}
      >
        {result.ok ? <CheckCircle2 className="size-7" /> : <XCircle className="size-7" />}
      </div>

      <h1 className="font-display text-2xl font-semibold tracking-tight">
        {result.ok ? "Email confirmed" : "We could not confirm that link"}
      </h1>
      <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">{result.message}</p>

      <div className="mt-7 flex justify-center gap-3">
        <Link href={result.ok ? "/dashboard" : "/dashboard/settings"} className="btn-primary">
          {result.ok ? "Go to dashboard" : "Open settings"}
        </Link>
      </div>
    </div>
  );
}
