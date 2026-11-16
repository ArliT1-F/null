/**
 * Content-based binary validators for uploaded fonts (V2.3) and videos (V2.4).
 *
 * Client-supplied filenames and `Content-Type` headers are NEVER trusted. Every
 * file is verified against its container specification (magic bytes, header
 * lengths, directory/box bounds, and required structural records) so renamed
 * HTML, SVG, scripts, polyglots, or truncated junk fail before touching storage.
 */

export type VerifiedFont = {
  format: "woff2" | "woff" | "ttf" | "otf";
  ext: ".woff2" | ".woff" | ".ttf" | ".otf";
  mimeType: "font/woff2" | "font/woff" | "font/ttf" | "font/otf";
};

export type VerifiedVideo = {
  format: "mp4" | "webm";
  ext: ".mp4" | ".webm";
  mimeType: "video/mp4" | "video/webm";
};

const REQUIRED_SFNT_TABLES = ["cmap", "head", "hhea", "maxp", "name"] as const;
const VALID_SFNT_FLAVORS = new Set([
  0x00010000, // TrueType
  0x4f54544f, // "OTTO" (CFF / OpenType)
  0x74727565, // "true"
]);

/** Validates WOFF2, WOFF, TrueType (.ttf), and OpenType (.otf) binaries. */
export function verifyFontBuffer(buf: Buffer): VerifiedFont | null {
  if (buf.byteLength < 44) return null;
  const sig = buf.readUInt32BE(0);

  // 1. WOFF2 ("wOF2" = 0x774F4632), 48-byte header
  if (sig === 0x774f4632) {
    if (buf.byteLength < 48) return null;
    const flavor = buf.readUInt32BE(4);
    const declaredLength = buf.readUInt32BE(8);
    const numTables = buf.readUInt16BE(12);
    const reserved = buf.readUInt16BE(14);
    const totalSfntSize = buf.readUInt32BE(16);
    const totalCompressedSize = buf.readUInt32BE(20);
    const metaOffset = buf.readUInt32BE(28);
    const metaLength = buf.readUInt32BE(32);
    const privOffset = buf.readUInt32BE(40);
    const privLength = buf.readUInt32BE(44);

    if (!VALID_SFNT_FLAVORS.has(flavor) && flavor !== 0x74746366) return null;
    if (reserved !== 0) return null;
    if (declaredLength !== buf.byteLength) return null;
    if (numTables < 4 || numTables > 128) return null;
    if (totalSfntSize < 64 || totalSfntSize > 32 * 1024 * 1024) return null;
    if (totalCompressedSize === 0 || totalCompressedSize > buf.byteLength - 48) return null;
    if (metaLength > 0 && (metaOffset < 48 || metaOffset + metaLength > buf.byteLength)) return null;
    if (privLength > 0 && (privOffset < 48 || privOffset + privLength > buf.byteLength)) return null;

    // Walk the WOFF2 TableDirectoryEntry stream (W3C WOFF2 §4.2) to forbid `SVG ` tables
    // (known-tag index 45 or arbitrary tag index 63 = "SVG ").
    const readBase128 = (start: number): { value: number; next: number } | null => {
      let accum = 0;
      for (let i = 0; i < 5; i++) {
        if (start + i >= buf.byteLength) return null;
        const b = buf[start + i]!;
        if (i === 0 && b === 0x80) return null;
        if (accum & 0xfe000000) return null;
        accum = ((accum << 7) | (b & 0x7f)) >>> 0;
        if ((b & 0x80) === 0) return { value: accum, next: start + i + 1 };
      }
      return null;
    };

    let pos = 48;
    for (let i = 0; i < numTables; i++) {
      if (pos >= buf.byteLength) return null;
      const flags = buf[pos++]!;
      const tagIndex = flags & 0x3f;
      const xformVersion = (flags >>> 6) & 0x03;
      // W3C WOFF2 known-tag index 45 is "SVG ".
      if (tagIndex === 45) return null;
      let isGlyfOrLoca = tagIndex === 10 || tagIndex === 11;
      if (tagIndex === 63) {
        if (pos + 4 > buf.byteLength) return null;
        const customTag = buf.toString("ascii", pos, pos + 4);
        pos += 4;
        if (customTag === "SVG ") return null;
        isGlyfOrLoca = customTag === "glyf" || customTag === "loca";
      }
      const origLen = readBase128(pos);
      if (!origLen) return null;
      pos = origLen.next;
      const hasTransformLen = isGlyfOrLoca ? xformVersion === 0 : xformVersion !== 0;
      if (hasTransformLen) {
        const xformLen = readBase128(pos);
        if (!xformLen) return null;
        pos = xformLen.next;
      }
    }
    if (pos + totalCompressedSize > buf.byteLength) return null;

    return { format: "woff2", ext: ".woff2", mimeType: "font/woff2" };
  }

  // 2. WOFF ("wOFF" = 0x774F4646), 44-byte header + 20-byte table directory entries
  if (sig === 0x774f4646) {
    const flavor = buf.readUInt32BE(4);
    const declaredLength = buf.readUInt32BE(8);
    const numTables = buf.readUInt16BE(12);
    const reserved = buf.readUInt16BE(14);
    const totalSfntSize = buf.readUInt32BE(16);

    if (!VALID_SFNT_FLAVORS.has(flavor)) return null;
    if (reserved !== 0) return null;
    if (declaredLength !== buf.byteLength) return null;
    if (numTables < REQUIRED_SFNT_TABLES.length || numTables > 128) return null;
    if (totalSfntSize < 64 || totalSfntSize > 32 * 1024 * 1024) return null;

    const dirEnd = 44 + numTables * 20;
    if (dirEnd > buf.byteLength) return null;

    const tags = new Set<string>();
    for (let i = 0; i < numTables; i++) {
      const base = 44 + i * 20;
      const tag = buf.toString("ascii", base, base + 4);
      if (!/^[\x20-\x7e]{4}$/.test(tag)) return null;
      const offset = buf.readUInt32BE(base + 4);
      const compLength = buf.readUInt32BE(base + 8);
      const origLength = buf.readUInt32BE(base + 12);
      if (offset < dirEnd || compLength > origLength || offset + compLength > buf.byteLength) {
        return null;
      }
      tags.add(tag);
    }
    if (!REQUIRED_SFNT_TABLES.every((t) => tags.has(t))) return null;
    // Refuse SVG-in-OpenType tables (defence against embedded script/XML surfaces).
    if (tags.has("SVG ")) return null;

    return { format: "woff", ext: ".woff", mimeType: "font/woff" };
  }

  // 3. Raw OpenType / TrueType SFNT (12-byte offset table + 16-byte records)
  if (VALID_SFNT_FLAVORS.has(sig)) {
    const numTables = buf.readUInt16BE(4);
    if (numTables < REQUIRED_SFNT_TABLES.length || numTables > 128) return null;
    const dirEnd = 12 + numTables * 16;
    if (dirEnd > buf.byteLength) return null;

    const tags = new Set<string>();
    for (let i = 0; i < numTables; i++) {
      const base = 12 + i * 16;
      const tag = buf.toString("ascii", base, base + 4);
      if (!/^[\x20-\x7e]{4}$/.test(tag)) return null;
      const offset = buf.readUInt32BE(base + 8);
      const length = buf.readUInt32BE(base + 12);
      if (offset < dirEnd || offset + length > buf.byteLength) return null;
      tags.add(tag);
    }
    if (!REQUIRED_SFNT_TABLES.every((t) => tags.has(t))) return null;
    if (tags.has("SVG ")) return null;

    if (sig === 0x4f54544f) {
      return { format: "otf", ext: ".otf", mimeType: "font/otf" };
    }
    return { format: "ttf", ext: ".ttf", mimeType: "font/ttf" };
  }

  return null;
}

