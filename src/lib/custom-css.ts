/**
 * Security-hardened compiler & validator for Pro custom CSS (V2.5, NUL-6).
 *
 * Defence in depth:
 *  1. Custom CSS is NEVER rendered on the main application origin — only inside
 *     a sandboxed iframe (`sandbox` without `allow-same-origin`) on the distinct
 *     `PRO_CSS_SANDBOX_ORIGIN` (public) or an opaque-origin `srcDoc` frame (editor).
 *  2. Even inside the sandbox, this zero-filesystem parser validates syntax,
 *     strips all comments (no `sourceMappingURL` vector), rejects HTML/style-tag
 *     escapes, decodes CSS hex escapes before security checks, rejects external
 *     resource functions (`url()`, `image-set()`, `@import`, `@font-face`),
 *     rejects legacy script vectors (`expression()`, `behavior`, `-moz-binding`,
 *     `javascript:`), prefixes `@keyframes` identifiers, and scopes every
 *     selector under `.null-profile`.
 *  3. Exact 1-based line/column diagnostics feed directly into Monaco Editor.
 */

export const MAX_CUSTOM_CSS_LENGTH = 16_384;

export type CssDiagnostic = {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  severity: "error" | "warning";
};

export type CompiledCustomCss = {
  ok: boolean;
  /** Safe, comment-free, `.null-profile`-scoped stylesheet (empty if invalid or blank). */
  css: string;
  diagnostics: CssDiagnostic[];
};

/** Profile selectors & CSS variables exposed in the editor's quick-reference panel. */
export const CUSTOM_CSS_SELECTORS = [
  { selector: ".null-profile", description: "Profile page root & CSS variables (--p-*)" },
  { selector: ".vp-card", description: "Main profile card container" },
  { selector: ".vp-head", description: "Identity header (avatar, name, bio, badges)" },
  { selector: ".vp-avatar", description: "Avatar image or monogram" },
  { selector: ".vp-name", description: "Display name heading" },
  { selector: ".vp-handle", description: "@username line" },
  { selector: ".vp-bio", description: "Headline and biography text" },
  { selector: ".vp-meta span", description: "Location and status pills" },
  { selector: ".vp-links", description: "Social/external links list" },
  { selector: ".vp-link", description: "Individual link button" },
  { selector: ".vp-link--highlight", description: "Highlighted link button" },
  { selector: ".vp-blocks", description: "Component blocks container" },
  { selector: ".vp-block-text", description: "Text block" },
  { selector: ".vp-block-image", description: "Image block figure" },
  { selector: ".vp-block-gallery", description: "Gallery grid container" },
  { selector: ".vp-block-divider", description: "Divider rule" },
  { selector: ".vp-block-embed", description: "Embed container" },
  { selector: ".vp-canvas-item", description: "Positioned element in Canvas mode" },
] as const;

export const CUSTOM_CSS_VARIABLES = [
  "--p-accent",
  "--p-text",
  "--p-muted",
  "--p-bg",
  "--p-card-radius",
  "--p-card-padding",
  "--p-card-blur",
  "--p-btn-radius",
  "--p-width",
  "--p-gap",
  "--p-font",
  "--p-heading-font",
] as const;

const ALLOWED_CONDITIONAL_ATRULES = new Set(["media", "supports", "container"]);
const FORBIDDEN_PROPERTIES = new Set([
  "behavior",
  "-moz-binding",
  "-webkit-app-region",
  "app-region",
]);

/** Decodes CSS `\XXXXXX` and `\c` escapes so `\75\72\6c(` is recognised as `url(`. */
function decodeCssEscapes(input: string): string {
  return input
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return "";
      try {
        return String.fromCodePoint(code);
      } catch {
        return "";
      }
    })
    .replace(/\\([^\n\r\f])/g, "$1")
    .replace(/\\\r?\n/g, "");
}

function buildLineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function offsetToLineCol(starts: number[], offset: number): { line: number; column: number } {
  const clamped = Math.max(0, offset);
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (starts[mid] <= clamped) low = mid + 1;
    else high = mid - 1;
  }
  const lineIdx = Math.max(0, high);
  return { line: lineIdx + 1, column: clamped - starts[lineIdx] + 1 };
}

