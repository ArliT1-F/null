import type { RenderableProfile } from "@/components/profile/profile-renderer";
import { backgroundImageFor, backgroundVideoFor, safeBackgroundUrl, videoMimeFor } from "@/lib/background-image";
import { resolveBlockFrame } from "@/lib/canvas-guides";
import { compileCustomCss } from "@/lib/custom-css";
import {
  DEFAULT_IDENTITY_FRAME,
  DEFAULT_LINKS_FRAME,
  embedUrlFor,
  filterVisibleBlocks,
  type CanvasFrame,
  type ProfileBlock,
  type ProfileConfig,
} from "@/lib/profile-config";
import { buildProfileCss, pageBackground } from "@/lib/profile-css";

/**
 * Isolated document builder & origin guard for Pro custom CSS (V2.5, guardrail #4).
 *
 * Emits zero `<script>` tags and zero event handlers, escapes every user text
 * node, re-runs `compileCustomCss()` immediately prior to emitting, and pairs
 * with a strict `default-src 'none'` CSP on `PRO_CSS_SANDBOX_ORIGIN`.
 */

const RADIUS_PX: Record<string, string> = {
  none: "0px",
  sm: "6px",
  md: "10px",
  lg: "14px",
  xl: "20px",
  full: "999px",
};

const ASPECT_CSS: Record<string, string> = {
  "1:1": "aspect-ratio:1/1;",
  "16:9": "aspect-ratio:16/9;",
  "4:3": "aspect-ratio:4/3;",
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeStyleTag(css: string): string {
  return css.replace(/<\/style/gi, "<\\/style");
}

function prefixMedia(url: string | null | undefined, mediaOrigin?: string): string | null {
  if (!url) return null;
  if (!mediaOrigin || !url.startsWith("/") || url.startsWith("//")) return url;
  return `${mediaOrigin.replace(/\/+$/, "")}${url}`;
}

function prefixRelativeCssUrls(css: string, mediaOrigin?: string): string {
  if (!mediaOrigin) return css;
  const clean = mediaOrigin.replace(/\/+$/, "");
  return css.replace(/url\("(\/(?!\/)[^"]+)"\)/g, `url("${clean}$1")`);
}

function frameInlineStyle(frame: CanvasFrame): string {
  const h = frame.h !== null ? `${frame.h}px` : "auto";
  return `--item-x:${frame.x}%;--item-y:${frame.y}px;--item-w:${frame.w}%;--item-h:${h};z-index:${frame.z}`;
}

function entranceClass(entrance: ProfileConfig["theme"]["effects"]["entrance"]): string {
  if (entrance === "rise") return "vp-anim-rise";
  if (entrance === "fade") return "vp-anim-fade";
  if (entrance === "scale") return "vp-anim-scale";
  if (entrance === "blur") return "vp-anim-blur";
  return "";
}

function renderIdentityHtml(profile: RenderableProfile, mediaOrigin?: string): string {
  const { config } = profile;
  const title = profile.displayName || profile.usernameDisplay;
  const avatar = prefixMedia(safeBackgroundUrl(profile.avatarUrl), mediaOrigin);
  const parts: string[] = ['<header class="vp-head">'];

  if (config.layout.showAvatar) {
    if (avatar) {
      parts.push(
        `<img src="${escapeHtml(avatar)}" alt="${escapeHtml(title)} avatar" width="84" height="84" class="vp-avatar" decoding="async" />`,
      );
    } else {
      const initial = escapeHtml(title.slice(0, 1).toUpperCase());
      parts.push(
        `<div class="vp-avatar" aria-hidden="true" style="display:grid;place-items:center;background:color-mix(in srgb,var(--p-accent) 35%,transparent);color:var(--p-text);font-weight:700;font-size:28px">${initial}</div>`,
      );
    }
  }

  parts.push(
    `<div><h1 class="vp-name">${escapeHtml(title)}</h1><p class="vp-handle">@${escapeHtml(profile.usernameDisplay)}</p></div>`,
  );

  if (profile.headline) {
    parts.push(`<p class="vp-bio" style="color:var(--p-text);font-weight:500">${escapeHtml(profile.headline)}</p>`);
  }
  if (profile.bio) {
    parts.push(`<p class="vp-bio">${escapeHtml(profile.bio)}</p>`);
  }

  const showLoc = config.layout.showLocation && profile.location;
  const showStat = config.layout.showStatus && profile.statusText;
  if (showLoc || showStat) {
    parts.push('<div class="vp-meta">');
    if (showLoc && profile.location) parts.push(`<span>${escapeHtml(profile.location)}</span>`);
    if (showStat && profile.statusText) parts.push(`<span>${escapeHtml(profile.statusText)}</span>`);
    parts.push("</div>");
  }

  parts.push("</header>");
  return parts.join("");
}

function renderLinksHtml(
  links: RenderableProfile["links"],
  preview: boolean,
  showEmpty: boolean,
): string {
  if (links.length === 0) {
    return showEmpty ? '<p class="vp-empty">No links yet.</p>' : "";
  }
  const iconSvg =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  const items = links
    .map((link) => {
      const cls = link.highlight ? "vp-link vp-link--highlight" : "vp-link";
      const isMail = link.url.startsWith("mailto:");
      const hrefAttr = preview
        ? ""
        : ` href="${escapeHtml(link.url)}"${isMail ? "" : ' target="_blank" rel="noopener noreferrer nofollow"'}`;
      return `<a${hrefAttr} class="${cls}">${iconSvg}<span>${escapeHtml(link.label)}</span></a>`;
    })
    .join("");
  return `<nav class="vp-links" aria-label="Links">${items}</nav>`;
}

function renderBlockHtml(block: ProfileBlock, preview: boolean, mediaOrigin?: string): string {
  switch (block.type) {
    case "text": {
      if (!block.props.content.trim()) {
        return preview ? '<div class="vp-empty">Empty text block.</div>' : "";
      }
      const tone = block.props.tone !== "primary" ? ` vp-block-text--${block.props.tone}` : "";
      const weight = block.props.weight !== "normal" ? ` vp-block-text--w-${block.props.weight}` : "";
      return `<p class="vp-block-text vp-block-text--${block.props.size} vp-block-text--${block.props.align}${tone}${weight}">${escapeHtml(block.props.content)}</p>`;
    }
    case "image": {
      const src = prefixMedia(safeBackgroundUrl(block.props.src), mediaOrigin);
      if (!src) return preview ? '<div class="vp-empty">Image block.</div>' : "";
      const radius = RADIUS_PX[block.props.radius] ?? "14px";
      const aspect = ASPECT_CSS[block.props.aspect] ?? "";
      const fit = block.props.fit === "contain" ? "contain" : "cover";
      const cap = block.props.caption
        ? `<figcaption class="vp-block-caption">${escapeHtml(block.props.caption)}</figcaption>`
        : "";
      return `<figure class="vp-block-image"><img src="${escapeHtml(src)}" alt="${escapeHtml(block.props.alt)}" loading="lazy" decoding="async" style="border-radius:${radius};${aspect}object-fit:${fit}" />${cap}</figure>`;
    }
    case "gallery": {
      const valid = block.props.images
        .map((img) => ({ src: prefixMedia(safeBackgroundUrl(img.src), mediaOrigin), alt: img.alt }))
        .filter((img): img is { src: string; alt: string } => Boolean(img.src));
      if (valid.length === 0) return preview ? '<div class="vp-empty">Gallery block.</div>' : "";
      const radius = RADIUS_PX[block.props.radius] ?? "10px";
      const imgs = valid
        .map(
          (img) =>
            `<img src="${escapeHtml(img.src)}" alt="${escapeHtml(img.alt)}" loading="lazy" decoding="async" style="border-radius:${radius}" />`,
        )
        .join("");
      return `<div class="vp-block-gallery" style="grid-template-columns:repeat(${block.props.columns},minmax(0,1fr));gap:${block.props.gap ?? 8}px">${imgs}</div>`;
    }
    case "divider":
      if (block.props.style === "spacing") {
        return `<div aria-hidden="true" style="height:${block.props.spacing}px"></div>`;
      }
      return `<hr class="vp-block-divider vp-block-divider--${block.props.style}" style="margin-block:${block.props.spacing / 2}px" />`;
    case "embed": {
      const src = embedUrlFor(block.props.url);
      if (!src) return preview ? '<div class="vp-empty">Embed block.</div>' : "";
      const aspectCls =
        block.props.aspect === "4:3"
          ? " vp-block-embed--4x3"
          : block.props.aspect === "1:1"
            ? " vp-block-embed--1x1"
            : block.props.aspect === "compact"
              ? " vp-block-embed--compact"
              : "";
      if (preview) {
        return `<div class="vp-block-embed${aspectCls}"><div class="vp-empty" style="position:absolute;inset:0;display:grid;place-items:center;border:0">Embed · ${escapeHtml(block.props.title || new URL(src).hostname)}</div></div>`;
      }
      return `<div class="vp-block-embed${aspectCls}"><iframe src="${escapeHtml(src)}" title="${escapeHtml(block.props.title || "Embedded content")}" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups" allow="encrypted-media; picture-in-picture"></iframe></div>`;
    }
  }
}

export function buildSandboxedProfileDocument(options: {
  profile: RenderableProfile;
  customCss: string;
  mediaOrigin?: string;
  appName?: string;
  preview?: boolean;
}): string {
  const { profile, customCss, mediaOrigin, appName = "null", preview = false } = options;
  const { config } = profile;

  const baseCss = prefixRelativeCssUrls(buildProfileCss(config), mediaOrigin);
  const compiled = compileCustomCss(customCss);
  const safeUserCss = compiled.ok ? compiled.css : "";

  const title = profile.displayName
    ? `${profile.displayName} (@${profile.usernameDisplay})`
    : `@${profile.usernameDisplay}`;
  const bg = pageBackground(config);

  const visibleLinks = profile.links.filter((l) => l.visible !== false);
  const visibleBlocks = filterVisibleBlocks(config.blocks ?? [], config.groups ?? []);
  const bgImage = prefixMedia(backgroundImageFor(config.theme.background), mediaOrigin);
  const bgVideo = prefixMedia(backgroundVideoFor(config.theme.background), mediaOrigin);
  const entrance = entranceClass(config.theme.effects.entrance);
  const stagger = config.theme.effects.stagger ? " vp-stagger" : "";

  const backdropHtml = [
    bgImage ? '<div class="vp-bg" aria-hidden="true"></div>' : "",
    bgVideo
      ? `<div class="vp-bg-video-wrap" aria-hidden="true"><video class="vp-bg-video" autoplay muted loop playsinline preload="metadata"${bgImage ? ` poster="${escapeHtml(bgImage)}"` : ""}><source src="${escapeHtml(bgVideo)}" type="${videoMimeFor(bgVideo)}" /></video><div class="vp-bg-dim"></div></div>`
      : "",
  ].join("");

  let innerHtml: string;
  if (config.layout.mode === "canvas") {
    const idStyle = frameInlineStyle(config.canvas?.identityFrame ?? DEFAULT_IDENTITY_FRAME);
    const linkStyle = frameInlineStyle(config.canvas?.linksFrame ?? DEFAULT_LINKS_FRAME);
    const blockItems = visibleBlocks
      .map((block, idx) => {
        const frame = resolveBlockFrame(block, idx);
        const cls = [
          "vp-canvas-item",
          block.type === "text" ? "vp-surface" : "",
          frame.h !== null ? "vp-canvas-item--sized" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `<div class="${cls}" style="${frameInlineStyle(frame)}">${renderBlockHtml(block, preview, mediaOrigin)}</div>`;
      })
      .join("");

    innerHtml = [
      `<div class="vp-canvas ${entrance}${stagger}">`,
      `<section class="vp-canvas-item vp-surface" style="${idStyle}" aria-label="Profile">${renderIdentityHtml(profile, mediaOrigin)}</section>`,
      visibleLinks.length > 0
        ? `<div class="vp-canvas-item vp-surface" style="${linkStyle}">${renderLinksHtml(visibleLinks, preview, false)}</div>`
        : "",
      blockItems,
      "</div>",
    ].join("");
  } else {
    const blocksHtml =
      visibleBlocks.length > 0
        ? `<div class="vp-blocks">${visibleBlocks.map((b) => renderBlockHtml(b, preview, mediaOrigin)).join("")}</div>`
        : "";
    const below = config.layout.blocksPosition === "below-links";

    innerHtml = [
      `<article class="vp-card ${entrance}${stagger}">`,
      renderIdentityHtml(profile, mediaOrigin),
      !below ? blocksHtml : "",
      renderLinksHtml(visibleLinks, preview, true),
      below ? blocksHtml : "",
      `<p class="vp-footer">${escapeHtml(appName)}</p>`,
      "</article>",
    ].join("");
  }

  const resetCss = `*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0;min-height:100%;background:${bg};--font-sans:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;--font-display:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}`;

  return [
    "<!DOCTYPE html>",
    `<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />`,
    `<title>${escapeHtml(title)}</title>`,
    `<style>${escapeStyleTag(resetCss)}\n${escapeStyleTag(baseCss)}</style>`,
    safeUserCss ? `<style data-null-custom-css>${escapeStyleTag(safeUserCss)}</style>` : "",
    `</head><body><main class="null-profile" data-layout="${escapeHtml(config.layout.mode)}" style="container-type:inline-size;container-name:null-profile">${backdropHtml}${innerHtml}</main></body></html>`,
  ].join("");
}

export function buildSandboxCsp(appOriginUrl: string): string {
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    `img-src ${appOriginUrl} https: data:`,
    `font-src ${appOriginUrl} data:`,
    `media-src ${appOriginUrl} https:`,
    "frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://open.spotify.com https://w.soundcloud.com",
    `frame-ancestors ${appOriginUrl}`,
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join("; ");
}

export function isRequestOnSandboxHost(
  req: Request,
  sandboxOrigin: string | null,
  appOriginUrl: string,
): boolean {
  if (!sandboxOrigin) return false;
  let sandboxHost: string;
  let appHost: string;
  try {
    sandboxHost = new URL(sandboxOrigin).host.toLowerCase();
    appHost = new URL(appOriginUrl).host.toLowerCase();
  } catch {
    return false;
  }
  if (!sandboxHost || sandboxHost === appHost) return false;

  const forwarded = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim().toLowerCase();
  const host = forwarded || req.headers.get("host")?.trim().toLowerCase() || "";
  if (host) return host === sandboxHost;

  try {
    return new URL(req.url).host.toLowerCase() === sandboxHost;
  } catch {
    return false;
  }
}
