#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

APP_DIR="${SUBSTRATA_APP_DIR:-/opt/substrata}"
BRANCH="${SUBSTRATA_BRANCH:-main}"
ENV_FILE="infra/.env.production"
BACKUP_DIR="/root/backups/substrata"
API_URL="http://127.0.0.1:4100/health"
WEB_URL="http://127.0.0.1:3100/"
MIGRATE_TIMEOUT_SECONDS=180
HEALTH_TIMEOUT_SECONDS=90

log() {
  printf '\n\033[1;36m==> %s\033[0m\n' "$*"
}

fail() {
  printf '\n\033[1;31mDeployment failed: %s\033[0m\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

show_failure_logs() {
  printf '\n\033[1;33mRecent Substrata logs:\033[0m\n' >&2
  docker logs --tail=80 substrata-migrate 2>&1 || true
  docker logs --tail=80 substrata-api 2>&1 || true
  docker logs --tail=80 substrata-web 2>&1 || true
}

trap 'show_failure_logs' ERR

require_command git
require_command docker
require_command curl
require_command date

cd "$APP_DIR" || fail "Application directory not found: $APP_DIR"
[[ -f "$ENV_FILE" ]] || fail "Missing environment file: $ENV_FILE"

if ! grep -qE '^SESSION_SECRET=.+$' "$ENV_FILE"; then
  fail "SESSION_SECRET is missing from $ENV_FILE"
fi

if [[ -n "$(git status --porcelain)" ]]; then
  fail "Git working tree is not clean. Commit, stash, or discard local changes before deploying."
fi

COMPOSE=(
  docker compose
  --env-file "$ENV_FILE"
  -f infra/docker-compose.prod.yml
)

log "Checking Docker Compose configuration"
"${COMPOSE[@]}" config -q

log "Fetching latest ${BRANCH} branch"
git fetch origin "$BRANCH"

CURRENT_COMMIT="$(git rev-parse HEAD)"
TARGET_COMMIT="$(git rev-parse "origin/${BRANCH}")"

if [[ "$CURRENT_COMMIT" != "$TARGET_COMMIT" ]]; then
  log "Updating source code"
  git merge --ff-only "origin/${BRANCH}"
else
  log "Source already at latest commit: ${CURRENT_COMMIT:0:12}"
fi

STAMP="$(date +%F-%H%M%S)"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="${BACKUP_DIR}/substrata-${STAMP}.dump"
TMP_BACKUP_FILE="${BACKUP_FILE}.tmp"

log "Backing up PostgreSQL database"
docker exec substrata-postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' \
  > "$TMP_BACKUP_FILE"

[[ -s "$TMP_BACKUP_FILE" ]] || fail "Database backup was empty"
mv "$TMP_BACKUP_FILE" "$BACKUP_FILE"
printf 'Backup created: %s\n' "$BACKUP_FILE"

log "Building API, migration, and web images"
"${COMPOSE[@]}" build api migrate web

log "Running database migrations"
docker rm -f substrata-migrate >/dev/null 2>&1 || true
"${COMPOSE[@]}" up -d migrate

for ((elapsed=0; elapsed<MIGRATE_TIMEOUT_SECONDS; elapsed+=3)); do
  STATUS="$(docker inspect -f '{{.State.Status}}' substrata-migrate 2>/dev/null || true)"

  if [[ "$STATUS" == "exited" ]]; then
    EXIT_CODE="$(docker inspect -f '{{.State.ExitCode}}' substrata-migrate)"
    [[ "$EXIT_CODE" == "0" ]] || fail "Migration container exited with code ${EXIT_CODE}"
    break
  fi

  sleep 3
done

[[ "${STATUS:-}" == "exited" ]] || fail "Migration timed out after ${MIGRATE_TIMEOUT_SECONDS}s"

log "Recreating API and web containers"
"${COMPOSE[@]}" up -d --no-deps --force-recreate api web

log "Waiting for API health check"
for ((elapsed=0; elapsed<HEALTH_TIMEOUT_SECONDS; elapsed+=3)); do
  if curl -fsS "$API_URL" >/dev/null; then
    break
  fi
  sleep 3
done

curl -fsS "$API_URL" || fail "API health check failed"

log "Checking web application"
WEB_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' "$WEB_URL")"
[[ "$WEB_STATUS" == "200" ]] || fail "Web health check returned HTTP ${WEB_STATUS}"

log "Deployment complete"
printf 'Commit: %s\n' "$(git rev-parse --short HEAD)"
printf 'Database backup: %s\n' "$BACKUP_FILE"
printf 'API: healthy\n'
printf 'Web: HTTP %s\n' "$WEB_STATUS"

"${COMPOSE[@]}" ps
