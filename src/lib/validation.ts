import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .max(254);

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200, "Password is too long.")
  .refine((v) => !/^\s|\s$/.test(v), "Password cannot start or end with a space.");

export const displayNameSchema = z.string().trim().min(1).max(60);

export const bioSchema = z.string().trim().max(600);

/**
 * Link URLs are restricted to http(s) and mailto. This blocks `javascript:`,
 * `data:` and similar schemes outright rather than relying on the renderer.
 */
export const linkUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return ["http:", "https:", "mailto:"].includes(url.protocol);
    } catch {
      return false;
    }
  }, "Enter a full URL starting with https:// (or mailto:).");

export const linkLabelSchema = z.string().trim().min(1, "Add a label.").max(80);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: z.string().trim().min(1).max(30),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

/** Extracts the first error message per field for form rendering. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Something went wrong.";
}
