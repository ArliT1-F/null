import Link from "next/link";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

/**
 * null mark: a rounded "hull" formed by two arcs with a rising line through it.
 * Pure SVG so it stays crisp and needs no asset pipeline.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="relative grid size-8 place-items-center rounded-[10px] bg-ink-950 text-white shadow-sm dark:bg-brand-400 dark:text-[#04231b]">
        {/* suppressHydrationWarning: extensions such as Dark Reader rewrite svg
            attributes before hydration — see the note on <Icon> in ui.tsx. It
            has to sit on the paths too: they carry their own `stroke`, which is
            exactly what gets rewritten, and the flag does not inherit. */}
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" aria-hidden suppressHydrationWarning>
          <path
            d="M4 15.5c2.2 2.6 5.1 3.9 8 3.9s5.8-1.3 8-3.9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            suppressHydrationWarning
          />
          <path d="M12 4.5v9.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" suppressHydrationWarning />
          <path d="M8.6 8.2 12 4.6l3.4 3.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" suppressHydrationWarning />
        </svg>
      </span>
      <span className="font-display text-[17px] font-semibold tracking-tight">{env.APP_NAME}</span>
    </span>
  );
}

export function LogoLink({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("transition-opacity hover:opacity-80", className)} aria-label={`${env.APP_NAME} home`}>
      <Logo />
    </Link>
  );
}
