import { Github, Globe, Instagram, Music, Twitch, Youtube } from "lucide-react";
import { backgroundImageFor } from "@/lib/background-image";
import type { ProfileConfig } from "@/lib/profile-config";
import { themeToCssVars } from "@/lib/profile-config";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * A live, style-accurate preview of a profile card.
 *
 * The same `themeToCssVars` output drives the real public renderer, so what a
 * visitor sees here is what they get on their published page. Used on the
 * landing page as a product demonstration (not fake data presented as a real
 * user — it is clearly a sample).
 *
 * Every node that carries an inline `style` also carries
 * `suppressHydrationWarning`: colour/background/border declarations are exactly
 * what Dark Reader rewrites in the DOM before React hydrates, and the
 * suppression does not inherit, so it has to sit on each node that owns a
 * `style` prop. Icons go through `<Icon>` for the same reason. See the note on
 * `<Icon>` in `src/components/ui.tsx`.
 */

const SAMPLE_LINKS = [
  { icon: Instagram, label: "Photography", tone: "#f7a1c4" },
  { icon: Github, label: "Open source", tone: "#93a4c4" },
  { icon: Youtube, label: "Latest video", tone: "#f59f9f" },
  { icon: Music, label: "Now playing", tone: "#7ce0b8" },
  { icon: Twitch, label: "Streaming Tuesdays", tone: "#c4a4f0" },
  { icon: Globe, label: "my-site.dev", tone: "#8fd3ff" },
];

export function ProfilePreviewCard({
  config,
  className,
}: {
  config: ProfileConfig;
  className?: string;
}) {
  const vars = themeToCssVars(config.theme, config.layout) as React.CSSProperties;
  const glow = config.theme.effects.glow;
  const backgroundImage = backgroundImageFor(config.theme.background);

  return (
    <div
      className={cn("relative overflow-hidden rounded-[28px] border border-white/10", className)}
      suppressHydrationWarning
      style={{
        ...vars,
        background: "var(--p-bg)",
        fontFamily: "var(--p-font)",
        color: "var(--p-text)",
        fontSize: "var(--p-base-size)",
      }}
    >
      {backgroundImage && (
        <div
           className="pointer-events-none absolute inset-0 bg-cover bg-center"
           suppressHydrationWarning
           style={{
            backgroundImage: `linear-gradient(rgba(0,0,0,var(--p-bg-dim)), rgba(0,0,0,var(--p-bg-dim))), url("${backgroundImage}")`,
            filter: "blur(var(--p-bg-blur))",
            transform: "scale(1.06)",
           }}
           aria-hidden
        />
      )}
      {config.theme.background.type !== "solid" && (
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          suppressHydrationWarning
          style={{
            background:
              "radial-gradient(60% 50% at 20% 10%, rgba(255,255,255,0.16), transparent 70%), radial-gradient(50% 45% at 85% 90%, rgba(255,255,255,0.10), transparent 70%)",
          }}
        />
      )}
      <div className="relative flex min-h-[420px] flex-col items-center justify-center p-8">
        <div
          className="w-full"
          suppressHydrationWarning
          style={{
            maxWidth: "var(--p-width)",
            display: "flex",
            flexDirection: "column",
            alignItems: config.layout.alignment === "center" ? "center" : "flex-start",
            gap: "var(--p-gap)",
            background: "color-mix(in srgb, var(--p-card-surface) calc(var(--p-card-opacity) * 100%), transparent)",
            border: "var(--p-card-border-width) solid color-mix(in srgb, var(--p-card-border) calc(var(--p-card-border-opacity) * 100%), transparent)",
            borderRadius: "var(--p-card-radius)",
            padding: "var(--p-card-padding)",
            backdropFilter: "blur(var(--p-card-blur))",
            boxShadow: "var(--p-card-shadow)",
            textAlign: config.layout.alignment === "center" ? "center" : "left",
          }}
        >
          {config.layout.showAvatar && (
            <div
              className="relative size-20 shrink-0 rounded-full"
              suppressHydrationWarning
              style={{
                background: "linear-gradient(145deg, var(--p-accent), color-mix(in srgb, var(--p-accent) 40%, #ffffff))",
                boxShadow: glow ? "0 0 0 1px rgba(255,255,255,0.18), 0 10px 30px -10px var(--p-accent)" : "none",
              }}
              aria-hidden
            >
              <span className="absolute inset-0 grid place-items-center text-2xl font-bold text-black/50">a</span>
            </div>
          )}

          <div className="space-y-1.5">
            <p
              className="text-lg font-bold leading-tight"
              suppressHydrationWarning
              style={{ fontWeight: "var(--p-heading-weight)" }}
            >
              arli
            </p>
            <p
              className="text-xs"
              suppressHydrationWarning
              style={{ color: "var(--p-muted)", letterSpacing: "var(--p-tracking)" }}
            >
              designer · tinkerer · Tirana
            </p>
          </div>

          <p
            className="max-w-[34ch] text-xs leading-relaxed"
            suppressHydrationWarning
            style={{ color: "var(--p-muted)", lineHeight: "var(--p-leading)" }}
          >
            Building small, careful things for the web. Sometimes I take photos.
          </p>

          <div className="mt-1 flex w-full flex-col" style={{ gap: "calc(var(--p-gap) * 0.7)" }}>
            {SAMPLE_LINKS.slice(0, 4).map((link) => (
              <div
                key={link.label}
                className="flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium"
                suppressHydrationWarning
                style={{
                  borderRadius: "var(--p-btn-radius)",
                  background: "color-mix(in srgb, var(--p-btn-fill) calc(var(--p-btn-fill-opacity) * 100%), transparent)",
                  border: "1px solid color-mix(in srgb, var(--p-text) 14%, transparent)",
                }}
              >
                <Icon icon={link.icon} className="size-3.5 shrink-0" style={{ color: link.tone }} />
                <span className="truncate">{link.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
