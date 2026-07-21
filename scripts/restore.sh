#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)
COMPOSE_FILE="${REPO_ROOT}/deploy/docker-compose/compose.yaml"
COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-"${REPO_ROOT}/deploy/docker-compose/.env"}
RESTORE_MODE=${LITEMCP_RESTORE_MODE:-compose}
ARCHIVE_PATH=
CONFIRMATION=

usage() {
  cat <<'EOF'
Usage: scripts/restore.sh --archive PATH [--mode compose|external] \
  --confirm-restore litemcp

Restore drops and recreates only the litemcp.* MongoDB namespaces. The explicit
confirmation is mandatory. Take a fresh backup and stop application writes
before running this command.
EOF
}

while (($#)); do
  case "$1" in
    --archive)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      ARCHIVE_PATH=$2
      shift 2
      ;;
    --mode)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      RESTORE_MODE=$2
      shift 2
      ;;
    --confirm-restore)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      CONFIRMATION=$2
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

[[ -n "$ARCHIVE_PATH" ]] || {
  printf -- '--archive is required.\n' >&2
  usage >&2
  exit 2
}
[[ -f "$ARCHIVE_PATH" && ! -L "$ARCHIVE_PATH" ]] || {
  printf 'Archive is missing, not a regular file, or is a symbolic link: %s\n' "$ARCHIVE_PATH" >&2
  exit 1
}

case "$RESTORE_MODE" in
  compose|external) ;;
  *)
    printf 'Invalid restore mode: %s\n' "$RESTORE_MODE" >&2
    exit 2
    ;;
esac

if [[ "$CONFIRMATION" != litemcp ]]; then
  printf 'Restore not started. Re-run with --confirm-restore litemcp after reviewing the runbook.\n' >&2
  exit 2
fi

checksum_path="${ARCHIVE_PATH}.sha256"
if [[ -f "$checksum_path" ]]; then
  if command -v shasum >/dev/null 2>&1; then
    (
      cd -- "$(dirname -- "$ARCHIVE_PATH")"
      shasum -a 256 -c "$(basename -- "$checksum_path")"
    )
  elif command -v sha256sum >/dev/null 2>&1; then
    (
      cd -- "$(dirname -- "$ARCHIVE_PATH")"
      sha256sum -c "$(basename -- "$checksum_path")"
    )
  else
    printf 'No SHA-256 utility is available to verify %s.\n' "$checksum_path" >&2
    exit 1
  fi
else
  printf 'Warning: no checksum file found at %s.\n' "$checksum_path" >&2
fi

printf 'Restoring litemcp.* namespaces using %s mode. Existing data in that namespace will be dropped.\n' "$RESTORE_MODE"

case "$RESTORE_MODE" in
  compose)
    command -v docker >/dev/null 2>&1 || {
      printf 'docker is required for compose restore mode.\n' >&2
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
      mongorestore --quiet --archive --gzip --drop --nsInclude='litemcp.*' <"$ARCHIVE_PATH"
    ;;
  external)
    command -v mongorestore >/dev/null 2>&1 || {
      printf 'mongorestore is required for external restore mode.\n' >&2
      exit 1
    }
    : "${MONGODB_URI:?Set MONGODB_URI for external restore mode}"
    mongorestore \
      --quiet \
      --uri "$MONGODB_URI" \
      --archive="$ARCHIVE_PATH" \
      --gzip \
      --drop \
      --nsInclude='litemcp.*'
    ;;
esac

printf 'Restore completed. Run application health checks before resuming traffic.\n'
