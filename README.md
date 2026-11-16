# null

A customizable personal identity platform. Claim `yourdomain.com/yourname`, design
it visually, and publish only when it is exactly right.

null is a **modular monolith**: one Next.js application, one PostgreSQL
database, one storage interface. The same container image runs on a laptop, a
home desktop behind Cloudflare Tunnel, and a cloud VPS.

```
Visitor ──▶ Cloudflare ──▶ Tunnel ──▶ null (Next.js) ──┬─▶ PostgreSQL
                                                        └─▶ Media (local disk or S3/R2)
```

## Status — V1

Implemented and working end to end:

- Email + password accounts with Argon2id hashing, sessions, email verification and password reset.
- Unique, case-insensitive usernames with reserved-name and impersonation protection.
- A public profile at `/<username>`: server-rendered, themeable, responsive, SEO-ready (canonical URL, Open Graph image, JSON-LD, sitemap).
- A three-panel editor: design tokens, identity, link management (add/edit/reorder/hide/delete) and publishing, with live preview, autosave, undo/redo and keyboard shortcuts.
- **Drafts never leak.** Visitors see an immutable published snapshot; publishing is transactional and versioned, with restore.
- Twelve built-in themes; every colour, font, radius, shadow and spacing value is adjustable.
- Media pipeline: content-verified uploads, EXIF stripping, multi-size variants, local or S3 storage.
- Dashboard, media library, account settings (username/email/password/sessions/delete), public explore page.
- Rate limiting, audit logging, security headers, health endpoint, robots and sitemap.
- Docker Compose for development, self-hosted and cloud; migrations, seed, backup and restore scripts.

Not implemented (deliberately out of scope for V1): billing, OAuth providers,
third-party widget integrations, guestbooks, advanced analytics. See
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## Quick start

Requires Node.js 20.11+ and PostgreSQL 14+ (local or Docker).

```bash
cp .env.example .env          # then set AUTH_SECRET and APP_ENCRYPTION_KEY
npm install
npm run db:migrate            # apply SQL migrations
npm run db:seed               # theme catalogue (+ a local admin account)
npm run dev                   # http://localhost:3000
```

Generate the two secrets:

```bash
openssl rand -base64 48   # AUTH_SECRET
openssl rand -base64 32   # APP_ENCRYPTION_KEY
```

Fully containerised development:

```bash
cp .env.example .env
npm run docker:dev
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload on `0.0.0.0:3000` |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | Strict TypeScript, no emit |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm run test` | Vitest suite (49 tests) |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:migrate` | Apply migrations (development) |
| `npm run db:deploy` | Apply migrations (production, non-interactive) |
| `npm run db:seed` | Upsert themes; create a dev admin account |
| `npm run db:reset` | Drop and rebuild a `*_dev` / `*_test` database |
| `npm run docker:dev` | Compose: development stack |
| `npm run docker:prod` | Compose: self-hosted production stack |

## Documentation

| Document | Contents |
| --- | --- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Module layout, rendering strategy, key design decisions |
| [DATABASE.md](docs/DATABASE.md) | Every table, index and constraint; JSONB policy |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local setup, workflow, testing, common tasks |
| [SELF_HOSTING.md](docs/SELF_HOSTING.md) | Desktop deployment, Cloudflare Tunnel, operations |
| [CLOUD_DEPLOYMENT.md](docs/CLOUD_DEPLOYMENT.md) | Moving to a VPS with managed PostgreSQL and R2 |
| [MIGRATION.md](docs/MIGRATION.md) | Server-to-server and self-hosted→cloud migration, with rollback |
| [BACKUP_AND_RESTORE.md](docs/BACKUP_AND_RESTORE.md) | Backup policy, rotation, verified restores, disaster scenarios |
| [SECURITY.md](docs/SECURITY.md) | Threat model and every implemented control |
| [API.md](docs/API.md) | HTTP endpoints and server actions |
| [ROADMAP.md](docs/ROADMAP.md) | V1 → V5 plan and what is intentionally absent |

## Configuration

All configuration is environment-based and validated at startup
(`src/lib/env.ts`). `.env.example`, `.env.selfhosted.example` and
`.env.cloud.example` document every variable. Secrets are never committed; the
app refuses to boot in production with placeholder values.

## Licence

Private project. The name, visual identity and code are original and do not copy
any other platform's assets or branding.
