import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { ProfileView, type RenderProfile } from "@/components/profile/profile-renderer";
import { env } from "@/lib/env";
import { backgroundImageFor } from "@/lib/background-image";
import { buildProfileCss, pageBackground } from "@/lib/profile-css";
import { getPublishedProfile } from "@/lib/profiles/service";
import { rehydrateNullableProfileDates } from "@/lib/profiles/serialize";
import { RESERVED_USERNAMES } from "@/lib/username";
import { truncate } from "@/lib/utils";

/**
 * The public profile.
 *
 * Strategy:
 *  - Fully server rendered; zero client components in the page body.
 *  - Revalidated by tag on publish (`revalidateTag("profile:<name>")`), so a
 *    published change appears immediately while visitors get cached HTML.
 *  - All customisation is delivered as a scoped, generated stylesheet — no
 *    inline user CSS, no arbitrary style attributes, no JavaScript.
 */

export const revalidate = 60;

/**
 * Published profiles are cached under a per-username tag. `publishProfile()`
 * calls `revalidateTag("profile:<name>")`, which invalidates *both* the page
 * route and this data cache — so a publish is visible immediately while every
 * other request is served from cache. Without the tag the page would only
 * refresh on the 60-second timer.
 */
function loadPublishedProfile(username: string) {
  const canonical = username.toLowerCase();
  const cached = unstable_cache(
    async () => getPublishedProfile(canonical),
    ["published-profile", canonical],
    { revalidate: 60, tags: [`profile:${canonical}`] },
  );

  // The cache round-trips through JSON, which turns dates into strings. Hydrate
  // before anything calls a Date method on the result.
  return cached().then(rehydrateNullableProfileDates);
}

type PageProps = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;

  // Reserved words never reach the profile service; they 404 cleanly.
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
    showLocation: profile.config.layout.showLocation,
    showStatus: profile.config.layout.showStatus,
    showAvatar: profile.config.layout.showAvatar,
    blocks: profile.config.blocks,
    entrance: profile.config.theme.effects.entrance,
    appName: env.APP_NAME,
  };

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

  return (
    <>
      {/* The generated stylesheet is scoped to .null-profile and built only
          from validated tokens; see src/lib/profile-css.ts. */}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <style
        dangerouslySetInnerHTML={{
          __html: `@keyframes vp-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}@keyframes vp-fade{from{opacity:0}to{opacity:1}}.vp-anim-rise{animation:vp-rise .55s cubic-bezier(.22,1,.36,1) both}.vp-anim-fade{animation:vp-fade .45s ease both}@media (prefers-reduced-motion:reduce){.vp-anim-rise,.vp-anim-fade{animation:none}}html,body{background:${pageBackground(profile.config)}}`,
        }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ProfileView profile={render} backgroundUrl={backgroundImageFor(profile.config.theme.background)} track />
    </>
  );
}
