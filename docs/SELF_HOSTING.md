# Self-hosting on a home desktop

Target: a Linux desktop with 4–8 GB RAM and an SSD, on a residential connection
with limited upload bandwidth (the reference machine has ~21 Mbps up, i.e. about
2.6 MB/s). Public access is provided by Cloudflare Tunnel — no router ports are
opened.

## Hardware expectations

| Resource | Minimum | Recommended |
| --- | --- | --- |
| RAM | 4 GB | 8–16 GB |
| Storage | 20 GB SSD | SSD strongly preferred for PostgreSQL |
| CPU | 2 cores | 4 cores |
| Upload | 20 Mbps | 40 Mbps+ (most visitors are served cached HTML/CSS/JS) |

Compose caps the app at 768 MB and the database at 512 MB by default (see
`WEB_MEMORY_LIMIT` / `DB_MEMORY_LIMIT`). PostgreSQL is tuned in
`docker-compose.yml` for a small machine: `max_connections=40`,
`shared_buffers=128MB`, `work_mem=4MB`.

## One-time server preparation

```bash
# Debian/Ubuntu-based host
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git rclone
sudo systemctl enable --now docker

# Optional: constrain Docker's journal so logs cannot fill the disk
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json >/dev/null <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
JSON
sudo systemctl restart docker
```

## Deploy

```bash
git clone <repo> /srv/null && cd /srv/null
cp .env.selfhosted.example .env.selfhosted
```

Edit `.env.selfhosted`:

- `APP_URL` — your real public hostname, `https://…`, **no trailing slash**
- `POSTGRES_PASSWORD`, `AUTH_SECRET`, `APP_ENCRYPTION_KEY` — generated secrets
- `SMTP_*` — a real mail provider (verification and reset links)
- `CLOUDFLARE_TUNNEL_TOKEN` — from the next section
- `TRUST_PROXY=true` — required behind the tunnel

Then:

```bash
docker compose --env-file .env.selfhosted \
  -f docker-compose.yml -f docker-compose.selfhosted.yml up -d --build

# apply migrations inside the runtime image (idempotent, safe to re-run)
docker compose --env-file .env.selfhosted \
  -f docker-compose.yml -f docker-compose.selfhosted.yml \
  run --rm web node scripts/db-migrate.mjs

# seed the theme catalogue (optional but recommended)
docker compose --env-file .env.selfhosted \
  -f docker-compose.yml -f docker-compose.selfhosted.yml \
  run --rm web node -e "console.log('seed from the repo checkout instead')"
```

Seeding reads the TypeScript seed file, so run it from a repository checkout on
the host (it only needs `DATABASE_URL`, which must point at the published
database port — the production overlay does not publish one, so use a temporary
`docker compose run` with the dev overlay or seed before switching to the
production overlay):

```bash
npm run db:seed
```

Verify:

```bash
curl -fsS http://127.0.0.1:3000/api/health | jq
curl -fsSI https://your-domain.example | head -1
```

## Cloudflare Tunnel

1. In Cloudflare Zero Trust → **Networks → Tunnels → Create a tunnel**, choose
   *Cloudflared*, name it `null`.
2. Copy the tunnel token into `CLOUDFLARE_TUNNEL_TOKEN`.
3. Add a **Public Hostname**: `your-domain.example` → `http://web:3000`.
   The service name `web` is the compose service; the tunnel container shares the
   internal network with it.
4. SSL/TLS mode must be **Full** or **Full (strict)**. Cloudflare terminates TLS;
   the origin is reachable only over the Docker network.
5. Set `TRUST_PROXY=true` so the app reads `CF-Connecting-IP` for rate limiting.

No ports are forwarded on the router, PostgreSQL has no published port, and the
app binds only to `127.0.0.1:3000` on the host.

### Cloudflare caching

Static assets under `/_next/static/` are immutable and safe to cache aggressively.
Do **not** put a Cache Everything rule in front of HTML: profiles change on
publish and the app already emits correct cache headers. If you add a rule, scope
it to `/_next/static/*` and `/api/media/*` only.

## Restart and update procedure

```bash
cd /srv/null

# 1. Back up first — always
BACKUP_MEDIA_DIR=/var/lib/docker/volumes/null_media_data/_data \
RCLONE_REMOTE=remote:null-backups \
./scripts/backup.sh

# 2. Pull and rebuild
git pull
docker compose --env-file .env.selfhosted \
  -f docker-compose.yml -f docker-compose.selfhosted.yml up -d --build

# 3. Apply migrations (against the running database container)
docker compose --env-file .env.selfhosted \
  -f docker-compose.yml -f docker-compose.selfhosted.yml \
  run --rm web node scripts/db-migrate.mjs

# 4. Confirm
docker compose --env-file .env.selfhosted ps
curl -fsS https://your-domain.example/api/health
```

Containers use `restart: unless-stopped`, so the stack comes back after a reboot
or a crash on its own. Enable Docker at boot (`systemctl enable docker`).

## Monitoring

- **Uptime**: point a free monitor (UptimeRobot, Better Stack, Healthchecks.io)
  at `https://your-domain.example/api/health`. It returns `200` with a JSON body
  listing `database` and `storage` status, or `503` when degraded.
- **Logs**: `docker compose logs -f web`. Rotation is configured at 10 MB × 3
  files per service.
- **Disk**: the database grows slowly, but media does not — watch
  `du -sh /var/lib/docker/volumes/null_*`.
- **Memory**: `docker stats` should show the app well under its 768 MB cap.

## Scheduled jobs

Add to `crontab -e` on the host:

```cron
# Nightly backup at 03:15, keep 14 days locally and copy off-site
15 3 * * * cd /srv/null && BACKUP_MEDIA_DIR=/var/lib/docker/volumes/null_media_data/_data RCLONE_REMOTE=remote:null-backups ./scripts/backup.sh >> /var/log/null-backup.log 2>&1

# Monthly restore rehearsal into a scratch database
0 4 1 * * cd /srv/null && ./scripts/restore.sh "$(ls -t backups/db-*.sql.gz | head -1)" >> /var/log/null-restore-check.log 2>&1
```

See [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md) for the full policy.

## Limitations to be honest about

- Residential upload bandwidth is the hard ceiling. Cloudflare caches static
  assets; HTML is revalidated. Heavy traffic on a viral profile will be slower
  than a cloud deployment.
- Power cuts and ISP outages take the site down. Nothing in the app can prevent
  that; the auto-restart policy only helps after power returns.
- There is no built-in DDoS mitigation beyond Cloudflare's edge and in-process
  rate limits.
- A single disk is a single point of failure. Keep off-site backups and test them.

When any of these becomes a real constraint, follow
[MIGRATION.md](MIGRATION.md) to move to a cloud deployment — no application
changes are required.
