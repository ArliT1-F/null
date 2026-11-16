import { describe, expect, it } from "vitest";
import { backgroundImageFor, safeBackgroundUrl } from "@/lib/background-image";
import { buildProfileCss } from "@/lib/profile-css";
import { configWithTheme } from "@/lib/profile-config";

/**
 * Background images are the one place where a user-supplied string ends up in
 * generated CSS, so both the resolver and the stylesheet that consumes it are
 * covered here: a valid upload/paste has to render, and anything else must be
 * dropped rather than interpolated.
 */
describe("safeBackgroundUrl", () => {
  it("accepts same-origin media paths written by the uploader", () => {
    const url = "/api/media/backgrounds/user-1/2026/ab12@1600.webp";
    expect(safeBackgroundUrl(url)).toBe(url);
  });

  it("trims pasted values", () => {
    expect(safeBackgroundUrl("  /api/media/backgrounds/u/x.webp \n")).toBe("/api/media/backgrounds/u/x.webp");
    expect(safeBackgroundUrl("  https://cdn.example.com/x.jpg  ")).toBe("https://cdn.example.com/x.jpg");
  });

  it("accepts absolute http(s) URLs", () => {
    expect(safeBackgroundUrl("https://cdn.example.com/a/b.png?w=10&h=10")).toBe(
      "https://cdn.example.com/a/b.png?w=10&h=10",
    );
    expect(safeBackgroundUrl("http://localhost:8080/a.jpg")).toBe("http://localhost:8080/a.jpg");
  });

  it("rejects schemes that could execute or inline payloads", () => {
    expect(safeBackgroundUrl("javascript:alert(1)")).toBeNull();
    expect(safeBackgroundUrl("JavaScript:alert(1)")).toBeNull();
    expect(safeBackgroundUrl("data:image/svg+xml,<svg onload=alert(1)>")).toBeNull();
    expect(safeBackgroundUrl("vbscript:msgbox(1)")).toBeNull();
    expect(safeBackgroundUrl("ftp://example.com/x.jpg")).toBeNull();
  });

  it("rejects values that are not URLs at all", () => {
    for (const value of ["", "   ", "not a url", "example.com/x.jpg", "www.example.com"]) {
      expect(safeBackgroundUrl(value)).toBeNull();
    }
  });

  it("rejects protocol-relative and path-relative values", () => {
    expect(safeBackgroundUrl("//evil.example/x.jpg")).toBeNull();
    expect(safeBackgroundUrl("media/x.jpg")).toBeNull();
  });

  it("rejects characters that would break out of url(...)", () => {
    for (const value of [
      '/api/media/x.webp"',
      "/api/media/x.webp)",
      "/api/media/x.webp);background:red",
      "/api/media/x.webp;color:red",
      "/api/media/x.webp\\",
      "/api/media/x.webp'",
      "https://example.com/a)b.jpg",
    ]) {
      expect(safeBackgroundUrl(value)).toBeNull();
    }
  });

  it("handles null/undefined", () => {
    expect(safeBackgroundUrl(null)).toBeNull();
    expect(safeBackgroundUrl(undefined)).toBeNull();
  });
});

describe("backgroundImageFor", () => {
  it("only resolves when the theme selects an image background", () => {
    expect(
      backgroundImageFor({ type: "image", imageUrl: "/api/media/backgrounds/u/x.webp" }),
    ).toBe("/api/media/backgrounds/u/x.webp");

    expect(backgroundImageFor({ type: "gradient", imageUrl: "/api/media/backgrounds/u/x.webp" })).toBeNull();
    expect(backgroundImageFor({ type: "solid", imageUrl: null })).toBeNull();
    expect(backgroundImageFor({ type: "image", imageUrl: null })).toBeNull();
    expect(backgroundImageFor(null)).toBeNull();
  });
});

describe("buildProfileCss background image layer", () => {
  it("emits the layer for an uploaded asset", () => {
    const css = buildProfileCss(
      configWithTheme({
        background: { type: "image", imageUrl: "/api/media/backgrounds/user-1/2026/ab12@1600.webp" },
      }),
    );

    expect(css).toContain(".vessel-profile .vp-bg{");
    expect(css).toContain('url("/api/media/backgrounds/user-1/2026/ab12@1600.webp")');
    expect(css).toContain("background-size:cover");
    expect(css).toContain("filter:blur(var(--p-bg-blur))");
    // The dim overlay rides on the same declaration, driven by the token.
    expect(css).toContain("linear-gradient(rgba(0,0,0,var(--p-bg-dim))");
    // The scope must be a positioning context for the absolute layer.
    expect(css).toContain("position:relative;overflow:hidden");
  });

  it("emits the layer for a pasted https URL", () => {
    const css = buildProfileCss(
      configWithTheme({ background: { type: "image", imageUrl: "https://cdn.example.com/bg.jpg" } }),
    );
    expect(css).toContain('url("https://cdn.example.com/bg.jpg")');
  });

  it("emits nothing for solid/gradient backgrounds", () => {
    expect(buildProfileCss(configWithTheme({ background: { type: "solid", color: "#101010" } }))).not.toContain(
      ".vp-bg{",
    );
    expect(buildProfileCss(configWithTheme({ background: { type: "gradient" } }))).not.toContain(".vp-bg{");
    // An image URL may linger on the record after switching type — it must not
    // leak into the stylesheet.
    expect(
      buildProfileCss(configWithTheme({ background: { type: "solid", imageUrl: "/api/media/x.webp" } })),
    ).not.toContain(".vp-bg{");
  });

  it("never interpolates an unsafe value", () => {
    for (const imageUrl of ["javascript:alert(1)", "data:image/png;base64,AAA", '/x.webp"'] as const) {
      const css = buildProfileCss(configWithTheme({ background: { type: "image", imageUrl } }));
      expect(css).not.toContain(".vp-bg{");
      expect(css).not.toContain("javascript:");
      expect(css).not.toContain("data:image/png");
    }
  });
});