const ALLOWED_MP4_BRANDS = new Set([
  "isom",
  "iso2",
  "iso4",
  "iso5",
  "iso6",
  "mp41",
  "mp42",
  "avc1",
  "M4V ",
  "dash",
]);

function verifyMp4Buffer(buf: Buffer): boolean {
  if (buf.byteLength < 32) return false;

  // First box must be `ftyp` with an allowlisted MP4 brand.
  const firstType = buf.toString("ascii", 4, 8);
  if (firstType !== "ftyp") return false;
  const ftypSize = buf.readUInt32BE(0);
  if (ftypSize < 16 || ftypSize > 4096 || ftypSize > buf.byteLength || ftypSize % 4 !== 0) {
    return false;
  }

  const brands: string[] = [buf.toString("ascii", 8, 12)];
  for (let off = 16; off + 4 <= ftypSize; off += 4) {
    brands.push(buf.toString("ascii", off, off + 4));
  }
  if (!brands.some((b) => ALLOWED_MP4_BRANDS.has(b))) return false;

  // Walk every top-level ISO BMFF atom to ensure exact box integrity and both `moov` + `mdat`.
  let offset = 0;
  let sawMoov = false;
  let sawMdat = false;
  let boxCount = 0;

  while (offset < buf.byteLength) {
    if (++boxCount > 256) return false;
    if (offset + 8 > buf.byteLength) return false;

    const size32 = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    if (!/^[\x20-\x7e]{4}$/.test(type)) return false;

    let boxSize: number;
    if (size32 === 0) {
      // Box extends to EOF (allowed only on the final atom).
      boxSize = buf.byteLength - offset;
    } else if (size32 === 1) {
      // 64-bit largesize box.
      if (offset + 16 > buf.byteLength) return false;
      const big = buf.readBigUInt64BE(offset + 8);
      if (big < BigInt(16) || big > BigInt(buf.byteLength - offset)) return false;
      boxSize = Number(big);
    } else {
      if (size32 < 8) return false;
      boxSize = size32;
    }

    if (offset + boxSize > buf.byteLength) return false;
    if (type === "moov") sawMoov = true;
    if (type === "mdat") sawMdat = true;
    offset += boxSize;
  }

  return offset === buf.byteLength && sawMoov && sawMdat;
}

