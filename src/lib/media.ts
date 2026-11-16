import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db/client";
import { mediaAssets, mediaKindEnum, type MediaAsset, type MediaVariant } from "@/db/schema";
import { env } from "@/lib/env";
import { verifyFontBuffer, verifyVideoBuffer } from "@/lib/media-verify";
import { getStorage, mediaUrl, variantKey } from "@/lib/storage";

/**
 * Media pipeline.
 *
 * Uploads are validated strictly by binary *content*, never by filename or
 * declared `Content-Type`:
 *   - Images are decoded by `sharp` and re-encoded to WebP from raw pixels,
 *     stripping EXIF/GPS metadata and any appended payloads. SVG is forbidden.
 *   - Fonts (V2.3) are verified against WOFF2, WOFF, TrueType, and OpenType
 *     binary specifications (rejecting SVG-in-OpenType) and capped at 2 MB.
 *   - Videos (V2.4) are verified against ISO BMFF (MP4) and EBML (`webm`)
 *     container structure and capped at `MAX_UPLOAD_MB` (up to 32 MB).
 *   - Every object passes through `getStorage()` (local disk or S3/R2/MinIO).
 */

export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/gif",
] as const;

export type MediaKind = (typeof mediaKindEnum.enumValues)[number];

const MB = 1024 * 1024;
export const MAX_FONT_BYTES = Math.min(env.maxUploadBytes, 2 * MB);
export const MAX_VIDEO_BYTES = Math.min(env.maxUploadBytes, 32 * MB);

export class MediaError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "MediaError";
  }
}

type VariantSpec = { name: string; width: number };

const VARIANTS: Record<"avatar" | "background" | "gallery" | "none", VariantSpec[]> = {
  avatar: [
    { name: "64", width: 64 },
    { name: "128", width: 128 },
    { name: "256", width: 256 },
  ],
  background: [
    { name: "768", width: 768 },
    { name: "1280", width: 1280 },
    { name: "1920", width: 1920 },
  ],
  gallery: [
    { name: "400", width: 400 },
    { name: "800", width: 800 },
    { name: "1600", width: 1600 },
  ],
  none: [],
};

const LIMITS: Record<MediaKind, { maxBytes: number; maxDimension: number; variants: keyof typeof VARIANTS }> = {
  AVATAR: { maxBytes: Math.min(env.maxUploadBytes, 5 * MB), maxDimension: 4096, variants: "avatar" },
  BACKGROUND: { maxBytes: env.maxUploadBytes, maxDimension: 8192, variants: "background" },
  GALLERY: { maxBytes: Math.min(env.maxUploadBytes, 10 * MB), maxDimension: 8192, variants: "gallery" },
  AUDIO: { maxBytes: env.maxUploadBytes, maxDimension: 0, variants: "none" },
  DOCUMENT: { maxBytes: Math.min(env.maxUploadBytes, 10 * MB), maxDimension: 0, variants: "none" },
  FONT: { maxBytes: MAX_FONT_BYTES, maxDimension: 0, variants: "none" },
  VIDEO: { maxBytes: MAX_VIDEO_BYTES, maxDimension: 0, variants: "none" },
};

function folderFor(kind: MediaKind): string {
  switch (kind) {
    case "AVATAR":
      return "avatars";
    case "BACKGROUND":
      return "backgrounds";
    case "GALLERY":
      return "galleries";
    case "FONT":
      return "fonts";
    case "VIDEO":
      return "videos";
    case "AUDIO":
      return "audio";
    default:
      return "uploads";
  }
}

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export type UploadResult = {
  asset: MediaAsset;
  /** Best display URL (largest variant for images, canonical key for fonts/videos). */
  url: string;
};

/**
 * Validates and stores an uploaded image.
 */
