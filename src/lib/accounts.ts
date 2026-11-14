import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { profiles, users } from "@/db/schema";
import { DEFAULT_PROFILE_CONFIG } from "@/lib/profile-config";
import { validateUsername } from "@/lib/username";

/**
 * Account lifecycle: registration and the account/profile creation invariant.
 */

export type RegisterInput = {
  email: string;
  password: string;
  username: string;
  passwordHash: string;
};

export type RegisterResult =
  | { ok: true; userId: string; username: string }
  | { ok: false; field: "email" | "username" | "form"; reason: string };

/**
 * Creates a user, their profile and its default draft in a single transaction.
 * Registration is the only place profiles are created, so "every active user has
 * exactly one profile" is guaranteed by the database transaction rather than by
 * convention.
 */
export async function registerAccount(input: RegisterInput): Promise<RegisterResult> {
  const email = input.email.trim().toLowerCase();

  const existingEmail = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existingEmail.length > 0) {
    return { ok: false, field: "email", reason: "An account with that email already exists." };
  }

  const check = validateUsername(input.username);
  if (!check.ok) return { ok: false, field: "username", reason: check.reason };

  const existingUsername = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, check.username))
    .limit(1);
  if (existingUsername.length > 0) {
    return { ok: false, field: "username", reason: "That username is already taken." };
  }

  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          email,
          passwordHash: input.passwordHash,
          username: check.username,
          usernameDisplay: check.display,
          displayName: check.display,
        })
        .returning({ id: users.id, username: users.username });

      await tx.insert(profiles).values({
        userId: user.id,
        draftConfig: DEFAULT_PROFILE_CONFIG,
        themeSlug: "aurora",
        visibility: "PUBLIC",
      });

      return { ok: true as const, userId: user.id, username: user.username };
    });
  } catch (error) {
    // Unique violation race between the check above and the insert.
    const message = error instanceof Error ? error.message : "";
    if (message.includes("users_email_unique") || message.includes("users_email_key")) {
      return { ok: false, field: "email", reason: "An account with that email already exists." };
    }
    if (message.includes("users_username_unique") || message.includes("users_username_key")) {
      return { ok: false, field: "username", reason: "That username is already taken." };
    }
    throw error;
  }
}

export async function findUserByEmail(email: string) {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserByUsername(username: string) {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.username, username.trim().toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

export async function updatePassword(userId: string, passwordHash: string) {
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

/** Marks the account deleted and frees the username for reuse. */
export async function softDeleteAccount(userId: string) {
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = rows[0];
    if (!user) return;

    const tombstone = `deleted_${user.id.slice(0, 8)}`;
    await tx
      .update(users)
      .set({
        status: "DELETED",
        deletedAt: new Date(),
        username: tombstone,
        usernameDisplay: tombstone,
        email: `${tombstone}@deleted.invalid`,
        passwordHash: null,
        displayName: null,
        bio: null,
        avatarUrl: null,
      })
      .where(eq(users.id, userId));

    await tx
      .update(profiles)
      .set({ visibility: "PRIVATE", publishedSnapshot: null, publishedAt: null })
      .where(eq(profiles.userId, userId));
  });
}
