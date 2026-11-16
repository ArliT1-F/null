import { backgroundImageFor, fontFormatFor, safeFontUrl } from "./background-image";
import type { BreakpointOverride, ProfileConfig } from "@/lib/profile-config";
import { themeToCssVars } from "@/lib/profile-config";

/**
 * Builds the profile stylesheet.
 *
 * Why a stylesheet instead of inline styles? Because a profile page should paint
 * in one request with no hydration. The CSS is generated entirely from
 * *validated tokens* — every value below comes from a typed field whose schema
 * restricts it to a hex colour, an enum, a bounded number, or a strictly
 * validated media path. No raw user string is ever interpolated into a
 * declaration, so there is no CSS-injection surface.
 *
 * All rules are scoped under `.null-profile`, so profile styling cannot affect
 * the surrounding application chrome.
 */

const PROFILE_SCOPE = ".null-profile";

/**
 * Solid colour behind the profile, so overscroll and the address-bar area match
 * the profile instead of flashing white. Derived from validated tokens only.
 */
export function pageBackground(config: ProfileConfig): string {
  const { type, color, gradientFrom } = config.theme.background;
  return type === "solid" || type === "mesh" ? color : gradientFrom;
}

function buildBreakpointBody(override: BreakpointOverride | undefined): string {
  if (!override) return "";
  const vars: string[] = [];
  if (override.width !== undefined) vars.push(`--p-width:${override.width}px`);
  if (override.gap !== undefined) vars.push(`--p-gap:${override.gap}px`);
  if (override.padding !== undefined) vars.push(`--p-card-padding:${override.padding}px`);
  if (override.baseSize !== undefined) vars.push(`--p-base-size:${override.baseSize}px`);
  if (override.alignment !== undefined) {
    vars.push(`--p-align:${override.alignment}`);
    vars.push(`--p-flex-align:${override.alignment === "center" ? "center" : "flex-start"}`);
  }

  const rules: string[] = [];
  if (vars.length > 0) {
    rules.push(`${PROFILE_SCOPE}{${vars.join(";")}}`);
  }
  if (override.canvasStack === true) {
    rules.push(canvasStackRules());
  } else if (override.canvasStack === false) {
    rules.push(canvasFreeformRestoreRules());
  }
  return rules.join("");
}

function canvasStackRules(): string {
  return [
    `${PROFILE_SCOPE} .vp-canvas{min-height:0;display:flex;flex-direction:column;gap:var(--p-gap);}`,
    `${PROFILE_SCOPE} .vp-canvas-item{position:relative!important;left:auto!important;top:auto!important;width:100%!important;height:auto!important;}`,
  ].join("");
}

function canvasFreeformRestoreRules(): string {
  return [
    `${PROFILE_SCOPE} .vp-canvas{min-height:var(--p-canvas-height);display:block;}`,
    `${PROFILE_SCOPE} .vp-canvas-item{position:absolute!important;left:var(--item-x)!important;top:var(--item-y)!important;width:var(--item-w)!important;height:var(--item-h)!important;}`,
  ].join("");
}

/**
 * Emits both `@media` (public profiles & browsers without a wrapper container)
 * and `@container null-profile` (viewport-isolated editor device previews) so
 * responsive rules behave identically in the editor and in production.
 */
function responsiveBlock(maxWidthPx: number, body: string): string {
  if (!body) return "";
  return [
    `@media (max-width:${maxWidthPx}px){${body}}`,
    `@container null-profile (max-width:${maxWidthPx}px){${body}}`,
  ].join("\n");
}

