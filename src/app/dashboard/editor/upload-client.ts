"use client";

export type ClientMediaKind = "AVATAR" | "BACKGROUND" | "GALLERY" | "FONT" | "VIDEO";

export type UploadedMedia = {
  id: string;
  url: string;
  size: number;
  mimeType?: string;
  width?: number;
  height?: number;
};

/**
 * Uploads a single file to `POST /api/media` with typed response parsing.
 */
export async function uploadMediaFile(
  file: File,
  kind: ClientMediaKind,
): Promise<{ ok: true; media: UploadedMedia } | { ok: false; error: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);

  try {
    const res = await fetch("/api/media", { method: "POST", body: form });
    const data = (await res.json()) as
      | ({ ok: true } & UploadedMedia)
      | { ok: false; error?: string };

    if (!res.ok || !data.ok) {
      return { ok: false, error: ("error" in data && data.error) || "Upload failed." };
    }
    return {
      ok: true,
      media: {
        id: data.id,
        url: data.url,
        size: data.size,
        mimeType: data.mimeType,
        width: data.width,
        height: data.height,
      },
    };
  } catch {
    return { ok: false, error: "Upload failed. Check your connection and try again." };
  }
}
