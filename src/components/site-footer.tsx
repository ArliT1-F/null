import Link from "next/link";
import { env } from "@/lib/env";
import { Logo } from "@/components/logo";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-ink-200/70 dark:border-white/10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3">
          <Logo />
          <p className="max-w-xs text-sm text-ink-500 dark:text-ink-400">
            A customizable identity platform. Your profile, your rules, your own corner of the
            internet.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-10 gap-y-3 text-sm">
          <div className="flex flex-col gap-2">
            <span className="eyebrow">Product</span>
            <Link href="/explore" className="text-ink-600 hover:text-ink-950 dark:text-ink-300 dark:hover:text-white">
              Explore profiles
            </Link>
            <Link href="/register" className="text-ink-600 hover:text-ink-950 dark:text-ink-300 dark:hover:text-white">
              Create a profile
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            <span className="eyebrow">Resources</span>
            <Link href="/docs" className="text-ink-600 hover:text-ink-950 dark:text-ink-300 dark:hover:text-white">
              Documentation
            </Link>
            <Link href="/docs/security" className="text-ink-600 hover:text-ink-950 dark:text-ink-300 dark:hover:text-white">
              Security
            </Link>
            <a
              href="/api/health"
              className="text-ink-600 hover:text-ink-950 dark:text-ink-300 dark:hover:text-white"
              rel="nofollow"
            >
              Service status
            </a>
          </div>
          <div className="flex flex-col gap-2">
            <span className="eyebrow">Legal</span>
            <Link href="/legal/terms" className="text-ink-600 hover:text-ink-950 dark:text-ink-300 dark:hover:text-white">
              Terms
            </Link>
            <Link href="/legal/privacy" className="text-ink-600 hover:text-ink-950 dark:text-ink-300 dark:hover:text-white">
              Privacy
            </Link>
          </div>
        </div>
      </div>
      <div className="border-t border-ink-200/70 py-5 dark:border-white/10">
        <p className="mx-auto max-w-6xl px-4 text-xs text-ink-500 sm:px-6 dark:text-ink-500">
          © {year} {env.APP_NAME}. Built to be self-hosted.
        </p>
      </div>
    </footer>
  );
}
