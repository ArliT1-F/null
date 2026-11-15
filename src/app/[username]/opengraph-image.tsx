import { ImageResponse } from "next/og";
import { env } from "@/lib/env";
import { getPublishedProfile } from "@/lib/profiles/service";
import { truncate } from "@/lib/utils";

/**
 * Open Graph image, generated on demand and cached by the platform.
 *
 * Uses only the published snapshot, so a drafted-but-unpublished avatar or name
 * never leaks into a social preview.
 */

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Profile preview";

export default async function OpengraphImage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await getPublishedProfile(username);

  const name = profile?.displayName ?? "Profile";
  const handle = profile ? `@${profile.usernameDisplay}` : `@${username}`;
  const bio = profile?.bio ? truncate(profile.bio, 140) : profile?.headline ?? "";
  const accent = profile?.config.theme.text.accent ?? "#3fcf9f";
  const from = profile?.config.theme.background.gradientFrom ?? "#101a2b";
  const to = profile?.config.theme.background.gradientTo ?? "#0a2a22";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: `linear-gradient(135deg, ${from}, ${to})`,
          color: "#f5f7fa",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 26, opacity: 0.65 }}>
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#04231b",
              fontWeight: 700,
            }}
          >
            V
          </span>
          {env.APP_NAME}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            {profile?.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt=""
                width={132}
                height={132}
                style={{ borderRadius: 999, objectFit: "cover", border: `3px solid ${accent}` }}
              />
            ) : (
              <div
                style={{
                  width: 132,
                  height: 132,
                  borderRadius: 999,
                  background: accent,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#04231b",
                  fontSize: 56,
                  fontWeight: 700,
                }}
              >
                {name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 62, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>{name}</div>
              <div style={{ fontSize: 30, color: accent }}>{handle}</div>
            </div>
          </div>

          {bio && <div style={{ fontSize: 30, opacity: 0.8, maxWidth: 940, lineHeight: 1.4 }}>{bio}</div>}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, opacity: 0.5 }}>
          <span>{`${env.APP_URL.replace(/^https?:\/\//, "")}/${username}`}</span>
          <span>{profile ? `${profile.links.length} links` : "not found"}</span>
        </div>
      </div>
    ),
    size,
  );
}
