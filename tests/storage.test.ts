import { describe, expect, it } from "vitest";
import { assertSafeKey } from "@/lib/storage/types";

describe("assertSafeKey", () => {
  it("accepts generated keys, including variant keys", () => {
    expect(() => assertSafeKey("avatars/u_1/2026/abc@256.webp")).not.toThrow();
    expect(() => assertSafeKey("backgrounds/u/2026/a-b_c.webp")).not.toThrow();
  });

  it("rejects traversal attempts", () => {
    for (const key of [
      "../etc/passwd",
      "avatars/../../secrets",
      "..",
      "avatars/./x.png",
      "/absolute/path.png",
      "a//b.png",
    ]) {
      expect(() => assertSafeKey(key), key).toThrow();
    }
  });

  it("rejects backslashes, NULs and control characters", () => {
    expect(() => assertSafeKey("a\\b.png")).toThrow();
    expect(() => assertSafeKey("a\u0000b.png")).toThrow();
    expect(() => assertSafeKey("a b.png")).toThrow();
  });

  it("rejects absurdly long keys", () => {
    expect(() => assertSafeKey("a".repeat(600))).toThrow();
  });
});
