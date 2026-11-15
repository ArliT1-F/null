import "server-only";

import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { assertSafeKey, type StorageProvider, type StoredObject } from "./types";

/**
 * Local filesystem storage for development and the self-hosted desktop.
 *
 * Files live under MEDIA_ROOT, which is deliberately outside the application
 * source tree and mounted as a persistent volume in Docker. Every path is
 * resolved and re-checked against the root, so a crafted key can never traverse
 * upward.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = "local" as const;
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    const prefix = this.root.endsWith(path.sep) ? this.root : this.root + path.sep;
    if (full !== this.root && !full.startsWith(prefix)) {
      throw new Error("Refusing to access a path outside the media root");
    }
    return full;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    // Write then rename so a partial upload never becomes visible.
    const tmp = `${full}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, body);
    await fs.rename(tmp, full);
    return { key, size: body.byteLength, contentType };
  }

  async get(key: string) {
    const full = this.resolve(key);
    let stat;
    try {
      stat = await fs.stat(full);
    } catch {
      return null;
    }
    if (!stat.isFile()) return null;

    const nodeStream = createReadStream(full);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
    return {
      body: webStream,
      contentType: contentTypeForKey(key),
      size: stat.size,
    };
  }

  async getBuffer(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.resolve(key));
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch {
      // Deleting a missing object is not an error.
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const stat = await fs.stat(this.resolve(key));
      return stat.isFile();
    } catch {
      return false;
    }
  }

  publicUrl(): string | null {
    return null;
  }
}

const MIME_BY_EXT: Record<string, string> = {
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".txt": "text/plain",
};

export function contentTypeForKey(key: string): string {
  return MIME_BY_EXT[path.extname(key).toLowerCase()] ?? "application/octet-stream";
}
