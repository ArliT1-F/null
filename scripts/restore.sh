#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Vessel — restore script
#
# Usage:
#   ./scripts/restore.sh backups/db-20260101T030000Z.sql.gz [media-archive.tar.gz]
#
# STOP THE APPLICATION FIRST. Restoring over a live database while the app is
# writing will produce an inconsistent result.
#
#   docker compose -f docker-compose.yml -f docker-compose.selfhosted.yml stop web
#   BACKUP_DIR=./backups ./scripts/restore.sh ./backups/db-....sql.gz
#   docker compose -f docker-compose.yml -f docker-compose.selfhosted.yml start web
#
# Environment:
#   COMPOSE_FILE   compose file used to reach the db (default docker-compose.yml)
#   POSTGRES_USER  database user (default vessel)
#   POSTGRES_DB    database name (default vessel)
# ---------------------------------------------------------------------------
set -Eeuo pipefail

DB_ARCHIVE="${1:-}"
MEDIA_ARCHIVE="${2:-}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
POSTGRES_USER="${POSTGRES_USER:-vessel}"
POSTGRES_DB="${POSTGRES_DB:-vessel}"

log() { printf '[restore] %s\n' "$*"; }
fail() { printf '[restore] ERROR: %s\n' "$*" >&2; exit 1; }

[[ -n "${DB_ARCHIVE}" ]] || fail "usage: restore.sh <db-backup.sql.gz> [media-backup.tar.gz]"
[[ -f "${DB_ARCHIVE}" ]] || fail "database archive not found: ${DB_ARCHIVE}"
gzip -t "${DB_ARCHIVE}" || fail "database archive is corrupt"

log "verifying archive"
gunzip -c "${DB_ARCHIVE}" | head -5 | grep -q "PostgreSQL database dump" \
  || fail "this does not look like a pg_dump archive"

log "restoring ${DB_ARCHIVE} into ${POSTGRES_DB}"
# The dump was taken with --clean --if-exists, so it recreates objects itself.
gunzip -c "${DB_ARCHIVE}" | docker compose -f "${COMPOSE_FILE}" exec -T db \
  psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"

log "database restored"

if [[ -n "${MEDIA_ARCHIVE}" ]]; then
  [[ -f "${MEDIA_ARCHIVE}" ]] || fail "media archive not found: ${MEDIA_ARCHIVE}"
  tar -tzf "${MEDIA_ARCHIVE}" > /dev/null || fail "media archive is corrupt"
  log "restoring media from ${MEDIA_ARCHIVE}"
  # Extract into a staging directory first: never overwrite the live media root
  # until the archive has been validated.
  STAGING="$(mktemp -d)"
  tar -xzf "${MEDIA_ARCHIVE}" -C "${STAGING}"
  log "media staged at ${STAGING}; move it into place with the app stopped"
fi

log "done — start the web container and verify /api/health plus a profile URL"
