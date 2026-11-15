"use client";

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";

/**
 * Route-level error boundary.
 *
 * Shows a recoverable message instead of a stack trace, and logs the digest so
 * an operator can correlate it with server logs. Never renders error details to
 * the visitor, which could leak internal structure.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[client] unhandled error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-4 text-center">
      <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300">
        <TriangleAlert className="size-7" />
      </div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
        The page could not be rendered. You can try again — your saved data has not been changed.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-[11px] text-ink-400">reference: {error.digest}</p>
      )}
      <button onClick={reset} className="btn-primary mt-7">
        <RotateCcw className="size-4" />
        Try again
      </button>
    </main>
  );
}
