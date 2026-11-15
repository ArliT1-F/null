"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input, Spinner } from "@/components/ui";
import type { FormState } from "@/app/(auth)/actions";

/** Shared password form for reset and (re)set flows. */
export function PasswordForm({
  action,
  token,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  token: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false } as FormState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.message && <Alert tone="error">{state.message}</Alert>}
      <input type="hidden" name="token" value={token} />

      <Field label="New password" htmlFor="password" error={state.errors?.password} hint="At least 10 characters.">
        <Input id="password" name="password" type="password" required autoComplete="new-password" />
      </Field>

      <Field label="Confirm password" htmlFor="confirmPassword" error={state.errors?.confirmPassword}>
        <Input id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password" />
      </Field>

      <Button type="submit" className="w-full py-2.5" disabled={pending}>
        {pending ? <Spinner /> : null}
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
