import { MapPin, Sparkles } from "lucide-react";
import { Icon } from "@/components/ui";
import { LinkTracker } from "./link-tracker";
import { linkIcon } from "./icons";
import { embedUrlFor, type ProfileBlock } from "@/lib/profile-config";
import { safeBackgroundUrl } from "@/lib/background-image";

/**
 * The public profile body.
 *
 * A pure, server-only component: no hooks, no client JS, no data fetching. It
 * receives an already-validated snapshot and renders semantic HTML + the
 * generated stylesheet. Visitors get the page in one request.
 *
 * Link URLs were scheme-checked on write (http/https/mailto only); `rel` and
 * `target` are hard-coded here, so neither can be influenced by profile data.
 * Block content is plain text (React-escaped); block images are re-validated
 * here via `safeBackgroundUrl` (defence in depth — the schema already checked
 * them); embeds are allowlisted and rendered in a sandboxed iframe.
 *
 * Icons render through `<Icon>` and the two inline-styled nodes opt out of
 * React's hydration comparison, because extensions such as Dark Reader inject
 * their own attributes/styles into the DOM before hydration runs. See the note
 * on `<Icon>` in `src/components/ui.tsx`.
 */

export type RenderLink = {
  id: string;
  label: string;
  url: string;
  icon: string;
  highlight: boolean;
};

export type RenderProfile = {
  username: string;
  usernameDisplay: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  headline: string | null;
  location: string | null;
  statusText: string | null;
  links: RenderLink[];
  blocks: ProfileBlock[];
  showLocation: boolean;
  showStatus: boolean;
  showAvatar: boolean;
  entrance: "none" | "fade" | "rise";
  appName: string;
};

const RADIUS_PX: Record<string, string> = {
  none: "0px",
  sm: "6px",
  md: "10px",
  lg: "14px",
  xl: "20px",
  full: "999px",
};

function BlockView({ block }: { block: ProfileBlock }) {
  if (!block.visible) return null;
  switch (block.type) {
    case "text": {
      if (!block.props.content.trim()) return null;
      return (
        <p className={`vp-block-text vp-block-text--${block.props.size} vp-block-text--${block.props.align}`}>
          {block.props.content}
        </p>
      );
    }
    case "image": {
      const src = safeBackgroundUrl(block.props.src);
      if (!src) return null;
      return (
        <figure className="vp-block-image">
          {/* eslint-disable-next-line @next/next/no-img-element -- served through our own optimised media route */}
          <img
            src={src}
            alt={block.props.alt || ""}
            loading="lazy"
            decoding="async"
            style={{ borderRadius: RADIUS_PX[block.props.radius] ?? "14px" }}
          />
          {block.props.caption ? <figcaption className="vp-block-caption">{block.props.caption}</figcaption> : null}
        </figure>
      );
    }
    case "gallery": {
      const images = block.props.images
        .map((img) => ({ src: safeBackgroundUrl(img.src), alt: img.alt }))
        .filter((img): img is { src: string; alt: string } => Boolean(img.src));
      if (images.length === 0) return null;
      return (
        <div
          className="vp-block-gallery"
          style={{ gridTemplateColumns: `repeat(${block.props.columns}, minmax(0, 1fr))` }}
        >
          {images.map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- served through our own optimised media route
            <img key={`${img.src}-${i}`} src={img.src} alt={img.alt} loading="lazy" decoding="async" />
          ))}
        </div>
      );
    }
    case "divider": {
      if (block.props.style === "spacing") return <div aria-hidden style={{ height: block.props.spacing }} />;
      return <hr className={`vp-block-divider vp-block-divider--${block.props.style}`} style={{ marginTop: block.props.spacing / 2, marginBottom: block.props.spacing / 2 }} />;
    }
    case "embed": {
      const src = embedUrlFor(block.props.url);
      if (!src) return null;
      return (
        <div className="vp-block-embed">
          <iframe
            src={src}
            title={block.props.title || "Embedded content"}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-presentation"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      );
    }
    default:
      return null;
  }
}

export function ProfileView({
  profile,
  track,
  backgroundUrl,
}: {
  profile: RenderProfile;
  track?: boolean;
  backgroundUrl?: string | null;
}) {
  const animationClass =
    profile.entrance === "rise" ? "vp-anim-rise" : profile.entrance === "fade" ? "vp-anim-fade" : "";

  const visibleBlocks = (profile.blocks ?? []).filter((b) => b.visible);

  return (
    <div className="null-profile">
      {backgroundUrl ? <div className="vp-bg" aria-hidden /> : null}
      <main className={`vp-card ${animationClass}`}>
        <div className="vp-head">
          {profile.showAvatar && profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- served through our own optimised media route
            <img
              className="vp-avatar"
              src={profile.avatarUrl}
              alt={`${profile.displayName} avatar`}
              width={84}
              height={84}
              decoding="async"
            />
          ) : profile.showAvatar ? (
            <div
              className="vp-avatar"
              aria-hidden
              suppressHydrationWarning
              style={{
                display: "grid",
                placeItems: "center",
                background: "color-mix(in srgb, var(--p-accent) 35%, transparent)",
                fontWeight: 700,
                fontSize: 28,
                color: "var(--p-text)",
              }}
            >
              {profile.displayName.slice(0, 1).toUpperCase()}
            </div>
          ) : null}

          <div>
            <h1 className="vp-name">{profile.displayName}</h1>
            <p className="vp-handle">@{profile.usernameDisplay}</p>
          </div>

          {profile.headline && (
            <p className="vp-bio" suppressHydrationWarning style={{ color: "var(--p-text)", fontWeight: 500 }}>
              {profile.headline}
            </p>
          )}
          {profile.bio && <p className="vp-bio">{profile.bio}</p>}

          {(profile.showLocation && profile.location) || (profile.showStatus && profile.statusText) ? (
            <div className="vp-meta">
              {profile.showLocation && profile.location && (
                <span>
                  <Icon icon={MapPin} width={12} height={12} aria-hidden />
                  {profile.location}
                </span>
              )}
              {profile.showStatus && profile.statusText && (
                <span>
                  <Icon icon={Sparkles} width={12} height={12} aria-hidden />
                  {profile.statusText}
                </span>
              )}
            </div>
          ) : null}
        </div>

        {visibleBlocks.length > 0 ? (
          <div className="vp-blocks">
            {visibleBlocks.map((block) => (
              <BlockView key={block.id} block={block} />
            ))}
          </div>
        ) : null}

        <div className="vp-links">
          {profile.links.length === 0 ? (
            <p className="vp-empty">No links yet.</p>
          ) : (
            profile.links.map((link) => {
              const LinkIcon = linkIcon(link.icon);
              const isMail = link.url.startsWith("mailto:");
              return (
                <a
                  key={link.id}
                  className={`vp-link${link.highlight ? " vp-link--highlight" : ""}`}
                  href={link.url}
                  rel={isMail ? undefined : "noopener noreferrer nofollow"}
                  target={isMail ? undefined : "_blank"}
                  data-link-id={link.id}
                  data-track-link={track ? link.id : undefined}
                >
                  <Icon icon={LinkIcon} aria-hidden />
                  <span>{link.label}</span>
                </a>
              );
            })
          )}
        </div>

        <p className="vp-footer">
          <Icon icon={Sparkles} width={11} height={11} aria-hidden />
          {profile.appName}
        </p>
      </main>
      {track && <LinkTracker username={profile.username} />}
    </div>
  );
}
