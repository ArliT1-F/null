import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verifyFontBuffer, verifyVideoBuffer } from "@/lib/media-verify";
import { StorageNotFoundError } from "@/lib/storage/types";
import { LocalStorageProvider } from "@/lib/storage/local";

/** Build a valid synthetic OpenType/TrueType font with the given 4-char table tags. */
function makeOpenTypeBuffer(sfnt: "ttf" | "otf", tags: string[]): Buffer {
  const numTables = tags.length;
  const headerSize = 12 + numTables * 16;
  const tableDataSize = 16;
  const total = headerSize + numTables * tableDataSize;
  const buf = Buffer.alloc(total);

  if (sfnt === "ttf") {
    buf.writeUInt32BE(0x00010000, 0);
  } else {
    buf.write("OTTO", 0, "ascii");
  }
  buf.writeUInt16BE(numTables, 4);
  buf.writeUInt16BE(64, 6);
  buf.writeUInt16BE(2, 8);
  buf.writeUInt16BE(numTables * 16 - 64, 10);

  tags.forEach((tag, i) => {
    const rec = 12 + i * 16;
    const dataOffset = headerSize + i * tableDataSize;
    buf.write(tag.padEnd(4, " ").slice(0, 4), rec, "ascii");
    buf.writeUInt32BE(0x12345678, rec + 4);
    buf.writeUInt32BE(dataOffset, rec + 8);
    buf.writeUInt32BE(tableDataSize, rec + 12);
  });

  return buf;
}

/** Build a valid synthetic WOFF 1.0 font with the given table tags. */
function makeWoffBuffer(tags: string[]): Buffer {
  const numTables = tags.length;
  const headerSize = 44 + numTables * 20;
  const tableSize = 16;
  const total = headerSize + numTables * tableSize;
  const buf = Buffer.alloc(total);

  buf.write("wOFF", 0, "ascii");
  buf.writeUInt32BE(0x00010000, 4);
  buf.writeUInt32BE(total, 8);
  buf.writeUInt16BE(numTables, 12);
  buf.writeUInt16BE(0, 14);
  buf.writeUInt32BE(total + 64, 16);

  tags.forEach((tag, i) => {
    const rec = 44 + i * 20;
    const offset = headerSize + i * tableSize;
    buf.write(tag.padEnd(4, " ").slice(0, 4), rec, "ascii");
    buf.writeUInt32BE(offset, rec + 4);
    buf.writeUInt32BE(tableSize, rec + 8);
    buf.writeUInt32BE(tableSize, rec + 12);
    buf.writeUInt32BE(0xabcdef01, rec + 16);
  });
  return buf;
}

/** Build a valid synthetic WOFF2 font header + table directory (known & optional `SVG ` tag). */
function makeWoff2Buffer(svgMode: "none" | "custom" | "known" = "none"): Buffer {
  // Known non-glyf/loca tags with transform version 0 (single UIntBase128 origLength each):
  // 0=cmap, 1=head, 2=hhea, 4=maxp, 5=name
  const required = [0x00, 0x04, 0x01, 0x04, 0x02, 0x04, 0x04, 0x04, 0x05, 0x04];
  const extra =
    svgMode === "custom"
      ? [0x3f, 0x53, 0x56, 0x47, 0x20, 0x04] // arbitrary tag "SVG "
      : svgMode === "known"
        ? [45, 0x04] // W3C known-tag index 45 = "SVG "
        : [];
  const numTables = svgMode === "none" ? 5 : 6;
  const dirBytes = [...required, ...extra];
  const compSize = 32;
  const total = 48 + dirBytes.length + compSize;
  const buf = Buffer.alloc(total);
  buf.write("wOF2", 0, "ascii");
  buf.writeUInt32BE(0x00010000, 4);
  buf.writeUInt32BE(total, 8);
  buf.writeUInt16BE(numTables, 12);
  buf.writeUInt16BE(0, 14);
  buf.writeUInt32BE(2048, 16);
  buf.writeUInt32BE(compSize, 20);
  Buffer.from(dirBytes).copy(buf, 48);
  return buf;
}

/** Build a valid synthetic ISO-BMFF MP4 container (`ftyp` + optional `moov` + `mdat`). */
function makeMp4Buffer(majorBrand: string, includeMoov = true): Buffer {
  const boxes: Buffer[] = [];
  const ftyp = Buffer.alloc(24);
  ftyp.writeUInt32BE(24, 0);
  ftyp.write("ftyp", 4, "ascii");
  ftyp.write(majorBrand.padEnd(4, " ").slice(0, 4), 8, "ascii");
  ftyp.writeUInt32BE(0x200, 12);
  ftyp.write(majorBrand.padEnd(4, " ").slice(0, 4), 16, "ascii");
  ftyp.write("isom", 20, "ascii");
  boxes.push(ftyp);

  if (includeMoov) {
    const moov = Buffer.alloc(32);
    moov.writeUInt32BE(32, 0);
    moov.write("moov", 4, "ascii");
    boxes.push(moov);
  }

  const mdat = Buffer.alloc(128, 0x5a);
  mdat.writeUInt32BE(128, 0);
  mdat.write("mdat", 4, "ascii");
  boxes.push(mdat);

  return Buffer.concat(boxes);
}

