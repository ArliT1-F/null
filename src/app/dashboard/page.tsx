import {
  ArrowUpRight,
  CircleDot,
  Eye,
  ExternalLink,
  Image as ImageIcon,
  Link2,
  Palette,
  PenLine,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, Icon } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";
import { getEditorData, listVersions } from "@/lib/profiles/service";
import { timeAgo } from "@/lib/utils";
import { ResendVerification } from "./resend-verification";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const data = await getEditorData(user.id);
  if (!data) {
    return (
      <EmptyState
        title="Your profile is missing"
        description="That should not happen. Try signing out and back in; if it persists, contact the operator."
        icon={ShieldAlert}
      />
    );
  }

  const { profile, links } = data;
  const versions = await listVersions(profile.id, 5);
  const published = Boolean(profile.publishedSnapshot);
  const draftDirty = profile.draftUpdatedAt > (profile.publishedAt ?? new Date(0));

  const profileUrl = `/${user.username}`;

  return (
    <div className="space-y-8">
      {/* Header --------------------------------------------------------- */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Your workspace</p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
            Hey, {user.displayName ?? user.usernameDisplay}
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            {published
              ? draftDirty
                ? "You have unpublished changes waiting."
                : "Your published profile is up to date."
              : "Your profile is still a draft — visitors cannot see it yet."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/editor" className="btn-primary">
            <Icon icon={PenLine} className="size-4" />
            Open editor
          </Link>
          {published && (
            <Link href={profileUrl} className="btn-ghost" target="_blank" rel="noopener">
              <Icon icon={ExternalLink} className="size-4" />
              View live
            </Link>
          )}
        </div>
      </div>

      {!user.emailVerified && <ResendVerification />}

      {/* Stat cards ----------------------------------------------------- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={CircleDot}
          label="Status"
          value={published ? "Published" : "Draft"}
          hint={published ? (draftDirty ? "unpublished edits" : "live now") : "not visible publicly"}
          tone={published ? (draftDirty ? "warn" : "good") : "neutral"}
        />
        <StatCard icon={Link2} label="Links" value={String(links.length)} hint={`${links.filter((l) => l.visible).length} visible`} />
        <StatCard icon={Palette} label="Theme" value={profile.themeSlug} hint="appearance preset" />
        <StatCard icon={Eye} label="Published" value={published ? timeAgo(profile.publishedAt!) : "—"} hint={`${versions.length} versions kept`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        {/* Quick actions ------------------------------------------------ */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Quick actions</h2>
            <Link href="/dashboard/settings" className="text-xs text-ink-500 hover:text-ink-900 dark:hover:text-white">
              All settings
            </Link>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <ActionTile
              href="/dashboard/editor"
              icon={PenLine}
              title="Design your profile"
              body="Colours, type, layout and links in one place."
            />
            <ActionTile
              href="/dashboard/editor#links"
              icon={Link2}
              title="Manage links"
              body="Add, reorder and highlight your destinations."
            />
            <ActionTile
              href="/dashboard/media"
              icon={ImageIcon}
              title="Media library"
              body="Avatars, backgrounds and gallery images."
            />
            <ActionTile
              href="/dashboard/settings"
              icon={Sparkles}
              title="Account & username"
              body="Change your handle, email and password."
            />
          </div>
        </Card>

        {/* Published URL + history ------------------------------------- */}
        <div className="space-y-6">
          <Card>
            <h2 className="text-sm font-semibold">Your address</h2>
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
              This is the link you share. It is yours as long as the account exists.
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 px-3 py-2.5 dark:border-white/10 dark:bg-black/20">
              <span className="truncate font-mono text-[13px] text-ink-700 dark:text-ink-200">
                <span className="text-ink-400">/</span>
                {user.usernameDisplay}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-ink-400">
              {published
                ? `Last published ${timeAgo(profile.publishedAt!)} · version ${profile.revision}`
                : "Publish from the editor to make it live."}
            </p>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Recent versions</h2>
              <Badge>{versions.length}</Badge>
            </div>
            {versions.length === 0 ? (
              <p className="text-sm text-ink-500 dark:text-ink-400">
                No published versions yet. Your first publish will appear here.
              </p>
            ) : (
              <ul className="divide-y divide-ink-100 dark:divide-white/[0.06]">
                {versions.map((version) => (
                  <li key={version.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-[13px] font-medium">Version {version.version}</p>
                      <p className="text-[11px] text-ink-400">{timeAgo(version.createdAt)}</p>
                    </div>
                    {version.version === profile.revision ? (
                      <Badge tone="accent">live</Badge>
                    ) : (
                      <span className="text-[11px] text-ink-400">archived</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: TileIcon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: typeof Eye;
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "good" | "warn";
}) {
  const toneClasses = {
    neutral: "text-ink-500 bg-ink-100 dark:bg-white/[0.06] dark:text-ink-300",
    good: "text-brand-600 bg-brand-50 dark:bg-brand-400/10 dark:text-brand-300",
    warn: "text-amber-600 bg-amber-50 dark:bg-amber-400/10 dark:text-amber-300",
  };
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2">
        <span className={`grid size-7 place-items-center rounded-lg ${toneClasses[tone]}`}>
          <Icon icon={TileIcon} className="size-3.5" />
        </span>
        <span className="text-xs font-medium text-ink-500 dark:text-ink-400">{label}</span>
      </div>
      <p className="mt-3 truncate font-display text-lg font-semibold capitalize tracking-tight">{value}</p>
      <p className="mt-0.5 text-[11px] text-ink-400">{hint}</p>
    </div>
  );
}

function ActionTile({
  href,
  icon: TileIcon,
  title,
  body,
}: {
  href: string;
  icon: typeof Eye;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-ink-200/80 p-3.5 transition-all hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-sm dark:border-white/10 dark:hover:border-white/20"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-600 transition-colors group-hover:bg-ink-950 group-hover:text-white dark:bg-white/[0.06] dark:text-ink-300 dark:group-hover:bg-brand-400 dark:group-hover:text-[#04231b]">
        <Icon icon={TileIcon} className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-[13px] font-medium">
          {title}
          <Icon icon={ArrowUpRight} className="size-3 text-ink-400 opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">{body}</span>
      </span>
    </Link>
  );
}