/** Entrance + reduced-motion stylesheet shared between public profile, sandbox and preview. */
export function buildEntranceCss(): string {
  return [
    `@keyframes vp-rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}`,
    `@keyframes vp-fade{from{opacity:0}to{opacity:1}}`,
    `@keyframes vp-scale{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}`,
    `@keyframes vp-blur{from{opacity:0;filter:blur(8px);transform:translateY(6px)}to{opacity:1;filter:blur(0);transform:none}}`,
    `${PROFILE_SCOPE} .vp-anim-rise{animation:vp-rise .55s cubic-bezier(.22,1,.36,1) both}`,
    `${PROFILE_SCOPE} .vp-anim-fade{animation:vp-fade .45s ease both}`,
    `${PROFILE_SCOPE} .vp-anim-scale{animation:vp-scale .5s cubic-bezier(.22,1,.36,1) both}`,
    `${PROFILE_SCOPE} .vp-anim-blur{animation:vp-blur .6s cubic-bezier(.22,1,.36,1) both}`,
    `${PROFILE_SCOPE} .vp-stagger>*{animation:vp-rise .5s cubic-bezier(.22,1,.36,1) both}`,
    `${PROFILE_SCOPE} .vp-stagger>*:nth-child(1){animation-delay:40ms}`,
    `${PROFILE_SCOPE} .vp-stagger>*:nth-child(2){animation-delay:110ms}`,
    `${PROFILE_SCOPE} .vp-stagger>*:nth-child(3){animation-delay:180ms}`,
    `${PROFILE_SCOPE} .vp-stagger>*:nth-child(4){animation-delay:240ms}`,
    `@media (prefers-reduced-motion:reduce){${PROFILE_SCOPE} .vp-anim-rise,${PROFILE_SCOPE} .vp-anim-fade,${PROFILE_SCOPE} .vp-anim-scale,${PROFILE_SCOPE} .vp-anim-blur,${PROFILE_SCOPE} .vp-stagger>*{animation:none!important}}`,
  ].join("");
}

