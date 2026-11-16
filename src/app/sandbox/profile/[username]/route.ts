import { env } from "@/lib/env";
import { getPublishedProfile } from "@/lib/profiles/service";
import { buildSandboxCsp, buildSandboxedProfileDocument, isRequestOnSandboxHost } from "@/lib/sandbox";
import { RESERVED_USERNAMES } from "@/lib/username";

export const runtime = "nodejs";

/**
 * GET /sandbox/profile/:username — separate-origin scriptless renderer for Pro CSS.
 *
 * Refuses every request unless `FEATURE_PRO_CSS=true`, a distinct
 * `PRO_CSS_SANDBOX_ORIGIN` is configured, and the incoming `Host` header
 * matches `PRO_CSS_SANDBOX_ORIGIN` (never `APP_URL`). Emits zero JavaScript and
 * a `default-src 'none'` CSP restricting `frame-ancestors` to `APP_URL`.
 */
export async function GET(req: Request, context: { params: Promise<{ username: string }> }) {
  if (!env.proCssPublicEnabled || !env.proCssSandboxOrigin) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  if (!isRequestOnSandboxHost(req, env.proCssSandboxOrigin, env.appOrigin)) {
    return new Response("Forbidden: sandbox origin required", {
      status: 403,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  }

  const { username } = await context.params;
  const canonical = username.toLowerCase();
  if (!canonical || canonical.length > 30 || RESERVED_USERNAMES.has(canonical)) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const profile = await getPublishedProfile(canonical);
  if (!profile || !profile.publishedCustomCss) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const html = buildSandboxedProfileDocument({
    profile: {
      username: profile.username,
      usernameDisplay: profile.usernameDisplay,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      headline: profile.headline,
      bio: profile.bio,
      location: profile.location,
      statusText: profile.statusText,
      config: profile.config,
      links: profile.links,
    },
    customCss: profile.publishedCustomCss,
    mediaOrigin: env.appOrigin,
    appName: env.APP_NAME,
    preview: false,
  });

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": buildSandboxCsp(env.appOrigin),
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
