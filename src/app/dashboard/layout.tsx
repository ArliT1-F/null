import { redirect } from "next/navigation";
import { AppHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Authenticated shell.
 *
 * Authentication is checked here against the database, never inferred from
 * cookie presence in middleware — a stale or forged cookie must not pass.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirectTo=%2Fdashboard");

  return (
    <div className="min-h-dvh bg-ink-50/50 dark:bg-ink-950">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 2xl:max-w-[90rem]">{children}</div>
    </div>
  );
}
