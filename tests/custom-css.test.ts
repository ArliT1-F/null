import { describe, expect, it } from "vitest";
import { compileCustomCss, MAX_CUSTOM_CSS_LENGTH } from "@/lib/custom-css";

describe("compileCustomCss — zero-FS parser, scoper & security policy", () => {
  it("returns empty output with ok=true for blank or comment-only CSS", () => {
    expect(compileCustomCss("")).toEqual({ ok: true, css: "", diagnostics: [] });
    expect(compileCustomCss("   /* header comment */  \n ")).toEqual({
      ok: true,
      css: "",
      diagnostics: [],
    });
  });

  it("scopes selectors, root aliases, comma groups, and universal selectors under .null-profile", () => {
    const res = compileCustomCss(`
      :root { --glow: #7ef2c8; }
      html, body { color: #ffffff; }
      .vp-card { border-radius: 28px; }
      .vp-link, .vp-name { letter-spacing: 0.02em; }
      .null-profile .vp-bio { opacity: 0.9; }
      * { box-sizing: border-box; }
      .vp-card > .vp-head { padding: 32px; }
    `);

    expect(res.ok).toBe(true);
    expect(res.diagnostics).toEqual([]);
    // Every selector contains .null-profile
    const selectors = [...res.css.matchAll(/(?:^|[{}])\s*([^{}@]+?)\s*\{/g)].flatMap((m) =>
      m[1].split(",").map((s) => s.trim()),
    );
    expect(selectors.length).toBeGreaterThanOrEqual(8);
    for (const sel of selectors) {
      expect(sel, `Unscoped selector: ${sel}`).toMatch(/^\.null-profile\b/);
    }
    expect(res.css).not.toMatch(/\bhtml\b|\bbody\b|:root/);
  });

  it("namespaces @keyframes with null-u- and rewrites animation references", () => {
    const res = compileCustomCss(`
      @keyframes pulseGlow {
        from { opacity: 0.8; }
        50% { opacity: 1; }
        to { opacity: 0.8; }
      }
      .vp-avatar {
        animation: pulseGlow 3s ease-in-out infinite;
      }
      .vp-link {
        animation-name: pulseGlow;
      }
    `);

    expect(res.ok).toBe(true);
    expect(res.css).toContain("@keyframes null-u-pulseGlow");
    expect(res.css).toContain("animation:null-u-pulseGlow 3s ease-in-out infinite");
    expect(res.css).toContain("animation-name:null-u-pulseGlow");
    expect(res.css).toContain(".null-profile .vp-avatar");

    // Strict idempotency when defence-in-depth re-compiles already-compiled CSS on render
    const second = compileCustomCss(res.css);
    expect(second.ok).toBe(true);
    expect(second.css).toBe(res.css);
  });

  it("recursively scopes rules inside @media and @supports", () => {
    const res = compileCustomCss(`
      @media (max-width: 600px) {
        .vp-card { padding: 16px; }
      }
      @supports (backdrop-filter: blur(8px)) {
        .vp-link { backdrop-filter: blur(8px); }
      }
    `);
    expect(res.ok).toBe(true);
    expect(res.css).toContain("@media (max-width: 600px)");
    expect(res.css).toContain(".null-profile .vp-card");
    expect(res.css).toContain("@supports (backdrop-filter: blur(8px))");
    expect(res.css).toContain(".null-profile .vp-link");
  });

  it.each([
    ["@import exfiltration", `@import "https://evil.example/steal.css";`],
    ["@font-face injection", `@font-face { font-family: x; src: local("Arial"); }`],
    ["@namespace rule", `@namespace svg "http://www.w3.org/2000/svg";`],
    ["@charset rule", `@charset "UTF-8";`],
    ["@property rule", `@property --x { syntax: "*"; inherits: false; }`],
    ["standard url()", `.vp-card { background: url(https://evil.example/beacon.png); }`],
    ["uppercase URL()", `.vp-card { background: URL("https://evil.example/a.png"); }`],
    ["hex-escaped \\75\\72\\6c()", `.vp-card { background: \\75\\72\\6c(https://evil.example/a.png); }`],
    ["letter-escaped u\\rl()", `.vp-card { background-image: u\\rl("/media/x.webp"); }`],
    ["image-set() exfiltration", `.vp-card { background-image: image-set("https://evil.example/a.png" 1x); }`],
    ["-webkit-image-set()", `.vp-card { background-image: -webkit-image-set("a.png" 1x); }`],
    ["escaped image-s\\65t()", `.vp-card { background-image: image-s\\65t("a.png" 1x); }`],
    ["IE expression()", `.vp-card { width: expression(alert(1)); }`],
    ["javascript: scheme", `.vp-card { background: "javascript:alert(1)"; }`],
    ["data: URI", `.vp-card { mask: "data:image/svg+xml,<svg/>"; }`],
    ["-moz-binding", `.vp-card { -moz-binding: none; }`],
    ["behavior property", `.vp-card { behavior: none; }`],
    ["position: fixed overlay", `.vp-card { position: fixed; inset: 0; }`],
    ["escaped position: f\\69xed", `.vp-card { position: f\\69xed; }`],
    ["</style> tag breakout", `.vp-card { content: "</style><script>alert(1)</script>"; }`],
    ["HTML comment token", `<!-- .vp-card { color: red; } -->`],
  ])("blocks dangerous construct: %s", (_label, payload) => {
    const res = compileCustomCss(payload);
    expect(res.ok).toBe(false);
    expect(res.css).toBe("");
    expect(res.diagnostics.length).toBeGreaterThan(0);
    expect(res.diagnostics[0].line).toBeGreaterThanOrEqual(1);
    expect(res.diagnostics[0].column).toBeGreaterThanOrEqual(1);
  });

  it("reports structured syntax errors with line numbers and never throws", () => {
    const res = compileCustomCss(".vp-card {\n  color: #fff;\n");
    expect(res.ok).toBe(false);
    expect(res.diagnostics[0]?.line).toBeGreaterThanOrEqual(1);
  });

  it("enforces MAX_CUSTOM_CSS_LENGTH cap", () => {
    const huge = ".vp-card{color:#fff}\n".repeat(1200);
    expect(huge.length).toBeGreaterThan(MAX_CUSTOM_CSS_LENGTH);
    const res = compileCustomCss(huge);
    expect(res.ok).toBe(false);
    expect(res.diagnostics[0]?.message).toMatch(/16,384|limit/i);
  });
});
