# Architecture

## Shape of the system

null is a **modular monolith**. There is one deployable unit (a Next.js
application) and one database. Modules are separated by directory and imports,
not by network boundaries, because the target hardware is a home desktop with
4–8 GB of RAM.

```
src/
├── app/                    Routing, pages, route handlers, server actions
│   ├── (auth)/             Register, login, reset, verify — grouped, no URL segment
│   ├── [username]/         Public profile (SSR, stack/canvas) + generated OG image
│   ├── sandbox/            Separate-origin scriptless Pro CSS document route
│   ├── dashboard/          Authenticated shell: overview, 3-panel editor, settings
│   ├── api/                JSON & media endpoints: health, media (Range), track, username
│   ├── docs/ legal/        Documentation and legal pages
│   └── robots.ts sitemap.ts
├── components/             Presentation components (ui, profile renderer/video, chrome)
├── db/
│   ├── schema.ts           Drizzle table definitions + inferred types (incl. V2 tables)
│   ├── client.ts           Connection pool (singleton, small max)
│   ├── migrations/         Versioned SQL (0000 foundation, 0001 V2 customisation)
│   └── seed.ts             Idempotent 20-theme + dev admin seed
└── lib/
    ├── env.ts              Validated configuration & cross-origin sandbox contract
    ├── entitlements.ts     Centralised plan & feature-flag resolver
    ├── auth/session.ts     Sessions, current user, audit helper
    ├── profiles/service.ts Profile domain: drafts, publishing, diffs, themes, Pro CSS
    ├── storage/            StorageProvider (Local + S3, incl. byte-range streaming)
    ├── media-verify.ts     Binary WOFF2/WOFF/TTF/OTF & MP4/WebM container verifiers
    ├── media.ts            Upload validation, image re-encoding, font/video storage
    ├── profile-config.ts   Zod Config v2 schema (tokens, blocks, groups, canvas, breakpoints)
    ├── profile-css.ts      Token → scoped `.null-profile` stylesheet + `@font-face`
    ├── profile-diff.ts     Bounded before/after revision diffing
    ├── canvas-guides.ts    Freeform canvas clamping, grid snap & alignment guides
    ├── custom-css.ts       Zero-FS custom CSS parser, linter & `.null-profile` scoper
    ├── sandbox.ts          Scriptless HTML builder, `default-src 'none'` CSP & host guard
    ├── password.ts         Argon2id hashing
    ├── crypto.ts           Token hashing, AES-GCM, IP hashing
    ├── rate-limit.ts       Fixed-window limiter
    ├── mail.ts             Mailer interface (console / SMTP)
    ├── themes.ts           Cached theme catalogue
    └── validation.ts       Shared Zod schemas
```

## The central invariant: drafts are private

```
profiles.draft_config      ← the editor writes here (every keystroke, debounced)
profiles.published_snapshot← publishProfile() copies draft → snapshot (transaction)
profile_versions           ← append-only history, one row per publish
```

A visitor request reads **only** `published_snapshot`. Consequences:

- Editing can never accidentally change the live profile.
- The editor preview and the live page are two renders of the same data shape.
- Rollback is "publish an older snapshot as a new version" — history is never
  rewritten, so an audit trail is preserved by construction.
- Cache invalidation is a single, well-defined event.

`publishProfile()` runs inside `SELECT … FOR UPDATE` on the profile row, so two
concurrent publishes cannot allocate the same version number.

## Rendering strategy

| Surface | Strategy |
| --- | --- |
| Public profile `/[username]` | Server component, no client JS. `revalidate = 60` with tag-based invalidation on publish. |
| OG image | `ImageResponse` on demand, built from the published snapshot only. |
| Landing / explore / docs | Server components, static or short ISR. |
| Editor | Client component with server actions for every mutation. |
| Dashboard / settings | Server components; forms are client islands via `useActionState`. |

The public profile ships **zero kilobytes of JavaScript** for the page body. The
only stylesheet is generated from validated tokens (`src/lib/profile-css.ts`).

## Caching contract

Public profiles are read-mostly, so they are cached — but a publish must be
visible immediately. Two mechanisms combine:

1. **Route-level ISR** (`export const revalidate = 60`) serves cached HTML.
2. **Tag-based invalidation**: the profile loader wraps `getPublishedProfile()` in
   `unstable_cache` with the tag `profile:<username>`, and
   `publishProfile()` (via the server action) calls
   `revalidateTag("profile:<username>")`.

Verified behaviour: after a publish, the next request already returns the new
snapshot — no 60-second wait. Without the tag the page would only refresh on the
timer, and the first request after expiry would serve *stale* HTML while it
regenerated in the background (Next.js ISR is stale-while-revalidate, not
stale-if-error-while-blocking).

### The cache boundary rule

`unstable_cache` serialises its result through JSON. **`Date` objects come back
as strings.** Any field that crosses a cache boundary must be normalised before
use:

```ts
// src/app/[username]/page.tsx
return cached().then(rehydrateNullableProfileDates);
```

