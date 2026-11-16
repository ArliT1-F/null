# API

null exposes a small HTTP surface plus server actions. Everything mutating goes
through the application's own origin and requires a session cookie.

There is no public developer API in V1 (see [ROADMAP.md](ROADMAP.md), V5).

## Conventions

- All JSON responses use `{ ok: boolean, ... }`; errors use
  `{ ok: false, error: string }` with an appropriate status code.
- Authentication is the `null_session` httpOnly cookie.
- Rate limits return `429` with a `Retry-After` header.
- No API is versioned yet because none is public.

## HTTP endpoints

### `GET /api/health`

Liveness and readiness. Unauthenticated.

```json
{
  "status": "ok",
  "checks": { "app": "ok", "database": "ok", "storage": "ok" },
  "latencyMs": 7,
  "timestamp": "2026-01-01T12:00:00.000Z"
}
```

`200` when everything is healthy, `503` when the database or storage check fails.
`Cache-Control: no-store`.

### `GET /api/username/check?u=<name>`

Availability probe for the registration form. Rate limited (60/min per IP).

```json
{ "available": true, "username": "arlit1" }
{ "available": false, "reason": "That username is already taken." }
```

Also returns `available: false` with a reason for syntactically invalid or
reserved names.

### `POST /api/media`

Upload a verified media asset (image, web font, or looping video).
**Authentication and same-origin `Origin` required.** `multipart/form-data`:

| Field | Type | Notes |
| --- | --- | --- |
| `file` | File | Image (`PNG`, `JPEG`, `WebP`, `AVIF`, `GIF`), Font (`WOFF2`, `WOFF`, `TTF`, `OTF`, ≤ 2 MB), or Video (`MP4`, `WebM`, ≤ 12 MB) |
| `kind` | `AVATAR` \| `BACKGROUND` \| `GALLERY` \| `FONT` \| `VIDEO` | binary signature verified server-side |

```json
{
  "ok": true,
  "id": "c862f618-…",
  "url": "/api/media/avatars/<userId>/2026/<assetId>@256.webp",
  "width": 256,
  "height": 256,
  "size": 1288
}
```

Font and video uploads return `width: null` and `height: null`.

Errors: `401` unauthenticated, `403` cross-origin request, `400` invalid kind or
failed binary verification, `413` too large, `429` rate limited (30/hour per user).

### `DELETE /api/media/:id`

Deletes an owned asset and all of its stored variants. Returns `404` for assets
that do not exist **or do not belong to the caller**.

```json
{ "ok": true }
```

### `GET /api/media/[...key]`

Serves a stored image, font, or video object. Keys are restricted to allowlisted
roots and reject traversal attempts. Supports single-range `Range: bytes=start-end`
requests (`206 Partial Content`, or `416 Range Not Satisfiable` with
`Content-Range: bytes */<size>`). Responds with `Cache-Control: public,
max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`,
`Cross-Origin-Resource-Policy: cross-origin`, narrow CORS for
`PRO_CSS_SANDBOX_ORIGIN` only, and `Content-Security-Policy: default-src 'none';
sandbox`. `404` when absent.

### `GET /sandbox/profile/:username`

Separate-origin, zero-JavaScript HTML renderer for profiles with published Pro
custom CSS. Returns `404` unless `FEATURE_PRO_CSS=true`, a distinct
`PRO_CSS_SANDBOX_ORIGIN` is configured, and the profile has published custom CSS;
returns `403` unless the incoming `Host` / `X-Forwarded-Host` matches
`PRO_CSS_SANDBOX_ORIGIN` (never `APP_URL`). Emits `Content-Security-Policy:
default-src 'none'; ...; frame-ancestors <APP_URL>`.

## Pages with dynamic behaviour

| Route | Notes |
| --- | --- |
| `GET /<username>` | Public profile. `404` when unpublished, private or unknown. |
| `GET /<username>/opengraph-image` | PNG, 1200×630, generated from the published snapshot. |
| `GET /explore?page=n` | Public listing of published, public profiles. |
| `GET /robots.txt`, `/sitemap.xml` | Generated; unlisted profiles are excluded. |
| `GET /api/health` | included in the middleware exclusion list |

## Server actions

Server actions are invoked by the app's own forms and the editor. They are
exported from feature directories and always begin with a session check.

### Authentication — `src/app/(auth)/actions.ts`

| Action | Effect |
| --- | --- |
| `registerAction` | Creates account + profile, sends verification email, starts session |
| `loginAction` | Verifies credentials with constant-work comparison, starts session |
| `logoutAction` | Deletes the session row and clears the cookie |
| `verifyEmailAction(token)` | Marks the email verified (single-use) |
| `resendVerificationAction` | Issues a new verification email (3/hour) |
| `requestPasswordResetAction` | Issues a reset email; always reports success |
| `resetPasswordAction` | Sets a new password and revokes all sessions |

### Editor — `src/app/dashboard/editor/actions.ts`

| Action | Effect |
| --- | --- |
| `saveDraftAction(config)` | Validates and stores the Config v2 draft (theme, layout, canvas, blocks, groups, breakpoints) |
| `saveCustomCssAction(rawCss)` | Entitlement-checked; compiles, scopes, and saves Pro custom CSS draft |
| `saveIdentityAction(fields)` | Display name, bio, headline, location, status, avatar, visibility |
| `applyThemeAction(slug)` | Applies a curated theme without overwriting blocks, groups, or layout |
| `saveCustomThemeAction` / `applySavedThemeAction` / `deleteSavedThemeAction` | User-saved theme presets |
| `createLinkAction` / `updateLinkAction` / `deleteLinkAction` / `reorderLinksAction` | Link CRUD and ordering |
| `publishAction(label?)` | Atomically publishes draft + custom CSS as the next immutable version |
| `versionDiffAction(versionId, baselineId?)` | Bounded before/after diff against previous or chosen revision |
| `restoreVersionAction(versionId)` | Restores snapshot + custom CSS into draft and publishes as version `N + 1` |

All return `{ ok: true, data? }` or `{ ok: false, error, field? }`.

### Settings — `src/app/dashboard/settings/actions.ts`

| Action | Effect |
| --- | --- |
| `changeUsernameAction` | 30-day cooldown, uniqueness, reserved-name checks |
| `changeEmailAction` | Requires the current password; clears verification |
| `changePasswordAction` | Requires the current password |
| `revokeOtherSessionsAction` / `revokeSessionAction` | Session management |
| `deleteAccountAction` | Requires typed confirmation + password; anonymises |

## Error format

```json
{ "ok": false, "error": "File is too large. Maximum is 12 MB." }
```

Server-action form state additionally carries field-scoped errors:

```json
{ "ok": false, "errors": { "email": "Enter a valid email address." } }
```