/** Reads an EBML variable-size integer (VINT) data size at `offset`. */
function readEbmlSize(buf: Buffer, offset: number): { value: number; width: number; unknown: boolean } | null {
  if (offset >= buf.byteLength) return null;
  const first = buf[offset];
  if (first === 0) return null;

  let width = 1;
  let mask = 0x80;
  while (width <= 8 && (first & mask) === 0) {
    width++;
    mask >>= 1;
  }
  if (width > 8 || offset + width > buf.byteLength) return null;

  let value = BigInt(first & (mask - 1));
  let allOnes = (first & (mask - 1)) === mask - 1;
  for (let i = 1; i < width; i++) {
    const b = buf[offset + i];
    value = (value << BigInt(8)) | BigInt(b);
    if (b !== 0xff) allOnes = false;
  }
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return { value: Number(value), width, unknown: allOnes };
}

/** Reads an EBML element ID (keeping its leading VINT marker bit). */
function readEbmlId(buf: Buffer, offset: number): { id: number; width: number } | null {
  if (offset >= buf.byteLength) return null;
  const first = buf[offset];
  if (first === 0) return null;
  let width = 1;
  let mask = 0x80;
  while (width <= 4 && (first & mask) === 0) {
    width++;
    mask >>= 1;
  }
  if (width > 4 || offset + width > buf.byteLength) return null;
  let id = 0;
  for (let i = 0; i < width; i++) {
    id = id * 256 + buf[offset + i];
  }
  return { id, width };
}

function verifyWebmBuffer(buf: Buffer): boolean {
  if (buf.byteLength < 32) return false;
  // EBML header element ID = 0x1A45DFA3.
  if (buf.readUInt32BE(0) !== 0x1a45dfa3) return false;

  const headerSize = readEbmlSize(buf, 4);
  if (!headerSize || headerSize.unknown || headerSize.value < 8 || headerSize.value > 4096) {
    return false;
  }
  const headerDataStart = 4 + headerSize.width;
  const headerEnd = headerDataStart + headerSize.value;
  if (headerEnd + 8 > buf.byteLength) return false;

  // Walk EBML header children and require exact DocType (0x4282) === "webm".
  let cursor = headerDataStart;
  let docType: string | null = null;
  while (cursor < headerEnd) {
    const elId = readEbmlId(buf, cursor);
    if (!elId) return false;
    cursor += elId.width;
    const elSize = readEbmlSize(buf, cursor);
    if (!elSize || elSize.unknown) return false;
    cursor += elSize.width;
    if (cursor + elSize.value > headerEnd) return false;

    if (elId.id === 0x4282) {
      // Strip optional trailing NUL padding permitted by EBML string spec.
      docType = buf.toString("ascii", cursor, cursor + elSize.value).replace(/\0+$/, "");
    }
    cursor += elSize.value;
  }
  if (cursor !== headerEnd || docType !== "webm") return false;

  // Immediately following the EBML header must be a Matroska Segment (0x18538067) or Void (0xEC).
  let segCursor = headerEnd;
  while (segCursor < buf.byteLength) {
    const elId = readEbmlId(buf, segCursor);
    if (!elId) return false;
    const elSize = readEbmlSize(buf, segCursor + elId.width);
    if (!elSize) return false;
    const bodyStart = segCursor + elId.width + elSize.width;
    if (elId.id === 0xec) {
      // EBML Void padding element
      if (elSize.unknown || bodyStart + elSize.value > buf.byteLength) return false;
      segCursor = bodyStart + elSize.value;
      continue;
    }
    if (elId.id === 0x18538067) {
      if (!elSize.unknown && bodyStart + elSize.value > buf.byteLength) return false;
      return buf.byteLength - bodyStart >= 8;
    }
    return false;
  }

  return false;
}

/** Validates MP4 (ISO BMFF) and WebM (EBML) video buffers. */
export function verifyVideoBuffer(buf: Buffer): VerifiedVideo | null {
  if (verifyMp4Buffer(buf)) {
    return { format: "mp4", ext: ".mp4", mimeType: "video/mp4" };
  }
  if (verifyWebmBuffer(buf)) {
    return { format: "webm", ext: ".webm", mimeType: "video/webm" };
  }
  return null;
}

/**
 * Parses a single HTTP `Range: bytes=start-end` header against a known object
 * length (or loosely for storage delegation). Multi-range headers return null
 * (caller serves the complete 200 response per RFC 9110).
 */
export function parseByteRangeHeader(
  header: string | null,
): { start: number; end?: number } | "invalid" | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed.startsWith("bytes=")) return null;
  const spec = trimmed.slice(6).trim();
  if (spec.includes(",")) return null; // fall back to full response for multi-range

  const match = spec.match(/^(\d+)-(\d*)$/);
  if (!match) return "invalid";

  const start = Number.parseInt(match[1], 10);
  if (!Number.isSafeInteger(start) || start < 0) return "invalid";

  if (!match[2]) return { start };
  const end = Number.parseInt(match[2], 10);
  if (!Number.isSafeInteger(end) || end < start) return "invalid";
  return { start, end };
}
