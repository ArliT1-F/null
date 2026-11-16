import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { ProfileView, type RenderProfile } from "@/components/profile/profile-renderer";
import { backgroundImageFor, backgroundVideoFor } from "@/lib/background-image";
import { env } from "@/lib/env";
import { buildProfileCss, pageBackground } from "@/lib/profile-css";
import { rehydrateNullableProfileDates } from "@/lib/profiles/serialize";
import { getPublishedProfile } from "@/lib/profiles/service";
import { RESERVED_USERNAMES } from "@/lib/username";
import { truncate } from "@/lib/utils";

/**
 * Public profile page (`/:username`).
 *
 *  - Fully server rendered from per-username tagged cache (`profile:<username>`),
 *    immediately invalidated on publish or restore.
 *  - Structured Config v2 styling (including self-hosted & uploaded fonts,
 *    component blocks, groups, freeform canvas, responsive overrides, and
 *    animations) compiles to a scoped `.null-profile` stylesheet with zero
 *    client JS (save the progressive `<BackgroundVideo>` on video profiles).
 *  - Pro custom CSS NEVER runs on `APP_URL`: when present and enabled, the
 *    profile renders strictly inside an isolated `<iframe sandbox>` loaded from
 *    the separate `PRO_CSS_SANDBOX_ORIGIN`.
 */

export const revalidate = 60;

function loadPublishedProfile(username: string) {
  const canonical = username.toLowerCase();
  const cached = unstable_cache(
    async () => getPublishedProfile(canonical),
    ["published-profile", canonical],
    { revalidate: 60, tags: [`profile:${canonical}`] },
  );
  return cached().then(rehydrateNullableProfileDates);
}

type PageProps = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;

  if (RESERVED_USERNAMES.has(username.toLowerCase())) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  const profile = await loadPublishedProfile(username);
  if (!profile) {
    return { title: "Profile not found", robots: { index: false, follow: false } };
  }

  const title = `${profile.displayName} (@${profile.usernameDisplay})`;
  const description = profile.bio
    ? truncate(profile.bio, 160)
    : profile.headline
      ? truncate(profile.headline, 160)
      : `${profile.displayName}'s profile on ${env.APP_NAME}.`;
  const url = `${env.APP_URL}/${profile.username}`;
  const ogImage = `${env.APP_URL}/${profile.username}/opengraph-image`;

  return {
    title,
    description,
    alternates: { canonical: url },
    robots:
      profile.username && !RESERVED_USERNAMES.has(profile.username)
        ? { index: true, follow: true }
        : { index: false, follow: false },
    openGraph: {
      title,
      description,
      url,
      siteName: env.APP_NAME,
      type: "profile",
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${profile.displayName} on ${env.APP_NAME}` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function ProfilePage({ params }: PageProps) {
  const { username } = await params;

  if (RESERVED_USERNAMES.has(username.toLowerCase())) notFound();

  const profile = await loadPublishedProfile(username);
  if (!profile) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    dateModified: profile.publishedAt.toISOString(),
    mainEntity: {
      "@type": "Person",
      name: profile.displayName,
      alternateName: profile.usernameDisplay,
      description: profile.bio ?? undefined,
      image: profile.avatarUrl ?? undefined,
      url: `${env.APP_URL}/${profile.username}`,
      sameAs: profile.links.filter((l) => !l.url.startsWith("mailto:")).map((l) => l.url),
    },
  };

  // Strict origin isolation for Pro custom CSS profiles (guardrail #4).
  if (profile.publishedCustomCss && env.proCssPublicEnabled && env.proCssSandboxOrigin) {
    const sandboxSrc = `${env.proCssSandboxOrigin}/sandbox/profile/${encodeURIComponent(profile.username)}`;
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: `html,body{margin:0;padding:0;background:${pageBackground(profile.config)}}` }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
        <iframe
          src={sandboxSrc}
          title={`${profile.displayName} (@${profile.usernameDisplay})`}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          style={{ display: "block", width: "100%", height: "100dvh", border: 0 }}
        />
      </>
    );
  }

  const css = buildProfileCss(profile.config);

  const render: RenderProfile = {
    username: profile.username,
    usernameDisplay: profile.usernameDisplay,
    displayName: profile.displayName,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    headline: profile.headline,
    location: profile.location,
    statusText: profile.statusText,
    links: profile.links,
    blocks: profile.config.blocks,
    groups: profile.config.groups,
    layoutMode: profile.config.layout.mode,
    blocksPosition: profile.config.layout.blocksPosition,
    canvas: profile.config.canvas,
    showLocation: profile.config.layout.showLocation,
    showStatus: profile.config.layout.showStatus,
    showAvatar: profile.config.layout.showAvatar,
    entrance: profile.config.theme.effects.entrance,
    stagger: profile.config.theme.effects.stagger,
    appName: env.APP_NAME,
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <style dangerouslySetInnerHTML={{ __html: `html,body{background:${pageBackground(profile.config)}}` }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <ProfileView
        profile={render}
        backgroundUrl={backgroundImageFor(profile.config.theme.background)}
        videoUrl={backgroundVideoFor(profile.config.theme.background)}
        track
      />
    </>
  );
}
