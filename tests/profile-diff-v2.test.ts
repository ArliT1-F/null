import { describe, expect, it } from "vitest";
import {
  blockGroupSchema,
  blockSchema,
  createBlockId,
  createGroupId,
  DEFAULT_PROFILE_CONFIG,
  normalizeProfileConfig,
} from "@/lib/profile-config";
import { diffSnapshots } from "@/lib/profile-diff";

describe("diffSnapshots — V2 field, block, group, breakpoint & custom CSS summaries", () => {
  it("reports readable changes across V2 layout mode, fonts, groups, canvas, breakpoints, and custom CSS", () => {
    const g1 = blockGroupSchema.parse({ id: createGroupId(), name: "Header cards" });
    const b1 = blockSchema.parse({ id: "b1", type: "text", props: { content: "Hello" } });
    const b2 = blockSchema.parse({ id: createBlockId(), type: "image", props: {} });

    const before = {
      displayName: "Aria",
      bio: "v1 bio",
      links: [{ id: "l1", label: "Site", url: "https://aria.dev", icon: "GLOBE", highlight: false }],
      config: DEFAULT_PROFILE_CONFIG,
      customCss: null,
    };

    const after = {
      displayName: "Aria",
      bio: "v2 bio",
      links: [{ id: "l1", label: "Site", url: "https://aria.dev", icon: "GLOBE", highlight: false }],
      config: normalizeProfileConfig({
        ...DEFAULT_PROFILE_CONFIG,
        theme: {
          ...DEFAULT_PROFILE_CONFIG.theme,
          background: { ...DEFAULT_PROFILE_CONFIG.theme.background, type: "mesh" },
          typography: {
            ...DEFAULT_PROFILE_CONFIG.theme.typography,
            font: "space-grotesk",
            customFontUrl: "/api/media/fonts/u1/studio.woff2",
          },
        },
        layout: { ...DEFAULT_PROFILE_CONFIG.layout, mode: "canvas" },
        blocks: [b1, b2],
        groups: [g1],
        breakpoints: { mobile: { gap: 10 }, tablet: {} },
      }),
      customCss: ".vp-card {\n  border-radius: 32px;\n}",
    };

    const changes = diffSnapshots(before, after);
    const paths = changes.map((c) => c.path.toLowerCase());
    expect(paths).toContain("bio");
    expect(paths.some((p) => p.includes("background"))).toBe(true);
    expect(paths.some((p) => p.includes("font"))).toBe(true);
    expect(paths.some((p) => p.includes("layout"))).toBe(true);
    expect(paths.some((p) => p.includes("css"))).toBe(true);
    expect(paths.some((p) => p.includes("block"))).toBe(true);
    expect(paths.some((p) => p.includes("group"))).toBe(true);
    expect(paths.some((p) => p.includes("mobile"))).toBe(true);
  });

  it("produces zero changes for identical V2 snapshots", () => {
    const snap = {
      displayName: "Aria",
      config: DEFAULT_PROFILE_CONFIG,
      links: [],
      customCss: ".vp-card { padding: 24px; }",
    };
    expect(diffSnapshots(snap, snap)).toEqual([]);
  });
});
