# Security

This document describes the controls that exist in the codebase. Anything not
listed here is not implemented.

## Threat model

Primary concerns for a self-hosted profile platform:

1. Account takeover (credential stuffing, weak passwords, session theft).
2. Malicious profile content attacking visitors or the platform itself.
3. Malicious uploads (web shells, oversized files, decompression bombs).
4. Abuse (spam profiles, impersonation, resource exhaustion).
5. Data exposure through misconfiguration (exposed database, debug output).

## Authentication

| Control | Implementation |
| --- | --- |
| Password hashing | Argon2id, 19 MiB / 2 iterations / parallelism 1 (`src/lib/password.ts`) |
| Password policy | ≥ 10 characters, no leading/trailing whitespace (`src/lib/validation.ts`) |
| Session token | 256-bit random, `httpOnly`, `SameSite=Lax`, `Secure` in production |
| Session storage | only SHA-256 of the token is stored (`sessions.token_hash`) |
| Session lifetime | 30 days, refreshed expiry on creation; expired rows pruned |
| Enumeration resistance | unknown emails run a real Argon2 verify against a dummy hash |
| Password reset | single-use token, 1 hour, revokes **all** sessions on use |
| Email verification | single-use token, 24 hours, re-issued on demand |
| Login throttling | 8 attempts / 15 min per IP |
| CSRF | SameSite=Lax cookie plus an origin check helper (`isAllowedOrigin`) |

Sessions are invalidated when `users.status !== 'ACTIVE'`, so suspension takes
effect on the next request rather than after expiry.

## Authorisation

- Every server action calls `requireUser()` and then re-resolves the caller's own
  profile. Client-supplied ids are never trusted as proof of ownership.
- Ownership checks happen inside SQL predicates (`and(eq(id), eq(profileId))`),
  so a foreign id returns "not found" rather than "forbidden" — no existence leak.
- Admin-only surfaces call `requireAdmin()`, which re-reads the role from the
  database rather than from the cookie.
- Middleware performs redirects for unauthenticated navigation only. It is never
  the authorization boundary.

## User content

The most important surface, because profiles are user-designed pages.

| Risk | Mitigation |
| --- | --- |
| CSS injection (structured profiles) | Appearance is stored as tokens (hex colours, enums, bounded numbers) validated by Zod; raw CSS is never stored in `ProfileConfig` |
| Selector escape | `buildProfileCss()` and `compileCustomCss()` prefix every selector with `.null-profile` and escape `</style>` |
| Pro custom CSS isolation | Stored in `profile_custom_css`; gated by `getEntitlements()`; escape-aware zero-FS compiler blocks `@import`, `@font-face`, `url()`, `image-set()`, `expression()`, `data:`/`javascript:`, `position: fixed`, sensitive attribute selectors, and HTML comments; served publicly **only** from `PRO_CSS_SANDBOX_ORIGIN` (`Host` verified, 0 `<script>` tags, `default-src 'none'` CSP) inside `<iframe sandbox="allow-popups allow-popups-to-escape-sandbox">`, and previewed in the editor inside `<iframe sandbox="" srcDoc>` |
| Third-party embeds | Allowlisted strictly to YouTube (`youtube-nocookie.com`), Vimeo, Spotify, and SoundCloud HTTPS player URLs with `referrerPolicy="no-referrer"` and sandboxed iframes |
| Third-party font tracking | Curated Google Fonts are self-hosted via `@fontsource-variable/*`; custom `@font-face` accepts only verified same-origin uploaded fonts |
| XSS in text fields | React escapes all output (and `buildSandboxedProfileDocument` HTML-escapes every user field); no raw user HTML is ever rendered |
| `javascript:` URLs | Link URLs are restricted to `http`, `https`, `mailto` at write time and rejected again by the test suite |
| Tabnabbing | External links render with `rel="noopener noreferrer nofollow"` |
| Script execution | Zero user JavaScript is accepted or executed anywhere; no eval or dynamic import from user data |
| Icon injection | Icons are stored as enum keys mapped to a static component registry |

`tests/profile-config.test.ts`, `tests/v2-config-css.test.ts`,
`tests/custom-css.test.ts`, and `tests/sandbox-entitlements.test.ts` assert
token validation, selector scoping, escape-aware CSS rejection, and sandbox host
isolation.

## Uploads

1. Authentication and `Origin` are checked **before** the body is parsed.
2. Per-kind limits: `AVATAR` ≤ 5 MB / 4096 px, `GALLERY` ≤ 8 MB / 6144 px,
   `BACKGROUND` ≤ 12 MB / 8192 px, `FONT` ≤ 2 MB, `VIDEO` ≤ 12 MB.
