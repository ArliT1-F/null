import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROFILE_CONFIG,
  configWithTheme,
  normalizeProfileConfig,
  themeToCssVars,
} from "@/lib/profile-config";
import { buildProfileCss } from "@/lib/profile-css";

describe("normalizeProfileConfig", () => {
  it("returns defaults for junk input", () => {
    expect(normalizeProfileConfig(null)).toEqual(DEFAULT_PROFILE_CONFIG);
    expect(normalizeProfileConfig("nope")).toEqual(DEFAULT_PROFILE_CONFIG);
    expect(normalizeProfileConfig(42)).toEqual(DEFAULT_PROFILE_CONFIG);
  });

  it("salvages valid fields from a partially invalid config", () => {
    const config = normalizeProfileConfig({
      theme: { text: { accent: "#ff0000", primary: "not-a-colour" } },
    });
    expect(config.theme.text.accent).toBe("#ff0000");
    // The invalid field falls back to the default rather than passing through.
    expect(config.theme.text.primary).toBe(DEFAULT_PROFILE_CONFIG.theme.text.primary);
  });

  it("rejects CSS injection attempts in colour fields", () => {
    const config = normalizeProfileConfig({
      theme: { text: { accent: "red;} body{display:none} .x{" } },
    });
    expect(config.theme.text.accent).toMatch(/^#/);
    expect(config.theme.text.accent).not.toContain("}");
  });

  it("strips unknown keys", () => {
    const config = normalizeProfileConfig({
      theme: { text: { accent: "#123456" }, evil: { script: "<script>" } },
      extra: true,
    }) as Record<string, unknown>;
    expect(config).not.toHaveProperty("extra");
    expect(config.theme).not.toHaveProperty("evil");
  });

  it("clamps out-of-range numbers", () => {
    const config = normalizeProfileConfig({ theme: { card: { opacity: 500 } } });
    expect(config.theme.card.opacity).toBeLessThanOrEqual(100);
  });
});

describe("themeToCssVars", () => {
  it("produces only safe custom property values", () => {
    const vars = themeToCssVars(DEFAULT_PROFILE_CONFIG.theme, DEFAULT_PROFILE_CONFIG.layout);
    for (const [key, value] of Object.entries(vars)) {
      expect(key.startsWith("--p-")).toBe(true);
      expect(value).not.toContain("<");
      expect(value).not.toContain(";");
    }
  });
});

describe("buildProfileCss", () => {
  it("scopes every selector to the profile root", () => {
    const css = buildProfileCss(configWithTheme({ background: { type: "solid", color: "#000000" } }));
    const selectors = css.match(/(^|})\s*([^{}@]+)\{/g) ?? [];
    const offenders = selectors
      .map((s) => s.replace(/^}|{/g, "").trim())
      .filter((s) => s.length > 0 && !s.includes(".null-profile") && !s.startsWith("from") && !s.startsWith("to") && !s.startsWith("100%") && !s.startsWith("@"));
    expect(offenders).toEqual([]);
  });

  it("includes the accent colour in the generated declaration block", () => {
    const css = buildProfileCss(configWithTheme({ text: { accent: "#abcdef" } }));
    expect(css).toContain("--p-accent:#abcdef");
  });

  it("emits no animation when the user disables it", () => {
    const css = buildProfileCss(configWithTheme({ effects: { animatedBackground: false } }));
    expect(css).not.toContain("animation:null-drift");
  });
});
