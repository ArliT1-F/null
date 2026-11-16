import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `MEDIA_ROOT` resolution.
 *
 * A copy of the Docker template used to leave laptops pointing at
 * /srv/vessel/media, which surfaced as `EACCES: mkdir '/srv/vessel'` on the first
 * upload. The default is now environment-aware, and a blank value counts as
 * unset (an empty line in a .env file must not become a path).
 */

const originalMediaRoot = process.env.MEDIA_ROOT;
const originalNodeEnv = process.env.NODE_ENV;

async function loadEnv() {
  vi.resetModules();
  const { env } = await import("@/lib/env");
  return env;
}

beforeEach(() => {
  delete process.env.MEDIA_ROOT;
});

afterEach(() => {
  process.env.MEDIA_ROOT = originalMediaRoot;
  (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
  vi.unstubAllEnvs();
});

describe("MEDIA_ROOT", () => {
  it("defaults to a repo-local folder outside production", async () => {
    expect((await loadEnv()).MEDIA_ROOT).toBe("media");
  });

  it("defaults to the container path in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await loadEnv()).MEDIA_ROOT).toBe("/srv/vessel/media");
  });

  it("treats a blank value as unset", async () => {
    vi.stubEnv("MEDIA_ROOT", "   ");
    expect((await loadEnv()).MEDIA_ROOT).toBe("media");
  });

  it("honours an explicit path", async () => {
    vi.stubEnv("MEDIA_ROOT", "./var/media");
    expect((await loadEnv()).MEDIA_ROOT).toBe("./var/media");
  });
});
