import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Security model",
  description: "How null handles credentials, user content, uploads and authorisation.",
};

const ITEMS = [
  {
    title: "Passwords and sessions",
    points: [
      "Passwords are hashed with Argon2id (19 MiB, 2 iterations) — no reversible storage, ever.",
      "Session tokens are 256-bit random values in an httpOnly, SameSite=Lax cookie; only a SHA-256 hash is stored.",
      "Failed logins for unknown addresses run the same hashing work, so response time does not reveal whether an account exists.",
      "A password reset revokes every existing session for the account.",
    ],
  },
  {
    title: "User content",
    points: [
      "Profile appearance is stored as validated tokens (hex colours, enums, bounded numbers) — never raw CSS.",
      "The generated stylesheet is scoped to `.null-profile`, so profile styling cannot affect the application UI.",
      "Link URLs are restricted to http, https and mailto at write time, blocking javascript: and data: schemes.",
      "No user JavaScript is executed on the application origin, and no iframe or eval path exists in V1.",
    ],
  },
  {
    title: "Uploads",
    points: [
      "Files are decoded by sharp: a renamed executable or a document is rejected outright.",
      "Images are re-encoded from decoded pixels, which strips EXIF (including GPS) and any appended payload.",
      "Storage keys are generated server-side and validated against a character and traversal whitelist.",
      "Media responses carry Content-Security-Policy: sandbox and X-Content-Type-Options: nosniff.",
    ],
  },
  {
    title: "Authorisation",
    points: [
      "Every mutation re-derives the user from the session; no action trusts a client-supplied owner id.",
      "Ownership is enforced in SQL predicates, so another user's object returns 404 rather than 403.",
      "Administrative routes require an ADMIN role check in the server component, not only in middleware.",
      "Security-relevant actions (login, publish, username change, deletion) are written to an audit log.",
    ],
  },
  {
    title: "Abuse and availability",
    points: [
      "Rate limits cover login, registration, password reset, uploads, publishing and username lookups.",
      "Uploads are size-capped per media kind and dimension-capped before decode.",
      "Public profile pages are cacheable and anonymous; no personalised data is ever cached publicly.",
      "The database and internal ports are never published outside the Docker network.",
    ],
  },
];

export default function SecurityPage() {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <p className="eyebrow">Documentation</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.02em]">Security model</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-600 dark:text-ink-300">
          This page summarises the controls implemented in the codebase. The authoritative document
          is <code>docs/SECURITY.md</code>.
        </p>

        <div className="mt-10 space-y-8">
          {ITEMS.map((item) => (
            <section key={item.title}>
              <h2 className="text-base font-semibold">{item.title}</h2>
              <ul className="mt-3 space-y-2">
                {item.points.map((point) => (
                  <li key={point} className="flex gap-2.5 text-[14px] leading-relaxed text-ink-600 dark:text-ink-300">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-500" />
                    {point}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-ink-200 bg-ink-50 px-5 py-4 text-sm dark:border-white/10 dark:bg-white/[0.03]">
          <p className="font-medium">Reporting a vulnerability</p>
          <p className="mt-1.5 text-[13px] text-ink-500 dark:text-ink-400">
            If you run this instance and find a security issue, report it privately to the operator
            of the instance rather than posting it publicly. There is no bounty programme.
          </p>
        </div>

        <p className="mt-8 text-sm">
          <Link href="/docs" className="link-underline">
            ← Back to documentation
          </Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
