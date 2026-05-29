#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${TRACEME_REPO:-https://github.com/KECIHH/TraceMe.git}"
BRANCH="${TRACEME_BRANCH:-main}"
INSTALL_DIR="${TRACEME_DIR:-$HOME/traceme}"
TRACEME_PORT="${TRACEME_PORT:-3000}"
TRACEME_BIND="${TRACEME_BIND:-127.0.0.1}"
APP_BASE_URL="${APP_BASE_URL:-http://127.0.0.1:${TRACEME_PORT}}"
ADMIN_USERNAME="${INITIAL_ADMIN_USERNAME:-admin}"
SEED_EXAMPLE_TRIP="${SEED_EXAMPLE_TRIP:-true}"

need_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

docker_compose() {
  docker compose "$@"
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 "$1" | tr -d '\n'
    return
  fi

  head -c "$1" /dev/urandom | base64 | tr -d '\n'
}

random_password() {
  local password=""

  while [ "${#password}" -lt 20 ]; do
    password="${password}$(random_secret 48 | tr -dc 'A-Za-z0-9')"
  done

  printf "%s" "${password:0:20}"
}

wait_for_health() {
  echo "Waiting for TraceMe to become healthy ..."
  for _ in $(seq 1 60); do
    if docker_compose exec -T travel-planner node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
      return
    fi

    sleep 2
  done

  echo "TraceMe did not become healthy in time. Showing recent logs:" >&2
  docker_compose logs --tail=80 travel-planner >&2
  exit 1
}

read_env_value() {
  local key="$1"
  local env_file="$2"

  if [ ! -f "$env_file" ]; then
    return
  fi

  awk -F= -v key="$key" '
    $1 == key {
      value = substr($0, index($0, "=") + 1)
      gsub(/^"/, "", value)
      gsub(/"$/, "", value)
      print value
      exit
    }
  ' "$env_file"
}

write_env_file() {
  local env_file="$1"
  local session_secret="$2"
  local admin_password="$3"

  cat >"$env_file" <<EOF_ENV
DATABASE_URL="file:./dev.db"
APP_BASE_URL="${APP_BASE_URL}"
SESSION_SECRET="${session_secret}"
INITIAL_ADMIN_USERNAME="${ADMIN_USERNAME}"
INITIAL_ADMIN_PASSWORD="${admin_password}"
TRACEME_BIND="${TRACEME_BIND}"
TRACEME_PORT="${TRACEME_PORT}"

# Optional
OPENAI_API_KEY="${OPENAI_API_KEY:-}"
OPENAI_MODEL="${OPENAI_MODEL:-gpt-4.1-mini}"
AI_PROVIDER="${AI_PROVIDER:-openai}"
AI_FEATURE_ENABLED="${AI_FEATURE_ENABLED:-true}"
DOCUMENT_ENCRYPTION_KEY="${DOCUMENT_ENCRYPTION_KEY:-}"
SEED_EXAMPLE_TRIP="${SEED_EXAMPLE_TRIP}"
EOF_ENV
}

need_command git
need_command docker

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required. Install Docker Desktop or the docker compose plugin first." >&2
  exit 1
fi

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "Updating TraceMe in $INSTALL_DIR ..."
  git -C "$INSTALL_DIR" fetch origin "$BRANCH"
  git -C "$INSTALL_DIR" checkout "$BRANCH"
  git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
else
  echo "Cloning TraceMe into $INSTALL_DIR ..."
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

generated_password=""
if [ ! -f .env ]; then
  generated_password="$(random_password)"
  write_env_file ".env" "$(random_secret 48)" "$generated_password"
  chmod 600 .env || true
  echo "Created .env with a generated admin password."
else
  echo "Using existing .env."
fi

echo "Building and starting TraceMe ..."
docker_compose up -d --build

wait_for_health

echo "Running initial admin seed ..."
docker_compose exec -T travel-planner node scripts/seed-admin.mjs

saved_app_base_url="$(read_env_value APP_BASE_URL .env || true)"
saved_admin_username="$(read_env_value INITIAL_ADMIN_USERNAME .env || true)"
if [ -n "$saved_app_base_url" ]; then
  APP_BASE_URL="$saved_app_base_url"
fi
if [ -n "$saved_admin_username" ]; then
  ADMIN_USERNAME="$saved_admin_username"
fi

echo
echo "TraceMe is ready."
echo "URL: ${APP_BASE_URL}"
echo "Username: ${ADMIN_USERNAME}"
if [ -n "$generated_password" ]; then
  echo "Password: ${generated_password}"
  echo "The password was also saved in $INSTALL_DIR/.env."
else
  echo "Password: read INITIAL_ADMIN_PASSWORD from $INSTALL_DIR/.env."
fi
echo
echo "Manage it later with:"
echo "  cd \"$INSTALL_DIR\" && docker compose ps"
echo "  cd \"$INSTALL_DIR\" && docker compose logs -f"