3. **Images** are decoded by `sharp` with `limitInputPixels` set and re-encoded
   from decoded pixels into WebP, discarding EXIF/GPS, thumbnails, and trailing data.
4. **Fonts** (`WOFF2`, `WOFF`, `TTF`, `OTF`) are inspected byte-for-byte
   (`verifyFontBuffer`) for container signatures, declared lengths, required
   OpenType tables, and absence of `SVG ` tables (preventing OpenType-SVG script/markup
   payloads).
5. **Videos** (`MP4`, `WebM`) are inspected (`verifyVideoBuffer`) for allowlisted
   ISO BMFF `ftyp` brands + intact `moov`/`mdat` boxes or EBML header with
   `DocType === "webm"` + Matroska `Segment` — client `Content-Type` and filenames
   are never trusted.
6. Storage keys are server-generated under allowlisted root folders and validated
   against a strict whitelist rejecting `..`, absolute paths, backslashes, and
   control characters; local writes use atomic temp-file + rename.
7. Media is served by `/api/media/...` with `X-Content-Type-Options: nosniff`,
   `Content-Security-Policy: default-src 'none'; sandbox`,
   `Cross-Origin-Resource-Policy: cross-origin`, bounded HTTP `Range` (`206`/`416`),
   and `Access-Control-Allow-Origin` emitted solely for `PRO_CSS_SANDBOX_ORIGIN`
   (or opaque `null` for the editor's sandboxed preview iframe) — never `*`.

## Input validation and output

- All inputs are parsed by Zod schemas; unknown fields are dropped.
- Numeric token values are bounded and clamped.
- SQL is generated by Drizzle's query builder; no string-interpolated SQL exists.
- HTML output goes through React's escaping. The two `dangerouslySetInnerHTML`
  uses contain generated CSS and a JSON-LD object, never raw user input.
- Usernames are validated against a syntax whitelist, a reserved-route list, and
  impersonation patterns, and are compared case-insensitively.

## Transport and headers

Set globally in `next.config.ts`:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: SAMEORIGIN`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
- Media responses add `Content-Security-Policy: default-src 'none'; sandbox`

HSTS is applied at the edge (Cloudflare) rather than in the app, because the app
also runs on plain HTTP during local development. Enable **Always Use HTTPS** and
HSTS in Cloudflare for production.

## Rate limiting

Fixed-window, per-process, keyed by a hash of the client IP or the user id:

| Scope | Limit |
| --- | --- |
| Login | 8 / 15 min |
| Register | 5 / hour |
| Password reset | 5 / hour |
| Uploads | 30 / hour |
| Publish | 30 / hour |
| Username availability | 60 / min |
| Reports | 10 / hour |

`TRUST_PROXY=true` is required behind Cloudflare Tunnel or a reverse proxy,
otherwise every request appears to come from the proxy and limits become global.
Leaving it false in direct-exposure deployments prevents `X-Forwarded-For`
spoofing.

## Secrets

- `.env`, `.env.*` (except the `.example` files) are git-ignored.
- `src/lib/env.ts` rejects a placeholder `AUTH_SECRET` when `NODE_ENV=production`.
- OAuth tokens (future integration work) are encrypted with AES-256-GCM using
  `APP_ENCRYPTION_KEY`; `encryptSecret`/`decryptSecret` are covered by tests
  including tamper detection.
- IP addresses are hashed (SHA-256 with a fixed salt) before storage in sessions
  and audit logs.

## Audit logging

Recorded events: register, login, logout, password change, password reset, email
change, username change, session revocation, publish, restore, account deletion.
Each row stores the actor, action, target, a small metadata object, a hashed IP
and a timestamp.

## Account deletion

Deletion anonymises the user row (email and username replaced with a tombstone,
password hash cleared, status `DELETED`), unpublishes the profile, and revokes all
sessions. The username becomes available again. Audit rows are retained with
`actor_id` nulled via `ON DELETE SET NULL`.

## Known limitations (V1)

- No TOTP / hardware second factor yet (V4).
- No CSRF token beyond SameSite + origin checking; acceptable for same-site form
  posts, revisit if cross-site embedding is ever added.
- Rate limiting is per process. Multiple replicas multiply the limits.
- No virus scanning for audio/document uploads, because those kinds are not exposed
  in the UI yet.
- No automated dependency scanning in CI; run `npm audit` as part of releases.

## Reporting

If you operate an instance and find a vulnerability, handle it privately first:
fix, deploy, then disclose. Do not open a public issue containing exploit details.
