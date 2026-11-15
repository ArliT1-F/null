/**
 * Username rules.
 *
 * A username is the public identity *and* the URL. It is therefore validated
 * twice: once syntactically, and once against routes the app itself owns, so a
 * user can never shadow `/login`, `/api`, `/admin` or similar.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;

/** How long a user must wait between username changes (abuse safeguard). */
export const USERNAME_CHANGE_COOLDOWN_DAYS = 30;

/**
 * Top-level application routes. A username may never equal one of these,
 * otherwise `/username` would be unreachable.
 */
export const RESERVED_USERNAMES = new Set<string>([
  // application routes
  "admin",
  "api",
  "login",
  "logout",
  "register",
  "signup",
  "signin",
  "sign-in",
  "sign-up",
  "dashboard",
  "settings",
  "help",
  "support",
  "terms",
  "privacy",
  "legal",
  "imprint",
  "about",
  "pricing",
  "blog",
  "docs",
  "documentation",
  "changelog",
  "roadmap",
  "status",
  "explore",
  "discover",
  "search",
  "report",
  "reports",
  "verify",
  "reset",
  "auth",
  "oauth",
  "account",
  "accounts",
  "billing",
  "checkout",
  "sso",
  "onboarding",
  "editor",
  "preview",
  "new",
  "create",
  "u",
  "s",
  "media",
  "assets",
  "static",
  "public",
  "uploads",
  "health",
  "healthz",
  "metrics",
  "robots.txt",
  "sitemap.xml",
  "manifest.json",
  "favicon.ico",
  "_next",
  // reserved for platform use / impersonation protection
  "admin",
  "administrator",
  "root",
  "system",
  "moderator",
  "mod",
  "staff",
  "team",
  "official",
  "support",
  "security",
  "abuse",
  "hostmaster",
  "postmaster",
  "webmaster",
  "noreply",
  "no-reply",
  "vessel",
  "guns",
  "null",
  "everyone",
  "anonymous",
  "guest",
  "user",
  "username",
  "me",
  "you",
  "profile",
  "test",
]);

/** Names that read as impersonation of the platform itself. */
const IMPERSONATION_PATTERNS = [/^(vessel|admin)[-_]?/i, /[-_]?(official|support|staff|team)$/i];

export type UsernameCheck =
  | { ok: true; username: string; display: string }
  | { ok: false; reason: string };

/**
 * Validates and canonicalises a username.
 * @param input raw user input
 * @param reserved extra reserved names (e.g. already taken — checked in DB)
 */
export function validateUsername(input: string, reserved: ReadonlySet<string> = new Set()): UsernameCheck {
  const display = input.trim();

  if (display.length === 0) {
    return { ok: false, reason: "Enter a username." };
  }
  if (display.length < USERNAME_MIN) {
    return { ok: false, reason: `Usernames must be at least ${USERNAME_MIN} characters.` };
  }
  if (display.length > USERNAME_MAX) {
    return { ok: false, reason: `Usernames must be at most ${USERNAME_MAX} characters.` };
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(display)) {
    return { ok: false, reason: "Use only letters, numbers, dots, dashes and underscores." };
  }
  if (/^[._-]/.test(display) || /[._-]$/.test(display)) {
    return { ok: false, reason: "Usernames cannot start or end with a symbol." };
  }
  if (/[._-]{2,}/.test(display)) {
    return { ok: false, reason: "Avoid repeated symbols in a row." };
  }
  if (/^\d+$/.test(display)) {
    return { ok: false, reason: "Usernames cannot be only numbers." };
  }

  const canonical = display.toLowerCase();

  if (RESERVED_USERNAMES.has(canonical) || reserved.has(canonical)) {
    return { ok: false, reason: "That username is not available." };
  }
  if (IMPERSONATION_PATTERNS.some((re) => re.test(canonical))) {
    return { ok: false, reason: "That username could be mistaken for platform staff." };
  }

  return { ok: true, username: canonical, display };
}

/** Turns an email or display name into a candidate username ("Arli T" -> "arlit"). */
export function suggestUsername(source: string): string {
  const base = source
    .split("@")[0]
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9._-]+/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, USERNAME_MAX);

  if (base.length >= USERNAME_MIN && !RESERVED_USERNAMES.has(base)) return base;
  return `user${Math.floor(1000 + Math.random() * 9000)}`;
}