/** Build a valid synthetic WebM (EBML header with EBMLVersion + DocType + Segment) buffer. */
function makeWebmBuffer(docType = "webm"): Buffer {
  const versionEl = Buffer.from([0x42, 0x86, 0x81, 0x01]); // EBMLVersion = 1
  const dtBytes = Buffer.from(docType, "ascii");
  const docTypeEl = Buffer.concat([Buffer.from([0x42, 0x82, 0x80 | dtBytes.length]), dtBytes]);
  const children = Buffer.concat([versionEl, docTypeEl]);
  const ebmlHeader = Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x80 | children.length]),
    children,
  ]);
  const payload = Buffer.alloc(96, 0x33);
  const segment = Buffer.concat([
    Buffer.from([0x18, 0x53, 0x80, 0x67, 0x80 | payload.length]),
    payload,
  ]);
  return Buffer.concat([ebmlHeader, segment]);
}

describe("verifyFontBuffer — magic-byte & OpenType table security", () => {
  it("accepts synthetic WOFF2, WOFF, TTF, OTF fonts AND real production .woff2 files", async () => {
    expect(verifyFontBuffer(makeWoff2Buffer("none"))).toEqual({
      format: "woff2",
      ext: ".woff2",
      mimeType: "font/woff2",
    });
    expect(verifyFontBuffer(makeWoffBuffer(["cmap", "head", "hhea", "maxp", "name", "post"]))).toEqual({
      format: "woff",
      ext: ".woff",
      mimeType: "font/woff",
    });
    expect(verifyFontBuffer(makeOpenTypeBuffer("ttf", ["cmap", "head", "hhea", "maxp", "name", "glyf"]))).toEqual({
      format: "ttf",
      ext: ".ttf",
      mimeType: "font/ttf",
    });
    expect(verifyFontBuffer(makeOpenTypeBuffer("otf", ["cmap", "head", "hhea", "maxp", "name", "CFF "]))).toEqual({
      format: "otf",
      ext: ".otf",
      mimeType: "font/otf",
    });

    // Verify a real bundled variable Google Font (.woff2 with transformed glyf/loca tables)
    const realFontDir = path.join(
      process.cwd(),
      "node_modules/@fontsource-variable/space-grotesk/files",
    );
    const files = (await fs.readdir(realFontDir)).filter((f) => f.endsWith(".woff2"));
    expect(files.length).toBeGreaterThan(0);
    const realBytes = await fs.readFile(path.join(realFontDir, files[0]!));
    expect(verifyFontBuffer(realBytes)).toEqual({
      format: "woff2",
      ext: ".woff2",
      mimeType: "font/woff2",
    });
  });

  it("rejects OpenType-SVG fonts (embedded SVG table) across TTF, OTF, WOFF, and WOFF2", () => {
    expect(verifyFontBuffer(makeOpenTypeBuffer("ttf", ["cmap", "head", "hhea", "maxp", "name", "SVG "]))).toBeNull();
    expect(verifyFontBuffer(makeOpenTypeBuffer("otf", ["cmap", "head", "hhea", "maxp", "name", "SVG "]))).toBeNull();
    expect(verifyFontBuffer(makeWoffBuffer(["cmap", "head", "hhea", "maxp", "name", "SVG "]))).toBeNull();
    expect(verifyFontBuffer(makeWoff2Buffer("custom"))).toBeNull();
    expect(verifyFontBuffer(makeWoff2Buffer("known"))).toBeNull();
  });

  it("rejects HTML/JS masquerading as a font, missing required tables, and truncated data", () => {
    expect(verifyFontBuffer(Buffer.from("<script>alert(1)</script>".repeat(10)))).toBeNull();
    expect(verifyFontBuffer(makeOpenTypeBuffer("ttf", ["DSIG", "GPOS", "GSUB", "kern"]))).toBeNull();
    expect(verifyFontBuffer(Buffer.alloc(12))).toBeNull();
  });
});

describe("verifyVideoBuffer — MP4 ISO BMFF & WebM EBML verification", () => {
  it("accepts valid MP4 (isom/mp42) and WebM containers", () => {
    expect(verifyVideoBuffer(makeMp4Buffer("mp42", true))).toEqual({
      format: "mp4",
      ext: ".mp4",
      mimeType: "video/mp4",
    });
    expect(verifyVideoBuffer(makeWebmBuffer("webm"))).toEqual({
      format: "webm",
      ext: ".webm",
      mimeType: "video/webm",
    });
  });

  it("rejects MP4 without moov, disallowed brands (HEIC), non-webm Matroska, and HTML polyglots", () => {
    expect(verifyVideoBuffer(makeMp4Buffer("mp42", false))).toBeNull();

    const heicOnly = Buffer.alloc(64);
    heicOnly.writeUInt32BE(20, 0);
    heicOnly.write("ftyp", 4, "ascii");
    heicOnly.write("heic", 8, "ascii");
    heicOnly.writeUInt32BE(0, 12);
    heicOnly.write("heic", 16, "ascii");
    heicOnly.writeUInt32BE(44, 20);
    heicOnly.write("moov", 24, "ascii");
    expect(verifyVideoBuffer(heicOnly)).toBeNull();

    expect(verifyVideoBuffer(makeWebmBuffer("matroska"))).toBeNull();
    expect(verifyVideoBuffer(Buffer.from("<html><body>not a video</body></html>".repeat(5)))).toBeNull();
  });
});

