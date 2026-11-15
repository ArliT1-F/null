import { hash, verify } from "@node-rs/argon2";

/**
 * Password hashing with Argon2id.
 *
 * Parameters are tuned for a low-powered self-hosted server: ~19 MiB per hash,
 * 2 iterations. That is comfortably above OWASP's Argon2id floor while staying
 * safe on a 4 GB machine handling a handful of concurrent logins.
 */
const OPTIONS = {
  algorithm: 2, // Argon2id
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(digest: string, password: string): Promise<boolean> {
  try {
    return await verify(digest, password, OPTIONS);
  } catch {
    return false;
  }
}

/**
 * A real hash of a value nobody knows. Verifying against it costs the same as a
 * real check, so failed logins for unknown accounts do not leak account
 * existence through response timing.
 */
let dummyHash: string | null = null;
export async function dummyVerify(password: string): Promise<false> {
  if (!dummyHash) dummyHash = await hashPassword(crypto.randomUUID());
  await verifyPassword(dummyHash, password);
  return false;
}
