# V2 implementation status

**Status: complete (`v2.0.0`).** All five V2 milestones (NUL-5 through NUL-9) are
implemented, verified against PostgreSQL 18 and the standalone production build,
and covered by automated unit and database integration tests.

## Delivered capabilities

### V2.1 — Component blocks, hierarchy groups & three-panel editor (`NUL-5`)

- **ProfileConfig v2 (`src/lib/profile-config.ts`)**: validated `text`, `image`,
  `gallery`, `divider`, and provider-allowlisted `embed` blocks (max 24 blocks,
  max 12 groups, max 6 gallery photos), with deterministic V1 → V2 read-through
  normalisation, per-block/per-group salvage, and pre-validation array slicing.
- **Hierarchy & grouping (`blocks-panel.tsx`, `block-inspector.tsx`)**: nested
  layer tree with block groups, group collapse, cascading visibility and lock
  state, drag-and-drop and keyboard reordering, duplicate, copy/paste clipboard,
  z-index layering, and quick group alignment actions.
- **Stack + freeform canvas modes (`interactive-canvas.tsx`, `canvas-guides.ts`)**:
  direct drag positioning and multi-handle resizing (`e`, `w`, `s`, `se`), grid
  snap (`0` / `4` / `8` / `16` px), live center/margin/sibling alignment guides,
  `Alt`-hold snap bypass, arrow-key nudging, automatic frame materialisation when
  switching Stack → Canvas, and graceful single-column auto-stack on mobile.
- **Three-panel editor (`editor-client.tsx`)**: left Layers/Design/Profile/Links/CSS/History
  rail, central live canvas, and collapsible right properties inspector.

### V2.2 — Drag-and-drop canvas & typography/themes (`NUL-8`, `NUL-7`)

- **Self-hosted variable Google Fonts (`src/app/layout.tsx`)**: Inter, Sora,
  Space Grotesk, Plus Jakarta Sans, DM Sans, Outfit, Playfair Display, JetBrains
  Mono, and Fira Code (plus system stacks) shipped locally via `@fontsource-variable/*`
  — zero visitor requests to `fonts.googleapis.com` or `fonts.gstatic.com`.
- **Independent heading font, tracking & line-height** plus **verified custom font
  uploads** (`.woff2`, `.woff`, `.ttf`, `.otf`, ≤ 2 MB) checked for magic bytes,
  mandatory OpenType tables, and forbidden `SVG ` tables (`src/lib/media-verify.ts`).
- **20 curated preset themes (`src/db/seed.ts`)** across Dark, Glass, Atmospheric,
  Editorial, Vivid, and Minimal categories, plus user-owned **saved custom themes**
  (`saved_themes` table). Applying any preset preserves blocks, groups, canvas
  frames, layout mode, and breakpoint overrides (`applyThemeToConfig`).

### V2.4 — Video backgrounds, mesh gradients & animations (`NUL-9`)

- **Background pipeline**: solid, gradient, 3-point mesh gradient, verified image,
  and looping background video (`MP4` ISO BMFF / `WebM` EBML, ≤ 12 MB) with poster
  image fallback, dim/blur controls, and HTTP `206 Partial Content` Range streaming
  (`src/app/api/media/[...key]/route.ts`, `LocalStorageProvider` & `S3StorageProvider`).
- **Progressive video island (`src/components/profile/background-video.tsx`)**:
  suppresses playback automatically when `prefers-reduced-motion: reduce` or
  `navigator.connection.saveData` / `2g` is active; zero overhead on non-video profiles.
- **Motion controls**: `none`, `fade`, `rise`, `scale`, and `blur` entrances,
  optional child stagger, drift/pulse/aurora ambient motion, button and card hover
  treatments, all suppressed under `prefers-reduced-motion: reduce`.

### V2.3 — Responsive breakpoints, checkpoints & revision history (`NUL-7`, `NUL-5`)

