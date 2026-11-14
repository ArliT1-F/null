import { describe, expect, it } from "vitest";
import {
  RESERVED_USERNAMES,
  USERNAME_MAX,
  suggestUsername,
  validateUsername,
} from "@/lib/username";

describe("validateUsername", () => {
  it("accepts ordinary usernames and canonicalises the casing", () => {
    const result = validateUsername("ArliT1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.username).toBe("arlit1");
      expect(result.display).toBe("ArliT1");
    }
  });

  it("rejects empty, too short and too long input", () => {
    expect(validateUsername("").ok).toBe(false);
    expect(validateUsername("ab").ok).toBe(false);
    expect(validateUsername("a".repeat(USERNAME_MAX + 1)).ok).toBe(false);
  });

  it("rejects illegal characters, including unicode lookalikes", () => {
    expect(validateUsername("ar li").ok).toBe(false);
    expect(validateUsername("arli!").ok).toBe(false);
    expect(validateUsername("аrli").ok).toBe(false); // Cyrillic 'а'
    expect(validateUsername("arli/").ok).toBe(false);
  });

  it("rejects leading, trailing and repeated separators", () => {
    expect(validateUsername("_arli").ok).toBe(false);
    expect(validateUsername("arli-").ok).toBe(false);
    expect(validateUsername("ar..li").ok).toBe(false);
  });

  it("rejects digit-only usernames", () => {
    expect(validateUsername("123456").ok).toBe(false);
    expect(validateUsername("123abc").ok).toBe(true);
  });

  it("blocks every reserved application route regardless of case", () => {
    for (const name of ["login", "LOGIN", "Api", "dashboard", "admin", "settings"]) {
      expect(validateUsername(name).ok, name).toBe(false);
    }
    expect(RESERVED_USERNAMES.has("login")).toBe(true);
  });

  it("blocks impersonation patterns", () => {
    expect(validateUsername("vessel-support").ok).toBe(false);
    expect(validateUsername("admin-official").ok).toBe(false);
    expect(validateUsername("someone-official").ok).toBe(false);
  });

  it("honours a caller-supplied reserved set (taken names)", () => {
    const taken = new Set(["taken"]);
    expect(validateUsername("taken", taken).ok).toBe(false);
    expect(validateUsername("available", taken).ok).toBe(true);
  });
});

describe("suggestUsername", () => {
  it("derives a usable name from an email", () => {
    expect(suggestUsername("arli.t@example.com")).toBe("arli.t");
  });

  it("falls back to a generated name when the source is unusable", () => {
    const suggestion = suggestUsername("a@b.com");
    expect(validateUsername(suggestion).ok).toBe(true);
  });

  it("never suggests a reserved name", () => {
    expect(validateUsername(suggestUsername("admin@example.com")).ok).toBe(true);
  });
});
