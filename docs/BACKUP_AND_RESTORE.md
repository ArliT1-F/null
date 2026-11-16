# Backup and restore

**A backup that has never been restored is not a backup.** This document covers
what to back up, how, how to prove it works, and what to do when things break.

## What to back up

| Data | Why | Method |
| --- | --- | --- |
| PostgreSQL | accounts, profiles, links, versions, audit | `pg_dump --clean --if-exists` piped to gzip |
| Media directory | every uploaded image and variant | `tar.gz` of the volume, or `rclone` if S3-backed |
| Secrets | `AUTH_SECRET`, **`APP_ENCRYPTION_KEY`** | password manager / encrypted store — never in the repo |
| Configuration | `.env.selfhosted` | same as secrets |
| Repository | the code you actually deployed | Git remote + tagged releases |

`APP_ENCRYPTION_KEY` deserves emphasis: without it, encrypted OAuth tokens in
`accounts` cannot be decrypted. Back it up separately from the database — a
backup that contains both is not much better than no backup if a single disk
holds both.

## Retention policy

- **Local**: 14 daily archives, rotated automatically (`BACKUP_RETAIN_DAYS=14`).
- **Off-site**: at least 30 days, provided by `RCLONE_REMOTE` or your cloud
  provider's object versioning.
- **Monthly**: keep one archive per month for a year.

At least one copy must live on a different machine or in object storage.
**A second partition on the same disk does not count.**

## Taking a backup

```bash
cd /srv/null
BACKUP_MEDIA_DIR=/var/lib/docker/volumes/null_media_data/_data \
BACKUP_DIR=./backups \
RCLONE_REMOTE=remote:null-backups \
./scripts/backup.sh
```

What the script does, in order:

1. `pg_dump` with `--clean --if-exists` (so restores replace objects cleanly).
2. `gzip -t` on the result — an archive that fails is deleted immediately.
3. Tars the media directory (skipped when `BACKUP_MEDIA_DIR` is unset).
4. Writes SHA-256 checksums next to the archives.
5. Copies the current archive off-site when `RCLONE_REMOTE` is set — and prints a
   warning if it is not.
6. Deletes archives older than `BACKUP_RETAIN_DAYS`.

## Restoring

```bash
# 1. Stop writes
docker compose -f docker-compose.yml -f docker-compose.selfhosted.yml stop web

# 2. Restore
./scripts/restore.sh ./backups/db-20260101T031500Z.sql.gz \
                     ./backups/media-20260101T031500Z.tar.gz

# 3. Start and verify
docker compose -f docker-compose.yml -f docker-compose.selfhosted.yml start web
curl -fsS https://your-domain.example/api/health | jq
```

`restore.sh` validates the gzip stream and checks that the dump header looks like
`pg_dump` output before touching the database. Media is extracted into a staging
directory rather than over the live volume, so you decide when to swap it in.

## Restore rehearsal (do this monthly)

```bash
# Create a scratch database and restore into it — production stays untouched.
createdb -h 127.0.0.1 -U null restore_check
gunzip -c backups/db-<STAMP>.sql.gz | psql -h 127.0.0.1 -U null -d restore_check -v ON_ERROR_STOP=1

# Sanity checks
psql -d restore_check -c "select count(*) from users;"
psql -d restore_check -c "select count(*) from profiles where published_snapshot is not null;"
psql -d restore_check -c "select count(*) from media_assets;"

# Spot-check that a media key really exists in the archive/filesystem
psql -d restore_check -tAc "select storage_key from media_assets limit 1;"

dropdb restore_check
```

Record the date and result in your operations log.

## Disaster scenarios

### Accidental deletion of a profile or link

Restore into a scratch database (above), then copy the affected rows:

```sql
\copy (select * from profile_links where id = '…') to 'rows.csv' csv header
```

Re-insert them into production with `\copy … from 'rows.csv' csv header`.
For a profile, restoring the `profile_versions` row and using the editor's
"restore version" action is simpler and preserves the audit trail.

### Database corruption

1. Stop the app.
2. Move the current data directory aside — do not delete it, it may be salvageable.
3. Initialise a fresh PostgreSQL volume and start the database.
4. `npm run db:deploy` to create the schema.
5. Restore the most recent dump that passes `gzip -t`.
6. Start the app and verify `/api/health`, a login, and one published profile.

Data loss equals the time between the last good backup and the failure. That is
why nightly is the minimum and why the off-site copy matters.

### Drive failure / OS reinstall

Full rebuild:

```bash
sudo apt install -y docker.io docker-compose-plugin git rclone
git clone <repo> /srv/null && cd /srv/null
# restore .env.selfhosted from your secret manager
docker compose --env-file .env.selfhosted -f docker-compose.yml -f docker-compose.selfhosted.yml up -d db
./scripts/restore.sh <db-dump> <media-archive>
# extract media into the volume, fixing ownership
docker compose --env-file .env.selfhosted -f docker-compose.yml -f docker-compose.selfhosted.yml up -d
```

### Failed migration to a new server

See [MIGRATION.md](MIGRATION.md#rollback). Because the source is stopped rather
than deleted, rollback is a DNS change plus `start web`.

### Media lost but database intact

Images referenced by `media_assets` will 404. Restore the media archive; no
database change is needed as long as keys are preserved. If the files are
unrecoverable, delete the corresponding `media_assets` rows and re-upload — the
profile layout itself is unaffected.

## Verification checklist after any restore

- [ ] `/api/health` reports `ok` for database and storage
- [ ] Existing account logs in
- [ ] A published profile renders with images
- [ ] The editor loads the current draft
- [ ] Publishing produces version `revision + 1`
- [ ] `media_assets` count matches the files present in storage
- [ ] Sitemap lists published profiles
