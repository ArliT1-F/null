"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  compileCustomCss,
  CUSTOM_CSS_SELECTORS,
  CUSTOM_CSS_VARIABLES,
  MAX_CUSTOM_CSS_LENGTH,
} from "@/lib/custom-css";
import type { Entitlements } from "@/lib/entitlements";

const MonacoCssEditor = dynamic(() => import("./monaco-css-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[300px] w-full items-center justify-center rounded-xl border border-ink-200 bg-[#0c0d11] text-xs text-ink-400 dark:border-white/10">
      Loading CSS editor…
    </div>
  ),
});

const STARTER_SNIPPETS = [
  {
    name: "Neon border",
    css: `.vp-card {\n  border-color: color-mix(in srgb, var(--p-accent) 50%, transparent);\n  box-shadow: 0 0 44px -14px var(--p-accent);\n}`,
  },
  {
    name: "Gradient name",
    css: `.vp-name {\n  background: linear-gradient(95deg, var(--p-text), var(--p-accent));\n  -webkit-background-clip: text;\n  color: transparent;\n}`,
  },
  {
    name: "Pill hover",
    css: `.vp-link:hover {\n  letter-spacing: 0.02em;\n  background: color-mix(in srgb, var(--p-accent) 18%, transparent);\n}`,
  },
] as const;

/**
 * Entitlement-gated Pro Custom CSS panel (V2.5, NUL-6).
 *
 * Raw CSS is kept strictly out of `ProfileConfig`, validated + scoped live with
 * `compileCustomCss`, previewed exclusively inside an opaque-origin sandboxed
 * iframe, and served publicly only from `PRO_CSS_SANDBOX_ORIGIN`.
 */
