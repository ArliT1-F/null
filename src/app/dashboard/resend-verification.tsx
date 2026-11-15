"use client";

import { useState, useTransition } from "react";
import { MailWarning } from "lucide-react";
import { resendVerificationAction } from "@/app/(auth)/actions";

/** Non-blocking prompt to confirm the account email. */
export function ResendVerification() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200">
      <div className="flex items-start gap-2.5">
        <MailWarning className="mt-0.5 size-4 shrink-0" />
        <p>{message ?? "Confirm your email address to secure your account and enable recovery."}</p>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await resendVerificationAction();
            setMessage(result.message ?? "Done.");
          })
        }
        className="shrink-0 rounded-full border border-amber-300 bg-white/70 px-3.5 py-1.5 text-xs font-medium text-amber-900 hover:bg-white disabled:opacity-60 dark:border-amber-400/30 dark:bg-transparent dark:text-amber-200 dark:hover:bg-amber-400/10"
      >
        {pending ? "Sending…" : "Resend email"}
      </button>
    </div>
  );
}
