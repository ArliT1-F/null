# Roadmap

Only V1 is implemented. Everything below V1 is a plan, not a description of
existing code.

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

## V2 — Advanced customisation

- Drag-and-drop canvas: absolute positioning with alignment guides, not just a
  centred card.
- Component blocks: text, image, gallery, divider, embed — each with its own
  properties panel.
- Component hierarchy tree with grouping, visibility and locking.
- Undo/redo history with named checkpoints and a visual timeline.
- Revision history browsing with diffs and one-click restore.
- Monaco CSS editor for **Pro** users, rendered inside a sandboxed iframe on a
  separate origin — never on the application origin.
- Per-breakpoint overrides (mobile/tablet/desktop) for every layout token.
- Font uploads and Google Fonts selection with self-hosted serving.
- Video backgrounds with poster fallback and data-saver handling.

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
