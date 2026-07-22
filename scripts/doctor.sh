#!/usr/bin/env bash

set -uo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)
COMPOSE_FILE="${REPO_ROOT}/deploy/docker-compose/compose.yaml"
COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-"${REPO_ROOT}/deploy/docker-compose/.env"}
CHART_DIR="${REPO_ROOT}/deploy/helm/litemcp"

TARGET=all
FAILURES=0
WARNINGS=0

usage() {
  cat <<'EOF'
Usage: scripts/doctor.sh [--target all|compose|kubernetes]

Checks local prerequisites and renders deployment configuration. It does not
start containers, create a cluster, or change deployed resources.
EOF
}

while (($#)); do
  case "$1" in
    --target)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      TARGET=$2
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

case "$TARGET" in
  all|compose|kubernetes) ;;
  *)
    printf 'Invalid target: %s\n' "$TARGET" >&2
    usage >&2
    exit 2
    ;;
esac

pass() {
  printf 'PASS  %s\n' "$1"
}

warn() {
  printf 'WARN  %s\n' "$1"
  WARNINGS=$((WARNINGS + 1))
}

fail() {
  printf 'FAIL  %s\n' "$1"
  FAILURES=$((FAILURES + 1))
}

require_command() {
  local command_name=$1
  if command -v "$command_name" >/dev/null 2>&1; then
    pass "${command_name} is installed"
    return 0
  fi

  fail "${command_name} is not installed"
  return 1
}

read_env_value() {
  local key=$1
  local file=$2
  awk -F= -v wanted="$key" '
    $1 == wanted {
      sub(/^[^=]*=/, "")
      print
      exit
    }
  ' "$file"
}

check_compose() {
  require_command docker || return

  if docker compose version >/dev/null 2>&1; then
    pass "Docker Compose is installed"
  else
    fail "Docker Compose v2 is not available"
    return
  fi

  if docker info >/dev/null 2>&1; then
    pass "Docker daemon is reachable"
  else
    fail "Docker daemon is not reachable"
  fi

  if [[ ! -f "$COMPOSE_ENV_FILE" ]]; then
    fail "Compose environment file is missing: ${COMPOSE_ENV_FILE}"
    warn "Copy deploy/docker-compose/.env.example to .env and replace the placeholder"
    return
  fi

  local auth_secret
  local credential_key
  local mongodb_password
  local mongodb_replica_key
  auth_secret=$(read_env_value BETTER_AUTH_SECRET "$COMPOSE_ENV_FILE")
  if [[ ${#auth_secret} -lt 32 || "$auth_secret" == replace-* ]]; then
    fail "BETTER_AUTH_SECRET must be a non-placeholder value of at least 32 characters"
  else
    pass "BETTER_AUTH_SECRET is present and has an acceptable length"
  fi

  credential_key=$(read_env_value CREDENTIAL_MASTER_KEY "$COMPOSE_ENV_FILE")
  if [[ ${#credential_key} -lt 32 || "$credential_key" == replace-* ]]; then
    fail "CREDENTIAL_MASTER_KEY must be a non-placeholder value of at least 32 characters"
  else
    pass "CREDENTIAL_MASTER_KEY is present and has an acceptable length"
  fi

  mongodb_password=$(read_env_value MONGODB_PASSWORD "$COMPOSE_ENV_FILE")
  if [[ ${#mongodb_password} -lt 24 || "$mongodb_password" == replace-* ]]; then
    fail "MONGODB_PASSWORD must be a non-placeholder URI-safe value of at least 24 characters"
  elif [[ "$mongodb_password" =~ [^A-Za-z0-9._~-] ]]; then
    fail "MONGODB_PASSWORD must be URI-safe without percent encoding"
  else
    pass "MONGODB_PASSWORD is present and URI-safe"
  fi

  mongodb_replica_key=$(read_env_value MONGODB_REPLICA_SET_KEY "$COMPOSE_ENV_FILE")
  if [[ ${#mongodb_replica_key} -lt 32 || "$mongodb_replica_key" == replace-* ]]; then
    fail "MONGODB_REPLICA_SET_KEY must be a non-placeholder value of at least 32 characters"
  else
    pass "MONGODB_REPLICA_SET_KEY is present and has an acceptable length"
  fi

  if docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" config --quiet; then
    pass "Docker Compose configuration is valid"
  else
    fail "Docker Compose configuration is invalid"
  fi
}

check_kubernetes() {
  local docker_ready=true
  local helm_ready=true
  local kind_ready=true
  local kubectl_ready=true

  require_command docker || docker_ready=false
  require_command kubectl || kubectl_ready=false
  require_command kind || kind_ready=false
  require_command helm || helm_ready=false

  if [[ "$docker_ready" == true ]]; then
    if docker info >/dev/null 2>&1; then
      pass "Docker daemon is reachable"
    else
      fail "Docker daemon is not reachable"
    fi
  fi

  if [[ "$helm_ready" == true ]]; then
    if helm lint --strict "$CHART_DIR"; then
      pass "Helm chart lint passed"
    else
      fail "Helm chart lint failed"
    fi

    if helm template litemcp "$CHART_DIR" >/dev/null; then
      pass "Helm chart renders with default values"
    else
      fail "Helm chart rendering failed"
    fi
  fi

  if [[ "$kubectl_ready" == true && "$kind_ready" == true ]]; then
    pass "kubectl and kind are available; no cluster was created"
  fi
}

printf 'LiteMCP Composer deployment doctor (target: %s)\n' "$TARGET"

case "$TARGET" in
  compose)
    check_compose
    ;;
  kubernetes)
    check_kubernetes
    ;;
  all)
    check_compose
    check_kubernetes
    ;;
esac

printf '\nSummary: %d failure(s), %d warning(s)\n' "$FAILURES" "$WARNINGS"
((FAILURES == 0))