/** Replaces comments with same-shape spaces/newlines so line/column offsets stay exact. */
function stripCommentsPreservingOffsets(
  source: string,
  addError: (start: number, end: number, message: string) => void,
): string {
  const chars = source.split("");
  let i = 0;
  let quote: string | null = null;
  let quoteStart = 0;

  while (i < chars.length) {
    const ch = chars[i];
    const next = chars[i + 1];

    if (quote) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "\n") {
        addError(quoteStart, i, "Unterminated string literal");
        quote = null;
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      quoteStart = i;
      i++;
      continue;
    }

    if (ch === "/" && next === "*") {
      const start = i;
      chars[i] = " ";
      chars[i + 1] = " ";
      i += 2;
      let closed = false;
      while (i < chars.length) {
        if (chars[i] === "*" && chars[i + 1] === "/") {
          chars[i] = " ";
          chars[i + 1] = " ";
          i += 2;
          closed = true;
          break;
        }
        if (chars[i] !== "\n") chars[i] = " ";
        i++;
      }
      if (!closed) addError(start, chars.length, "Unterminated comment (missing */)");
      continue;
    }

    i++;
  }

  if (quote) addError(quoteStart, chars.length, "Unterminated string literal");
  return chars.join("");
}

/** Splits a string on `delimiter` only at top level (outside quotes and parens). */
function splitTopLevel(input: string, delimiter: string): { text: string; offset: number }[] {
  const parts: { text: string; offset: number }[] = [];
  let start = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote: string | null = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === "[") bracketDepth++;
    else if (ch === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (ch === delimiter && parenDepth === 0 && bracketDepth === 0) {
      parts.push({ text: input.slice(start, i), offset: start });
      start = i + 1;
    }
  }
  parts.push({ text: input.slice(start), offset: start });
  return parts;
}

/** Finds matching `}` starting right after `{`, respecting strings. */
function findMatchingBrace(source: string, openBraceIndex: number): number {
  let depth = 1;
  let quote: string | null = null;
  for (let i = openBraceIndex + 1; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function hasBalancedParens(input: string): boolean {
  let depth = 0;
  let bracket = 0;
  let quote: string | null = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth < 0) return false;
    } else if (ch === "[") bracket++;
    else if (ch === "]") {
      bracket--;
      if (bracket < 0) return false;
    }
  }
  return depth === 0 && bracket === 0 && quote === null;
}

