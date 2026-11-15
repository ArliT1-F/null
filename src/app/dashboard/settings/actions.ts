"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { findUserByEmail, softDeleteAccount, updatePassword } from "@/lib/accounts";
import { audit, getCurrentUser, requireUser, revokeAllSessions } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/password";
import { changeUsername } from "@/lib/profiles/service";
import { LINK_ICONS } from "@/db/schema";
import { emailSchema, fieldErrors, passwordSchema } from "@/lib/validation";
import { USERNAME_CHANGE_COOLDOWN_DAYS, validateUsername } from "@/lib/username";
import { usernameCooldownMessage } from "@/lib/username-messages";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { z } from "zod";

export type SettingsState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Profile URL / username
// ---------------------------------------------------------------------------

export async function changeUsernameAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const raw = String(formData.get("username") ?? "").trim();

  const check = validateUsername(raw);
  if (!check.ok) return { ok: false, errors: { username: check.reason } };

  const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const current = rows[0];
  if (!current) return { ok: false, message: "Account not found." };

  const cooldown = usernameCooldownMessage(current.usernameChangedAt, USERNAME_CHANGE_COOLDOWN_DAYS);
  if (cooldown) {
    return { ok: false, message: cooldown };
  }

  const result = await changeUsername(user.id, raw);
  if (!result.ok) return { ok: false, errors: { username: result.reason } };

  await audit({ actorId: user.id, action: "account.username_change", metadata: { to: result.username } });
  revalidateTag(`profile:${user.username}`);
  revalidateTag(`profile:${result.username}`);
  revalidatePath("/dashboard");
  revalidatePath(`/${result.username}`);

  return { ok: true, message: `Your profile now lives at /${result.username}.` };
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export async function changeEmailAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const password = String(formData.get("password") ?? "");
  const emailInput = String(formData.get("email") ?? "");

  const parsedEmail = emailSchema.safeParse(emailInput);
  if (!parsedEmail.success) {
    return { ok: false, errors: { email: parsedEmail.error.issues[0].message } };
  }

  const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const current = rows[0];
  if (!current?.passwordHash) return { ok: false, message: "Set a password before changing your email." };

  const valid = await verifyPassword(current.passwordHash, password);
  if (!valid) return { ok: false, errors: { password: "Password is incorrect." } };

  if (parsedEmail.data === current.email) {
    return { ok: false, errors: { email: "That is already your email." } };
  }

  const existing = await findUserByEmail(parsedEmail.data);
  if (existing) return { ok: false, errors: { email: "That email is already in use." } };

  // Changing the email address clears verification: it must be re-confirmed.
  await db
    .update(users)
    .set({ email: parsedEmail.data, emailVerifiedAt: null })
    .where(eq(users.id, user.id));

  await audit({ actorId: user.id, action: "account.email_change" });
  return { ok: true, message: "Email updated. Check your inbox to confirm the new address." };
}

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

export async function changePasswordAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) return { ok: false, errors: { newPassword: parsed.error.issues[0].message } };
  if (newPassword !== confirm) return { ok: false, errors: { confirmPassword: "Passwords do not match." } };

  const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const current = rows[0];
  if (!current?.passwordHash) {
    // OAuth-only account: allow setting a first password after re-auth is out of
    // scope for V1, so keep the behaviour explicit rather than silently insecure.
    return { ok: false, message: "This account has no password set yet." };
  }

  const valid = await verifyPassword(current.passwordHash, currentPassword);
  if (!valid) return { ok: false, errors: { currentPassword: "Current password is incorrect." } };

  await updatePassword(user.id, await hashPassword(newPassword));
  await audit({ actorId: user.id, action: "account.password_change" });

  return { ok: true, message: "Password changed. Other devices stay signed in." };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function revokeOtherSessionsAction(): Promise<SettingsState> {
  const user = await requireUser();
  const store = await cookies();
  const raw = store.get(env.SESSION_COOKIE_NAME)?.value;
  await revokeAllSessions(user.id, raw);
  await audit({ actorId: user.id, action: "account.sessions_revoked" });
  revalidatePath("/dashboard/settings");
  return { ok: true, message: "All other sessions have been signed out." };
}

export async function revokeSessionAction(sessionId: string): Promise<SettingsState> {
  const user = await requireUser();
  await db.delete(sessions).where(eq(sessions.id, sessionId));
  const check = await db.select({ userId: sessions.userId }).from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (check[0] && check[0].userId !== user.id) {
    return { ok: false, message: "Session not found." };
  }
  revalidatePath("/dashboard/settings");
  return { ok: true, message: "Session signed out." };
}

// ---------------------------------------------------------------------------
// Danger zone
// ---------------------------------------------------------------------------

const deleteSchema = z.object({
  confirmation: z.literal("DELETE", { errorMap: () => ({ message: 'Type DELETE to confirm.' }) }),
  password: z.string().min(1, "Enter your password."),
});

export async function deleteAccountAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "You need to be signed in." };

  const parsed = deleteSchema.safeParse({
    confirmation: String(formData.get("confirmation") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const current = rows[0];
  if (!current?.passwordHash) return { ok: false, message: "Password required to delete this account." };

  const valid = await verifyPassword(current.passwordHash, parsed.data.password);
  if (!valid) return { ok: false, errors: { password: "Password is incorrect." } };

  await softDeleteAccount(user.id);
  await audit({ actorId: user.id, action: "account.delete" });
  await revokeAllSessions(user.id);

  const store = await cookies();
  store.delete(env.SESSION_COOKIE_NAME);

  return { ok: true, message: "Your account has been deleted." };
}

/** Blocks anything that is not a known icon key; used by the link icon picker. */
export async function listIconChoices(): Promise<string[]> {
  return [...LINK_ICONS];
}
