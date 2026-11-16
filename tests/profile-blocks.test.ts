import { describe, expect, it } from "vitest";
import { blockSchema, normalizeProfileConfig, embedUrlFor, isEmbedAllowed, MAX_BLOCKS } from "@/lib/profile-config";
import { buildProfileCss } from "@/lib/profile-css";
import { diffSnapshots } from "@/lib/profile-diff";

describe("V2 blocks", () => {
  it("upgrades V1 without losing appearance", () => {
    const c = normalizeProfileConfig({ version: 1, layout: { gap: 20 } });
    expect(c.version).toBe(2); expect(c.layout.gap).toBe(20); expect(c.blocks).toEqual([]);
  });
  it.each(["text", "image", "gallery", "divider", "embed"])("supports empty %s editor placeholders", (type) => {
    expect(blockSchema.safeParse({ id: "a", type, props: {} }).success).toBe(true);
  });
  it("salvages valid blocks, strips unknown fields and deduplicates ids", () => {
    const c = normalizeProfileConfig({ blocks: [
      { id: "a", type: "text", props: { content: "hello", html: "unsafe" } },
      { id: "a", type: "divider", props: {} },
      { id: "b", type: "image", props: { src: "javascript:alert(1)" } },
      { id: "c", type: "divider", props: {} },
    ] });
    expect(c.blocks.map((b) => b.id)).toEqual(["a", "c"]);
    expect(c.blocks[0].props).not.toHaveProperty("html");
  });
  it("bounds block count", () => {
    const c = normalizeProfileConfig({ blocks: Array.from({ length: 100 }, (_, i) => ({ id: `b${i}`, type: "text", props: {} })) });
    expect(c.blocks).toHaveLength(MAX_BLOCKS);
  });
  it.each(["javascript:alert(1)", "https://youtube.com.evil.test/watch?v=x", "https://user:pass@youtube.com/watch?v=x", "http://youtube.com/watch?v=x", "https://youtube.com:444/watch?v=x"])("rejects unsafe embed %s", (url) => {
    expect(isEmbedAllowed(url)).toBe(false); expect(embedUrlFor(url)).toBeNull();
  });
  it("converts provider share URLs to player URLs", () => {
    expect(embedUrlFor("https://youtu.be/abc_123")).toBe("https://www.youtube-nocookie.com/embed/abc_123");
    expect(embedUrlFor("https://vimeo.com/12345")).toBe("https://player.vimeo.com/video/12345");
    expect(embedUrlFor("https://open.spotify.com/track/abc123")).toBe("https://open.spotify.com/embed/track/abc123");
    expect(embedUrlFor("https://soundcloud.com/artist/track")).toMatch(/^https:\/\/w.soundcloud.com\/player\//);
  });
  it("emits responsive overrides in tablet then mobile order", () => {
    const css = buildProfileCss(normalizeProfileConfig({ breakpoints: { tablet: { gap: 20 }, mobile: { gap: 8 } } }));
    expect(css).toContain("--p-gap:20px"); expect(css).toContain("--p-gap:8px");
    expect(css.indexOf("--p-gap:20px")).toBeLessThan(css.indexOf("--p-gap:8px"));
  });
});

describe("revision diffs", () => {
  it("compares nested fields and added/removed values deterministically", () => {
    expect(diffSnapshots({ config: { gap: 12 }, old: true }, { config: { gap: 8 }, added: true })).toEqual([
      { path: "added", before: "(absent)", after: "true" },
      { path: "config.gap", before: "12", after: "8" },
      { path: "old", before: "true", after: "(absent)" },
    ]);
  });
  it("has bounded output and ignores unchanged snapshots", () => {
    expect(diffSnapshots({}, {})).toEqual([]);
    expect(diffSnapshots({}, Object.fromEntries(Array.from({ length: 200 }, (_, i) => [String(i), "x".repeat(400)])))).toHaveLength(100);
  });
});
