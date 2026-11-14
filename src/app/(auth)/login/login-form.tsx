"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, Button, Field, Input, Spinner } from "@/components/ui";
import { loginAction, type FormState } from "../actions";

const initial: FormState = { ok: false };

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.message && <Alert tone="error">{state.message}</Alert>}

      <input type="hidden" name="redirectTo" value={redirectTo ?? ""} />

      <Field label="Email" htmlFor="email" error={state.errors?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
          placeholder="you@example.com"
          aria-invalid={Boolean(state.errors?.email)}
        />
      </Field>

      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••••"
        />
      </Field>

      <div className="flex items-center justify-between">
        <Link href="/forgot-password" className="text-sm text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white">
          Forgot password?
        </Link>
      </div>

      <Button type="submit" className="w-full py-2.5" disabled={pending}>
        {pending ? <Spinner /> : null}
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
