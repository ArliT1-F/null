import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, hashIp, hashToken, randomToken, safeEqual } from "@/lib/crypto";

describe("token hashing", () => {
  it("is deterministic and never returns the input", () => {
    const token = randomToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
    expect(hashToken(token)).toHaveLength(64);
  });

  it("differs for different tokens", () => {
    expect(hashToken(randomToken())).not.toBe(hashToken(randomToken()));
  });
});

describe("secret encryption", () => {
  it("round-trips a value", () => {
    const secret = "oauth-refresh-token-value";
    const encrypted = encryptSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptSecret(encrypted)).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("fails loudly on tampering", () => {
    const encrypted = encryptSecret("value");
    const parts = encrypted.split(".");
    const tampered = [parts[0], parts[1], parts[2], Buffer.from("other").toString("base64url")].join(".");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe("hashIp", () => {
  it("is stable and does not expose the address", () => {
    const hash = hashIp("203.0.113.9");
    expect(hash).toBe(hashIp("203.0.113.9"));
    expect(hash).not.toContain("203.0.113.9");
    expect(hashIp(null)).toBeNull();
  });
});

describe("safeEqual", () => {
  it("compares without throwing on length mismatch", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
