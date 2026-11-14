import "server-only";

import { and, eq, gt, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/db/client";
import { auditLogs, sessions, users, type User } from "@/db/schema";
import { hashIp, hashToken, randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { clientIp } from "@/lib/request";

/**
 * Session management.
 *
 * Sessions are opaque random tokens in an httpOnly, SameSite=Lax cookie. Only a
 * SHA-256 hash of the token is stored, so a database read cannot be replayed as
 * a login.
 */

export type SessionUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  username: string;
  usernameDisplay: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: User["role"];
};

function sessionExpiry(): Date {
  return new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.isProduction,
    path: "/",
    expires,
  };
}

export async function createSession(userId: string, req?: Request): Promise<string> {
  const raw = randomToken(32);
  const expiresAt = sessionExpiry();

  await db.insert(sessions).values({
    tokenHash: hashToken(raw),
    userId,
    expiresAt,
    userAgent: req?.headers.get("user-agent")?.slice(0, 400) ?? null,
    ipHash: req ? hashIp(clientIp(req)) : null,
  });

  const store = await cookies();
  store.set(env.SESSION_COOKIE_NAME, raw, cookieOptions(expiresAt));

  return raw;
}

/** Reads the current user from the session cookie. Cached per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const raw = store.get(env.SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;

  const rows = await db
    .select({
      user: users,
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(raw)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.user.status !== "ACTIVE") return null;

  return {
    id: row.user.id,
    email: row.user.email,
    emailVerified: Boolean(row.user.emailVerifiedAt),
    username: row.user.username,
    usernameDisplay: row.user.usernameDisplay,
    displayName: row.user.displayName,
    avatarUrl: row.user.avatarUrl,
    role: row.user.role,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new ForbiddenError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("You must be signed in.");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("You do not have permission to do that.");
    this.name = "ForbiddenError";
  }
}

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(env.SESSION_COOKIE_NAME)?.value;
  if (raw) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(raw)));
  }
  store.delete(env.SESSION_COOKIE_NAME);
}

/** Revokes every session for a user, optionally keeping the current one. */
export async function revokeAllSessions(userId: string, keepToken?: string): Promise<void> {
  if (keepToken) {
    await db
      .delete(sessions)
      .where(and(eq(sessions.userId, userId), sql`${sessions.tokenHash} <> ${hashToken(keepToken)}`));
    return;
  }
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function listSessions(userId: string) {
  return db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(sql`${sessions.lastUsedAt} DESC`)
    .limit(50);
}

/** Housekeeping: drop expired sessions. Called from the health worker + login. */
export async function pruneExpiredSessions(): Promise<number> {
  const deleted = await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning({ id: sessions.id });
  return deleted.length;
}

export async function audit(entry: {
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  req?: Request;
}): Promise<void> {
  await db.insert(auditLogs).values({
    actorId: entry.actorId ?? null,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
    ipHash: entry.req ? hashIp(clientIp(entry.req)) : null,
  });
}
