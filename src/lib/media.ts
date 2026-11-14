import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db/client";
import { mediaAssets, mediaKindEnum, type MediaAsset, type MediaVariant } from "@/db/schema";
import { env } from "@/lib/env";
import { getStorage, mediaUrl, variantKey } from "@/lib/storage";

/**
 * Media pipeline.
 *
 * Uploads are validated by *content*, not by the name or declared MIME type:
 * the bytes are decoded by sharp and re-encoded, which simultaneously
 *   - proves the file really is an image,
 *   - strips EXIF/metadata (including GPS location and embedded files),
 *   - normalises the format, and
 *   - gives us the dimensions we need for variants and layout stability.
 *
 * Anything sharp cannot decode is rejected. We never store original user bytes.
 */

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"] as const;

export type MediaKind = (typeof mediaKindEnum.enumValues)[number];

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

/** Variants per kind. The largest is used as the "full" image. */
const VARIANTS: Record<"avatar" | "background" | "gallery" | "document", VariantSpec[]> = {
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
  document: [],
};

const LIMITS: Record<MediaKind, { maxBytes: number; maxDimension: number; variants: keyof typeof VARIANTS }> = {
  AVATAR: { maxBytes: Math.min(env.maxUploadBytes, 5 * 1024 * 1024), maxDimension: 4096, variants: "avatar" },
  BACKGROUND: { maxBytes: env.maxUploadBytes, maxDimension: 8192, variants: "background" },
  GALLERY: { maxBytes: Math.min(env.maxUploadBytes, 10 * 1024 * 1024), maxDimension: 8192, variants: "gallery" },
  AUDIO: { maxBytes: env.maxUploadBytes, maxDimension: 0, variants: "document" },
  DOCUMENT: { maxBytes: Math.min(env.maxUploadBytes, 10 * 1024 * 1024), maxDimension: 0, variants: "document" },
};

function folderFor(kind: MediaKind): string {
  switch (kind) {
    case "AVATAR":
      return "avatars";
    case "BACKGROUND":
      return "backgrounds";
    case "GALLERY":
      return "galleries";
    case "AUDIO":
      return "audio";
    default:
      return "uploads";
  }
}

export type UploadResult = {
  asset: MediaAsset;
  /** Best display URL (largest variant) for immediate preview. */
  url: string;
};

/**
 * Validates and stores an uploaded image.
 *
 * @param file raw upload
 * @param kind media category
 * @param userId owner — keys are namespaced per user
 */
export async function storeImage(file: File, kind: MediaKind, userId: string): Promise<UploadResult> {
  const limits = LIMITS[kind];
  if (!limits) throw new MediaError("Unsupported media kind", 400);

  if (file.size === 0) throw new MediaError("The file is empty.");
  if (file.size > limits.maxBytes) {
    throw new MediaError(`File is too large. Maximum is ${Math.floor(limits.maxBytes / 1024 / 1024)} MB.`, 413);
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());

  // Decode by content. A renamed .exe or a PDF will fail here.
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

  // Re-encode from decoded pixels: this discards all embedded metadata and any
  // trailing payload appended to the file.
  const variants: MediaVariant[] = [];
  let mainWidth = 0;
  let mainHeight = 0;
  let mainBytes = 0;

  for (const spec of VARIANTS[limits.variants]) {
    const { data, info } = await sharp(inputBuffer, { limitInputPixels: limits.maxDimension ** 2 })
      .rotate() // respect EXIF orientation, then drop the EXIF block
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

/** Largest stored variant for an asset, as a public URL. */
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

export async function listAssets(userId: string, kinds: MediaKind[] = ["AVATAR", "BACKGROUND", "GALLERY"]) {
  return db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.userId, userId), inArray(mediaAssets.kind, kinds)))
    .orderBy(mediaAssets.createdAt)
    .limit(200);
}

export function storageUsageLabel(assets: MediaAsset[]): string {
  const total = assets.reduce((sum, a) => sum + a.sizeBytes, 0);
  return `${(total / 1024 / 1024).toFixed(1)} MB`;
}
