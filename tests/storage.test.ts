import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LocalStorageProvider } from "@/lib/storage/local";
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

describe("LocalStorageProvider", () => {
  const tempDirs: string[] = [];

  async function tempDir() {
    const dir = await mkdtemp(path.join(tmpdir(), "vessel-storage-"));
    tempDirs.push(dir);
    return dir;
  }

  afterAll(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("round-trips an object and creates nested folders", async () => {
    const root = await tempDir();
    const provider = new LocalStorageProvider(root);
    const key = "avatars/u_1/2026/abc@64.webp";

    await provider.put(key, Buffer.from([1, 2, 3]), "image/webp");

    expect(await provider.exists(key)).toBe(true);
    const buffer = await provider.getBuffer(key);
    expect(buffer && [...buffer]).toEqual([1, 2, 3]);
    expect((await provider.get(key))?.contentType).toBe("image/webp");
  });

  it("names MEDIA_ROOT when the root is not writable instead of leaking EACCES", async () => {
    // A path underneath a regular file can never be created — the same failure
    // a container path like /srv/vessel/media gives on a laptop.
    const file = path.join(await tempDir(), "not-a-directory");
    await writeFile(file, "x");
    const provider = new LocalStorageProvider(path.join(file, "media"));

    const error = await provider
      .put("avatars/u/2026/a.webp", Buffer.from([1]), "image/webp")
      .then(() => null)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    const message = String(error?.message);
    // Names the knob, the code, the file it tried to write and the root.
    expect(message).toContain("MEDIA_ROOT is not writable");
    expect(message).toContain("ENOTDIR");
    expect(message).toContain("avatars/u/2026/a.webp");
    expect(message).toContain("(root:");
    // ...and how to fix it.
    expect(message).toContain("MEDIA_ROOT=./media");
  });
});
