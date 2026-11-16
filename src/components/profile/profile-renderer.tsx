import type { CSSProperties } from "react";
import { MapPin, Sparkles } from "lucide-react";
import { Icon } from "@/components/ui";
import { safeBackgroundUrl, videoMimeFor } from "@/lib/background-image";
import { resolveBlockFrame } from "@/lib/canvas-guides";
import {
  DEFAULT_IDENTITY_FRAME,
  DEFAULT_LINKS_FRAME,
  embedUrlFor,
  filterVisibleBlocks,
  type BlockGroup,
  type CanvasConfig,
  type CanvasFrame,
  type ProfileBlock,
  type ProfileConfig,
} from "@/lib/profile-config";
import { BackgroundVideo } from "./background-video";
import { linkIcon } from "./icons";
import { LinkTracker } from "./link-tracker";

/**
 * The public profile body (Stack & Freeform Canvas modes, zero client JS by default).
 *
 * Receives a validated profile snapshot and renders semantic HTML paired with
 * the scoped stylesheet from `buildProfileCss(config)`. Only profiles with an
 * active video background mount the progressive `<BackgroundVideo>` island.
 */

export type RenderLink = {
  id: string;
  label: string;
  url: string;
  icon: string;
  highlight: boolean;
  visible?: boolean;
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
  groups?: BlockGroup[];
  layoutMode?: "stack" | "canvas";
  blocksPosition?: "above-links" | "below-links";
  canvas?: CanvasConfig;
  showLocation: boolean;
  showStatus: boolean;
  showAvatar: boolean;
  entrance: ProfileConfig["theme"]["effects"]["entrance"];
  stagger?: boolean;
  appName: string;
};

export type RenderableProfile = {
  username: string;
  usernameDisplay: string;
  displayName: string | null;
  avatarUrl: string | null;
  headline: string | null;
  bio: string | null;
  location: string | null;
  statusText: string | null;
  config: ProfileConfig;
  links: RenderLink[];
};

const RADIUS_PX: Record<string, string> = {
  none: "0px",
  sm: "6px",
  md: "10px",
  lg: "14px",
  xl: "20px",
  full: "999px",
};

const IMAGE_ASPECT_CSS: Record<string, string | undefined> = {
  auto: undefined,
  "1:1": "1 / 1",
  "16:9": "16 / 9",
  "4:3": "4 / 3",
};

export function entranceClass(entrance: ProfileConfig["theme"]["effects"]["entrance"]): string {
  switch (entrance) {
    case "rise":
      return "vp-anim-rise";
    case "fade":
      return "vp-anim-fade";
    case "scale":
      return "vp-anim-scale";
    case "blur":
      return "vp-anim-blur";
    default:
      return "";
  }
}

export function frameToStyle(frame: CanvasFrame): CSSProperties {
  return {
    "--item-x": `${frame.x}%`,
    "--item-y": `${frame.y}px`,
    "--item-w": `${frame.w}%`,
    "--item-h": frame.h !== null ? `${frame.h}px` : "auto",
    zIndex: frame.z,
  } as CSSProperties;
}

