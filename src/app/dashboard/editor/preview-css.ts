import type { ProfileConfig } from "@/lib/profile-config";

/**
 * Background image handling for the live preview.
 *
 * The stored value is either an absolute media URL ("/api/media/...") or an
 * https URL. Both are rendered as a CSS background layer in the editor only;
 * the public page uses the same value through the generated stylesheet.
 * `javascript:` and `data:` URLs are rejected so a pasted value cannot execute.
 */
export function backgroundImageUrl(config: ProfileConfig): string | null {
  const { type, imageUrl } = config.theme.background;
  if (type !== "image" || !imageUrl) return null;
  if (imageUrl.startsWith("/") || imageUrl.startsWith("https://")) return imageUrl;
  return null;
}
