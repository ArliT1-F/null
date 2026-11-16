# V2 implementation status

## Implemented foundation

- Config v2: plain-text, image, gallery, divider and provider-allowlisted embed
  blocks; bounded counts, unique IDs, validation and per-block salvage.
- V1 JSON configs normalise to v2 without a database migration.
- Blocks inspector: add/edit/delete, visibility, locking, ordered layers, drag
  reorder and accessible up/down buttons. This is an ordered layer list, **not**
  the planned nested hierarchy or direct-manipulation canvas.
- Public renderer and editor preview share block rendering. Blocks remain draft
  content until the existing `publishProfile()` boundary publishes the config.
  Hidden blocks remain in the snapshot config but are omitted from rendering.
- Revision history shows bounded before/after field diffs against the previous
  revision (arrays shown as whole values). Existing append-only restore retained.
- Responsive override schema and generated tablet/mobile media queries; responsive
  controls and viewport-isolated previews are still pending.

## Remaining before V2 completion

Nested hierarchy/group manipulation; direct canvas drag/drop; browser and real
PostgreSQL publishing/restore tests; breakpoint editor; font uploads/Google Fonts;
video upload/background pipeline; entitlement-gated Pro CSS editor on a separate
origin using sandboxed Monaco. Do not accept raw CSS in the normal profile config.

## Rebrand operations

The code, docs, tests, package and deployment templates now use `null`. Existing
installations need an explicit migration: cookie name, localStorage key, token
hash salt, database/user defaults, container account, media path and bucket
names changed. Existing token hashes no longer verify; reissue outstanding
verification/reset links. Existing DB volumes and media are **not** renamed by
these changes: back them up and migrate paths/ownership/configuration before
starting the renamed stack. Do not recreate production volumes blindly.

## Validation (2026-11-16)

`npm run typecheck` and `npm run lint` pass. `npm test`: 76 passed, 13 DB
integration tests skipped (no configured test database). No browser verification
or production build performed. `npm install --ignore-scripts` completed.

Dependency audit reports 16 findings (12 moderate, 2 high, 2 critical), including
Vitest/tinypool, Zod and PostCSS. Suggested fixes include major-version upgrades;
these need a dedicated compatibility/security pass before deployment.

Tracking: Linear NUL-5 through NUL-9. Infrastructure decisions are also recorded
in the shared Notion page “null — V2 Infrastructure & Decisions”.
