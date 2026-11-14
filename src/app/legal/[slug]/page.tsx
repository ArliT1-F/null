import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { env } from "@/lib/env";

/**
 * Legal pages.
 *
 * Written as honest, plain-language documents that describe what this software
 * actually does — including the fact that a self-hosted instance is operated by
 * whoever runs it, not by the project.
 */

const LEGAL_PAGES = ["terms", "privacy"] as const;
type LegalSlug = (typeof LEGAL_PAGES)[number];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const title = slug === "terms" ? "Terms of use" : slug === "privacy" ? "Privacy policy" : "Legal";
  return { title };
}

export function generateStaticParams() {
  return LEGAL_PAGES.map((slug) => ({ slug }));
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!LEGAL_PAGES.includes(slug as LegalSlug)) notFound();

  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        {slug === "terms" ? <Terms /> : <Privacy />}
      </main>
      <SiteFooter />
    </div>
  );
}

function Terms() {
  return (
    <article className="max-w-none">
      <p className="eyebrow">Legal</p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.02em]">Terms of use</h1>
      <p className="mt-2 text-xs text-ink-400">Last updated {new Date().getFullYear()}</p>

      <div className="mt-8 space-y-6 text-[14.5px] leading-relaxed text-ink-600 dark:text-ink-300">
        <section>
          <h2 className="text-base font-semibold text-ink-900 dark:text-white">Who runs this instance</h2>
          <p className="mt-2">
            {env.APP_NAME} is self-hosted software. The person or organisation operating the
            instance you are using is responsible for it, including its content, availability and
            data handling. The software project itself provides no hosting service.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink-900 dark:text-white">Your account</h2>
          <p className="mt-2">
            You are responsible for keeping your credentials safe and for everything published from
            your account. One person per account. Usernames are allocated on a first-come basis and
            may be reclaimed if they impersonate someone else or are inactive.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink-900 dark:text-white">Acceptable use</h2>
          <p className="mt-2">Do not use your profile to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>impersonate a person or organisation in a misleading way;</li>
            <li>publish illegal content, harassment or credible threats;</li>
            <li>distribute malware, phishing pages or deceptive links;</li>
            <li>attempt to break, overload or probe the platform&apos;s security.</li>
          </ul>
          <p className="mt-2">
            Accounts that break these rules may be suspended, and content may be removed.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink-900 dark:text-white">Your content</h2>
          <p className="mt-2">
            You keep ownership of what you upload. You grant the operator permission to store,
            resize and serve it in order to display your profile. Deleting your account removes your
            profile, links and media from the active system.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink-900 dark:text-white">Availability</h2>
          <p className="mt-2">
            This platform may run on modest self-hosted hardware. There is no uptime guarantee.
            Backups are taken, but you should keep your own copy of anything irreplaceable.
          </p>
        </section>
      </div>
    </article>
  );
}

function Privacy() {
  return (
    <article className="max-w-none">
      <p className="eyebrow">Legal</p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.02em]">Privacy policy</h1>
      <p className="mt-2 text-xs text-ink-400">Last updated {new Date().getFullYear()}</p>

      <div className="mt-8 space-y-6 text-[14.5px] leading-relaxed text-ink-600 dark:text-ink-300">
        <section>
          <h2 className="text-base font-semibold text-ink-900 dark:text-white">What is stored</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Your email address and username, so you can sign in and be found.</li>
            <li>A hash of your password — the password itself is never stored.</li>
            <li>Whatever you choose to publish on your profile.</li>
            <li>Uploaded images, re-encoded to remove embedded metadata such as GPS location.</li>
            <li>A hash of your IP address (not the address itself) for rate limiting and audit records.</li>
            <li>An audit trail of security-relevant actions such as sign-ins and publishes.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink-900 dark:text-white">What is not done</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>No advertising or cross-site tracking scripts.</li>
            <li>No selling of data.</li>
            <li>No third-party analytics by default.</li>
            <li>No collection of data beyond what the features above require.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink-900 dark:text-white">Cookies</h2>
          <p className="mt-2">
            One essential cookie keeps you signed in. It is httpOnly, SameSite=Lax, and carries no
            tracking information. There are no marketing cookies.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink-900 dark:text-white">Your choices</h2>
          <p className="mt-2">
            You can edit or unpublish your profile at any time, and delete your account from the
            settings page. Deletion removes your profile, links, sessions and media, and frees your
            username. Some audit records may be retained in aggregate for security purposes.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink-900 dark:text-white">Data location</h2>
          <p className="mt-2">
            This instance stores its data on the machine operated by whoever runs it. If that is not
            you, contact the operator for questions about your data.
          </p>
        </section>
      </div>
    </article>
  );
}
