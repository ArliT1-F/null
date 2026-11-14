/**
 * Storage abstraction.
 *
 * The application never knows which provider is active. Everything it needs from
 * a storage backend is expressed here, so switching from the home server's disk
 * to Cloudflare R2 is an environment change, not a code change.
 */

export type StoredObject = {
  key: string;
  size: number;
  contentType: string;
};

export interface StorageProvider {
  readonly name: "local" | "s3";

  /** Writes bytes at `key`, replacing any existing object. */
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;

  /** Returns the object stream, or null when the key does not exist. */
  get(key: string): Promise<{ body: ReadableStream<Uint8Array>; contentType: string; size: number } | null>;

  /** Raw bytes — used by the image pipeline to generate variants. */
  getBuffer(key: string): Promise<Buffer | null>;

  delete(key: string): Promise<void>;

  exists(key: string): Promise<boolean>;

  /**
   * Public URL for browser rendering when the provider can serve the object
   * directly (S3/CDN). Local storage returns null, because local reads are
   * always mediated by the application's /api/media route.
   */
  publicUrl(key: string): string | null;
}

export class StorageNotFoundError extends Error {
  constructor(key: string) {
    super(`Storage object not found: ${key}`);
    this.name = "StorageNotFoundError";
  }
}

/**
 * Rejects keys that could escape the storage root or collide with internals.
 * Applied by every provider, not just local disk.
 */
export function assertSafeKey(key: string): void {
  if (!key || key.length > 512) throw new Error("Invalid storage key");
  if (key.startsWith("/") || key.includes("\\")) throw new Error("Invalid storage key");
  const segments = key.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") throw new Error("Invalid storage key");
  }
  if (!/^[A-Za-z0-9._@\-/]+$/.test(key)) throw new Error("Invalid storage key");
}
