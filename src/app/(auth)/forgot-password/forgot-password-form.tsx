"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input, Spinner } from "@/components/ui";
import { requestPasswordResetAction, type FormState } from "../actions";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, { ok: false } as FormState);

  if (state.ok && state.message) {
    return (
      <Alert tone="success">
        {state.message}
        <br />
        <span className="text-xs opacity-80">
          Check your spam folder if it does not arrive within a few minutes.
        </span>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.message && !state.ok && <Alert tone="error">{state.message}</Alert>}

      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
      </Field>

      <Button type="submit" className="w-full py-2.5" disabled={pending}>
        {pending ? <Spinner /> : null}
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
