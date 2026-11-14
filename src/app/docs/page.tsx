import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Database, Server, ShieldCheck, Terminal } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Documentation",
  description: "How Vessel works and how to run it yourself.",
};

const SECTIONS = [
  {
    icon: Terminal,
    title: "Develop locally",
    body: "Clone the repository, run Docker Compose, open localhost:3000. Hot reload for both the server and the UI.",
    href: "#development",
  },
  {
    icon: Server,
    title: "Self-host",
    body: "Run on your own hardware behind Cloudflare Tunnel: no port forwarding, no exposed database.",
    href: "#self-hosting",
  },
  {
    icon: Database,
    title: "Data model",
    body: "One PostgreSQL database, structured core tables, JSONB only for presentation configuration.",
    href: "#database",
  },
  {
    icon: ShieldCheck,
    title: "Security",
    body: "How uploads, customisation, sessions and authorisation are locked down.",
    href: "/docs/security",
  },
];

export default function DocsPage() {
  return (
    <div>
      <SiteHeader />

      <main className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <p className="eyebrow">Documentation</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.02em]">Running Vessel</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-600 dark:text-ink-300">
          Vessel is a single Next.js application with one PostgreSQL database. The same image runs on
          a laptop, a home server and a cloud VPS. Everything below describes what the code actually
          does.
        </p>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {SECTIONS.map(({ icon: Icon, title, body, href }) => (
            <li key={title}>
              <Link
                href={href}
                className="panel group flex h-full flex-col gap-2 p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <Icon className="size-5 text-brand-600 dark:text-brand-300" />
                <span className="flex items-center gap-1 text-sm font-semibold">
                  {title}
                  <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
                <span className="text-[13px] leading-relaxed text-ink-500 dark:text-ink-400">{body}</span>
              </Link>
            </li>
          ))}
        </ul>

        <section id="development" className="mt-16">
          <h2 className="section-title">Local development</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
            Requirements: Node.js 20.11+, Docker (or a local PostgreSQL 14+), and Git. The full
            stack is two containers: the app and the database.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-ink-200 bg-ink-950 p-4 text-[12.5px] leading-relaxed text-ink-100 dark:border-white/10">
            <code>{`git clone <repo> vessel && cd vessel
cp .env.example .env          # set AUTH_SECRET and APP_ENCRYPTION_KEY
npm install
npm run db:migrate             # apply SQL migrations
npm run db:seed                # theme catalogue (+ dev admin)
npm run dev                    # http://localhost:3000`}</code>
          </pre>
          <ul className="mt-4 space-y-2 text-sm text-ink-600 dark:text-ink-300">
            <li>
              <code className="rounded bg-ink-100 px-1.5 py-0.5 text-[12px] dark:bg-white/10">npm run typecheck</code>{" "}
              — strict TypeScript across the whole app.
            </li>
            <li>
              <code className="rounded bg-ink-100 px-1.5 py-0.5 text-[12px] dark:bg-white/10">npm run test</code> — unit
              and integration tests (Vitest).
            </li>
            <li>
              <code className="rounded bg-ink-100 px-1.5 py-0.5 text-[12px] dark:bg-white/10">npm run lint</code> — lint
              rules including Next.js specific checks.
            </li>
          </ul>
        </section>

        <section id="self-hosting" className="mt-14">
          <h2 className="section-title">Self-hosting</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
            Production uses the same image with a different environment file. PostgreSQL is only
            reachable on the internal Docker network; Cloudflare Tunnel provides public HTTPS without
            opening a router port.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-ink-200 bg-ink-950 p-4 text-[12.5px] leading-relaxed text-ink-100 dark:border-white/10">
            <code>{`cp .env.selfhosted.example .env.selfhosted   # fill in secrets
docker compose -f docker-compose.yml \\
  -f docker-compose.selfhosted.yml up -d --build

# backups run nightly from the host
./scripts/backup.sh`}</code>
          </pre>
          <p className="mt-3 text-sm text-ink-500 dark:text-ink-400">
            See <code>docs/SELF_HOSTING.md</code> in the repository for the full runbook, including
            Cloudflare Tunnel setup, restart policy and health checks.
          </p>
        </section>

        <section id="database" className="mt-14">
          <h2 className="section-title">Data model</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
            Accounts, profiles, links, versions, media and audit records are ordinary relational
            tables with foreign keys and indexes. Two JSONB columns hold genuinely flexible data:
            a profile&apos;s draft presentation config and published snapshot. Both are validated by a
            strict schema before being written.
          </p>
          <p className="mt-3 text-sm text-ink-500 dark:text-ink-400">
            Full table-by-table reference: <code>docs/DATABASE.md</code>.
          </p>
        </section>

        <div className="mt-14 rounded-2xl border border-ink-200 bg-ink-50 px-5 py-4 text-sm dark:border-white/10 dark:bg-white/[0.03]">
          <p className="flex items-center gap-2 font-medium">
            <BookOpen className="size-4" /> Repository documents
          </p>
          <p className="mt-1.5 text-[13px] text-ink-500 dark:text-ink-400">
            ARCHITECTURE, DATABASE, DEVELOPMENT, SELF_HOSTING, CLOUD_DEPLOYMENT, MIGRATION,
            BACKUP_AND_RESTORE, SECURITY, API and ROADMAP all live in <code>docs/</code>.
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