export function buildProfileCss(config: ProfileConfig): string {
  const vars = themeToCssVars(config.theme, config.layout, config.canvas);
  const decls = Object.entries(vars)
    .map(([name, value]) => `${name}:${value}`)
    .join(";");

  const { effects, buttons, typography } = config.theme;
  const { breakpoints, canvas } = config;
  const backgroundImage = backgroundImageFor(config.theme.background);
  const hasVideo = config.theme.background.type === "video";
  const customFontUrl = safeFontUrl(typography.customFontUrl);
  const usesCustomFont =
    customFontUrl && (typography.font === "custom" || typography.headingFont === "custom");

  const fontFaceRule = usesCustomFont
    ? `@font-face{font-family:"null-user-font";src:url("${customFontUrl}") format("${fontFormatFor(customFontUrl)}");font-display:swap;}`
    : "";

  const motionName =
    effects.backgroundMotion === "pulse"
      ? "null-pulse"
      : effects.backgroundMotion === "aurora"
        ? "null-aurora"
        : "null-drift";
  const motionDuration =
    effects.backgroundMotion === "pulse" ? "14s" : effects.backgroundMotion === "aurora" ? "18s" : "22s";

  const buttonVariantCss =
    buttons.style === "outline"
      ? `${PROFILE_SCOPE} .vp-link{background:transparent;border-color:color-mix(in srgb,var(--p-text) 26%,transparent);}`
      : buttons.style === "solid"
        ? `${PROFILE_SCOPE} .vp-link{background:color-mix(in srgb,var(--p-btn-fill) calc(max(var(--p-btn-fill-opacity),0.16) * 100%),transparent);}`
        : buttons.style === "glass"
          ? `${PROFILE_SCOPE} .vp-link{backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-color:color-mix(in srgb,var(--p-text) 20%,transparent);}`
          : "";

  const cardHoverCss =
    effects.cardHover === "lift"
      ? `${PROFILE_SCOPE} .vp-card{transition:transform .28s cubic-bezier(.22,1,.36,1),box-shadow .28s ease;}${PROFILE_SCOPE} .vp-card:hover{transform:translateY(-3px);}`
      : effects.cardHover === "glow"
        ? `${PROFILE_SCOPE} .vp-card{transition:border-color .28s ease,box-shadow .28s ease;}${PROFILE_SCOPE} .vp-card:hover{border-color:color-mix(in srgb,var(--p-accent) 45%,transparent);box-shadow:var(--p-card-shadow),0 0 48px -14px color-mix(in srgb,var(--p-accent) 52%,transparent);}`
        : "";

  // Responsive breakpoint rules: tablet (<=900px) first, then mobile (<=480px)
  // so narrower rules always win in cascade order.
  const tabletBody = buildBreakpointBody(breakpoints?.tablet);
  const mobileOverrideBody = buildBreakpointBody(breakpoints?.mobile);

  const defaultMobileParts: string[] = [`${PROFILE_SCOPE}{padding:24px 14px}`];
  // Only scale card padding automatically when the user didn't pick an explicit mobile padding.
  if (breakpoints?.mobile?.padding === undefined) {
    defaultMobileParts.push(`${PROFILE_SCOPE} .vp-card{padding:calc(var(--p-card-padding) * .8)}`);
  }
  // Reflow freeform canvas cleanly on small screens unless explicitly disabled.
  const shouldStackMobile = breakpoints?.mobile?.canvasStack ?? canvas?.mobileStack ?? true;
  if (shouldStackMobile && breakpoints?.mobile?.canvasStack === undefined) {
    defaultMobileParts.push(canvasStackRules());
  }

  return [
    fontFaceRule,
    `${PROFILE_SCOPE}{${decls};position:relative;overflow:hidden;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:40px 20px;background:var(--p-bg);color:var(--p-text);font-family:var(--p-font);font-size:var(--p-base-size);line-height:var(--p-leading);letter-spacing:var(--p-tracking);-webkit-font-smoothing:antialiased;}`,
    backgroundImage
      ? `${PROFILE_SCOPE} .vp-bg{position:absolute;inset:0;z-index:0;pointer-events:none;background-image:linear-gradient(rgba(0,0,0,var(--p-bg-dim)),rgba(0,0,0,var(--p-bg-dim))),url("${backgroundImage}");background-size:cover;background-position:center;background-repeat:no-repeat;filter:blur(var(--p-bg-blur));transform:scale(1.06);}`
      : "",
    hasVideo
      ? [
          `${PROFILE_SCOPE} .vp-bg-video-wrap{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden;}`,
          `${PROFILE_SCOPE} .vp-bg-video{width:100%;height:100%;object-fit:cover;filter:blur(var(--p-bg-blur));transform:scale(1.06);}`,
          `${PROFILE_SCOPE} .vp-bg-dim{position:absolute;inset:0;background:rgba(0,0,0,var(--p-bg-dim));}`,
          `@media (prefers-reduced-motion:reduce){${PROFILE_SCOPE} .vp-bg-video{display:none}}`,
          `@media (prefers-reduced-data:reduce){${PROFILE_SCOPE} .vp-bg-video{display:none}}`,
        ].join("")
      : "",
    effects.animatedBackground
      ? `${PROFILE_SCOPE}::before{content:"";position:fixed;inset:-20%;z-index:0;pointer-events:none;background:radial-gradient(45% 40% at 25% 25%,color-mix(in srgb,var(--p-accent) 26%,transparent),transparent 70%),radial-gradient(40% 38% at 78% 74%,color-mix(in srgb,var(--p-accent) 16%,transparent),transparent 70%);filter:blur(40px);animation:${motionName} ${motionDuration} ease-in-out infinite alternate;}@media (prefers-reduced-motion:reduce){${PROFILE_SCOPE}::before{animation:none;}}`
      : "",
    effects.noise
      ? `${PROFILE_SCOPE}::after{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.04;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E");}`
      : "",
    `@keyframes null-drift{from{transform:translate3d(-2%,-2%,0) scale(1)}to{transform:translate3d(2%,2%,0) scale(1.08)}}`,
    `@keyframes null-pulse{from{opacity:.55;transform:scale(.98)}to{opacity:1;transform:scale(1.06)}}`,
    `@keyframes null-aurora{from{transform:translate3d(-4%,2%,0) rotate(-3deg) scale(1.02)}to{transform:translate3d(4%,-3%,0) rotate(3deg) scale(1.1)}}`,
    buildEntranceCss(),
    `${PROFILE_SCOPE} .vp-card{position:relative;z-index:1;width:100%;max-width:var(--p-width);display:flex;flex-direction:column;gap:var(--p-gap);padding:var(--p-card-padding);border-radius:var(--p-card-radius);background:color-mix(in srgb,var(--p-card-surface) calc(var(--p-card-opacity) * 100%),transparent);border:var(--p-card-border-width) solid color-mix(in srgb,var(--p-card-border) calc(var(--p-card-border-opacity) * 100%),transparent);box-shadow:var(--p-card-shadow);backdrop-filter:blur(var(--p-card-blur));-webkit-backdrop-filter:blur(var(--p-card-blur));text-align:var(--p-align);}`,
    cardHoverCss,
    `${PROFILE_SCOPE} .vp-surface{padding:var(--p-card-padding);border-radius:var(--p-card-radius);background:color-mix(in srgb,var(--p-card-surface) calc(var(--p-card-opacity) * 100%),transparent);border:var(--p-card-border-width) solid color-mix(in srgb,var(--p-card-border) calc(var(--p-card-border-opacity) * 100%),transparent);box-shadow:var(--p-card-shadow);backdrop-filter:blur(var(--p-card-blur));-webkit-backdrop-filter:blur(var(--p-card-blur));text-align:var(--p-align);}`,
    `${PROFILE_SCOPE} .vp-canvas{position:relative;z-index:1;width:100%;max-width:var(--p-canvas-width);min-height:var(--p-canvas-height);margin:0 auto;}`,
    `${PROFILE_SCOPE} .vp-canvas-item{position:absolute;box-sizing:border-box;left:var(--item-x);top:var(--item-y);width:var(--item-w);height:var(--item-h);}`,
    `${PROFILE_SCOPE} .vp-canvas-item--sized{overflow:hidden;}`,
    `${PROFILE_SCOPE} .vp-canvas-item--sized .vp-block-image,${PROFILE_SCOPE} .vp-canvas-item--sized .vp-block-embed{height:100%;}`,
    `${PROFILE_SCOPE} .vp-canvas-item--sized .vp-block-image img{height:100%;}`,
    `${PROFILE_SCOPE} .vp-head{display:flex;flex-direction:column;gap:10px;align-items:var(--p-flex-align);}`,
    `${PROFILE_SCOPE} .vp-avatar{width:84px;height:84px;border-radius:999px;object-fit:cover;display:block;box-shadow:0 0 0 1px color-mix(in srgb,var(--p-text) 18%,transparent),0 12px 34px -16px var(--p-accent);}`,
    `${PROFILE_SCOPE} .vp-name{margin:0;font-family:var(--p-heading-font);font-size:1.4em;font-weight:var(--p-heading-weight);line-height:1.15;letter-spacing:-0.02em;color:var(--p-text);}`,
    `${PROFILE_SCOPE} .vp-handle{margin:0;font-size:.85em;color:var(--p-muted);}`,
    `${PROFILE_SCOPE} .vp-bio{margin:0;font-size:.92em;color:var(--p-muted);max-width:42ch;white-space:pre-line;}`,
    `${PROFILE_SCOPE} .vp-meta{display:flex;flex-wrap:wrap;gap:8px;justify-content:var(--p-flex-align);font-size:.78em;color:var(--p-muted);}`,
    `${PROFILE_SCOPE} .vp-meta span{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;background:color-mix(in srgb,var(--p-text) 8%,transparent);}`,
    `${PROFILE_SCOPE} .vp-links{display:flex;flex-direction:column;gap:calc(var(--p-gap) * .8);margin-top:4px;}`,
    `${PROFILE_SCOPE} .vp-link{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:var(--p-btn-radius);background:color-mix(in srgb,var(--p-btn-fill) calc(var(--p-btn-fill-opacity) * 100%),transparent);border:1px solid color-mix(in srgb,var(--p-text) 13%,transparent);color:var(--p-text);text-decoration:none;font-size:.9em;font-weight:500;transition:transform .18s ease,border-color .18s ease,background-color .18s ease;}`,
    buttonVariantCss,
    buttons.hoverLift
      ? `${PROFILE_SCOPE} .vp-link:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--p-accent) 55%,transparent);}`
      : `${PROFILE_SCOPE} .vp-link:hover{border-color:color-mix(in srgb,var(--p-accent) 55%,transparent);}`,
    `${PROFILE_SCOPE} .vp-link:focus-visible{outline:2px solid var(--p-accent);outline-offset:3px;}`,
    `${PROFILE_SCOPE} .vp-link svg{flex:none;width:16px;height:16px;color:var(--p-accent);}`,
    `${PROFILE_SCOPE} .vp-link--highlight{background:color-mix(in srgb,var(--p-accent) 22%,transparent);border-color:color-mix(in srgb,var(--p-accent) 45%,transparent);}`,
    `${PROFILE_SCOPE} .vp-link span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}`,
    `${PROFILE_SCOPE} .vp-empty{padding:24px;text-align:center;font-size:.85em;color:var(--p-muted);border:1px dashed color-mix(in srgb,var(--p-text) 16%,transparent);border-radius:var(--p-btn-radius);}`,
    `${PROFILE_SCOPE} .vp-footer{margin-top:6px;font-size:.72em;color:var(--p-muted);display:flex;gap:6px;justify-content:var(--p-flex-align);align-items:center;}`,
    // Component blocks (V2). All values are validated enums/bounded numbers.
    `${PROFILE_SCOPE} .vp-blocks{display:flex;flex-direction:column;gap:var(--p-gap);}`,
    `${PROFILE_SCOPE} .vp-block-text{margin:0;white-space:pre-line;color:var(--p-text);}`,
    `${PROFILE_SCOPE} .vp-block-text--sm{font-size:.85em} ${PROFILE_SCOPE} .vp-block-text--md{font-size:.95em} ${PROFILE_SCOPE} .vp-block-text--lg{font-size:1.15em;font-family:var(--p-heading-font);font-weight:var(--p-heading-weight)} ${PROFILE_SCOPE} .vp-block-text--xl{font-size:1.45em;font-family:var(--p-heading-font);font-weight:var(--p-heading-weight);line-height:1.2;letter-spacing:-0.02em}`,
    `${PROFILE_SCOPE} .vp-block-text--muted{color:var(--p-muted)} ${PROFILE_SCOPE} .vp-block-text--accent{color:var(--p-accent)}`,
    `${PROFILE_SCOPE} .vp-block-text--w-medium{font-weight:500} ${PROFILE_SCOPE} .vp-block-text--w-bold{font-weight:700}`,
    `${PROFILE_SCOPE} .vp-block-text--left{text-align:left} ${PROFILE_SCOPE} .vp-block-text--center{text-align:center} ${PROFILE_SCOPE} .vp-block-text--right{text-align:right}`,
    `${PROFILE_SCOPE} .vp-block-image{margin:0} ${PROFILE_SCOPE} .vp-block-image img{width:100%;height:auto;display:block;object-fit:cover}`,
    `${PROFILE_SCOPE} .vp-block-caption{margin:6px 0 0;font-size:.78em;color:var(--p-muted);text-align:center}`,
    `${PROFILE_SCOPE} .vp-block-gallery{display:grid;gap:8px} ${PROFILE_SCOPE} .vp-block-gallery img{width:100%;height:auto;display:block;object-fit:cover;aspect-ratio:1}`,
    `${PROFILE_SCOPE} .vp-block-divider{border:0;height:0;margin:0}`,
    `${PROFILE_SCOPE} .vp-block-divider--line{border-top:1px solid color-mix(in srgb,var(--p-text) 16%,transparent)}`,
    `${PROFILE_SCOPE} .vp-block-divider--dots{border-top:2px dotted color-mix(in srgb,var(--p-text) 24%,transparent)}`,
    `${PROFILE_SCOPE} .vp-block-divider--gradient{height:1px;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--p-accent) 60%,transparent),transparent)}`,
    `${PROFILE_SCOPE} .vp-block-embed{position:relative;width:100%;aspect-ratio:16/9;border-radius:var(--p-btn-radius);overflow:hidden;background:rgba(0,0,0,.25)}`,
    `${PROFILE_SCOPE} .vp-block-embed--4x3{aspect-ratio:4/3} ${PROFILE_SCOPE} .vp-block-embed--1x1{aspect-ratio:1/1} ${PROFILE_SCOPE} .vp-block-embed--compact{aspect-ratio:auto;height:152px}`,
    `${PROFILE_SCOPE} .vp-block-embed iframe{position:absolute;inset:0;width:100%;height:100%;border:0}`,
    `@media (prefers-reduced-motion:reduce){${PROFILE_SCOPE} .vp-link,${PROFILE_SCOPE} .vp-card{transition:none}${PROFILE_SCOPE} .vp-link:hover,${PROFILE_SCOPE} .vp-card:hover{transform:none}}`,
    responsiveBlock(900, tabletBody),
    responsiveBlock(480, defaultMobileParts.join("") + mobileOverrideBody),
  ]
    .filter(Boolean)
    .join("\n");
}