describe("GET /api/media/[...key] — HTTP Range 206/416, CORP & sandbox-only CORS", () => {
  let tmpDir: string;
  let localStorage: LocalStorageProvider;
  const videoBytes = makeMp4Buffer("mp42", true);
  const fontBytes = makeWoff2Buffer("none");

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "null-media-v2-"));
    localStorage = new LocalStorageProvider(tmpDir);
    await localStorage.put("videos/u1/2026/loop.mp4", videoBytes, "video/mp4");
    await localStorage.put("fonts/u1/2026/brand.woff2", fontBytes, "font/woff2");
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("serves 200 full body, 206 byte ranges, 416 invalid range, and restricts CORS strictly to sandbox origin", async () => {
    vi.resetModules();
    vi.doMock("@/lib/storage", async () => {
      const actual = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");
      return {
        ...actual,
        StorageNotFoundError,
        getStorage: () => localStorage,
      };
    });
    vi.doMock("@/lib/env", () => ({
      env: {
        proCssSandboxOrigin: "https://sandbox.null-usercontent.example",
      },
    }));

    const { GET } = await import("@/app/api/media/[...key]/route");

    // 1. Full font fetch from configured sandbox origin
    const fontRes = await GET(
      new Request("https://null.example/api/media/fonts/u1/2026/brand.woff2", {
        headers: { origin: "https://sandbox.null-usercontent.example" },
      }),
      { params: Promise.resolve({ key: ["fonts", "u1", "2026", "brand.woff2"] }) },
    );
    expect(fontRes.status).toBe(200);
    expect(fontRes.headers.get("content-type")).toBe("font/woff2");
    expect(fontRes.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    expect(fontRes.headers.get("access-control-allow-origin")).toBe(
      "https://sandbox.null-usercontent.example",
    );
    expect(fontRes.headers.get("x-content-type-options")).toBe("nosniff");

    // 2. Arbitrary third-party Origin MUST NOT receive Access-Control-Allow-Origin
    const evilRes = await GET(
      new Request("https://null.example/api/media/fonts/u1/2026/brand.woff2", {
        headers: { origin: "https://evil.example" },
      }),
      { params: Promise.resolve({ key: ["fonts", "u1", "2026", "brand.woff2"] }) },
    );
    expect(evilRes.status).toBe(200);
    expect(evilRes.headers.get("access-control-allow-origin")).toBeNull();

    // 3. Partial Content (206) on video with Range: bytes=0-31
    const rangeRes = await GET(
      new Request("https://null.example/api/media/videos/u1/2026/loop.mp4", {
        headers: { range: "bytes=0-31" },
      }),
      { params: Promise.resolve({ key: ["videos", "u1", "2026", "loop.mp4"] }) },
    );
    expect(rangeRes.status).toBe(206);
    expect(rangeRes.headers.get("accept-ranges")).toBe("bytes");
    expect(rangeRes.headers.get("content-type")).toBe("video/mp4");
    expect(rangeRes.headers.get("content-range")).toBe(`bytes 0-31/${videoBytes.byteLength}`);
    expect(rangeRes.headers.get("content-length")).toBe("32");
    const slice = Buffer.from(await rangeRes.arrayBuffer());
    expect(slice.equals(videoBytes.subarray(0, 32))).toBe(true);

    // 4. Open-ended range `bytes=64-`
    const openRes = await GET(
      new Request("https://null.example/api/media/videos/u1/2026/loop.mp4", {
        headers: { range: "bytes=64-" },
      }),
      { params: Promise.resolve({ key: ["videos", "u1", "2026", "loop.mp4"] }) },
    );
    expect(openRes.status).toBe(206);
    expect(openRes.headers.get("content-range")).toBe(
      `bytes 64-${videoBytes.byteLength - 1}/${videoBytes.byteLength}`,
    );
    expect(Buffer.from(await openRes.arrayBuffer()).byteLength).toBe(videoBytes.byteLength - 64);

    // 5. Out-of-bounds range -> 416 Range Not Satisfiable
    const badRange = await GET(
      new Request("https://null.example/api/media/videos/u1/2026/loop.mp4", {
        headers: { range: "bytes=999999-1000010" },
      }),
      { params: Promise.resolve({ key: ["videos", "u1", "2026", "loop.mp4"] }) },
    );
    expect(badRange.status).toBe(416);
    expect(badRange.headers.get("content-range")).toBe(`bytes */${videoBytes.byteLength}`);

    // 6. Path traversal / forbidden root -> 404
    const travRes = await GET(new Request("https://null.example/api/media/fonts/../secret.mp4"), {
      params: Promise.resolve({ key: ["fonts", "..", "secret.mp4"] }),
    });
    expect(travRes.status).toBe(404);
  });
});
