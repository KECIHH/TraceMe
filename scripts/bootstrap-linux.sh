#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${TRACEME_REPO:-https://github.com/KECIHH/TraceMe.git}"
BRANCH="${TRACEME_BRANCH:-main}"
INSTALL_DIR="${TRACEME_DIR:-$HOME/traceme}"
TRACEME_PORT="${TRACEME_PORT:-3000}"
TRACEME_BIND="${TRACEME_BIND:-127.0.0.1}"
APP_BASE_URL="${APP_BASE_URL:-}"
ADMIN_USERNAME="${INITIAL_ADMIN_USERNAME:-admin}"
SEED_EXAMPLE_TRIP="${SEED_EXAMPLE_TRIP:-true}"
BUILD_RETRIES="${TRACEME_BUILD_RETRIES:-3}"
BUILD_ATTEMPT_TIMEOUT="${TRACEME_BUILD_ATTEMPT_TIMEOUT:-1200}"
NPM_CONFIG_REGISTRY="${NPM_CONFIG_REGISTRY:-https://registry.npmmirror.com}"
ALPINE_REPOSITORY_MIRROR="${ALPINE_REPOSITORY_MIRROR:-https://mirrors.aliyun.com/alpine}"
BUILD_NODE_OPTIONS="${BUILD_NODE_OPTIONS:---max-old-space-size=1024}"
SWAP_FILE="${TRACEME_SWAP_FILE:-/swapfile.traceme}"
SWAP_SIZE_GB="${TRACEME_SWAP_SIZE_GB:-4}"
MIN_SWAP_MB="${TRACEME_MIN_SWAP_MB:-2048}"
SKIP_SWAP="${TRACEME_SKIP_SWAP:-false}"
TRACEME_IMAGE="${TRACEME_IMAGE:-ghcr.io/kecihh/traceme:main}"
USE_LOCAL_BUILD="${TRACEME_USE_LOCAL_BUILD:-false}"

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

show_build_network_help() {
  cat >&2 <<'EOF_HELP'

Docker build failed. If the error mentions "short read", "unexpected EOF",
"TLS handshake timeout", or a very slow node:lts-alpine download, the server
probably cannot download Docker Hub layers reliably.

Try one of these on the server, then rerun the same TraceMe install command:

  cd /root/traceme
  docker builder prune -f
  docker image rm node:lts-alpine || true
  docker compose up -d --build

On Alibaba Cloud, also consider configuring a Docker registry mirror in
/etc/docker/daemon.json, then restart Docker:

  sudo systemctl restart docker

EOF_HELP
}

ensure_swap() {
  if [ "$SKIP_SWAP" = "true" ]; then
    echo "Skipping swap setup because TRACEME_SKIP_SWAP=true."
    return
  fi

  if [ "$(id -u)" -ne 0 ]; then
    echo "Not running as root; skipping automatic swap setup."
    return
  fi

  local swap_total_mb
  swap_total_mb="$(awk '/SwapTotal/ {print int($2 / 1024)}' /proc/meminfo)"
  if [ "$swap_total_mb" -ge "$MIN_SWAP_MB" ]; then
    echo "Swap is already available: ${swap_total_mb} MB."
    return
  fi

  echo "Creating ${SWAP_SIZE_GB}GB swap at ${SWAP_FILE} to avoid build-time memory exhaustion ..."
  if [ ! -f "$SWAP_FILE" ]; then
    if command -v fallocate >/dev/null 2>&1; then
      fallocate -l "${SWAP_SIZE_GB}G" "$SWAP_FILE"
    else
      dd if=/dev/zero of="$SWAP_FILE" bs=1M count="$((SWAP_SIZE_GB * 1024))" status=progress
    fi
    chmod 600 "$SWAP_FILE"
    mkswap "$SWAP_FILE" >/dev/null
  fi

  if ! swapon --show=NAME | grep -qx "$SWAP_FILE"; then
    swapon "$SWAP_FILE"
  fi

  if ! grep -q "^${SWAP_FILE} " /etc/fstab; then
    printf '%s none swap sw 0 0\n' "$SWAP_FILE" >>/etc/fstab
  fi

  echo "Swap is ready:"
  swapon --show
}

build_local_and_start() {
  ensure_swap

  for attempt in $(seq 1 "$BUILD_RETRIES"); do
    echo "Docker build/start attempt ${attempt}/${BUILD_RETRIES} ..."

    if docker pull node:lts-alpine >/dev/null 2>&1 \
      && DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 timeout "$BUILD_ATTEMPT_TIMEOUT" docker compose build travel-planner \
      && docker compose up -d; then
      return
    fi

    if [ "$attempt" -lt "$BUILD_RETRIES" ]; then
      echo "Build failed, retrying after a short pause ..."
      docker image rm node:lts-alpine >/dev/null 2>&1 || true
      sleep 5
    fi
  done

  show_build_network_help
  exit 1
}

