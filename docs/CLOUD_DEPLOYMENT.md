# Cloud deployment

The same image that runs on the home server runs in the cloud. The differences are
configuration only: object storage instead of a local volume, a managed database,
and TLS terminated by the provider rather than by `cloudflared`.

## Target topology

```
Internet ──▶ Cloudflare (DNS, CDN, WAF)
                  │
                  ▼
          Load balancer / reverse proxy  (TLS)
                  │
                  ▼
        Vessel container(s)  ────▶ Managed PostgreSQL
                  │
                  └────────────▶ Cloudflare R2 (media, via S3 API)
```

## 1. Provision

- **Host**: a VPS with 2 vCPU / 2–4 GB RAM is ample for a few thousand daily
  visitors. A container platform (Fly.io, Railway, Render) works equally well
  because the image is standard.
- **Database**: managed PostgreSQL 16 with automated backups and point-in-time
  recovery. If you would rather keep the bundled container, remove the `db`
  dependency in your own compose override and back it up yourself.
- **Object storage**: a Cloudflare R2 bucket (or any S3-compatible store).

## 2. Configure

```bash
cp .env.cloud.example .env.cloud
```

Required values:

| Variable | Notes |
| --- | --- |
| `APP_URL` | exact public origin, `https://…`, no trailing slash |
| `DATABASE_URL` | managed instance connection string |
| `AUTH_SECRET` | 48 random bytes, base64 |
| `APP_ENCRYPTION_KEY` | 32 random bytes, base64 — **must match the old server when migrating** |
| `STORAGE_DRIVER` | `s3` |
| `S3_*` | endpoint, region, bucket, keys, optional public base URL |
| `TRUST_PROXY` | `true` |
| `MAIL_DRIVER` / `SMTP_*` | a real transactional mail provider |

`APP_ENCRYPTION_KEY` is the one value you cannot regenerate: it decrypts stored
OAuth tokens. Back it up with your secrets and carry it across during migration.

## 3. Deploy

```bash
docker compose --env-file .env.cloud \
  -f docker-compose.yml -f docker-compose.cloud.yml up -d --build

npm run db:deploy
```

Or on a container platform: build from the `Dockerfile`, expose port 3000, set the
same environment variables, and set the health check path to `/api/health`.

## 4. DNS and TLS

1. Point the hostname at the load balancer / platform ingress.
2. Enable Cloudflare proxy (orange cloud) for CDN and WAF.
3. SSL mode **Full (strict)**; the origin must present a valid certificate.
4. Keep a cache rule scoped to `/_next/static/*` and `/api/media/*`. Do not cache
   HTML blindly: profile pages are already served with correct revalidation.
5. If media is served from R2 through a custom domain, that hostname must be
   allowed by any CSP you add later.

## 5. Verify

```bash
curl -fsS https://vessel.example.com/api/health | jq
curl -fsSI https://vessel.example.com/ | head -5
curl -fsS https://vessel.example.com/<a-published-username> | grep -o '<title>[^<]*'
```

Then, in the browser:

- register a new account (confirms database writes and email delivery),
- log in and out (confirms sessions and cookie `Secure` flag),
- upload an avatar (confirms R2 credentials, public URL, and CDN),
- publish a profile and open `/username` in a private window,
- request a password reset and complete it.

## 6. Scaling notes

- The app is stateless once media lives in object storage: run two replicas behind
  the load balancer if needed.
- **Rate limiting is per process.** With multiple replicas, limits become
  per-replica. That is usually acceptable; if it is not, replace the `consume()`
  implementation in `src/lib/rate-limit.ts` with a shared store (Redis) — no call
  sites change.
- Database connections: each replica opens at most 10 (`src/db/client.ts`). Size
  the managed database accordingly, or use the provider's connection pooler.
- Theme caching is per process with a 60-second TTL; there is nothing to invalidate
  across replicas.

## 7. Operations

- **Backups**: rely on the managed database's automated backups, plus
  `scripts/backup.sh` for logical dumps you control. R2 should have versioning on.
- **Monitoring**: external uptime monitor on `/api/health`; ship container logs to
  the platform's log sink.
- **Updates**: `git pull`, rebuild, `npm run db:deploy`, rolling restart.

Rollback and full migration steps: [MIGRATION.md](MIGRATION.md).
