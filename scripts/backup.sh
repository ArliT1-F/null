#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# null — backup script
#
# Backs up PostgreSQL and (optionally) the media directory, verifies the dump,
# rotates old archives, and can push a copy off-site.
#
# Usage:
#   ./scripts/backup.sh
#
# Environment (all optional except paths):
#   BACKUP_DIR          where archives are written            (default ./backups)
#   BACKUP_RETAIN_DAYS  how long to keep local archives       (default 14)
#   COMPOSE_FILE        compose file used to reach the db     (default docker-compose.yml)
#   BACKUP_MEDIA_DIR    host path of the media volume; skipped when unset
#   RCLONE_REMOTE       rclone remote for off-site copies; skipped when unset
#
# Exit codes: 0 success, 1 failure. A failed verification deletes the archive so
# a broken backup is never mistaken for a good one.
# ---------------------------------------------------------------------------
set -Eeuo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-14}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
POSTGRES_USER="${POSTGRES_USER:-null}"
POSTGRES_DB="${POSTGRES_DB:-null}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DB_FILE="${BACKUP_DIR}/db-${STAMP}.sql.gz"
MEDIA_FILE="${BACKUP_DIR}/media-${STAMP}.tar.gz"
CHECKSUM_FILE="${BACKUP_DIR}/checksums-${STAMP}.txt"

log() { printf '[backup] %s\n' "$*"; }
fail() { printf '[backup] ERROR: %s\n' "$*" >&2; exit 1; }

mkdir -p "${BACKUP_DIR}"
log "starting backup ${STAMP}"

# --- Database --------------------------------------------------------------
log "dumping database ${POSTGRES_DB}"
if ! docker compose -f "${COMPOSE_FILE}" exec -T db \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner --no-privileges --clean --if-exists \
  | gzip -9 > "${DB_FILE}"; then
  rm -f "${DB_FILE}"
  fail "pg_dump failed"
fi

# A dump that is not a valid gzip stream is worthless; verify before trusting it.
if ! gzip -t "${DB_FILE}"; then
  rm -f "${DB_FILE}"
  fail "dump failed integrity check"
fi
log "database dump: $(du -h "${DB_FILE}" | cut -f1)"

# --- Media -----------------------------------------------------------------
if [[ -n "${BACKUP_MEDIA_DIR:-}" && -d "${BACKUP_MEDIA_DIR}" ]]; then
  log "archiving media from ${BACKUP_MEDIA_DIR}"
  tar -czf "${MEDIA_FILE}" -C "$(dirname "${BACKUP_MEDIA_DIR}")" "$(basename "${BACKUP_MEDIA_DIR}")"
  tar -tzf "${MEDIA_FILE}" > /dev/null || fail "media archive failed integrity check"
  log "media archive: $(du -h "${MEDIA_FILE}" | cut -f1)"
else
  log "no BACKUP_MEDIA_DIR set — skipping media archive"
fi

# --- Checksums -------------------------------------------------------------
{
  sha256sum "${DB_FILE}"
  [[ -f "${MEDIA_FILE}" ]] && sha256sum "${MEDIA_FILE}"
} > "${CHECKSUM_FILE}"
log "checksums written"

# --- Off-site copy ---------------------------------------------------------
# Required by the deployment rules: at least one copy must leave this machine.
if [[ -n "${RCLONE_REMOTE}" ]]; then
  log "copying to ${RCLONE_REMOTE}"
  rclone copy "${BACKUP_DIR}" "${RCLONE_REMOTE}" --include "*-${STAMP}*" || fail "off-site copy failed"
else
  log "WARNING: RCLONE_REMOTE is not set — this backup exists only on this machine"
fi

# --- Rotation --------------------------------------------------------------
log "removing archives older than ${BACKUP_RETAIN_DAYS} days"
find "${BACKUP_DIR}" -maxdepth 1 -type f -mtime "+${BACKUP_RETAIN_DAYS}" -delete

log "done"
