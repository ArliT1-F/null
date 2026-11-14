import { describe, expect, it } from "vitest";
import { linkUrlSchema, passwordSchema, emailSchema, registerSchema } from "@/lib/validation";

describe("linkUrlSchema", () => {
  it("accepts http, https and mailto", () => {
    expect(linkUrlSchema.safeParse("https://example.com").success).toBe(true);
    expect(linkUrlSchema.safeParse("http://example.com/path?q=1").success).toBe(true);
    expect(linkUrlSchema.safeParse("mailto:hi@example.com").success).toBe(true);
  });

  it("rejects executable and embedded-data schemes", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox",
      "file:///etc/passwd",
    ]) {
      expect(linkUrlSchema.safeParse(url).success, url).toBe(false);
    }
  });

  it("rejects relative and malformed values", () => {
    expect(linkUrlSchema.safeParse("/relative").success).toBe(false);
    expect(linkUrlSchema.safeParse("not a url").success).toBe(false);
    expect(linkUrlSchema.safeParse("").success).toBe(false);
  });

  it("enforces the length cap", () => {
    expect(linkUrlSchema.safeParse(`https://example.com/${"a".repeat(2100)}`).success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("requires at least ten characters", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("longenough1").success).toBe(true);
  });

  it("rejects leading and trailing whitespace", () => {
    expect(passwordSchema.safeParse(" password123").success).toBe(false);
    expect(passwordSchema.safeParse("password123 ").success).toBe(false);
  });
});

describe("emailSchema", () => {
  it("normalises case and whitespace", () => {
    const parsed = emailSchema.safeParse("  Arli@Example.COM ");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe("arli@example.com");
  });
});

describe("registerSchema", () => {
  it("requires all three fields", () => {
    expect(registerSchema.safeParse({ email: "a@b.com", password: "longenough1" }).success).toBe(false);
  });
});
