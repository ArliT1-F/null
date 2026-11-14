"use client";

import { useEffect } from "react";

/**
 * Fire-and-forget link click counting.
 *
 * This is the only JavaScript a public profile can load, and only when the
 * profile enables analytics. It observes clicks in the capture phase, sends one
 * `keepalive` POST and never blocks or delays navigation. No cookie is set and
 * no identifier is stored — the server increments an aggregate counter.
 */
export function LinkTracker({ username }: { username: string }) {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-track-link]");
      const linkId = target?.dataset.trackLink;
      if (!linkId) return;

      void fetch("/api/track/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, linkId }),
        keepalive: true,
        // Never let analytics interfere with the navigation.
        priority: "low",
      }).catch(() => {
        /* analytics failures are invisible to the visitor */
      });
    }

    document.addEventListener("click", onClick, { capture: true, passive: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [username]);

  return null;
}
