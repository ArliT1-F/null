# Roadmap

V1 and V2 are implemented. Everything from V3 onward is a plan, not a
description of existing code.

## V1 — Functional foundation ✅

**Status: complete.** The definition of done from the specification is met and
verifiable:

| Requirement | Where |
| --- | --- |
| Register, log in, log out | `src/app/(auth)/` |
| Email verification and password reset | `actions.ts`, `src/lib/mail.ts` |
| Unique, validated, reserved-aware username | `src/lib/username.ts`, users table unique index |
| Public profile at `/<username>` | `src/app/[username]/page.tsx` |
| Avatar upload | `/api/media` + editor identity panel |
| Background upload (image backgrounds) | media library + editor background controls |
| Add / edit / reorder / delete links | editor links panel, `profiles/service.ts` |
| Basic styling customisation | editor design panel (12 themes, full token control) |
| Live preview | editor canvas, same renderer as production |
| Save draft | autosave + explicit save; `draft_config` |
| Publish | transactional, versioned, restores previous versions |
| Visitors reach the public URL | SSR profile, OG image, canonical URL, sitemap |
| Mobile and desktop | responsive layout, mobile preview in the editor |
| Persistent data and media | PostgreSQL + storage abstraction with volumes |
| Survives restart | Docker restart policy, volumes, migrations |
| Runs on the development laptop | `npm run dev`, or `npm run docker:dev` |
| Deployable to the desktop | `docker-compose.selfhosted.yml` + runbook |
| Public via Cloudflare Tunnel | `tunnel` service in the self-hosted overlay |
| Cloud-portable architecture | one image, three overlays, no infra assumptions in `src/` |

Deliberately excluded from V1: payments, OAuth logins, third-party integrations,
widgets, analytics, guestbooks, custom CSS.

## V2 — Advanced customisation ✅

**Status: complete.** See [V2_PROGRESS.md](V2_PROGRESS.md) for validation details.

| Requirement | Where |
| --- | --- |
| Stack + freeform drag-and-drop canvas with snap & guides | `src/lib/canvas-guides.ts`, `src/app/dashboard/editor/interactive-canvas.tsx` |
| Component blocks (`text`, `image`, `gallery`, `divider`, `embed`) + inspector | `src/lib/profile-config.ts`, `src/app/dashboard/editor/block-inspector.tsx` |
| Hierarchy tree with grouping, visibility, locking, duplicate, copy/paste | `src/app/dashboard/editor/blocks-panel.tsx` |
| Undo/redo history with named checkpoints and timeline | `src/app/dashboard/editor/editor-store.ts`, `history-panel.tsx` |
| Revision history browsing, notes, two-version diffs & append-only restore | `src/lib/profile-diff.ts`, `src/lib/profiles/service.ts` |
| Entitlement-gated Pro Monaco CSS editor on isolated sandbox origin | `src/lib/{entitlements,custom-css,sandbox}.ts`, `src/app/sandbox/profile/[username]/route.ts` |
| Per-breakpoint overrides (desktop / tablet / mobile) + container-isolated preview | `src/lib/profile-css.ts`, `src/app/dashboard/editor/design-panel.tsx` |
| Self-hosted variable Google Fonts, font uploads & 20 curated + saved themes | `src/app/layout.tsx`, `src/lib/media-verify.ts`, `src/db/seed.ts` |
| Video backgrounds (Range `206`, poster fallback, data-saver & reduced-motion) | `src/components/profile/background-video.tsx`, `src/app/api/media/[...key]/route.ts` |

## V3 — Interactive profiles

- Widget registry: id, name, category, version, config schema, renderer,
  permissions, docs.
- Read-only integrations using official APIs: GitHub, Spotify, Steam, Discord,
  Twitch, YouTube.
- Encrypted token storage and refresh (the `accounts` table and crypto helpers
  already exist for this).
- Music player, image galleries, video embeds, countdowns, status indicators.
- Guestbook with moderation and spam controls.
- Privacy-conscious analytics: aggregate counts only, no third-party scripts,
  retention policy enforced by a pruning job.

## V4 — Commercial platform

- Payment provider abstraction, subscription service and **centralised
  entitlement service** — premium checks must not be scattered across modules.
- Signed, idempotent webhook processing; transaction records.
- Billing dashboard and payment history.
- Custom domains with automated verification and certificate issuance.
- Storage quotas and per-plan media limits.
- Full administration dashboard: users, profiles, reports, suspensions, audit
  log review, theme management, platform settings.
- Two-factor authentication.
- Provider eligibility for the operator's jurisdiction must be verified before
  selecting a merchant of record.

## V5 — Ecosystem

- Third-party widget SDK with a reviewed manifest and sandboxed execution.
- Public developer API with scoped tokens and rate limits.
- Theme and widget marketplaces with moderation.
- Creator tools and advanced analytics.
- Internationalisation of the interface.
- Horizontally scalable background processing (queue) and shared rate limiting.
- Observability: error reporting, tracing, structured log shipping.

## Architectural guardrails for future work

These rules keep the migration path open:

1. **Never read `process.env` outside `src/lib/env.ts`.**
2. **Never hardcode a filesystem path or bucket URL** — go through
   `getStorage()` and `mediaUrl()`.
3. **Never store raw CSS or HTML** from users; extend the token schema instead.
4. **Never put user JavaScript on the application origin**; use an iframe on a
   separate origin with a strict CSP.
5. **Never let premium checks leak into features** — route them through the
   entitlement service when it exists.
6. **Never publish outside `publishProfile()`**; the draft/published split is the
   product's core guarantee.
7. **Keep the public profile free of client JavaScript** unless a feature is
   impossible without it, and code-split it when it is unavoidable.
