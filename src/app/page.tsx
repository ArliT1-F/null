import {
  ArrowRight,
  Boxes,
  Github,
  Globe,
  Image as ImageIcon,
  Layers,
  Palette,
  Rocket,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { ProfilePreviewCard } from "@/components/profile-preview-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { configWithTheme } from "@/lib/profile-config";
import { getCurrentUser } from "@/lib/auth/session";

/** Three real theme token sets, rendered by the same engine as live profiles. */
const SHOWCASE_THEMES = [
  {
    slug: "aurora",
    label: "Aurora",
    tokens: { background: { type: "gradient", gradientFrom: "#101a2b", gradientTo: "#0a2a22" } },
  },
  {
    slug: "manga",
    label: "Manga",
    tokens: {
      background: { type: "gradient", gradientFrom: "#fdf2f8", gradientTo: "#fce7f3" },
      card: { surface: "#ffffff", opacity: 78, borderColor: "#f9a8d4", borderOpacity: 55, shadow: "soft" },
      text: { primary: "#3b0a2a", muted: "#8d5570", accent: "#ec4899" },
    },
  },
  {
    slug: "terminal",
    label: "Terminal",
    tokens: {
      background: { type: "solid", color: "#08090b" },
      card: { surface: "#0d1117", opacity: 95, borderColor: "#1f6feb", borderOpacity: 22, radius: "sm", shadow: "none" },
      text: { primary: "#d7e2ee", muted: "#7d8998", accent: "#4ade80" },
      typography: { font: "mono", letterSpacing: 0.4 },
    },
  },
] as const;

const FEATURES = [
  {
    icon: Palette,
    title: "Real design control",
    body: "Colours, type, spacing, radii, glass and gradient backgrounds — tuned in a live editor, not buried in a settings form.",
  },
  {
    icon: Layers,
    title: "Drafts that stay private",
    body: "Everything you change lives in a draft. Visitors only ever see the snapshot you chose to publish.",
  },
  {
    icon: Zap,
    title: "Fast by construction",
    body: "Server-rendered profiles, a single small stylesheet and responsive images. No framework shipped to your visitors.",
  },
  {
    icon: ShieldCheck,
    title: "Safe by default",
    body: "Uploads are decoded and re-encoded, links are scheme-checked, and customisation can never inject code into the platform.",
  },
  {
    icon: ImageIcon,
    title: "Portable media",
    body: "One storage interface: local disk on your own server today, Cloudflare R2 when you outgrow it. No code changes.",
  },
  {
    icon: Boxes,
    title: "Built to self-host",
    body: "PostgreSQL, one Node process, Docker Compose, Cloudflare Tunnel. Runs comfortably on modest hardware.",
  },
];

export default async function LandingPage() {
  const user = await getCurrentUser();

  return (
    <div className="relative">
      <SiteHeader />

      {/* Hero ------------------------------------------------------------- */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 grid-lines opacity-60 [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]" />
        <div className="pointer-events-none absolute -top-40 left-1/2 size-[60rem] -translate-x-1/2 rounded-full bg-brand-400/10 blur-3xl" />

        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:pb-28 lg:pt-24">
          <div className="animate-fade-up">
            <div className="chip-accent mb-5 inline-flex">
              <Sparkles className="size-3.5" />
              V1 — now open
            </div>
            <h1 className="font-display text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.03em] text-balance sm:text-6xl">
              A profile that looks like
              <span className="relative mx-2 inline-block">
                <span className="relative z-10">you</span>
                <span className="absolute inset-x-0 bottom-1 z-0 h-3 rounded-sm bg-brand-400/35" />
              </span>
              and nothing else.
            </h1>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-ink-600 text-pretty dark:text-ink-300">
              Design your identity page visually. Publish it at{" "}
              <code className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[13px] text-ink-800 dark:bg-white/10 dark:text-ink-100">
                /yourname
              </code>
              . Keep the draft until it is exactly right.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href={user ? "/dashboard" : "/register"} className="btn-primary px-6 py-3 text-[15px]">
                {user ? "Go to dashboard" : "Claim your name"}
                <ArrowRight className="size-4" />
              </Link>
              <Link href="/explore" className="btn-ghost px-5 py-3 text-[15px]">
                Browse profiles
              </Link>
            </div>

            <dl className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t border-ink-200/70 pt-6 dark:border-white/10">
              {[
                ["100%", "self-hostable"],
                ["0", "trackers by default"],
                ["1", "small CSS request"],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="font-display text-xl font-semibold tracking-tight">{value}</dt>
                  <dd className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative animate-fade-up [animation-delay:120ms]">
            <div className="absolute -inset-6 -z-10 rounded-[36px] bg-gradient-to-tr from-brand-400/20 via-transparent to-flare-400/20 blur-2xl" />
            <ProfilePreviewCard
              config={configWithTheme({
                background: { type: "gradient", gradientFrom: "#101a2b", gradientTo: "#0a2a22" },
              })}
              className="shadow-2xl"
            />
            <div className="absolute -right-3 -top-3 rotate-3 rounded-full border border-white/20 bg-ink-950/90 px-3 py-1 text-[11px] font-medium text-white shadow-xl backdrop-blur">
              live preview
            </div>
          </div>
        </div>
      </section>

      {/* Showcase --------------------------------------------------------- */}
      <section className="border-y border-ink-200/70 bg-ink-50/60 dark:border-white/10 dark:bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">Same engine, different moods</p>
              <h2 className="mt-2 section-title text-2xl">One renderer. Every aesthetic.</h2>
            </div>
            <p className="max-w-sm text-sm text-ink-500 dark:text-ink-400">
              These are live token sets — the exact CSS your visitors would receive. Switch a theme
              and publish whenever you like.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {SHOWCASE_THEMES.map((theme) => (
              <div key={theme.slug} className="group">
                <div className="overflow-hidden rounded-2xl border border-ink-200/80 bg-white p-2 shadow-panel transition-transform duration-300 group-hover:-translate-y-1 dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none">
                  <ProfilePreviewCard config={configWithTheme(theme.tokens)} className="min-h-[360px]" />
                </div>
                <p className="mt-3 px-1 text-sm font-medium text-ink-700 dark:text-ink-200">{theme.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features -------------------------------------------------------- */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Why it holds up</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.02em] text-balance">
            Built like a product, not a weekend link page
          </h2>
          <p className="mt-3 text-[15px] text-ink-600 dark:text-ink-300">
            Every part of V1 was designed for the deployment it actually runs on — including the one
            under your desk.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="panel group p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="mb-4 grid size-10 place-items-center rounded-xl bg-ink-950 text-white transition-colors group-hover:bg-brand-500 dark:bg-white/10 dark:group-hover:bg-brand-400 dark:group-hover:text-[#04231b]">
                <Icon className="size-[18px]" />
              </div>
              <h3 className="text-[15px] font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-500 dark:text-ink-400">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Deployment band ------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-ink-200/80 bg-ink-950 px-6 py-12 text-white dark:border-white/10 sm:px-12">
          <div className="pointer-events-none absolute inset-0 grid-lines opacity-[0.07]" />
          <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-brand-400/25 blur-3xl" />
          <div className="relative grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                Yours to host, yours to keep.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-300">
                The same container image runs on your laptop, on a home desktop behind Cloudflare
                Tunnel, and on a cloud VPS. PostgreSQL, one storage interface, no proprietary
                services in the critical path.
              </p>
              <ul className="mt-6 grid gap-2.5 text-sm text-ink-200 sm:grid-cols-2">
                {[
                  { icon: Rocket, text: "Docker Compose dev + production" },
                  { icon: ShieldCheck, text: "No database or admin ports exposed" },
                  { icon: Globe, text: "Cloudflare Tunnel, no port forwarding" },
                  { icon: Github, text: "Documented backup and restore" },
                ].map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-2.5">
                    <Icon className="size-4 text-brand-300" />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
            <Link href="/register" className="btn-accent w-full px-6 py-3 text-[15px] lg:w-auto">
              Start building
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />

      <div className="fixed bottom-4 right-4 z-40 md:hidden">
        <div className="rounded-full border border-ink-200 bg-white/90 p-1 shadow-lg backdrop-blur dark:border-white/10 dark:bg-ink-900/90">
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
