import { describe, expect, it } from "vitest";
import { THEME_SEEDS } from "@/db/seed";
import {
  backgroundImageFor,
  backgroundVideoFor,
  fontFormatFor,
  safeFontUrl,
  videoMimeFor,
} from "@/lib/background-image";
import {
  applyThemeToConfig,
  blockGroupSchema,
  blockSchema,
  createBlockId,
  createGroupId,
  DEFAULT_PROFILE_CONFIG,
  filterVisibleBlocks,
  FONT_VALUES,
  isBlockLocked,
  MAX_BLOCKS,
  MAX_GROUPS,
  normalizeProfileConfig,
} from "@/lib/profile-config";
import { buildProfileCss } from "@/lib/profile-css";

/** Asserts every non-at-rule selector in generated CSS is strictly scoped to `.null-profile`. */
function assertAllSelectorsScoped(css: string) {
  expect(css.toLowerCase()).not.toContain("</style");
  const selectorMatches = css.matchAll(/(?:^|[{}])\s*([^{}@][^{}]*?)\s*\{/g);
  for (const match of selectorMatches) {
    const group = match[1].trim();
    if (!group || group.startsWith("@")) continue;
    for (const sel of group.split(",")) {
      const s = sel.trim();
      if (!s || s.startsWith("@") || s === "from" || s === "to" || /^\d+(\.\d+)?%$/.test(s)) {
        continue;
      }
      expect(s, `Unscoped selector leaked: "${s}"`).toContain(".null-profile");
    }
  }
}

describe("ProfileConfig v2 schema & forward upgrade", () => {
  it("defaults to schema version 2 with stack layout and safe defaults", () => {
    expect(DEFAULT_PROFILE_CONFIG.version).toBe(2);
    expect(DEFAULT_PROFILE_CONFIG.layout.mode).toBe("stack");
    expect(DEFAULT_PROFILE_CONFIG.blocks).toEqual([]);
    expect(DEFAULT_PROFILE_CONFIG.groups).toEqual([]);
    expect(DEFAULT_PROFILE_CONFIG.canvas.gridSnap).toBe(8);
  });

  it("upgrades V1 configs losslessly without breaking existing properties", () => {
    const v1 = {
      version: 1,
      theme: {
        background: {
          type: "gradient",
          gradientFrom: "#112233",
          gradientTo: "#445566",
          gradientAngle: 90,
        },
        card: { surface: "#101010", opacity: 80, radius: "lg" },
        text: { primary: "#ffffff", muted: "#cccccc", accent: "#00ffaa" },
        typography: { font: "mono", baseSize: 16, headingWeight: "600" },
        buttons: { style: "outline", radius: "md" },
        effects: { glow: true, entrance: "fade" },
      },
      layout: { width: 600, alignment: "left", gap: 10, showAvatar: false },
    };

    const upgraded = normalizeProfileConfig(v1);
    expect(upgraded.version).toBe(2);
    expect(upgraded.theme.background.gradientFrom).toBe("#112233");
    expect(upgraded.theme.typography.font).toBe("mono");
    expect(upgraded.theme.typography.headingFont).toBe("inherit");
    expect(upgraded.theme.buttons.style).toBe("outline");
    expect(upgraded.layout.width).toBe(600);
    expect(upgraded.layout.alignment).toBe("left");
    expect(upgraded.layout.showAvatar).toBe(false);
    expect(upgraded.layout.mode).toBe("stack");
    expect(upgraded.blocks).toEqual([]);
    expect(upgraded.groups).toEqual([]);
  });

  it("caps adversarially oversized blocks and groups arrays during normalization", () => {
    const raw = {
      version: 2,
      blocks: Array.from({ length: 120 }, (_, i) => ({
        id: `blk_${i}`,
        type: "divider",
        props: {},
      })),
      groups: Array.from({ length: 40 }, (_, i) => ({
        id: `grp_${i}`,
        name: `Group ${i}`,
      })),
    };

    const parsed = normalizeProfileConfig(raw);
    expect(parsed.blocks.length).toBe(MAX_BLOCKS);
    expect(parsed.groups.length).toBe(MAX_GROUPS);
  });

  it("preserves blocks, groups, canvas frames, layout, and breakpoints when applying a theme", () => {
    const group = blockGroupSchema.parse({ id: createGroupId(), name: "Hero" });
    const block = blockSchema.parse({
      id: createBlockId(),
      type: "text",
      groupId: group.id,
      locked: true,
      frame: { x: 12, y: 340, w: 76, h: 120, z: 4 },
      props: { content: "Studio bio" },
    });

    const current = normalizeProfileConfig({
      ...DEFAULT_PROFILE_CONFIG,
      layout: { ...DEFAULT_PROFILE_CONFIG.layout, mode: "canvas", width: 680 },
      canvas: { ...DEFAULT_PROFILE_CONFIG.canvas, height: 1200, gridSnap: 16 },
      blocks: [block],
      groups: [group],
      breakpoints: { mobile: { gap: 10, baseSize: 14 }, tablet: { width: 560 } },
    });

    const applied = applyThemeToConfig(current, {
      background: {
        type: "mesh",
        color: "#05060a",
        gradientFrom: "#ff0088",
        gradientTo: "#2200ff",
        meshAccent: "#00ffcc",
      },
      text: { primary: "#fefefe", muted: "#aaaaaa", accent: "#ff0088" },
      typography: { font: "space-grotesk", headingFont: "playfair" },
    });

    expect(applied.theme.background.type).toBe("mesh");
    expect(applied.theme.text.accent).toBe("#ff0088");
    expect(applied.theme.typography.font).toBe("space-grotesk");
    expect(applied.theme.typography.headingFont).toBe("playfair");
    // Structure preserved intact
    expect(applied.layout.mode).toBe("canvas");
    expect(applied.layout.width).toBe(680);
    expect(applied.canvas.height).toBe(1200);
    expect(applied.blocks).toHaveLength(1);
    expect(applied.blocks[0].id).toBe(block.id);
    expect(applied.blocks[0].locked).toBe(true);
    expect(applied.blocks[0].frame).toEqual(block.frame);
    expect(applied.groups).toEqual([group]);
    expect(applied.breakpoints.mobile.gap).toBe(10);
    expect(applied.breakpoints.tablet.width).toBe(560);
  });

  it("propagates visibility and lock state from parent groups to child blocks", () => {
    const hiddenGroup = blockGroupSchema.parse({ id: "g_hidden", name: "Hidden", visible: false });
    const lockedGroup = blockGroupSchema.parse({
      id: "g_locked",
      name: "Locked",
      visible: true,
      locked: true,
    });
    const b1 = blockSchema.parse({ id: "b1", type: "text", groupId: hiddenGroup.id, visible: true, props: {} });
    const b2 = blockSchema.parse({ id: "b2", type: "text", groupId: lockedGroup.id, visible: true, props: {} });
    const b3 = blockSchema.parse({ id: "b3", type: "text", groupId: lockedGroup.id, visible: false, props: {} });
    const b4 = blockSchema.parse({ id: "b4", type: "text", visible: true, locked: true, props: {} });
    const b5 = blockSchema.parse({ id: "b5", type: "text", visible: true, props: {} });

    const groups = [hiddenGroup, lockedGroup];
    expect(filterVisibleBlocks([b1, b2, b3, b4, b5], groups).map((b) => b.id)).toEqual([
      "b2",
      "b4",
      "b5",
    ]);
    expect(isBlockLocked(b2, groups)).toBe(true);
    expect(isBlockLocked(b4, groups)).toBe(true);
    expect(isBlockLocked(b5, groups)).toBe(false);
  });
});

describe("Typography, fonts, backgrounds, animations & responsive CSS", () => {
  it("supports all 13 font choices (self-hosted variable Google Fonts, system, custom) & heading overrides", () => {
    expect(FONT_VALUES.length).toBe(13);
    for (const font of FONT_VALUES) {
      const cfg = normalizeProfileConfig({
        theme: { typography: { font, headingFont: "playfair" } },
      });
      const css = buildProfileCss(cfg);
      expect(css).toContain("--p-font:");
      expect(css).toContain("--p-heading-font:");
      assertAllSelectorsScoped(css);
    }
  });

  it("emits @font-face ONLY for verified same-origin uploaded fonts and rejects external font hosts", () => {
    expect(safeFontUrl("/api/media/fonts/u1/abc.woff2")).toBe("/api/media/fonts/u1/abc.woff2");
    expect(safeFontUrl("/api/media/fonts/u1/2026/a1b2-c3d4.woff2")).toBe(
      "/api/media/fonts/u1/2026/a1b2-c3d4.woff2",
    );
    expect(fontFormatFor("/api/media/fonts/u1/abc.woff2")).toBe("woff2");
    expect(fontFormatFor("/api/media/fonts/u1/abc.woff")).toBe("woff");
    expect(fontFormatFor("/api/media/fonts/u1/abc.otf")).toBe("opentype");
    expect(fontFormatFor("/api/media/fonts/u1/abc.ttf")).toBe("truetype");

    // External & traversal font URLs strictly rejected (zero third-party font leak)
    expect(safeFontUrl("https://evil.example/fonts/track.woff2")).toBeNull();
    expect(safeFontUrl("https://fonts.gstatic.com/s/inter.woff2")).toBeNull();
    expect(safeFontUrl("/api/media/fonts/../etc/passwd.woff2")).toBeNull();
    expect(safeFontUrl("/api/media/avatars/u1/pic.webp")).toBeNull();
    expect(safeFontUrl("javascript:alert(1)")).toBeNull();

    const goodCfg = normalizeProfileConfig({
      theme: {
        typography: {
          font: "custom",
          customFontUrl: "/api/media/fonts/u1/brand.woff2",
          customFontName: 'My "</style>" Font',
        },
      },
    });
    const goodCss = buildProfileCss(goodCfg);
    expect(goodCss).toContain("@font-face");
    expect(goodCss).toContain('url("/api/media/fonts/u1/brand.woff2") format("woff2")');
    expect(goodCss).toContain("font-display:swap");
    expect(goodCss).not.toContain("</style>");
    assertAllSelectorsScoped(goodCss);

    const badCfg = normalizeProfileConfig({
      theme: { typography: { font: "custom", customFontUrl: "https://evil.example/fonts/x.woff2" } },
    });
    expect(buildProfileCss(badCfg)).not.toContain("@font-face");
  });

  it("supports mesh gradients, verified background videos, poster fallback, and reduced-motion suppression", () => {
    const videoCfg = normalizeProfileConfig({
      theme: {
        background: {
          type: "video",
          color: "#07090e",
          videoUrl: "/api/media/videos/u1/loop.webm",
          imageUrl: "/api/media/backgrounds/u1/poster.webp",
          imageDim: 50,
        },
      },
    });
    expect(backgroundVideoFor(videoCfg.theme.background)).toBe("/api/media/videos/u1/loop.webm");
    expect(backgroundImageFor(videoCfg.theme.background)).toBe(
      "/api/media/backgrounds/u1/poster.webp",
    );
    expect(videoMimeFor("/api/media/videos/u1/loop.webm")).toBe("video/webm");
    expect(videoMimeFor("/api/media/videos/u1/loop.mp4")).toBe("video/mp4");

    const css = buildProfileCss(videoCfg);
    expect(css).toContain(".null-profile .vp-bg-video");
    expect(css).toContain("prefers-reduced-motion:reduce");
    expect(css).toContain(".null-profile .vp-bg-video{display:none}");
    assertAllSelectorsScoped(css);
  });

  it("emits dual @media and @container breakpoints (tablet before mobile) and canvas mobile auto-stack", () => {
    const cfg = normalizeProfileConfig({
      layout: { mode: "canvas", width: 640, gap: 16 },
      canvas: { height: 960, gridSnap: 8, showGuides: true },
      theme: {
        effects: {
          entrance: "blur",
          stagger: true,
          cardHover: "lift",
          animatedBackground: true,
          backgroundMotion: "aurora",
        },
        buttons: { style: "glass", radius: "full", hoverLift: true },
      },
      breakpoints: {
        tablet: { width: 540, gap: 14, baseSize: 15, alignment: "center" },
        mobile: { width: 420, gap: 10, baseSize: 14, alignment: "left", hideBackgroundMedia: true },
      },
    });
    const css = buildProfileCss(cfg);
    const tabletIdx = css.indexOf("--p-gap:14px");
    const mobileIdx = css.indexOf("--p-gap:10px");
    expect(tabletIdx).toBeGreaterThan(-1);
    expect(mobileIdx).toBeGreaterThan(tabletIdx);
    expect(css).toContain("@container null-profile");
    expect(css).toContain(".null-profile .vp-canvas");
    expect(css).toContain(".null-profile .vp-anim-blur");
    expect(css).toContain(".null-profile .vp-stagger");
    assertAllSelectorsScoped(css);
  });

  it("ships 20 valid curated seed themes whose generated stylesheets are all strictly scoped", () => {
    expect(THEME_SEEDS.length).toBe(20);
    const slugs = new Set<string>();
    for (const seed of THEME_SEEDS) {
      expect(slugs.has(seed.slug), `Duplicate theme slug: ${seed.slug}`).toBe(false);
      slugs.add(seed.slug);
      const cfg = applyThemeToConfig(DEFAULT_PROFILE_CONFIG, seed.tokens);
      const css = buildProfileCss(cfg);
      expect(css.length).toBeGreaterThan(200);
      assertAllSelectorsScoped(css);
    }
  });
});
