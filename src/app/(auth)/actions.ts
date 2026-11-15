"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { authTokens, users } from "@/db/schema";
import { findUserByEmail, registerAccount } from "@/lib/accounts";
import { audit, createSession, destroyCurrentSession, revokeAllSessions } from "@/lib/auth/session";
import { hashToken, randomToken } from "@/lib/crypto";
import { sendMail, passwordResetEmail, verificationEmail } from "@/lib/mail";
import { dummyVerify, hashPassword, verifyPassword } from "@/lib/password";
import { LIMITS, consume } from "@/lib/rate-limit";
import { fieldErrors, loginSchema, passwordSchema, registerSchema } from "@/lib/validation";
import { validateUsername } from "@/lib/username";

export type FormState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
};

/** Fake request handle for rate limiting inside server actions. */
async function requestKey(scope: string): Promise<string> {
  const h = await headers();
  // Server actions receive the same forwarded headers as a normal request.
  const ip =
    h.get("cf-connecting-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "local";
  return `${scope}:${ip}`;
}

function actionRequest(hdrs: Headers): Request {
  return new Request("http://internal", { headers: hdrs });
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const hdrs = await headers();
  const key = await requestKey("register");
  const limit = consume(key, LIMITS.register.limit, LIMITS.register.windowMs);
  if (!limit.allowed) {
    return { ok: false, message: "Too many attempts. Please try again later." };
  }

  const raw = {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    username: String(formData.get("username") ?? "").trim(),
  };
  const values = { email: raw.email, username: raw.username };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error), values };
  }

  const usernameCheck = validateUsername(parsed.data.username);
  if (!usernameCheck.ok) {
    return { ok: false, errors: { username: usernameCheck.reason }, values };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const result = await registerAccount({
    email: parsed.data.email,
    password: parsed.data.password,
    username: parsed.data.username,
    passwordHash,
  });

  if (!result.ok) {
    return { ok: false, errors: { [result.field]: result.reason }, values };
  }

  // Issue a verification token but do not block the account on it.
  const token = randomToken(32);
  await db.insert(authTokens).values({
    userId: result.userId,
    purpose: "EMAIL_VERIFICATION",
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  const user = await findUserByEmail(parsed.data.email);
  if (user) {
    await sendMail(verificationEmail({ to: user.email, username: user.usernameDisplay, token }));
  }

  await createSession(result.userId, actionRequest(hdrs));
  await audit({
    actorId: result.userId,
    action: "auth.register",
    targetType: "user",
    targetId: result.userId,
    req: actionRequest(hdrs),
  });

  redirect("/dashboard?welcome=1");
}

// ---------------------------------------------------------------------------
// Log in / log out
// ---------------------------------------------------------------------------

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const hdrs = await headers();
  const key = await requestKey("login");
  const limit = consume(key, LIMITS.login.limit, LIMITS.login.windowMs);
  if (!limit.allowed) {
    return { ok: false, message: "Too many sign-in attempts. Please wait a few minutes." };
  }

  const raw = {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
  const values = { email: raw.email };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error), values };
  }

  const user = await findUserByEmail(parsed.data.email);

  // Always do the expensive check so unknown emails and wrong passwords take
  // the same amount of time.
  const valid = user?.passwordHash
    ? await verifyPassword(user.passwordHash, parsed.data.password)
    : await dummyVerify(parsed.data.password);

  if (!user || !valid || !user.passwordHash) {
    return { ok: false, message: "Email or password is incorrect.", values };
  }
  if (user.status !== "ACTIVE") {
    return { ok: false, message: "This account is not available.", values };
  }

  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id));
  await createSession(user.id, actionRequest(hdrs));
  await audit({ actorId: user.id, action: "auth.login", req: actionRequest(hdrs) });

  const redirectTo = String(formData.get("redirectTo") ?? "");
  redirect(isSafeRedirect(redirectTo) ? redirectTo : "/dashboard");
}

export async function logoutAction(): Promise<void> {
  const hdrs = await headers();
  const { getCurrentUser } = await import("@/lib/auth/session");
  const user = await getCurrentUser();
  if (user) {
    await audit({ actorId: user.id, action: "auth.logout", req: actionRequest(hdrs) });
  }
  await destroyCurrentSession();
  redirect("/");
}

function isSafeRedirect(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\");
}

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

export async function verifyEmailAction(token: string): Promise<{ ok: boolean; message: string }> {
  const tokenHash = hashToken(token);
  const rows = await db.select().from(authTokens).where(eq(authTokens.tokenHash, tokenHash)).limit(1);
  const record = rows[0];

  if (!record || record.purpose !== "EMAIL_VERIFICATION") {
    return { ok: false, message: "This verification link is not valid." };
  }
  if (record.usedAt) {
    return { ok: false, message: "This link has already been used." };
  }
  if (record.expiresAt.getTime() < Date.now()) {
    return { ok: false, message: "This link has expired. Request a new one from your settings." };
  }

  await db.transaction(async (tx) => {
    await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, record.userId));
    await tx.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, record.id));
  });

  return { ok: true, message: "Your email address is confirmed." };
}

export async function resendVerificationAction(): Promise<FormState> {
  const { getCurrentUser } = await import("@/lib/auth/session");
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "You need to be signed in." };
  if (user.emailVerified) return { ok: false, message: "Your email is already confirmed." };

  const key = await requestKey("resend-verification");
  const limit = consume(key, 3, 60 * 60_000);
  if (!limit.allowed) return { ok: false, message: "Please wait before requesting another email." };

  const token = randomToken(32);
  await db.insert(authTokens).values({
    userId: user.id,
    purpose: "EMAIL_VERIFICATION",
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  await sendMail(verificationEmail({ to: user.email, username: user.usernameDisplay, token }));
  return { ok: true, message: "Verification email sent." };
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

export async function requestPasswordResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const key = await requestKey("password-reset");
  const limit = consume(key, LIMITS.passwordReset.limit, LIMITS.passwordReset.windowMs);
  if (!limit.allowed) {
    return { ok: false, message: "Too many requests. Please try again later." };
  }

  // Always report success: this endpoint must not reveal whether an account exists.
  const successMessage = "If that email is registered, a reset link is on its way.";

  const user = await findUserByEmail(email);
  if (!user || user.status !== "ACTIVE") {
    return { ok: true, message: successMessage };
  }

  const token = randomToken(32);
  await db.insert(authTokens).values({
    userId: user.id,
    purpose: "PASSWORD_RESET",
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  await sendMail(passwordResetEmail({ to: user.email, username: user.usernameDisplay, token }));
  return { ok: true, message: successMessage };
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) {
    return { ok: false, errors: { password: parsed.error.issues[0].message } };
  }
  if (password !== confirm) {
    return { ok: false, errors: { confirmPassword: "Passwords do not match." } };
  }

  const rows = await db
    .select()
    .from(authTokens)
    .where(eq(authTokens.tokenHash, hashToken(token)))
    .limit(1);
  const record = rows[0];

  if (!record || record.purpose !== "PASSWORD_RESET" || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    return { ok: false, message: "This reset link is invalid or has expired." };
  }

  const passwordHash = await hashPassword(password);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, record.userId));
    await tx.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, record.id));
  });

  // A password reset invalidates every existing session — that is the point.
  await revokeAllSessions(record.userId);
  await audit({ actorId: record.userId, action: "auth.password_reset" });

  redirect("/login?reset=1");
}
