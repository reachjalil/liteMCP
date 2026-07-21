#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)
COMPOSE_FILE="${REPO_ROOT}/deploy/docker-compose/compose.yaml"
COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-"${REPO_ROOT}/deploy/docker-compose/.env"}
BACKUP_MODE=${LITEMCP_BACKUP_MODE:-compose}
BACKUP_DIR=${LITEMCP_BACKUP_DIR:-"${REPO_ROOT}/backups"}

usage() {
  cat <<'EOF'
Usage: scripts/backup.sh [--mode compose|external] [--output-dir PATH]

Modes:
  compose   Run mongodump inside the Docker Compose MongoDB service.
  external  Run the local mongodump command using MONGODB_URI.

The archive contains the litemcp database. Credentials are never printed, but
operators should still protect the process environment, process list, and the
resulting archive.
EOF
}

while (($#)); do
  case "$1" in
    --mode)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      BACKUP_MODE=$2
      shift 2
      ;;
    --output-dir)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      BACKUP_DIR=$2
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$BACKUP_MODE" in
  compose|external) ;;
  *)
    printf 'Invalid backup mode: %s\n' "$BACKUP_MODE" >&2
    exit 2
    ;;
esac

if [[ -e "$BACKUP_DIR" && ! -d "$BACKUP_DIR" ]]; then
  printf 'Backup destination exists but is not a directory: %s\n' "$BACKUP_DIR" >&2
  exit 1
fi
if [[ ! -d "$BACKUP_DIR" ]]; then
  mkdir -p -- "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
fi

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
archive_path="${BACKUP_DIR%/}/litemcp-mongodb-${timestamp}.archive.gz"
temporary_path=$(mktemp "${BACKUP_DIR%/}/.litemcp-backup.XXXXXX")

cleanup() {
  rm -f -- "$temporary_path"
}
trap cleanup EXIT INT TERM

umask 077

case "$BACKUP_MODE" in
  compose)
    command -v docker >/dev/null 2>&1 || {
      printf 'docker is required for compose backup mode.\n' >&2
      exit 1
    }
    [[ -f "$COMPOSE_ENV_FILE" ]] || {
      printf 'Compose environment file is missing: %s\n' "$COMPOSE_ENV_FILE" >&2
      exit 1
    }
    docker compose \
      --env-file "$COMPOSE_ENV_FILE" \
      -f "$COMPOSE_FILE" \
      exec -T mongodb \
      mongodump --quiet --db litemcp --archive --gzip >"$temporary_path"
    ;;
  external)
    command -v mongodump >/dev/null 2>&1 || {
      printf 'mongodump is required for external backup mode.\n' >&2
      exit 1
    }
    : "${MONGODB_URI:?Set MONGODB_URI for external backup mode}"
    mongodump --quiet --uri "$MONGODB_URI" --db litemcp --archive --gzip >"$temporary_path"
    ;;
esac

[[ -s "$temporary_path" ]] || {
  printf 'Backup command produced an empty archive.\n' >&2
  exit 1
}

mv -- "$temporary_path" "$archive_path"
chmod 600 "$archive_path"
trap - EXIT INT TERM

if command -v shasum >/dev/null 2>&1; then
  (
    cd -- "$(dirname -- "$archive_path")"
    shasum -a 256 "$(basename -- "$archive_path")" >"$(basename -- "$archive_path").sha256"
  )
elif command -v sha256sum >/dev/null 2>&1; then
  (
    cd -- "$(dirname -- "$archive_path")"
    sha256sum "$(basename -- "$archive_path")" >"$(basename -- "$archive_path").sha256"
  )
else
  printf 'Warning: no SHA-256 utility found; checksum was not written.\n' >&2
fi

printf 'Backup written to %s\n' "$archive_path"
printf 'Store this archive encrypted and separately from the LiteMCP Composer deployment.\n'