- **Per-breakpoint overrides**: Desktop base with independent Tablet (`≤ 900px`)
  and Mobile (`≤ 560px`) overrides (`width`, `gap`, `baseSize`, `alignment`,
  `cardPadding`, `hideBackgroundMedia`) emitted as both `@media` rules (live
  viewports) and `@container null-profile` rules (accurate in-editor device frames).
- **Undo/redo & checkpoints (`editor-store.ts`, `history-panel.tsx`)**: bounded
  session timeline with keyboard shortcuts, named pinned checkpoints, and click-to-jump.
- **Published revision browser (`src/lib/profile-diff.ts`, `profiles/service.ts`)**:
  optional revision notes on publish, arbitrary two-version comparison covering
  identity, links, theme, blocks, groups, canvas, breakpoints, and custom CSS,
  and one-click append-only restore (creates version `N + 1`).

### V2.5 — Pro custom CSS with separate-origin sandbox (`NUL-6`)

- **Centralised entitlements (`src/lib/entitlements.ts`)**: single gate for Pro
  features (`FEATURE_PRO_CSS` + `PRO_CSS_SANDBOX_ORIGIN` + plan/role check), ready
  for V4 subscriptions without scattered checks.
- **Dedicated storage (`profile_custom_css`)**: raw custom CSS is never accepted
  inside `ProfileConfig` JSONB. Draft and published columns mirror the profile
  publish/restore transaction boundary.
- **Zero-FS CSS compiler (`src/lib/custom-css.ts`)**: 16 KiB limit, line/column
  diagnostics, escape-aware rejection of `@import`, `@font-face`, `url()`,
  `image-set()`, `expression()`, `data:`/`javascript:`, `position: fixed`,
  sensitive attribute selectors, and `</style>` breakouts; namespaces `@keyframes`
  with `null-u-` and idempotently scopes every selector under `.null-profile`.
- **Lazy-loaded Monaco editor (`monaco-css-editor.tsx`, `css-panel.tsx`)**:
  code-split on demand, inline diagnostic markers, `.null-profile` selector and
  `--p-*` variable autocomplete, and live preview in `<iframe sandbox="" srcDoc>`.
- **Separate-origin public isolation (`src/lib/sandbox.ts`, `/sandbox/profile/[username]`)**:
  primary `APP_URL` never injects custom CSS — it renders `<iframe sandbox="allow-popups allow-popups-to-escape-sandbox">`
  pointing to `PRO_CSS_SANDBOX_ORIGIN`, which verifies `Host`, emits zero `<script>`
  tags, and enforces `Content-Security-Policy: default-src 'none'`.

## Database migration

`src/db/migrations/0001_v2_customization.sql` is strictly additive and idempotent:
adds `FONT` and `VIDEO` to `media_kind`, creates `saved_themes` and
`profile_custom_css`, and leaves all V1 profiles and snapshots intact.

## Validation (2026-11-16)

- `npm run typecheck`: 0 errors.
- `npm run lint`: 0 warnings, 0 errors.
- `npm test`: **17/17 test suites, 161/161 tests passed** against PostgreSQL 18
  (15 suites / 144 tests without `TEST_DATABASE_URL`).
- `node scripts/db-migrate.mjs` and `npm run db:seed`: applied and re-applied
  idempotently (20 curated themes).
- `npm run build` + standalone runtime E2E: verified `/api/health`, CSP headers,
  authenticated editor SSR, live WOFF2/MP4 upload and spoof rejection, HTTP `206`
  and `416` Range responses, sandbox-only CORS, public canvas/font/video/group SSR,
  OG image generation, and separate-origin Pro CSS host & CSP isolation. Public
  `/[username]` first-load route payload remains `1.09 kB`.
- Dependencies: `dompurify` and `postcss` pinned via `package.json` overrides; all
  new V2 runtime packages report 0 advisories (existing `zod@3` collection DoS is
  mitigated by slicing untrusted arrays before schema parsing; dev-only
  `vitest`/`drizzle-kit` upgrades remain tracked for a separate tooling bump).