Skipping this produced a production 500 on every public profile
(`c.publishedAt.toISOString is not a function`). The rule applies to *every*
serialising cache (Redis included, if one is ever added), not just Next.js.
`src/lib/profiles/serialize.ts` owns the conversion and
`tests/profile-serialize.test.ts` pins the contract.

## Profile customisation is data, not code

A profile owns a `ProfileConfig` validated by Zod:

- colours are `#rrggbb` hex strings only;
- fonts, radii, shadows and alignments are enums;
- numeric controls are bounded and integers where appropriate;
- unknown keys are stripped before storage.

`themeToCssVars()` converts tokens into CSS custom properties;
`buildProfileCss()` emits one stylesheet where **every selector is prefixed with
`.null-profile`**. Users therefore cannot write CSS, target application
chrome, or exfiltrate anything. `tests/profile-config.test.ts` asserts both the
injection resistance of the schema and the scoping of the generated CSS.

If a profile carries Pro custom CSS (`FEATURE_PRO_CSS=true` plus a distinct
`PRO_CSS_SANDBOX_ORIGIN`), the stylesheet is stored separately in
`profile_custom_css` (never in `ProfileConfig`), compiled and scoped to
`.null-profile` with external resource loading forbidden (`src/lib/custom-css.ts`),
and rendered exclusively from `GET /sandbox/profile/[username]` on
`PRO_CSS_SANDBOX_ORIGIN` inside `<iframe sandbox="allow-popups allow-popups-to-escape-sandbox">`
with a scriptless `default-src 'none'` CSP. Custom CSS never touches `APP_URL`.

## Storage abstraction

`StorageProvider` (`put`, `get`, `getRange`, `getBuffer`, `delete`, `exists`,
`publicUrl`) has two implementations:

- `LocalStorageProvider` — writes under `MEDIA_ROOT`, rejects traversal, writes
  via temp file + rename so partial uploads never appear, and streams byte slices
  via bounded `createReadStream({ start, end })`.
- `S3StorageProvider` — Cloudflare R2 / MinIO / AWS S3; supports `Range` reads
  on `GetObjectCommand` and an optional CDN base URL.

`STORAGE_DRIVER` selects one at runtime. No application code contains a
filesystem path or a bucket URL.

## Media pipeline

1. Auth and origin are checked before the request body is read.
2. Size and dimension limits are enforced per media kind (`AVATAR` ≤ 5 MB,
   `GALLERY` ≤ 8 MB, `BACKGROUND` ≤ 12 MB, `FONT` ≤ 2 MB, `VIDEO` ≤ 12 MB).
3. **Images** are decoded by `sharp` (`limitInputPixels` enforced) and re-encoded
   from decoded pixels into WebP variants, stripping EXIF/GPS and appended data.
4. **Fonts** (`WOFF2`, `WOFF`, `TTF`, `OTF`) are verified in `src/lib/media-verify.ts`
   for magic bytes, header bounds, required OpenType tables, and absence of
   embedded `SVG ` tables. Self-hosted Google Fonts ship via `@fontsource-variable/*`.
5. **Videos** (`MP4` ISO BMFF and `WebM` EBML) are verified for container brand,
   atom boundaries, and presence of `moov`/`mdat` or `webm` `DocType` + `Segment`.
6. Media is served through `/api/media/...` with `nosniff`, `Accept-Ranges: bytes`
   (`206 Partial Content` / `416`), `Cross-Origin-Resource-Policy: cross-origin`,
   narrow CORS restricted solely to `PRO_CSS_SANDBOX_ORIGIN` (and opaque editor
   preview), `Content-Security-Policy: default-src 'none'; sandbox`, and a
   one-year immutable cache.

## Security boundaries

- **Authentication** is a server-side lookup of `sessions.token_hash`. The raw
  token exists only in the client's httpOnly cookie.
- **Authorisation** is re-derived inside every server action and route handler
  from that session; client-supplied ids are always re-scoped by owner.
- **Middleware** performs fast redirects only. It is never the security boundary.
- **Rate limiting** is in-process and per-policy. `consume()` is the only
  function to replace if the app ever needs a shared store.

## Deployment portability

One image, three overlays:

| Overlay | Database | Media | Ingress |
| --- | --- | --- | --- |
| `docker-compose.dev.yml` | container, port on localhost | volume | direct `:3000` |
| `docker-compose.selfhosted.yml` | container, no published port | volume | `cloudflared` outbound tunnel |
| `docker-compose.cloud.yml` | managed PostgreSQL (recommended) | S3/R2 | platform load balancer |

Nothing in `src/` branches on the environment except through `env.ts`.

## Deliberate non-choices

- **No Redis.** Nothing in V1 requires a shared cache; the theme catalogue is
  cached in process for 60 seconds and rate limits are per-process.
- **No microservices.** A single Node process is easier to back up, restart and
  reason about on a home server.
- **No client-side data library.** Pages fetch on the server; forms post to
  server actions.
- **No ORM migrations at runtime.** SQL migrations are versioned in the
  repository and applied explicitly.
