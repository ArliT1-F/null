import type { Metadata } from "next";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { getProfileForUser } from "@/lib/profiles/service";
import { USERNAME_CHANGE_COOLDOWN_DAYS, usernameCooldownMessage } from "@/lib/username-messages";
import { timeAgo } from "@/lib/utils";
import {
  ChangeEmailForm,
  ChangePasswordForm,
  ChangeUsernameForm,
  DangerZone,
  SessionList,
} from "./settings-forms";
import { Badge, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Settings", robots: { index: false, follow: false } };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [profile, account, activeSessions] = await Promise.all([
    getProfileForUser(user.id),
    db.select().from(users).where(eq(users.id, user.id)).limit(1).then((r) => r[0]),
    db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.lastUsedAt))
      .limit(20),
  ]);

  const cooldown = usernameCooldownMessage(account?.usernameChangedAt ?? null, USERNAME_CHANGE_COOLDOWN_DAYS);

  return (
    <div className="max-w-3xl space-y-8">
      <header>
        <p className="eyebrow">Preferences</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">Account settings</h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
          Your identity, credentials and sessions in one place.
        </p>
      </header>

      {/* Profile URL ------------------------------------------------------ */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Profile address</h2>
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
              Your username is your public URL. Changing it retires the old one permanently.
            </p>
          </div>
          <Badge>{profile?.visibility === "PRIVATE" ? "private" : profile?.publishedSnapshot ? "published" : "draft"}</Badge>
        </div>

        <div className="mt-4 rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-2.5 dark:border-white/10 dark:bg-black/20">
          <p className="font-mono text-sm">
            <span className="text-ink-400">/</span>
            <span className="font-medium">{user.usernameDisplay}</span>
          </p>
        </div>

        <div className="mt-5">
          <ChangeUsernameForm currentUsername={user.usernameDisplay} cooldownMessage={cooldown} />
        </div>
      </Card>

      {/* Email ------------------------------------------------------------ */}
      <Card>
        <h2 className="text-sm font-semibold">Email address</h2>
        <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
          Used for sign-in, password recovery and account notices.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm">{user.email}</span>
          {user.emailVerified ? <Badge tone="accent">verified</Badge> : <Badge tone="warn">unverified</Badge>}
        </div>
        <div className="mt-5">
          <ChangeEmailForm currentEmail={user.email} />
        </div>
      </Card>

      {/* Password --------------------------------------------------------- */}
      <Card>
        <h2 className="text-sm font-semibold">Password</h2>
        <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
          At least 10 characters. Changing it does not sign out your other devices — use the sessions
          list below for that.
        </p>
        <div className="mt-5">
          <ChangePasswordForm />
        </div>
      </Card>

      {/* Sessions --------------------------------------------------------- */}
      <Card>
        <h2 className="text-sm font-semibold">Active sessions</h2>
        <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
          Every device currently signed in to your account.
        </p>
        <SessionList
          sessions={activeSessions.map((s) => ({
            id: s.id,
            userAgent: s.userAgent,
            createdAt: s.createdAt.toISOString(),
            lastUsedAt: s.lastUsedAt.toISOString(),
          }))}
          lastSeen={account?.lastSeenAt ? timeAgo(account.lastSeenAt) : null}
        />
      </Card>

      {/* Danger zone ------------------------------------------------------ */}
      <Card className="border-red-200 dark:border-red-500/25">
        <h2 className="text-sm font-semibold text-red-700 dark:text-red-300">Delete account</h2>
        <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
          Deletes your profile, links and media, and frees your username. This cannot be undone.
        </p>
        <div className="mt-5">
          <DangerZone />
        </div>
      </Card>
    </div>
  );
}
