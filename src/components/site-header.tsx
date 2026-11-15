import Link from "next/link";
import { LogoLink } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser } from "@/lib/auth/session";

/** Marketing/docs header for signed-out visitors. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-200/70 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-ink-950/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <LogoLink />
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          <Link href="/explore" className="btn-quiet">
            Explore
          </Link>
          <Link href="/#features" className="btn-quiet">
            Features
          </Link>
          <Link href="/docs" className="btn-quiet">
            Docs
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className="btn-ghost hidden sm:inline-flex">
            Sign in
          </Link>
          <Link href="/register" className="btn-primary">
            Create yours
          </Link>
        </div>
      </div>
    </header>
  );
}

/** Header for signed-in users, showing their public handle. */
export async function AppHeader() {
  const user = await getCurrentUser();
  if (!user) return <SiteHeader />;

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200/70 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-ink-950/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <LogoLink />
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Primary">
            <Link href="/dashboard" className="btn-quiet">
              Dashboard
            </Link>
            <Link href="/dashboard/editor" className="btn-quiet">
              Editor
            </Link>
            <Link href="/dashboard/settings" className="btn-quiet">
              Settings
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href={`/${user.username}`}
            className="btn-ghost max-w-[10rem] truncate"
            title={`View your profile at /${user.usernameDisplay}`}
          >
            /{user.usernameDisplay}
          </Link>
        </div>
      </div>
    </header>
  );
}