export function CssPanel({
  value,
  dirty,
  saving,
  entitlements,
  sandboxPreview,
  onToggleSandboxPreview,
  onChange,
  onSave,
}: {
  value: string;
  dirty: boolean;
  saving: boolean;
  entitlements: Entitlements;
  sandboxPreview: boolean;
  onToggleSandboxPreview: (next: boolean) => void;
  onChange: (next: string) => void;
  onSave: () => void;
}) {
  const [revealLine, setRevealLine] = useState<number | null>(null);
  const [showFallbackTextarea, setShowFallbackTextarea] = useState(false);

  const compiled = useMemo(() => compileCustomCss(value), [value]);

  if (!entitlements.canEditCustomCss) {
    return (
      <div className="space-y-4 p-4">
        <div className="rounded-xl border border-ink-200 bg-ink-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">
              Pro · Isolated
            </span>
            <h3 className="text-sm font-semibold">Custom CSS</h3>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
            {entitlements.customCssDisabledReason ??
              "Author scoped stylesheet overrides in a syntax-highlighted Monaco editor, rendered inside a dedicated sandbox origin."}
          </p>
          <ul className="mt-3 space-y-1.5 text-[11px] text-ink-500 dark:text-ink-400">
            <li>· Separate origin iframe sandbox — never runs on the primary app domain</li>
            <li>· Zero external fetches (`@import` and `url()` blocked for visitor privacy)</li>
            <li>· Versioned and append-only restorable alongside your published revisions</li>
          </ul>
        </div>
      </div>
    );
  }

  function insertSnippet(snippet: string) {
    const next = value.trim() ? `${value.trimEnd()}\n\n${snippet}\n` : `${snippet}\n`;
    onChange(next);
    if (!sandboxPreview) onToggleSandboxPreview(true);
  }

  return (
    <div className="space-y-3.5 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">
            Pro CSS
          </span>
          <span className="text-[11px] tabular-nums text-ink-400">
            {value.length.toLocaleString()}/{MAX_CUSTOM_CSS_LENGTH.toLocaleString()}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowFallbackTextarea((s) => !s)}
          className="text-[11px] text-ink-400 hover:text-ink-800 dark:hover:text-white"
        >
          {showFallbackTextarea ? "Monaco view" : "Plain text"}
        </button>
      </div>

      {!entitlements.canPublishCustomCss && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
          {entitlements.customCssDisabledReason}
        </div>
      )}

      {/* Starter snippets */}
      <div className="flex flex-wrap gap-1.5">
        {STARTER_SNIPPETS.map((s) => (
          <button
            key={s.name}
            type="button"
            onClick={() => insertSnippet(s.css)}
            className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] text-ink-600 hover:border-brand-500/50 hover:text-ink-950 dark:border-white/10 dark:bg-white/[0.03] dark:text-ink-300 dark:hover:text-white"
          >
            + {s.name}
          </button>
        ))}
      </div>

      {showFallbackTextarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={13}
          maxLength={MAX_CUSTOM_CSS_LENGTH}
          spellCheck={false}
          aria-label="Custom profile CSS"
          placeholder={`.vp-card {\n  border-color: var(--p-accent);\n}`}
          className="w-full rounded-xl border border-ink-200 bg-[#0c0d11] p-3 font-mono text-xs leading-relaxed text-emerald-100 dark:border-white/10"
        />
      ) : (
        <MonacoCssEditor
          value={value}
          onChange={onChange}
          diagnostics={compiled.diagnostics}
          revealLine={revealLine}
        />
      )}

      {/* Live validation banner & clickable diagnostics */}
      {compiled.ok ? (
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-emerald-600 dark:text-emerald-400">
            {value.trim() ? "✓ Valid & scoped to .null-profile" : "No custom CSS rules yet"}
          </span>
          {value.trim() && (
            <button
              type="button"
              onClick={() => onToggleSandboxPreview(!sandboxPreview)}
              className="font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              {sandboxPreview ? "Interactive canvas" : "Preview in sandbox →"}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-1 rounded-lg border border-red-500/30 bg-red-500/[0.07] p-2.5">
          <p className="text-[11px] font-semibold text-red-600 dark:text-red-300">
            {compiled.diagnostics.length} {compiled.diagnostics.length === 1 ? "issue" : "issues"} to fix before saving
          </p>
          <ul className="max-h-28 space-y-1 overflow-y-auto text-[11px] text-red-600 dark:text-red-300">
            {compiled.diagnostics.map((d, i) => (
              <li key={`${d.line}-${d.column}-${i}`}>
                <button
                  type="button"
                  onClick={() => setRevealLine(d.line)}
                  className="text-left hover:underline"
                >
                  <span className="font-mono">
                    L{d.line}:{d.column}
                  </span>{" "}
                  — {d.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirty || !compiled.ok}
          className="btn-primary flex-1 text-xs"
        >
          {saving ? "Saving CSS…" : dirty ? "Save CSS draft" : "CSS saved"}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="btn-secondary text-xs"
          >
            Clear
          </button>
        )}
      </div>

      {/* Selector & token reference */}
      <details className="rounded-xl border border-ink-200/80 dark:border-white/[0.08]">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-ink-600 dark:text-ink-300">
          Selectors &amp; variables reference
        </summary>
        <div className="space-y-3 border-t border-ink-200/70 p-3 text-[11px] dark:border-white/[0.07]">
          <div className="space-y-1">
            {CUSTOM_CSS_SELECTORS.slice(0, 12).map((s) => (
              <button
                key={s.selector}
                type="button"
                onClick={() => insertSnippet(`${s.selector} {\n  \n}`)}
                className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-0.5 text-left hover:bg-ink-100 dark:hover:bg-white/[0.05]"
              >
                <code className="font-mono text-brand-600 dark:text-brand-300">{s.selector}</code>
                <span className="truncate text-ink-400">{s.description}</span>
              </button>
            ))}
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
              Theme variables
            </p>
            <div className="flex flex-wrap gap-1">
              {CUSTOM_CSS_VARIABLES.map((v) => (
                <code
                  key={v}
                  className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] text-ink-600 dark:bg-white/[0.06] dark:text-ink-300"
                >
                  {v}
                </code>
              ))}
            </div>
          </div>
          <p className="text-[10px] leading-relaxed text-ink-400">
            External <code>@import</code>, <code>@font-face</code>, and <code>url()</code> rules are rejected automatically. Use Design → Type or Backdrop to upload custom fonts, images, and videos safely.
          </p>
        </div>
      </details>
    </div>
  );
}
