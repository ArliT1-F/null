# Development

## Prerequisites

- Node.js 20.11 or newer (22 recommended)
- PostgreSQL 14+ — either installed locally or run via Docker
- Git

Nothing else. There is no Redis, no message broker, no object storage emulator.

## First run

```bash
git clone <repo> vessel && cd vessel
cp .env.example .env
```

Fill in the two mandatory secrets:

```bash
openssl rand -base64 48    # AUTH_SECRET
openssl rand -base64 32    # APP_ENCRYPTION_KEY
```

Then:

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open <http://localhost:3000>. The seed creates twelve themes and (outside
production) an admin account:

```
admin@localhost / vessel-admin-2026
```

Override with `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`,
`SEED_ADMIN_USERNAME`.

## Working with Docker

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

This mounts the source into the container and runs `next dev`, so edits reload.
Database port is published on `127.0.0.1:5432` only.

## Environment variables

`src/lib/env.ts` validates everything at startup and fails with a readable list
of what is missing. Two rules worth knowing:

- `AUTH_SECRET` must be at least 32 characters.
- Production refuses to start with a `replace-me` secret.

`TEMP`-style values are fine for local work; `.env.example` marks which ones
must be generated.

## Everyday commands

```bash
npm run dev          # dev server, hot reload
npm run typecheck    # strict TS across app, scripts and tests
npm run lint         # ESLint
npm run test         # Vitest
npm run test:watch
npm run db:studio    # Drizzle Studio (browse data)
```

## Testing

The suite is `tests/`:

| File | Covers |
| --- | --- |
| `username.test.ts` | reserved names, impersonation, unicode lookalikes, suggestions |
| `profile-config.test.ts` | schema injection resistance, salvage logic, CSS scoping |
| `validation.test.ts` | URL scheme allowlist, password/email rules |
| `crypto.test.ts` | token hashing, AES-GCM round-trip and tamper detection |
| `storage.test.ts` | path traversal and unsafe key rejection |
| `publishing.test.ts` | **integration**: drafts stay private, versioning, hidden links, private profiles, restore, case-insensitive uniqueness, click counts |

`publishing.test.ts` needs a real database and is skipped without one:

```bash
createdb vessel_test
TEST_DATABASE_URL=postgresql://localhost/vessel_test npm test
```

It applies the real migrations to that database, so it also validates migrations.

## Common tasks

### Change the schema

1. Edit `src/db/schema.ts`.
2. `npm run db:generate` → review the generated SQL in `src/db/migrations/`.
3. `npm run db:migrate`.
4. Commit the schema **and** the migration.

### Add a theme

Append to `THEME_SEEDS` in `src/db/seed.ts` and run `npm run db:seed`. Themes are
upserted by slug, so re-running updates existing rows.

### Reset a development database

```bash
npm run db:reset
```

Refuses to run unless the database name ends in `_dev`, `_test` or `_local`.

### Exercise signed-in pages from curl

```bash
TOKEN=$(NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env scripts/dev/dev-session.ts arlit1)
curl -H "Cookie: vessel_session=$TOKEN" http://localhost:3000/dashboard
```

`NODE_OPTIONS=--conditions=react-server` is required because those scripts import
modules guarded by the `server-only` marker.

### Test email flows without a provider

`MAIL_DRIVER=console` prints the full message — including verification and reset
links — to the server log. Copy the link into the browser.

## Conventions

- Server-only modules start with `import "server-only";`.
- Client modules must never import `src/lib/password.ts` (native binding) — use
  `password-strength.ts` for UI hints.
- Configuration is read from `src/lib/env.ts`, never `process.env` directly.
- Every mutation is a server action or route handler that re-derives the user
  from the session.
- New user-facing strings go through the existing components; there is no i18n
  layer in V1.

## Troubleshooting

**`Invalid environment configuration`** — the message lists the missing
variables. Copy `.env.example` again if unsure.

**Port 5432 already in use** — another PostgreSQL is running; set `DB_PORT` for
the Docker overlay or point `DATABASE_URL` elsewhere.

**`server-only` import error in a script** — add
`NODE_OPTIONS=--conditions=react-server`.

**Images fail to upload** — check `MEDIA_ROOT` exists and is writable by the app
user. In Docker it is the `media_data` volume.

**A public profile returns 500 after changing caching code** — almost certainly a
date crossing a serialising cache boundary and coming back as a string. Wrap the
loader in `rehydrateNullableProfileDates` (see
`src/app/[username]/page.tsx`). Run `npm test` — `profile-serialize.test.ts`
covers exactly this and will fail first.
