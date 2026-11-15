import Link from "next/link";
import { LogoLink } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Auth shell: a two-column split where the left side is product context and the
 * right side is the form. The panel collapses to a single column on mobile.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,32rem)]">
      {/* Context panel */}
      <aside className="relative hidden overflow-hidden bg-ink-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 grid-lines opacity-[0.08]" />
        <div className="pointer-events-none absolute -left-24 top-1/3 size-[26rem] rounded-full bg-brand-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 bottom-0 size-80 rounded-full bg-flare-400/15 blur-3xl" />

        <div className="relative">
          <Link href="/" className="inline-flex items-center gap-2 text-lg font-semibold" aria-label="Vessel home">
            <span className="grid size-9 place-items-center rounded-[10px] bg-brand-400 text-[#04231b]">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden suppressHydrationWarning>
                <path d="M4 15.5c2.2 2.6 5.1 3.9 8 3.9s5.8-1.3 8-3.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M12 4.5v9.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M8.6 8.2 12 4.6l3.4 3.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            Vessel
          </Link>
        </div>

        <div className="relative max-w-md">
          <blockquote className="font-display text-2xl font-medium leading-snug tracking-tight text-balance">
            “Your profile is the first thing people see. It should look like you decided it.”
          </blockquote>
          <p className="mt-5 text-sm text-ink-400">
            Draft freely. Publish only when it is exactly right.
          </p>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-ink-500">
          <span className="size-1.5 rounded-full bg-brand-400" />
          Self-hosted, no trackers, your data stays yours
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex flex-col">
        <div className="flex items-center justify-between px-5 py-5 sm:px-8">
          <div className="lg:hidden">
            <LogoLink />
          </div>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 pb-16 sm:px-8">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </main>
    </div>
  );
}