export function ProfileIdentityHeader({
  profile,
}: {
  profile: Pick<
    RenderableProfile,
    | "displayName"
    | "usernameDisplay"
    | "avatarUrl"
    | "headline"
    | "bio"
    | "location"
    | "statusText"
    | "config"
  >;
}) {
  const title = profile.displayName || profile.usernameDisplay;
  const avatarSrc = safeBackgroundUrl(profile.avatarUrl);
  const { showAvatar, showLocation, showStatus } = profile.config.layout;

  return (
    <div className="vp-head">
      {showAvatar && avatarSrc ? (
        // eslint-disable-next-line @next/next/no-img-element -- served through our own verified media route
        <img
          className="vp-avatar"
          src={avatarSrc}
          alt={`${title} avatar`}
          width={84}
          height={84}
          decoding="async"
        />
      ) : showAvatar ? (
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
          {title.slice(0, 1).toUpperCase()}
        </div>
      ) : null}

      <div>
        <h1 className="vp-name">{title}</h1>
        <p className="vp-handle">@{profile.usernameDisplay}</p>
      </div>

      {profile.headline && (
        <p className="vp-bio" suppressHydrationWarning style={{ color: "var(--p-text)", fontWeight: 500 }}>
          {profile.headline}
        </p>
      )}
      {profile.bio && <p className="vp-bio">{profile.bio}</p>}

      {(showLocation && profile.location) || (showStatus && profile.statusText) ? (
        <div className="vp-meta">
          {showLocation && profile.location && (
            <span>
              <Icon icon={MapPin} width={12} height={12} aria-hidden />
              {profile.location}
            </span>
          )}
          {showStatus && profile.statusText && (
            <span>
              <Icon icon={Sparkles} width={12} height={12} aria-hidden />
              {profile.statusText}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ProfileLinksNav({
  links,
  preview = false,
  track = false,
  showEmptyState = true,
}: {
  links: RenderLink[];
  preview?: boolean;
  track?: boolean;
  showEmptyState?: boolean;
}) {
  if (links.length === 0) {
    return showEmptyState ? <p className="vp-empty">No links yet.</p> : null;
  }

  return (
    <div className="vp-links">
      {links.map((link) => {
        const LinkIconComponent = linkIcon(link.icon);
        const isMail = link.url.startsWith("mailto:");
        return (
          <a
            key={link.id}
            className={`vp-link${link.highlight ? " vp-link--highlight" : ""}`}
            href={preview ? undefined : link.url}
            rel={preview || isMail ? undefined : "noopener noreferrer nofollow"}
            target={preview || isMail ? undefined : "_blank"}
            data-link-id={link.id}
            data-track-link={!preview && track ? link.id : undefined}
          >
            <Icon icon={LinkIconComponent} aria-hidden />
            <span>{link.label}</span>
          </a>
        );
      })}
    </div>
  );
}

export function ProfileBlockView({
  block,
  preview = false,
}: {
  block: ProfileBlock;
  preview?: boolean;
}) {
  if (!block.visible && !preview) return null;

  switch (block.type) {
    case "text": {
      if (!block.props.content.trim()) {
        return preview ? <div className="vp-empty">Empty text block — click to write.</div> : null;
      }
      const toneClass = block.props.tone !== "primary" ? `vp-block-text--${block.props.tone}` : "";
      const weightClass =
        block.props.weight !== "normal" ? `vp-block-text--w-${block.props.weight}` : "";
      return (
        <p
          className={`vp-block-text vp-block-text--${block.props.size} vp-block-text--${block.props.align} ${toneClass} ${weightClass}`.trim()}
        >
          {block.props.content}
        </p>
      );
    }
    case "image": {
      const src = safeBackgroundUrl(block.props.src);
      if (!src) {
        return preview ? (
          <div className="vp-empty">Image block — upload an image or paste an https URL.</div>
        ) : null;
      }
      return (
        <figure className="vp-block-image">
          {/* eslint-disable-next-line @next/next/no-img-element -- served through our own verified media route */}
          <img
            src={src}
            alt={block.props.alt || ""}
            loading="lazy"
            decoding="async"
            suppressHydrationWarning
            style={{
              borderRadius: RADIUS_PX[block.props.radius] ?? "14px",
              aspectRatio: IMAGE_ASPECT_CSS[block.props.aspect],
              objectFit: block.props.fit ?? "cover",
            }}
          />
          {block.props.caption ? (
            <figcaption className="vp-block-caption">{block.props.caption}</figcaption>
          ) : null}
        </figure>
      );
    }
    case "gallery": {
      const images = block.props.images
        .map((img) => ({ src: safeBackgroundUrl(img.src), alt: img.alt }))
        .filter((img): img is { src: string; alt: string } => Boolean(img.src));
      if (images.length === 0) {
        return preview ? <div className="vp-empty">Gallery block — add up to 6 photos.</div> : null;
      }
      const radius = RADIUS_PX[block.props.radius] ?? "10px";
      return (
        <div
          className="vp-block-gallery"
          suppressHydrationWarning
          style={{
            gridTemplateColumns: `repeat(${block.props.columns}, minmax(0, 1fr))`,
            gap: `${block.props.gap ?? 8}px`,
          }}
        >
          {images.map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- served through our own verified media route
            <img
              key={`${img.src}-${i}`}
              src={img.src}
              alt={img.alt}
              loading="lazy"
              decoding="async"
              suppressHydrationWarning
              style={{ borderRadius: radius }}
            />
          ))}
        </div>
      );
    }
    case "divider": {
      if (block.props.style === "spacing") {
        return <div aria-hidden style={{ height: block.props.spacing }} />;
      }
      return (
        <hr
          className={`vp-block-divider vp-block-divider--${block.props.style}`}
          style={{ marginTop: block.props.spacing / 2, marginBottom: block.props.spacing / 2 }}
        />
      );
    }
    case "embed": {
      const src = embedUrlFor(block.props.url);
      if (!src) {
        return preview ? (
          <div className="vp-empty">Embed block — paste a YouTube, Vimeo, Spotify, or SoundCloud link.</div>
        ) : null;
      }
      const aspectClass =
        block.props.aspect === "4:3"
          ? "vp-block-embed--4x3"
          : block.props.aspect === "1:1"
            ? "vp-block-embed--1x1"
            : block.props.aspect === "compact"
              ? "vp-block-embed--compact"
              : "";
      if (preview) {
        return (
          <div className={`vp-block-embed ${aspectClass}`.trim()}>
            <div
              className="vp-empty"
              style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", border: 0 }}
            >
              Embed · {block.props.title || new URL(src).hostname}
            </div>
          </div>
        );
      }
      return (
        <div className={`vp-block-embed ${aspectClass}`.trim()}>
          <iframe
            src={src}
            title={block.props.title || "Embedded content"}
            loading="lazy"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-popups"
            allow="encrypted-media; picture-in-picture"
          />
        </div>
      );
    }
  }
}

export function ProfileView({
  profile,
  backgroundUrl,
  videoUrl,
  track = false,
}: {
  profile: RenderProfile;
  backgroundUrl: string | null;
  videoUrl?: string | null;
  track?: boolean;
}) {
  const animationClass = entranceClass(profile.entrance);
  const staggerClass = profile.stagger ? "vp-stagger" : "";
  const visibleBlocks = filterVisibleBlocks(profile.blocks ?? [], profile.groups ?? []);
  const isCanvas = profile.layoutMode === "canvas";
  const blocksBelow = profile.blocksPosition === "below-links";

  const identityShape = {
    displayName: profile.displayName,
    usernameDisplay: profile.usernameDisplay,
    avatarUrl: profile.avatarUrl,
    headline: profile.headline,
    bio: profile.bio,
    location: profile.location,
    statusText: profile.statusText,
    config: {
      layout: {
        showAvatar: profile.showAvatar,
        showLocation: profile.showLocation,
        showStatus: profile.showStatus,
      },
    } as ProfileConfig,
  };

  return (
    <div className="null-profile" data-layout={isCanvas ? "canvas" : "stack"}>
      {backgroundUrl ? <div className="vp-bg" aria-hidden /> : null}
      {videoUrl ? (
        <BackgroundVideo
          src={videoUrl}
          mimeType={videoMimeFor(videoUrl)}
          poster={backgroundUrl}
        />
      ) : null}

      {isCanvas ? (
        <main className={`vp-canvas ${animationClass} ${staggerClass}`.trim()}>
          <section
            className="vp-canvas-item vp-surface"
            suppressHydrationWarning
            style={frameToStyle(profile.canvas?.identityFrame ?? DEFAULT_IDENTITY_FRAME)}
            aria-label="Profile"
          >
            <ProfileIdentityHeader profile={identityShape} />
          </section>

          {profile.links.length > 0 && (
            <div
              className="vp-canvas-item vp-surface"
              suppressHydrationWarning
              style={frameToStyle(profile.canvas?.linksFrame ?? DEFAULT_LINKS_FRAME)}
            >
              <ProfileLinksNav links={profile.links} track={track} showEmptyState={false} />
            </div>
          )}

          {visibleBlocks.map((block, index) => {
            const frame = resolveBlockFrame(block, index);
            return (
              <div
                key={block.id}
                className={[
                  "vp-canvas-item",
                  block.type === "text" ? "vp-surface" : "",
                  frame.h !== null ? "vp-canvas-item--sized" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                suppressHydrationWarning
                style={frameToStyle(frame)}
              >
                <ProfileBlockView block={block} />
              </div>
            );
          })}
        </main>
      ) : (
        <main className={`vp-card ${animationClass} ${staggerClass}`.trim()}>
          <ProfileIdentityHeader profile={identityShape} />

          {!blocksBelow && visibleBlocks.length > 0 ? (
            <div className="vp-blocks">
              {visibleBlocks.map((block) => (
                <ProfileBlockView key={block.id} block={block} />
              ))}
            </div>
          ) : null}

          <ProfileLinksNav links={profile.links} track={track} />

          {blocksBelow && visibleBlocks.length > 0 ? (
            <div className="vp-blocks">
              {visibleBlocks.map((block) => (
                <ProfileBlockView key={block.id} block={block} />
              ))}
            </div>
          ) : null}

          <p className="vp-footer">
            <Icon icon={Sparkles} width={11} height={11} aria-hidden />
            {profile.appName}
          </p>
        </main>
      )}

      {track && <LinkTracker username={profile.username} />}
    </div>
  );
}