pull_and_start() {
  echo "Pulling prebuilt TraceMe image: ${TRACEME_IMAGE}"

  if docker pull "$TRACEME_IMAGE"; then
    docker compose up -d --no-build
    return
  fi

  cat >&2 <<EOF_PULL

Could not pull the prebuilt image: ${TRACEME_IMAGE}

This usually means the GitHub Actions image build has not finished yet, or the
GHCR package is not public. Wait a few minutes and rerun this command:

  cd "$INSTALL_DIR" && bash scripts/bootstrap-linux.sh

If you intentionally want to build on this server, run:

  TRACEME_USE_LOCAL_BUILD=true bash scripts/bootstrap-linux.sh

EOF_PULL
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

ensure_env_value() {
  local key="$1"
  local value="$2"
  local env_file="$3"

  if [ -z "$value" ] || grep -q "^${key}=" "$env_file"; then
    return
  fi

  printf '%s="%s"\n' "$key" "$value" >>"$env_file"
}

set_env_value() {
  local key="$1"
  local value="$2"
  local env_file="$3"

  if grep -q "^${key}=" "$env_file"; then
    local escaped_value
    escaped_value="$(printf '%s' "$value" | sed 's/[&|\\]/\\&/g')"
    sed -i "s|^${key}=.*|${key}=\"${escaped_value}\"|" "$env_file"
    return
  fi

  printf '%s="%s"\n' "$key" "$value" >>"$env_file"
}

is_valid_app_base_url() {
  local value="$1"

  case "$value" in
    https://*) return 0 ;;
    http://localhost:*|http://127.0.0.1:*|http://[::1]:*) return 0 ;;
    http://[0-9]*.[0-9]*.[0-9]*.[0-9]*:*) return 0 ;;
    http://\[*:*) return 0 ;;
    *) return 1 ;;
  esac
}

ensure_app_base_url_ready() {
  local env_file="$1"
  local saved_app_base_url

  if [ -n "$APP_BASE_URL" ]; then
    set_env_value "APP_BASE_URL" "$APP_BASE_URL" "$env_file"
    echo "Updated APP_BASE_URL in $env_file."
    return
  fi

  saved_app_base_url="$(read_env_value APP_BASE_URL "$env_file" || true)"
  if is_valid_app_base_url "$saved_app_base_url"; then
    APP_BASE_URL="$saved_app_base_url"
    return
  fi

  cat >&2 <<EOF_APP_BASE_URL
Invalid APP_BASE_URL in $INSTALL_DIR/.env: ${saved_app_base_url:-<empty>}

Domain access must use HTTPS. Re-run with your HTTPS domain, for example:

  APP_BASE_URL=https://travel.example.com bash scripts/bootstrap-linux.sh

For temporary IP testing before the domain is ready, use:

  APP_BASE_URL=http://YOUR_SERVER_IP:${TRACEME_PORT} bash scripts/bootstrap-linux.sh

For a local smoke test, use:

  APP_BASE_URL=http://127.0.0.1:${TRACEME_PORT} bash scripts/bootstrap-linux.sh

EOF_APP_BASE_URL
  exit 1
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
TRACEME_IMAGE="${TRACEME_IMAGE}"
NPM_CONFIG_REGISTRY="${NPM_CONFIG_REGISTRY}"
ALPINE_REPOSITORY_MIRROR="${ALPINE_REPOSITORY_MIRROR}"
BUILD_NODE_OPTIONS="${BUILD_NODE_OPTIONS}"

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

if [ -z "$APP_BASE_URL" ] && [ ! -f "$INSTALL_DIR/.env" ]; then
  echo "APP_BASE_URL is required for production installs. Example:" >&2
  echo "  APP_BASE_URL=https://travel.example.com bash scripts/bootstrap-linux.sh" >&2
  exit 1
fi

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

ensure_app_base_url_ready ".env"
ensure_env_value "NPM_CONFIG_REGISTRY" "$NPM_CONFIG_REGISTRY" ".env"
ensure_env_value "ALPINE_REPOSITORY_MIRROR" "$ALPINE_REPOSITORY_MIRROR" ".env"
ensure_env_value "BUILD_NODE_OPTIONS" "$BUILD_NODE_OPTIONS" ".env"
ensure_env_value "TRACEME_IMAGE" "$TRACEME_IMAGE" ".env"

echo "Starting TraceMe ..."
if [ "$USE_LOCAL_BUILD" = "true" ]; then
  build_local_and_start
else
  pull_and_start
fi

wait_for_health

echo "Running initial admin seed ..."
docker_compose run --rm seed-admin

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
