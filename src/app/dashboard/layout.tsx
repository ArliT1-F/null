import { redirect } from "next/navigation";
import { AppHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Authenticated shell.
 *
 * Middleware already redirects cookie-less visitors, but the authoritative check
 * happens here against the database — a stale or forged cookie must not pass.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirectTo=%2Fdashboard");

  return (
    <div className="min-h-dvh bg-ink-50/50 dark:bg-ink-950">
      <AppHeader />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
