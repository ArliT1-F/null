# Migration guide

Two migrations matter:

1. **Self-hosted → cloud** (the planned path), and
2. **Server → server** (new hardware, same deployment style).

Both follow the same shape: prepare the target, snapshot the source, restore,
switch traffic, keep the source alive for rollback.

## What must survive

| Data | Where it lives | Carried by |
| --- | --- | --- |
| Accounts, credentials | `users`, `accounts` | pg_dump |
| Sessions | `sessions` | pg_dump (optional — users re-login cleanly) |
| Usernames | `users.username` | pg_dump |
| Profiles, drafts, published versions | `profiles`, `profile_versions` | pg_dump |
| Links | `profile_links` | pg_dump |
| Media files | `MEDIA_ROOT` or S3 bucket | tarball / `rclone sync` |
| Media rows and variant keys | `media_assets` | pg_dump — keys must match the copied files |
| Themes | `themes` | pg_dump (or re-seed) |
| Audit history | `audit_logs` | pg_dump |
| Secrets | `.env.*` / secret manager | manual, secure channel |

V1 has no subscriptions, payments, custom domains or widget configuration, so
those parts of the eventual checklist are not yet applicable.

## Prerequisites

- The new host is reachable and Docker is installed.
- You have the source `.env` values, **including `APP_ENCRYPTION_KEY`**. Changing
  it makes previously stored OAuth tokens unreadable.
- New DNS records are ready but not yet switched.
- You have enough disk space for the dump plus the media archive.

## Procedure

### 1. Put the source into maintenance

Stop writes so the dump is consistent:

```bash
docker compose -f docker-compose.yml -f docker-compose.selfhosted.yml stop web
```

The site is now unavailable on the old host. Keep the tunnel up; visitors get a
connection error rather than a confusing partial state.

### 2. Snapshot the source

```bash
cd /srv/vessel
BACKUP_MEDIA_DIR=/var/lib/docker/volumes/vessel_media_data/_data \
  ./scripts/backup.sh
ls -lh backups/
```

Note the timestamps. Verify the dump:

```bash
gzip -t backups/db-*.sql.gz
gunzip -c backups/db-<STAMP>.sql.gz | head -3
```

### 3. Prepare the target

```bash
git clone <repo> /srv/vessel && cd /srv/vessel
cp .env.cloud.example .env.cloud
# fill in DATABASE_URL, AUTH_SECRET (same or new), APP_ENCRYPTION_KEY (MUST match),
# S3_* or MEDIA_ROOT, MAIL_*, APP_URL (the new hostname)
```

Bring up only the database (or use your managed instance), then apply migrations
**without** seeding demo data:

```bash
docker compose --env-file .env.cloud -f docker-compose.yml -f docker-compose.cloud.yml up -d db
npm run db:deploy
```

### 4. Restore the database

```bash
gunzip -c backups/db-<STAMP>.sql.gz \
  | docker compose --env-file .env.cloud -f docker-compose.yml exec -T db \
      psql -v ON_ERROR_STOP=1 -U vessel -d vessel
```

For a managed database, use its connection string instead:

```bash
gunzip -c backups/db-<STAMP>.sql.gz | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
```

### 5. Migrate media

**Same storage driver (local → local):**

```bash
rsync -av --progress \
  /var/lib/docker/volumes/vessel_media_data/_data/ \
  new-host:/var/lib/docker/volumes/vessel_media_data/_data/
```

**Local → S3/R2:**

```bash
rclone sync /var/lib/docker/volumes/vessel_media_data/_data/ r2:vessel-media
```

Keep the directory structure exactly. `media_assets.storage_key` and the variant
keys inside `variants` are relative paths; any renaming breaks every image.

### 6. Switch traffic

1. Start the target app and confirm it is healthy on its local port.
2. Update Cloudflare DNS / the load balancer to point at the new host.
3. If using a tunnel, move the tunnel's public hostname to the new service or
   install the tunnel token on the new host.

### 7. Verify

Run through this list before declaring success:

- [ ] `GET /api/health` returns `200` with `database: ok` and `storage: ok`
- [ ] An existing account can log in
- [ ] A password reset email arrives and the link works
- [ ] A published profile renders at `/<username>`
- [ ] Its images load (correct storage keys and CDN hostname)
- [ ] The editor loads, autosave works, publishing creates the next version
- [ ] Explore page lists profiles
- [ ] OG image renders: `/<username>/opengraph-image`
- [ ] Sitemap and robots respond
- [ ] Registering a new account works and sends verification email
- [ ] Uploading a new avatar works and appears on the profile

### 8. Keep the old host for rollback

Leave the old container stopped but present, with its volumes intact, for at least
seven days.

## Rollback

If anything is wrong:

1. Stop the new deployment.
2. Point DNS / the tunnel back at the old host.
3. `docker compose … start web` on the old host.
4. Investigate with the site live.

Because step 1 of the migration stopped writes on the old host, no data was
created after the dump — rollback loses nothing. If the new deployment ran for a
while before you decided to roll back, you must restore the old host from the
**new** database dump, or you will lose accounts created in between.

## Server → server (same style)

For new hardware, the same steps apply with two simplifications: you can run the
dump **without** stopping the app if you accept a few seconds of potential skew
(`pg_dump` is consistent; only in-flight requests may be lost), and media can be
copied with `rsync` while the site is up, followed by one final incremental pass
immediately before switching.

## Common problems

| Symptom | Cause | Fix |
| --- | --- | --- |
| Images 404 after migration | media not copied, or keys renamed | re-copy preserving paths; compare `SELECT storage_key FROM media_assets LIMIT 5` with the filesystem |
| `APP_ENCRYPTION_KEY` errors | different key on the new host | restore the original key from your secret store |
| Login works but every page redirects | `APP_URL` mismatch with the real hostname | set `APP_URL` to the exact scheme + host |
| Rate limits trigger immediately | `TRUST_PROXY` false behind a proxy | set `TRUST_PROXY=true` so real client IPs are used |
| Profiles missing from Explore | visibility or publish state not restored | check `profiles.visibility` and `published_at` |
| Migration errors on start | schema newer than the dump | run `npm run db:deploy` after restoring |
