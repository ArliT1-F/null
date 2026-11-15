"use client";

import { Check, X } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Alert, Button, Field, Icon, Input, Spinner } from "@/components/ui";
import { passwordStrength } from "@/lib/password-strength";
import { registerAction, type FormState } from "../actions";

const initial: FormState = { ok: false };

type Availability =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "taken"; reason: string };

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initial);
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState(state.values?.username ?? "");
  const [availability, setAvailability] = useState<Availability>({ state: "idle" });

  // Live username availability, debounced. The server re-validates on submit —
  // this is purely to give fast feedback while typing.
  useEffect(() => {
    const value = username.trim();
    if (value.length < 3) {
      setAvailability({ state: "idle" });
      return;
    }

    setAvailability({ state: "checking" });
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/username/check?u=${encodeURIComponent(value)}`);
        const data = (await res.json()) as { available: boolean; reason?: string };
        setAvailability(
          data.available ? { state: "available" } : { state: "taken", reason: data.reason ?? "Unavailable" },
        );
      } catch {
        setAvailability({ state: "idle" });
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [username]);

  const strength = passwordStrength(password);
  const bars = ["bg-red-400", "bg-orange-400", "bg-amber-400", "bg-brand-400", "bg-brand-500"];

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.message && <Alert tone="error">{state.message}</Alert>}

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

      <Field
        label="Username"
        htmlFor="username"
        error={state.errors?.username}
        hint="Letters, numbers, dots, dashes and underscores. This becomes your profile URL."
      >
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">
            /
          </span>
          <Input
            id="username"
            name="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="pl-6 pr-10"
            placeholder="yourname"
            autoComplete="username"
            aria-invalid={Boolean(state.errors?.username)}
            aria-describedby="username-status"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2" id="username-status">
            {availability.state === "checking" && <Spinner className="size-3.5 text-ink-400" />}
            {availability.state === "available" && <Icon icon={Check} className="size-4 text-brand-500" />}
            {availability.state === "taken" && <Icon icon={X} className="size-4 text-red-500" />}
          </span>
        </div>
        {availability.state === "taken" && (
          <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{availability.reason}</p>
        )}
        {availability.state === "available" && (
          <p className="mt-1.5 text-xs font-medium text-brand-600 dark:text-brand-400">
            {username.trim().toLowerCase()} is available
          </p>
        )}
      </Field>

      <Field label="Password" htmlFor="password" error={state.errors?.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 10 characters"
          aria-invalid={Boolean(state.errors?.password)}
        />
        {password.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex flex-1 gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className={`h-1 flex-1 rounded-full ${i <= strength.score ? bars[strength.score] : "bg-ink-200 dark:bg-white/10"}`}
                />
              ))}
            </div>
            <span className="w-12 text-right text-[11px] text-ink-500">{strength.hint}</span>
          </div>
        )}
      </Field>

      <Button type="submit" className="w-full py-2.5" disabled={pending || availability.state === "taken"}>
        {pending ? <Spinner /> : null}
        {pending ? "Creating…" : "Create account"}
      </Button>
    </form>
  );
}
