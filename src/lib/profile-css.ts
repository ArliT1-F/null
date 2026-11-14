import type { ProfileConfig } from "@/lib/profile-config";
import { themeToCssVars } from "@/lib/profile-config";

/**
 * Builds the profile stylesheet.
 *
 * Why a stylesheet instead of inline styles? Because a profile page should paint
 * in one request with no hydration. The CSS is generated entirely from
 * *validated tokens* — every value below comes from a typed field whose schema
 * restricts it to a hex colour, an enum or a bounded number. No user string is
 * ever interpolated into a declaration, so there is no CSS-injection surface.
 *
 * All selectors are prefixed with `.vessel-profile`, so profile styling cannot
 * affect the surrounding application chrome.
 */

const PROFILE_SCOPE = ".vessel-profile";

/**
 * Solid colour behind the profile, so overscroll and the address-bar area match
 * the profile instead of flashing white. Derived from validated tokens only.
 */
export function pageBackground(config: ProfileConfig): string {
  const { type, color, gradientFrom } = config.theme.background;
  return type === "solid" ? color : gradientFrom;
}

export function buildProfileCss(config: ProfileConfig): string {
  const vars = themeToCssVars(config.theme, config.layout);
  const decls = Object.entries(vars)
    .map(([name, value]) => `${name}:${value}`)
    .join(";");

  const { effects, buttons } = config.theme;
  const { layout } = config;

  return [
    `${PROFILE_SCOPE}{${decls};min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:40px 20px;background:var(--p-bg);color:var(--p-text);font-family:var(--p-font);font-size:var(--p-base-size);line-height:var(--p-leading);letter-spacing:var(--p-tracking);-webkit-font-smoothing:antialiased;}`,
    effects.animatedBackground
      ? `${PROFILE_SCOPE}::before{content:"";position:fixed;inset:-20%;z-index:0;pointer-events:none;background:radial-gradient(45% 40% at 25% 25%,color-mix(in srgb,var(--p-accent) 26%,transparent),transparent 70%),radial-gradient(40% 38% at 78% 74%,color-mix(in srgb,var(--p-accent) 16%,transparent),transparent 70%);filter:blur(40px);animation:vessel-drift 22s ease-in-out infinite alternate;}@media (prefers-reduced-motion:reduce){${PROFILE_SCOPE}::before{animation:none;}}`
      : "",
    effects.noise
      ? `${PROFILE_SCOPE}::after{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.04;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E");}`
      : "",
    `@keyframes vessel-drift{from{transform:translate3d(-2%,-2%,0) scale(1)}to{transform:translate3d(2%,2%,0) scale(1.08)}}`,
    `${PROFILE_SCOPE} .vp-card{position:relative;z-index:1;width:100%;max-width:var(--p-width);display:flex;flex-direction:column;gap:var(--p-gap);padding:var(--p-card-padding);border-radius:var(--p-card-radius);background:color-mix(in srgb,var(--p-card-surface) calc(var(--p-card-opacity) * 100%),transparent);border:var(--p-card-border-width) solid color-mix(in srgb,var(--p-card-border) calc(var(--p-card-border-opacity) * 100%),transparent);box-shadow:var(--p-card-shadow);backdrop-filter:blur(var(--p-card-blur));-webkit-backdrop-filter:blur(var(--p-card-blur));text-align:var(--p-align);}`,
    `${PROFILE_SCOPE} .vp-head{display:flex;flex-direction:column;gap:10px;align-items:${layout.alignment === "center" ? "center" : "flex-start"};}`,
    `${PROFILE_SCOPE} .vp-avatar{width:84px;height:84px;border-radius:999px;object-fit:cover;display:block;box-shadow:0 0 0 1px color-mix(in srgb,var(--p-text) 18%,transparent),0 12px 34px -16px var(--p-accent);}`,
    `${PROFILE_SCOPE} .vp-name{margin:0;font-size:1.4em;font-weight:var(--p-heading-weight);line-height:1.15;letter-spacing:-0.02em;color:var(--p-text);}`,
    `${PROFILE_SCOPE} .vp-handle{margin:0;font-size:.85em;color:var(--p-muted);}`,
    `${PROFILE_SCOPE} .vp-bio{margin:0;font-size:.92em;color:var(--p-muted);max-width:42ch;white-space:pre-line;}`,
    `${PROFILE_SCOPE} .vp-meta{display:flex;flex-wrap:wrap;gap:8px;justify-content:${layout.alignment === "center" ? "center" : "flex-start"};font-size:.78em;color:var(--p-muted);}`,
    `${PROFILE_SCOPE} .vp-meta span{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;background:color-mix(in srgb,var(--p-text) 8%,transparent);}`,
    `${PROFILE_SCOPE} .vp-links{display:flex;flex-direction:column;gap:calc(var(--p-gap) * .8);margin-top:4px;}`,
    `${PROFILE_SCOPE} .vp-link{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:var(--p-btn-radius);background:color-mix(in srgb,var(--p-btn-fill) calc(var(--p-btn-fill-opacity) * 100%),transparent);border:1px solid color-mix(in srgb,var(--p-text) 13%,transparent);color:var(--p-text);text-decoration:none;font-size:.9em;font-weight:500;transition:transform .18s ease,border-color .18s ease,background-color .18s ease;}`,
    buttons.hoverLift
      ? `${PROFILE_SCOPE} .vp-link:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--p-accent) 55%,transparent);}`
      : `${PROFILE_SCOPE} .vp-link:hover{border-color:color-mix(in srgb,var(--p-accent) 55%,transparent);}`,
    `${PROFILE_SCOPE} .vp-link:focus-visible{outline:2px solid var(--p-accent);outline-offset:3px;}`,
    `${PROFILE_SCOPE} .vp-link svg{flex:none;width:16px;height:16px;color:var(--p-accent);}`,
    `${PROFILE_SCOPE} .vp-link--highlight{background:color-mix(in srgb,var(--p-accent) 22%,transparent);border-color:color-mix(in srgb,var(--p-accent) 45%,transparent);}`,
    `${PROFILE_SCOPE} .vp-link span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}`,
    `${PROFILE_SCOPE} .vp-empty{padding:24px;text-align:center;font-size:.85em;color:var(--p-muted);border:1px dashed color-mix(in srgb,var(--p-text) 16%,transparent);border-radius:var(--p-btn-radius);}`,
    `${PROFILE_SCOPE} .vp-footer{margin-top:6px;font-size:.72em;color:var(--p-muted);display:flex;gap:6px;justify-content:${layout.alignment === "center" ? "center" : "flex-start"};align-items:center;}`,
    `@media (max-width:480px){${PROFILE_SCOPE}{padding:24px 14px}${PROFILE_SCOPE} .vp-card{padding:calc(var(--p-card-padding) * .8)}}`,
  ]
    .filter(Boolean)
    .join("\n");
}
