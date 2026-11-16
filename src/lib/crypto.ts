import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Cryptographic helpers.
 *
 * - `hashToken` produces the value stored for session/token rows so a database
 *   leak does not hand over usable credentials.
 * - `encryptSecret` / `decryptSecret` protect OAuth tokens at rest.
 * - `hashIp` keeps analytics/audit data useful without storing raw addresses.
 */

const SALT = "null.v1";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hashToken(token: string): string {
  return sha256(`${SALT}:${token}`);
}

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return sha256(`${SALT}.ip:${ip}`).slice(0, 32);
}

function encryptionKey(): Buffer {
  const raw = env.APP_ENCRYPTION_KEY;
  // Accept base64, hex, or a plain passphrase (hashed into a key).
  const candidates: Buffer[] = [];
  const b64 = Buffer.from(raw, "base64");
  if (b64.length === 32) candidates.push(b64);
  if (/^[0-9a-f]{64}$/i.test(raw)) candidates.push(Buffer.from(raw, "hex"));
  if (candidates.length === 0) {
    candidates.push(createHash("sha256").update(raw).digest());
  }
  return candidates[0];
}

/** AES-256-GCM. Output format: v1.<iv b64url>.<tag b64url>.<ciphertext b64url> */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(
    ".",
  );
}

export function decryptSecret(payload: string): string {
  const [version, ivPart, tagPart, dataPart] = payload.split(".");
  if (version !== "v1" || !ivPart || !tagPart || !dataPart) {
    throw new Error("Malformed encrypted payload");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