export async function storeImage(file: File, kind: MediaKind, userId: string): Promise<UploadResult> {
  const limits = LIMITS[kind];
  if (!limits || limits.maxDimension === 0) throw new MediaError("Unsupported media kind", 400);

  if (file.size === 0) throw new MediaError("The file is empty.");
  if (file.size > limits.maxBytes) {
    throw new MediaError(`File is too large. Maximum is ${Math.floor(limits.maxBytes / MB)} MB.`, 413);
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());

  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(inputBuffer, { failOn: "error", limitInputPixels: limits.maxDimension ** 2 }).metadata();
  } catch {
    throw new MediaError("That file is not a readable image.");
  }

  if (!metadata.format || !(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(`image/${metadata.format}`)) {
    throw new MediaError("Unsupported image format. Use PNG, JPEG, WebP, AVIF or GIF.");
  }
  if (!metadata.width || !metadata.height) {
    throw new MediaError("Could not read the image dimensions.");
  }
  if (metadata.width < 16 || metadata.height < 16) {
    throw new MediaError("Image is too small (minimum 16×16).");
  }
  if (metadata.width > limits.maxDimension || metadata.height > limits.maxDimension) {
    throw new MediaError(`Image is too large. Maximum dimension is ${limits.maxDimension}px.`);
  }

  const assetId = randomUUID();
  const year = new Date().getUTCFullYear();
  const baseKey = `${folderFor(kind)}/${userId}/${year}/${assetId}.webp`;
  const storage = getStorage();

  const variants: MediaVariant[] = [];
  let mainWidth = 0;
  let mainHeight = 0;
  let mainBytes = 0;

  for (const spec of VARIANTS[limits.variants]) {
    const { data, info } = await sharp(inputBuffer, { limitInputPixels: limits.maxDimension ** 2 })
      .rotate()
      .resize({ width: Math.min(spec.width, metadata.width), withoutEnlargement: true })
      .webp({ quality: kind === "AVATAR" ? 90 : 82, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    const key = variantKey(baseKey, spec.name);
    await storage.put(key, data, "image/webp");
    variants.push({ key, width: info.width, height: info.height, format: "webp" });

    if (spec.width >= mainWidth) {
      mainWidth = info.width;
      mainHeight = info.height;
      mainBytes = data.byteLength;
    }
  }

  if (variants.length === 0) throw new MediaError("No variants were produced.", 500);

  const [asset] = await db
    .insert(mediaAssets)
    .values({
      id: assetId,
      userId,
      kind,
      storageKey: baseKey,
      provider: storage.name,
      mimeType: "image/webp",
      sizeBytes: mainBytes,
      width: mainWidth,
      height: mainHeight,
      variants,
    })
    .returning();

  return { asset, url: assetUrl(asset) };
}

/**
 * Binary-verifies and stores a custom web font (`.woff2`, `.woff`, `.ttf`, `.otf`).
 */
export async function storeFont(file: File, userId: string): Promise<UploadResult> {
  if (file.size === 0) throw new MediaError("The font file is empty.");
  if (file.size > MAX_FONT_BYTES) {
    throw new MediaError(`Font is too large. Maximum is ${Math.max(1, Math.floor(MAX_FONT_BYTES / MB))} MB.`, 413);
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const verified = verifyFontBuffer(inputBuffer);
  if (!verified) {
    throw new MediaError("Unsupported or invalid font. Upload a valid WOFF2, WOFF, TTF or OTF file.");
  }

  const assetId = randomUUID();
  const year = new Date().getUTCFullYear();
  const key = `${folderFor("FONT")}/${userId}/${year}/${assetId}${verified.ext}`;
  const storage = getStorage();

  await storage.put(key, inputBuffer, verified.mimeType);

  const [asset] = await db
    .insert(mediaAssets)
    .values({
      id: assetId,
      userId,
      kind: "FONT",
      storageKey: key,
      provider: storage.name,
      mimeType: verified.mimeType,
      sizeBytes: inputBuffer.byteLength,
      checksum: sha256Hex(inputBuffer),
      variants: [],
    })
    .returning();

  return { asset, url: mediaUrl(key) };
}

/**
 * Binary-verifies and stores a looping video background (`.mp4` or `.webm`).
 */
export async function storeVideo(file: File, userId: string): Promise<UploadResult> {
  if (file.size === 0) throw new MediaError("The video file is empty.");
  if (file.size > MAX_VIDEO_BYTES) {
    throw new MediaError(`Video is too large. Maximum is ${Math.floor(MAX_VIDEO_BYTES / MB)} MB.`, 413);
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const verified = verifyVideoBuffer(inputBuffer);
  if (!verified) {
    throw new MediaError("Unsupported or invalid video. Upload a valid MP4 (H.264) or WebM clip.");
  }

  const assetId = randomUUID();
  const year = new Date().getUTCFullYear();
  const key = `${folderFor("VIDEO")}/${userId}/${year}/${assetId}${verified.ext}`;
  const storage = getStorage();

  await storage.put(key, inputBuffer, verified.mimeType);

  const [asset] = await db
    .insert(mediaAssets)
    .values({
      id: assetId,
      userId,
      kind: "VIDEO",
      storageKey: key,
      provider: storage.name,
      mimeType: verified.mimeType,
      sizeBytes: inputBuffer.byteLength,
      checksum: sha256Hex(inputBuffer),
      variants: [],
    })
    .returning();

  return { asset, url: mediaUrl(key) };
}

/** Largest stored variant for an asset (or canonical key for fonts/videos), as a public URL. */
export function assetUrl(asset: MediaAsset): string {
  const variants = (asset.variants ?? []) as MediaVariant[];
  const largest = [...variants].sort((a, b) => b.width - a.width)[0];
  return mediaUrl(largest?.key ?? asset.storageKey);
}

export function assetSrcSet(asset: MediaAsset): string | undefined {
  const variants = (asset.variants ?? []) as MediaVariant[];
  if (variants.length === 0) return undefined;
  return [...variants]
    .sort((a, b) => a.width - b.width)
    .map((v) => `${mediaUrl(v.key)} ${v.width}w`)
    .join(", ");
}

/** Fetches an asset the caller is allowed to read, or null. */
export async function getOwnedAsset(assetId: string, userId: string): Promise<MediaAsset | null> {
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getAssetById(assetId: string): Promise<MediaAsset | null> {
  const rows = await db.select().from(mediaAssets).where(eq(mediaAssets.id, assetId)).limit(1);
  return rows[0] ?? null;
}

/** Deletes an asset row and every stored variant. */
export async function deleteAsset(assetId: string, userId: string): Promise<boolean> {
  const asset = await getOwnedAsset(assetId, userId);
  if (!asset) return false;

  const storage = getStorage();
  const keys = [asset.storageKey, ...((asset.variants ?? []) as MediaVariant[]).map((v) => v.key)];
  await Promise.all(keys.map((key) => storage.delete(key)));
  await db.delete(mediaAssets).where(eq(mediaAssets.id, assetId));
  return true;
}

export async function listAssets(
  userId: string,
  kinds: MediaKind[] = ["AVATAR", "BACKGROUND", "GALLERY", "FONT", "VIDEO"],
) {
  return db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.userId, userId), inArray(mediaAssets.kind, kinds)))
    .orderBy(mediaAssets.createdAt)
    .limit(200);
}

export function storageUsageLabel(assets: MediaAsset[]): string {
  const total = assets.reduce((sum, a) => sum + a.sizeBytes, 0);
  return `${(total / MB).toFixed(1)} MB`;
}
