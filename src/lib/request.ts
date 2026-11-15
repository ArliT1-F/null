import { hashIp } from "@/lib/crypto";
import { env } from "@/lib/env";

/**
 * Request metadata helpers.
 *
 * `TRUST_PROXY=false` by default: unless the deployment explicitly sits behind
 * a trusted reverse proxy (Cloudflare Tunnel or Caddy), forwarded headers are
 * ignored so a client cannot spoof its own IP.
 */

export function clientIp(req: Request): string | null {
  const headers = req.headers;

  if (env.TRUST_PROXY) {
    const cf = headers.get("cf-connecting-ip");
    if (cf) return cf.trim();

    const forwarded = headers.get("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return first;
    }

    const real = headers.get("x-real-ip");
    if (real) return real.trim();
  }

  return null;
}

export function clientIpHash(req: Request): string | null {
  return hashIp(clientIp(req));
}

export function userAgent(req: Request): string | null {
  return req.headers.get("user-agent")?.slice(0, 400) ?? null;
}

/**
 * Origin check for state-changing requests, complementing SameSite cookies.
 * Allows the configured app origin, extra configured origins, and same-host
 * requests (which covers previews and self-hosted hostnames).
 */
export function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  // Same-origin form posts and server-to-server calls may omit Origin.
  if (!origin) return true;

  const allowed = new Set<string>([new URL(env.APP_URL).origin, ...env.allowedOrigins]);
  if (allowed.has(origin)) return true;

  try {
    const originHost = new URL(origin).host;
    const requestHost = req.headers.get("host");
    return Boolean(requestHost) && originHost === requestHost;
  } catch {
    return false;
  }
}

/** Best-effort cache key fragment that cannot be poisoned by user input. */
export function cacheTagForUsername(username: string): string {
  return `profile:${username.toLowerCase()}`;
}
