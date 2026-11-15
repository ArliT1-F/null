"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------
 * Editor controls.
 *
 * Every control is keyboard accessible and announces its value. Range inputs are
 * laid out so the number is editable too — sliders alone are hard to use with a
 * keyboard.
 * ---------------------------------------------------------------------- */

export function ControlGroup({
  title,
  children,
  defaultOpen = true,
  id,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  id?: string;
}) {
  return (
    <details className="group border-b border-ink-200/70 last:border-0 dark:border-white/[0.07]" open={defaultOpen} id={id}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[13px] font-medium text-ink-800 hover:bg-ink-50 dark:text-ink-100 dark:hover:bg-white/[0.03]">
        {title}
        <svg
          className="size-3.5 text-ink-400 transition-transform group-open:rotate-180"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          suppressHydrationWarning
        >
          <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="space-y-3.5 px-4 pb-5 pt-1">{children}</div>
    </details>
  );
}

export function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-xs text-ink-600 dark:text-ink-300">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            if (/^#?[0-9a-fA-F]{0,8}$/.test(next)) {
              onChange(next.startsWith("#") ? next : `#${next}`);
            }
          }}
          className="w-[5.5rem] rounded-md border border-ink-200 bg-white px-2 py-1 font-mono text-[11px] uppercase dark:border-white/10 dark:bg-black/30"
          aria-label={`${label} hex value`}
        />
        <span className="relative size-7 shrink-0 overflow-hidden rounded-md border border-ink-200 dark:border-white/15">
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute -inset-2 size-[calc(100%+1rem)] cursor-pointer border-0 p-0"
            aria-label={`Pick ${label.toLowerCase()}`}
          />
        </span>
      </div>
    </div>
  );
}

export function RangeControl({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="text-xs text-ink-600 dark:text-ink-300">
          {label}
        </label>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
          className="w-14 rounded-md border border-ink-200 bg-white px-1.5 py-0.5 text-right font-mono text-[11px] dark:border-white/10 dark:bg-black/30"
          aria-label={`${label} numeric value`}
        />
      </div>
      <input
        id={id}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-200 accent-brand-500 dark:bg-white/15"
        aria-valuetext={`${value}${unit}`}
      />
    </div>
  );
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  columns = 3,
}: {
  label?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  columns?: number;
}) {
  return (
    <div>
      {label && <p className="mb-1.5 text-xs text-ink-600 dark:text-ink-300">{label}</p>}
      <div
        className="grid gap-1 rounded-lg bg-ink-100 p-1 dark:bg-white/[0.06]"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        role="group"
        aria-label={label}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={cn(
              "rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors",
              value === option.value
                ? "bg-white text-ink-950 shadow-sm dark:bg-ink-700 dark:text-white"
                : "text-ink-500 hover:text-ink-800 dark:text-ink-300 dark:hover:text-white",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ToggleControl({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <label htmlFor={id} className="text-xs font-medium text-ink-700 dark:text-ink-200">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[11px] text-ink-400">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-brand-500" : "bg-ink-200 dark:bg-white/15",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-[1.15rem]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

export function TextControl({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
}) {
  const id = useId();
  const shared = {
    id,
    value,
    maxLength,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    className:
      "w-full rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-black/25 dark:text-white",
    "aria-label": label,
  };
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="text-xs text-ink-600 dark:text-ink-300">
          {label}
        </label>
        {maxLength && (
          <span className="text-[10px] tabular-nums text-ink-400">
            {value.length}/{maxLength}
          </span>
        )}
      </div>
      {multiline ? <textarea rows={3} {...shared} /> : <input type="text" {...shared} />}
    </div>
  );
}
