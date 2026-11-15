# Database

PostgreSQL 14+ (developed against 16). Schema defined in `src/db/schema.ts`
using Drizzle ORM; SQL migrations live in `src/db/migrations/` and are applied by
`npm run db:migrate` / `npm run db:deploy`.

## Principles

1. **Structured first.** Core business data — accounts, profiles, links,
   versions, media, audit — lives in ordinary tables with foreign keys,
   constraints and indexes.
2. **JSONB is for presentation only.** Exactly two columns hold free-form
   structure: `profiles.draft_config` and `profiles.published_snapshot`. Both are
   validated by a Zod schema before write and re-normalised on read, so a stored
   value can never be trusted blindly.
3. **Nothing is deleted silently.** Publishing is append-only; account deletion
   anonymises the row and frees the username rather than cascading away audit
   history.

## Enums

| Enum | Values |
| --- | --- |
| `user_role` | `USER`, `ADMIN` |
| `user_status` | `ACTIVE`, `SUSPENDED`, `DELETED` |
| `auth_provider` | `CREDENTIALS`, `GITHUB`, `GOOGLE`, `DISCORD` |
| `auth_token_purpose` | `EMAIL_VERIFICATION`, `PASSWORD_RESET`, `EMAIL_CHANGE` |
| `profile_visibility` | `PUBLIC`, `UNLISTED`, `PRIVATE` |
| `media_kind` | `AVATAR`, `BACKGROUND`, `GALLERY`, `AUDIO`, `DOCUMENT` |
| `report_status` | `OPEN`, `REVIEWING`, `RESOLVED`, `DISMISSED` |

## Tables

### `users`

One row per account. The username has two columns on purpose:

- `username` — canonical, **lower-cased**, `UNIQUE`. All lookups use this.
- `username_display` — the casing the user chose, used for rendering.

This makes `ArliT1` and `arlit1` impossible to hold simultaneously without
relying on a case-insensitive collation (which would break portability between
locales).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | UUID |
| `email` | text UNIQUE | stored lower-cased |
| `email_verified_at` | timestamptz | null until confirmed |
| `password_hash` | text | Argon2id; null after deletion |
| `role` | user_role | `USER` by default |
| `status` | user_status | checked on every session read |
| `username` | varchar(30) UNIQUE | canonical |
| `username_display` | varchar(30) | chosen casing |
| `username_changed_at` | timestamptz | drives the 30-day cooldown |
| `display_name`, `bio`, `avatar_url` | | profile identity |
| `created_at`, `updated_at`, `last_seen_at`, `deleted_at` | timestamptz | |

Indexes: `users_status_idx`, `users_created_at_idx`.

### `accounts`

OAuth/linked identities. `provider` + `provider_account_id` unique; one row per
provider per user. `access_token_enc` / `refresh_token_enc` hold AES-256-GCM
ciphertext — never plaintext tokens.

### `sessions`

| Column | Notes |
| --- | --- |
| `token_hash` | `UNIQUE`, SHA-256 of the cookie token; the raw token is never stored |
| `user_id` | cascade delete |
| `expires_at` | indexed; expired rows are pruned by `pruneExpiredSessions()` |
| `last_used_at`, `user_agent`, `ip_hash` | shown in the settings session list |

### `auth_tokens`

Single-use tokens for verification and password reset. `token_hash` is unique;
`used_at` is set on redemption; `expires_at` is enforced in code and indexed for
cleanup.

### `profiles`

One per user (`user_id UNIQUE`).

| Column | Notes |
| --- | --- |
| `draft_config` | JSONB, editable presentation state |
| `draft_updated_at` | compared against `published_at` to show "unpublished changes" |
| `theme_slug` | which catalogue theme seeded the current look |
| `headline`, `location`, `status_text` | short identity fields |
| `visibility` | `PUBLIC` / `UNLISTED` / `PRIVATE` |
| `published_snapshot` | JSONB, immutable copy served to visitors |
| `published_at` | null until first publish |
| `revision` | incremented on every publish; used for cache tags |

Indexes: `profiles_published_idx`, `profiles_visibility_idx`.

### `profile_versions`

Append-only publishing history. `(profile_id, version)` is unique. `snapshot`
holds the complete published state, so restoring an old version never depends on
rows that have since changed.

### `profile_links`

| Column | Notes |
| --- | --- |
| `label` | varchar(80) |
| `url` | varchar(2048), scheme-checked at write time |
| `icon` | one of the known icon keys |
| `position` | ordering; rewritten atomically on reorder |
| `visible` | hidden links are excluded from published snapshots |
| `highlight` | visual emphasis |
| `clicks` | incremented on redirect; never exposed publicly |

Index: `profile_links_profile_position_idx`.

### `media_assets`

One row per uploaded image. `storage_key` is provider-relative (no host, no
leading slash). `variants` is a JSONB array of `{ key, width, height, format }`.
`provider` records which backend wrote it, so a mixed-storage migration is
detectable.

### `themes`

Catalogue of built-in themes. `tokens` is a partial theme object that seeds a
new profile. `is_active` hides a theme without deleting history; `sort_order`
drives display order.

### `audit_logs`

Security-relevant events: registration, login, logout, publish, restore,
username change, email change, password change/reset, session revocation,
account deletion. Stores `actor_id`, `action`, `target_type/id` and a small
metadata object. IP addresses are hashed, not stored raw.

### `reports`

Abuse reports for the V4 moderation workflow. Present in the schema so moderation
data has a home, but no user-facing reporting form ships in V1.

## Transactions

Multi-step operations that must be atomic:

- `registerAccount` — user + profile + default draft.
- `publishProfile` — version row + snapshot + revision, under `FOR UPDATE`.
- `restoreVersion` — link reconciliation.
- `reorderLinks` — positions.
- `softDeleteAccount` — anonymise user + unpublish profile.

## Migrations

```bash
npm run db:generate    # after editing src/db/schema.ts
npm run db:migrate     # apply in development
npm run db:deploy      # apply in production (scripts/db-migrate.ts)
```

SQL files are committed. The migrator records applied migrations in
`drizzle.__drizzle_migrations`, so re-running is a no-op.

## Backups

See [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md). The short version:
`pg_dump --clean --if-exists | gzip`, verify with `gzip -t`, copy off the machine,
rotate after 14 days, and restore into a scratch database monthly to prove the
backup works.
