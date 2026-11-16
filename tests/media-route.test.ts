import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Media HTTP surface (docs/API.md).
 *
 * These handlers were missing from the tree entirely — the editor posted to
 * /api/media and Next answered "Server action not found" — so the contract is
 * pinned here: status codes, response shape and the "never leak internals" rule.
 *
 * The auth session and the media pipeline are mocked: they need a live database,
 * and what is under test is the HTTP layer around them.
 */

const mocks = vi.hoisted(() => {
  class MediaError extends Error {
    constructor(
      message: string,
      readonly status = 400,
    ) {
      super(message);
      this.name = "MediaError";
    }
  }

  return {
    MediaError,
    storeImage: vi.fn(),
    deleteAsset: vi.fn(),
    getCurrentUser: vi.fn(),
    getStorage: vi.fn(),
  };
});

vi.mock("@/lib/media", () => ({
  MediaError: mocks.MediaError,
  storeImage: mocks.storeImage,
  deleteAsset: mocks.deleteAsset,
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));

vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return { ...actual, getStorage: mocks.getStorage };
});

const { POST } = await import("@/app/api/media/route");
const { GET } = await import("@/app/api/media/[...key]/route");
const { DELETE } = await import("@/app/api/media/[id]/route");
const { reset } = await import("@/lib/rate-limit");

const USER = {
  id: "user-1",
  email: "a@example.com",
  emailVerified: true,
  username: "arlit",
  usernameDisplay: "arlit",
  displayName: "Arli",
  avatarUrl: null,
  role: "USER" as const,
};

function uploadRequest(opts: { kind?: string; file?: File | null; origin?: string } = {}) {
  const form = new FormData();
  if (opts.file !== null) {
    form.set("file", opts.file ?? new File([new Uint8Array([1, 2, 3])], "avatar.png", { type: "image/png" }));
  }
  form.set("kind", opts.kind ?? "AVATAR");
  return new Request("http://localhost:3000/api/media", {
    method: "POST",
    body: form,
    headers: opts.origin ? { origin: opts.origin } : undefined,
  });
}

function keyParams(key: string[]) {
  return { params: Promise.resolve({ key }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  reset(`upload:${USER.id}`);
  mocks.getCurrentUser.mockResolvedValue(USER);
});

describe("POST /api/media", () => {
  it("rejects anonymous uploads with 401", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(uploadRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false });
    expect(mocks.storeImage).not.toHaveBeenCalled();
  });

  it("rejects cross-origin uploads with 403", async () => {
    const res = await POST(uploadRequest({ origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(mocks.storeImage).not.toHaveBeenCalled();
  });

  it("requires a file", async () => {
    const res = await POST(uploadRequest({ file: null }));
    expect(res.status).toBe(400);
  });

  it("only accepts the kinds the editor can send", async () => {
    const res = await POST(uploadRequest({ kind: "DOCUMENT" }));
    expect(res.status).toBe(400);
    expect(mocks.storeImage).not.toHaveBeenCalled();
  });

  it("returns the documented shape for a stored image", async () => {
    mocks.storeImage.mockResolvedValue({
      asset: { id: "asset-1", width: 256, height: 256, sizeBytes: 1288 },
      url: "/api/media/avatars/user-1/2026/asset-1@256.webp",
    });

    const res = await POST(uploadRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      id: "asset-1",
      url: "/api/media/avatars/user-1/2026/asset-1@256.webp",
      width: 256,
      height: 256,
      size: 1288,
    });
    expect(mocks.storeImage).toHaveBeenCalledWith(expect.any(File), "AVATAR", USER.id);
  });

  it("maps pipeline rejections to their status", async () => {
    mocks.storeImage.mockRejectedValue(new mocks.MediaError("File is too large.", 413));
    const res = await POST(uploadRequest());
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ ok: false, error: "File is too large." });
  });

  it("does not leak internals on unexpected failures", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.storeImage.mockRejectedValue(new Error("ENOENT: /srv/null/media/x"));
    const res = await POST(uploadRequest());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("ENOENT");
    spy.mockRestore();
  });

  it("rate limits per user", async () => {
    mocks.storeImage.mockResolvedValue({
      asset: { id: "a", width: 64, height: 64, sizeBytes: 10 },
      url: "/api/media/avatars/user-1/2026/a@64.webp",
    });

    for (let i = 0; i < 30; i += 1) {
      expect((await POST(uploadRequest())).status).toBe(200);
    }
    const limited = await POST(uploadRequest());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("GET /api/media/[...key]", () => {
  it("refuses traversal, bare folder names and keys outside the pipeline's folders", async () => {
    for (const key of [["..", "etc", "passwd"], ["secrets", "x.webp"], ["avatars"]]) {
      const res = await GET(new Request("http://localhost:3000/api/media/x"), keyParams(key));
      expect(res.status, key.join("/")).toBe(404);
    }
    expect(mocks.getStorage).not.toHaveBeenCalled();
  });

  it("404s when the object is absent", async () => {
    mocks.getStorage.mockReturnValue({ get: vi.fn(async () => null) });
    const res = await GET(new Request("http://localhost:3000/api/media/x"), keyParams(["avatars", "u", "2026", "a@64.webp"]));
    expect(res.status).toBe(404);
  });

  it("serves bytes as inert, immutably cached media", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    const get = vi.fn(async () => ({ body, contentType: "image/webp", size: 3 }));
    mocks.getStorage.mockReturnValue({ get });

    const res = await GET(new Request("http://localhost:3000/api/media/x"), keyParams(["avatars", "u", "2026", "a@64.webp"]));
    expect(res.status).toBe(200);
    expect(get).toHaveBeenCalledWith("avatars/u/2026/a@64.webp");
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toContain("immutable");
    expect(res.headers.get("Content-Security-Policy")).toContain("sandbox");
  });
});

describe("DELETE /api/media/:id", () => {
  const request = () => new Request("http://localhost:3000/api/media/asset-1", { method: "DELETE" });

  it("requires a session", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await DELETE(request(), { params: Promise.resolve({ id: "asset-1" }) })).status).toBe(401);
  });

  it("404s for assets the caller does not own", async () => {
    mocks.deleteAsset.mockResolvedValue(false);
    const res = await DELETE(request(), { params: Promise.resolve({ id: "asset-1" }) });
    expect(res.status).toBe(404);
    expect(mocks.deleteAsset).toHaveBeenCalledWith("asset-1", USER.id);
  });

  it("confirms deletion of an owned asset", async () => {
    mocks.deleteAsset.mockResolvedValue(true);
    const res = await DELETE(request(), { params: Promise.resolve({ id: "asset-1" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
