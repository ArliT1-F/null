import "server-only";

import { env } from "@/lib/env";
import { LocalStorageProvider } from "./local";
import { S3StorageProvider } from "./s3";
import type { StorageProvider } from "./types";

export type { StorageProvider } from "./types";
export { assertSafeKey, StorageNotFoundError } from "./types";

let provider: StorageProvider | null = null;

export function mediaRoot(): string {
  const configured = typeof env.MEDIA_ROOT === "string" ? env.MEDIA_ROOT.trim() : "";
  if (configured) return configured;
  return env.isProduction ? "/srv/vessel/media" : "media";
}

/** The active storage backend, chosen purely by configuration. */
export function getStorage(): StorageProvider {
  if (provider) return provider;

  if (env.STORAGE_DRIVER === "s3") {
    provider = new S3StorageProvider({
      endpoint: env.S3_ENDPOINT!,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET!,
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      publicBaseUrl: env.S3_PUBLIC_BASE_URL || undefined,
    });
  } else {
    provider = new LocalStorageProvider(env.MEDIA_ROOT);
  }

  return provider;
}

/**
 * Public URL for a stored object. Local storage has no public URL of its own, so
 * reads go through the application route; S3/R2 may serve directly from a CDN.
 */
export function mediaUrl(key: string, variant?: string): string {
  const storage = getStorage();
  const target = variant ? variantKey(key, variant) : key;
  const direct = storage.publicUrl(target);
  if (direct) return direct;
  return `${env.MEDIA_PUBLIC_PREFIX}/${target}`;
}

/** Deterministic variant key: "adventures/a.png" + "256" -> "adventures/a@256.webp". */
export function variantKey(key: string, variant: string): string {
  const dot = key.lastIndexOf(".");
  if (dot === -1) return `${key}@${variant}`;
  const base = key.slice(0, dot);
  const ext = key.slice(dot);
  return `${base}@${variant}${ext}`;
}
