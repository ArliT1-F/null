"use client";

import { useActionState, useState, useTransition } from "react";
import { Alert, Button, Field, Input, Spinner } from "@/components/ui";
import {
  changeEmailAction,
  changePasswordAction,
  changeUsernameAction,
  deleteAccountAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
  type SettingsState,
} from "./actions";
import { timeAgo } from "@/lib/utils";

const initial: SettingsState = { ok: false };

export function ChangeUsernameForm({
  currentUsername,
  cooldownMessage,
}: {
  currentUsername: string;
  cooldownMessage: string | null;
}) {
  const [state, formAction, pending] = useActionState(changeUsernameAction, initial);
  const disabled = Boolean(cooldownMessage);

  return (
    <form action={formAction} className="space-y-3" noValidate>
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      {cooldownMessage && !state.message && <Alert tone="info">{cooldownMessage}</Alert>}

      <Field label="New username" htmlFor="new-username" error={state.errors?.username}>
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">/</span>
          <Input
            id="new-username"
            name="username"
            className="pl-6"
            placeholder={currentUsername}
            defaultValue=""
            disabled={disabled}
            autoComplete="off"
          />
        </div>
      </Field>

      <Button type="submit" variant="ghost" disabled={pending || disabled}>
        {pending ? <Spinner className="size-3.5" /> : null}
        Update username
      </Button>
    </form>
  );
}

export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, formAction, pending] = useActionState(changeEmailAction, initial);

  return (
    <form action={formAction} className="space-y-3" noValidate>
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="New email" htmlFor="new-email" error={state.errors?.email}>
          <Input id="new-email" name="email" type="email" placeholder={currentEmail} autoComplete="email" />
        </Field>
        <Field label="Confirm with password" htmlFor="email-password" error={state.errors?.password}>
          <Input id="email-password" name="password" type="password" autoComplete="current-password" placeholder="••••••••••" />
        </Field>
      </div>

      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? <Spinner className="size-3.5" /> : null}
        Update email
      </Button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initial);

  return (
    <form action={formAction} className="space-y-3" noValidate>
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}

      <Field label="Current password" htmlFor="current-password" error={state.errors?.currentPassword}>
        <Input id="current-password" name="currentPassword" type="password" autoComplete="current-password" />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="New password" htmlFor="new-password" error={state.errors?.newPassword}>
          <Input id="new-password" name="newPassword" type="password" autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm-password" error={state.errors?.confirmPassword}>
          <Input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" />
        </Field>
      </div>

      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? <Spinner className="size-3.5" /> : null}
        Update password
      </Button>
    </form>
  );
}

export function SessionList({
  sessions,
  lastSeen,
}: {
  sessions: { id: string; userAgent: string | null; createdAt: string; lastUsedAt: string }[];
  lastSeen: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="mt-4">
      {message && (
        <Alert tone="success" className="mb-3">
          {message}
        </Alert>
      )}

      <ul className="divide-y divide-ink-100 dark:divide-white/[0.06]">
        {sessions.map((session, index) => (
          <li key={session.id} className="flex items-center justify-between gap-3 py-3 first:pt-0">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">
                {describeAgent(session.userAgent)}
                {index === 0 && <span className="ml-2 text-[11px] font-normal text-brand-600 dark:text-brand-300">this device</span>}
              </p>
              <p className="text-[11px] text-ink-400">
                Started {timeAgo(session.createdAt)} · last active {timeAgo(session.lastUsedAt)}
              </p>
            </div>
            {index !== 0 && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await revokeSessionAction(session.id);
                    setMessage(result.message ?? null);
                  })
                }
                className="shrink-0 text-[11px] text-ink-500 hover:text-red-600 dark:hover:text-red-400"
              >
                Sign out
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-[11px] text-ink-400">{lastSeen ? `Last seen ${lastSeen}` : ""}</p>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending || sessions.length < 2}
          onClick={() =>
            startTransition(async () => {
              const result = await revokeOtherSessionsAction();
              setMessage(result.message ?? null);
            })
          }
          className="text-[11px]"
        >
          Sign out all other devices
        </Button>
      </div>
    </div>
  );
}

function describeAgent(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "iOS device";
  if (/android/i.test(userAgent)) return "Android device";
  if (/macintosh|mac os x/i.test(userAgent)) return "macOS browser";
  if (/windows/i.test(userAgent)) return "Windows browser";
  if (/linux/i.test(userAgent)) return "Linux browser";
  return "Browser";
}

export function DangerZone() {
  const [state, formAction, pending] = useActionState(deleteAccountAction, initial);

  if (state.ok && state.message) {
    return <Alert tone="success">{state.message}</Alert>;
  }

  return (
    <form action={formAction} className="space-y-3" noValidate>
      {state.message && <Alert tone="error">{state.message}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label='Type "DELETE" to confirm' htmlFor="confirm-delete" error={state.errors?.confirmation}>
          <Input id="confirm-delete" name="confirmation" placeholder="DELETE" autoComplete="off" />
        </Field>
        <Field label="Your password" htmlFor="delete-password" error={state.errors?.password}>
          <Input id="delete-password" name="password" type="password" autoComplete="current-password" />
        </Field>
      </div>

      <Button type="submit" variant="danger" disabled={pending}>
        {pending ? <Spinner className="size-3.5" /> : null}
        Permanently delete account
      </Button>
    </form>
  );
}
