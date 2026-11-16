import { MapPin, Sparkles } from "lucide-react";
import { Icon } from "@/components/ui";
import { LinkTracker } from "./link-tracker";
import { linkIcon } from "./icons";

/**
 * The public profile body.
 *
 * A pure, server-only component: no hooks, no client JS, no data fetching. It
 * receives an already-validated snapshot and renders semantic HTML + the
 * generated stylesheet. Visitors get the page in one request.
 *
 * Link URLs were scheme-checked on write (http/https/mailto only); `rel` and
 * `target` are hard-coded here, so neither can be influenced by profile data.
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
  showLocation: boolean;
  showStatus: boolean;
  showAvatar: boolean;
  entrance: "none" | "fade" | "rise";
  appName: string;
};

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

  return (
    <div className="vessel-profile">
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