function scopeSingleSelector(rawSelector: string): { ok: true; scoped: string } | { ok: false; error: string } {
  const sel = rawSelector.trim().replace(/\s+/g, " ");
  if (!sel) return { ok: false, error: "Empty selector" };
  if (/[<{};@]/.test(sel)) return { ok: false, error: "Invalid character in selector" };
  if (!hasBalancedParens(sel)) return { ok: false, error: "Unbalanced brackets or parentheses in selector" };

  const decoded = decodeCssEscapes(sel).toLowerCase();
  if (decoded.includes("url(") || decoded.includes("javascript:")) {
    return { ok: false, error: "Forbidden token in selector" };
  }
  // Reject attribute selectors matching data/value/href to prevent CSS exfiltration gadgets.
  if (/\[\s*(value|href|src|action|csrf|token|nonce)/i.test(decoded)) {
    return { ok: false, error: "Sensitive attribute selectors are not allowed" };
  }

  // Normalise root selectors directly to `.null-profile`.
  if (sel === ":root" || sel === "html" || sel === "body" || sel === ":host") {
    return { ok: true, scoped: ".null-profile" };
  }
  if (/^(:root|html|body)(?=[.#:[\s>+~])/.test(sel)) {
    return { ok: true, scoped: sel.replace(/^(:root|html|body)/, ".null-profile") };
  }
  if (sel === ".null-profile" || /^\.null-profile(?=($|[\s>+~.:#[]))/.test(sel)) {
    return { ok: true, scoped: sel };
  }
  return { ok: true, scoped: `.null-profile ${sel}` };
}

function validateAndFormatDeclarations(
  body: string,
  baseOffset: number,
  keyframeMap: Map<string, string>,
  allowKeyframesStep: boolean,
  addError: (start: number, end: number, message: string) => void,
): string {
  const items = splitTopLevel(body, ";");
  const out: string[] = [];

  for (const item of items) {
    const trimmed = item.text.trim();
    if (!trimmed) continue;

    const localStart = baseOffset + item.offset + item.text.indexOf(trimmed);
    const localEnd = localStart + trimmed.length;

    if (trimmed.includes("{") || trimmed.includes("}")) {
      addError(localStart, localEnd, "Unexpected brace inside declaration block");
      continue;
    }

    const colon = trimmed.indexOf(":");
    if (colon <= 0) {
      addError(localStart, localEnd, `Expected "property: value" declaration`);
      continue;
    }

    const rawProp = trimmed.slice(0, colon).trim();
    const rawValue = trimmed.slice(colon + 1).trim();

    if (!rawValue) {
      addError(localStart, localEnd, `Missing value for "${rawProp}"`);
      continue;
    }

    if (!/^(--[a-zA-Z0-9_-]+|-?[a-zA-Z][a-zA-Z0-9-]*)$/.test(rawProp)) {
      addError(localStart, localStart + rawProp.length, `Invalid CSS property "${rawProp}"`);
      continue;
    }

    const propLower = rawProp.toLowerCase();
    if (FORBIDDEN_PROPERTIES.has(propLower)) {
      addError(localStart, localEnd, `Property "${rawProp}" is not allowed`);
      continue;
    }

    if (!hasBalancedParens(rawValue)) {
      addError(localStart + colon + 1, localEnd, `Unbalanced parentheses or quotes in "${rawProp}"`);
      continue;
    }

    const decodedVal = decodeCssEscapes(rawValue).toLowerCase();
    if (/(^|[^a-z0-9_-])(url|image-set|-webkit-image-set|src)\s*\(/.test(decodedVal)) {
      addError(
        localStart + colon + 1,
        localEnd,
        "External url() and image-set() values are blocked for visitor privacy; use Background or Font uploads instead",
      );
      continue;
    }
    if (
      decodedVal.includes("expression(") ||
      decodedVal.includes("javascript:") ||
      decodedVal.includes("vbscript:") ||
      decodedVal.includes("data:") ||
      decodedVal.includes("-moz-binding")
    ) {
      addError(localStart + colon + 1, localEnd, `Unsafe value in "${rawProp}"`);
      continue;
    }
    if (propLower === "content" && /\battr\s*\(/.test(decodedVal)) {
      addError(localStart + colon + 1, localEnd, "attr() in content is not allowed");
      continue;
    }
    if (!allowKeyframesStep && propLower === "position" && /\bfixed\b/.test(decodedVal)) {
      addError(localStart + colon + 1, localEnd, `Use "position: absolute" or "relative" instead of "fixed"`);
      continue;
    }
    if (/[<>\\]/.test(rawValue) && !/^"[^<>]*"$|^'[^<>]*'$/.test(rawValue)) {
      // Disallow backslash hex escapes and angle brackets in emitted declarations.
      addError(localStart + colon + 1, localEnd, `Escape sequences and angle brackets are not allowed in "${rawProp}"`);
      continue;
    }

    let finalValue = rawValue.replace(/\s+/g, " ");
    if ((propLower === "animation" || propLower === "animation-name") && keyframeMap.size > 0) {
      for (const [userKey, scopedKey] of keyframeMap.entries()) {
        const re = new RegExp(`(^|[\\s,])${userKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[\\s,])`, "g");
        finalValue = finalValue.replace(re, `$1${scopedKey}`);
      }
    }

    const finalProp = rawProp.startsWith("--") ? rawProp : propLower;
    out.push(`${finalProp}:${finalValue}`);
  }

  return out.join(";");
}

export function compileCustomCss(rawInput: string): CompiledCustomCss {
  const input = typeof rawInput === "string" ? rawInput.replace(/\r\n/g, "\n") : "";
  if (!input.trim()) {
    return { ok: true, css: "", diagnostics: [] };
  }

  const lineStarts = buildLineStarts(input);
  const diagnostics: CssDiagnostic[] = [];

  const addError = (start: number, end: number, message: string) => {
    if (diagnostics.length >= 40) return;
    const s = offsetToLineCol(lineStarts, start);
    const e = offsetToLineCol(lineStarts, Math.max(start + 1, end));
    diagnostics.push({
      line: s.line,
      column: s.column,
      endLine: e.line,
      endColumn: e.column,
      message,
      severity: "error",
    });
  };

  if (input.length > MAX_CUSTOM_CSS_LENGTH) {
    addError(
      MAX_CUSTOM_CSS_LENGTH,
      input.length,
      `Custom CSS exceeds the ${MAX_CUSTOM_CSS_LENGTH.toLocaleString()}-character limit`,
    );
    return { ok: false, css: "", diagnostics };
  }

  // Reject NUL bytes and HTML/style breakout sequences before parsing.
  if (input.includes("\0")) {
    const idx = input.indexOf("\0");
    addError(idx, idx + 1, "Null bytes are not allowed");
    return { ok: false, css: "", diagnostics };
  }

  const stripped = stripCommentsPreservingOffsets(input, addError);

  // Reject any `<` outside of valid `@media (width <= 600px)` range syntax.
  const styleClose = input.toLowerCase().indexOf("</style");
  if (styleClose >= 0) {
    addError(styleClose, styleClose + 7, "HTML tags are not allowed in CSS");
    return { ok: false, css: "", diagnostics };
  }
  const scriptTag = input.toLowerCase().indexOf("<script");
  if (scriptTag >= 0) {
    addError(scriptTag, scriptTag + 7, "HTML tags are not allowed in CSS");
    return { ok: false, css: "", diagnostics };
  }
  const htmlComment = stripped.indexOf("<!--");
  if (htmlComment >= 0) {
    addError(htmlComment, htmlComment + 4, "HTML comments are not allowed in CSS");
    return { ok: false, css: "", diagnostics };
  }

  const keyframeMap = new Map<string, string>();

  // First pass: discover `@keyframes <name>` so forward references in `animation:` are rewritten too.
  const kfRegex = /@(?:-webkit-)?keyframes\s+([a-zA-Z_-][a-zA-Z0-9_-]*)\s*\{/g;
  let kfMatch: RegExpExecArray | null;
  while ((kfMatch = kfRegex.exec(stripped)) !== null) {
    const name = kfMatch[1];
    keyframeMap.set(name, name.startsWith("null-u-") ? name : `null-u-${name}`);
  }

  function parseBlockList(segment: string, baseOffset: number, depth: number): string {
    if (depth > 4) {
      addError(baseOffset, baseOffset + segment.length, "CSS nesting is too deep");
      return "";
    }

    const rules: string[] = [];
    let cursor = 0;

    while (cursor < segment.length) {
      while (cursor < segment.length && /\s/.test(segment[cursor])) cursor++;
      if (cursor >= segment.length) break;

      if (segment[cursor] === "}") {
        addError(baseOffset + cursor, baseOffset + cursor + 1, "Unexpected closing brace }");
        cursor++;
        continue;
      }

      // Find next `{` or `;` at top level.
      let i = cursor;
      let quote: string | null = null;
      let found: "{" | ";" | null = null;
      while (i < segment.length) {
        const ch = segment[i];
        if (quote) {
          if (ch === "\\") i++;
          else if (ch === quote) quote = null;
          i++;
          continue;
        }
        if (ch === '"' || ch === "'") quote = ch;
        else if (ch === "{" || ch === ";") {
          found = ch;
          break;
        } else if (ch === "}") {
          addError(baseOffset + i, baseOffset + i + 1, "Unexpected closing brace }");
          cursor = i + 1;
          found = null;
          break;
        }
        i++;
      }

      if (found === null) {
        if (i >= segment.length) {
          const dangling = segment.slice(cursor).trim();
          if (dangling) {
            addError(baseOffset + cursor, baseOffset + segment.length, "Expected { to open a CSS rule");
          }
          break;
        }
        continue;
      }

      const prelude = segment.slice(cursor, i).trim();
      const preludeStart = baseOffset + cursor;

      if (found === ";") {
        // Statement at-rules like @import, @charset, @namespace — all forbidden.
        if (prelude.startsWith("@")) {
          const atName = decodeCssEscapes(prelude.slice(1).split(/[\s("']/)[0] ?? "").toLowerCase();
          addError(preludeStart, baseOffset + i + 1, `@${atName || "rule"} is not allowed in profile CSS`);
        } else if (prelude) {
          addError(preludeStart, baseOffset + i + 1, "Declarations must be placed inside a selector block");
        }
        cursor = i + 1;
        continue;
      }

      // found === "{"
      const closeIdx = findMatchingBrace(segment, i);
      if (closeIdx < 0) {
        addError(baseOffset + i, baseOffset + i + 1, "Unclosed { block");
        break;
      }

      const inner = segment.slice(i + 1, closeIdx);
      const innerStart = baseOffset + i + 1;

      if (prelude.startsWith("@")) {
        const match = prelude.match(/^@([a-zA-Z-]+)([\s\S]*)$/);
        const rawAt = match?.[1]?.toLowerCase() ?? "";
        const params = (match?.[2] ?? "").trim().replace(/\s+/g, " ");
        const decodedPrelude = decodeCssEscapes(prelude).toLowerCase();

        if (decodedPrelude.includes("url(") || decodedPrelude.includes("import")) {
          addError(preludeStart, baseOffset + i, `@${rawAt} cannot load external resources`);
        } else if (rawAt === "keyframes" || rawAt === "-webkit-keyframes") {
          if (!/^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(params)) {
            addError(preludeStart, baseOffset + i, "Invalid @keyframes name");
          } else {
            const scopedName =
              keyframeMap.get(params) ?? (params.startsWith("null-u-") ? params : `null-u-${params}`);
            keyframeMap.set(params, scopedName);
            const steps = parseKeyframes(inner, innerStart);
            if (steps) rules.push(`@keyframes ${scopedName}{${steps}}`);
          }
        } else if (ALLOWED_CONDITIONAL_ATRULES.has(rawAt)) {
          if (!params || !hasBalancedParens(params) || /[;{}]/.test(params) || /<\/?/i.test(params)) {
            addError(preludeStart, baseOffset + i, `Invalid @${rawAt} condition`);
          } else {
            // Only allow `<` or `>` inside parenthesised media range expressions like `(width <= 600px)`.
            const safeCondition = /^[a-zA-Z0-9\s(),:._+\-/*<>=]+$/.test(params);
            if (!safeCondition) {
              addError(preludeStart, baseOffset + i, `Unsupported characters in @${rawAt} condition`);
            } else {
              const nested = parseBlockList(inner, innerStart, depth + 1);
              if (nested) rules.push(`@${rawAt} ${params}{${nested}}`);
            }
          }
        } else {
          addError(
            preludeStart,
            baseOffset + i,
            `@${rawAt} is not allowed (supported: @media, @supports, @container, @keyframes)`,
          );
        }
      } else {
        const selectorParts = splitTopLevel(prelude, ",");
        const scopedSelectors: string[] = [];
        for (const part of selectorParts) {
          const result = scopeSingleSelector(part.text);
          if (!result.ok) {
            addError(preludeStart + part.offset, preludeStart + part.offset + Math.max(1, part.text.length), result.error);
          } else {
            scopedSelectors.push(result.scoped);
          }
        }
        const decls = validateAndFormatDeclarations(inner, innerStart, keyframeMap, false, addError);
        if (scopedSelectors.length > 0 && decls) {
          rules.push(`${scopedSelectors.join(",")}{${decls}}`);
        }
      }

      cursor = closeIdx + 1;
    }

    return rules.join("\n");
  }

  function parseKeyframes(segment: string, baseOffset: number): string {
    const steps: string[] = [];
    let cursor = 0;
    while (cursor < segment.length) {
      while (cursor < segment.length && /\s/.test(segment[cursor])) cursor++;
      if (cursor >= segment.length) break;
      const openIdx = segment.indexOf("{", cursor);
      if (openIdx < 0) {
        addError(baseOffset + cursor, baseOffset + segment.length, "Expected { in @keyframes step");
        break;
      }
      const closeIdx = findMatchingBrace(segment, openIdx);
      if (closeIdx < 0) {
        addError(baseOffset + openIdx, baseOffset + openIdx + 1, "Unclosed { in @keyframes step");
        break;
      }
      const stepSel = segment.slice(cursor, openIdx).trim().replace(/\s+/g, " ");
      const validStep = stepSel
        .split(",")
        .map((s) => s.trim())
        .every((s) => s === "from" || s === "to" || /^(100|[0-9]{1,2}(\.[0-9]+)?)%$/.test(s));
      if (!validStep) {
        addError(baseOffset + cursor, baseOffset + openIdx, `Invalid @keyframes selector "${stepSel}"`);
      } else {
        const decls = validateAndFormatDeclarations(
          segment.slice(openIdx + 1, closeIdx),
          baseOffset + openIdx + 1,
          keyframeMap,
          true,
          addError,
        );
        if (decls) steps.push(`${stepSel}{${decls}}`);
      }
      cursor = closeIdx + 1;
    }
    return steps.join("");
  }

  const compiled = parseBlockList(stripped, 0, 0);
  if (diagnostics.length > 0) {
    return { ok: false, css: "", diagnostics };
  }

  // Final defence-in-depth post-condition: never emit `</style` or `@import`.
  if (/<\/style/i.test(compiled) || /@import/i.test(compiled)) {
    addError(0, 1, "Compiled stylesheet failed safety verification");
    return { ok: false, css: "", diagnostics };
  }

  return { ok: true, css: compiled, diagnostics: [] };
}
