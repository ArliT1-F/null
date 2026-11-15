import Link from "next/link";
import { Compass } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Icon } from "@/components/ui";

export default function NotFound() {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
        <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-ink-100 text-ink-500 dark:bg-white/[0.06] dark:text-ink-300">
          <Icon icon={Compass} className="size-7" />
        </div>
        <p className="font-mono text-xs text-ink-400">404</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">Nothing lives here</h1>
        <p className="mt-2 max-w-sm text-sm text-ink-500 dark:text-ink-400">
          This page does not exist, or the profile you are looking for has not been published.
        </p>
        <div className="mt-7 flex gap-3">
          <Link href="/" className="btn-primary">
            Back home
          </Link>
          <Link href="/explore" className="btn-ghost">
            Explore profiles
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
