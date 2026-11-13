#!/bin/sh
# Judge26 installer: sets up (or upgrades) a complete installation on a fresh Linux host.
# See docs/operations/deployment.md.
#
#   curl -fsSL https://raw.githubusercontent.com/JesseB0rn/Judge26/main/scripts/install.sh | sudo sh
#
# Settings are read from the environment (pass them to sh, e.g. `| sudo DOMAIN=judge.example.org sh`)
# or asked for when a terminal is available:
#
#   DOMAIN             DNS name of this host: HTTPS with Caddy. Empty: plain HTTP on JUDGE26_PORT.
#                      Also on a later run: switches an installation to (or, with DOMAIN=, from)
#                      HTTPS. Put it after sudo (`| sudo DOMAIN=… sh`): sudo drops variables set
#                      before curl.
#   ACME_EMAIL         Contact address for the Let's Encrypt certificates (optional).
#   SUPERUSER_EMAIL    Superuser for the dashboard (/_/). Its password is generated.
#   JUDGE26_VERSION    Release to install, e.g. 1.0.0. Default: the latest release.
#   JUDGE26_DIR        Installation directory. Default: /opt/judge26.
#   JUDGE26_PORT       HTTP port without a DOMAIN. Default: 8090.
#   INSTALL_DOCKER     0: never install Docker (fail if it is missing). Default: 1.
#   NONINTERACTIVE     1: never ask, use the environment and defaults only.
#
# Running it again upgrades: the compose files are replaced by those of the new release, .env is
# kept (only the image version changes) and the data volume is untouched.
#
# Email with OAuth for Microsoft 365 (M9-D): set SMTP_AUTH=oauth2 and the SMTP_OAUTH_* values in
# .env, then run this script again: it enables the mail relay (COMPOSE_PROFILES=mail-oauth).
#
# For tests: JUDGE26_SOURCE (base URL or local directory holding the repository files),
# JUDGE26_IMAGE and JUDGE26_MAIL_RELAY_IMAGE (images to run instead of the release images).

set -eu

REPO=JesseB0rn/Judge26
IMAGE_REPO=ghcr.io/jesseb0rn/judge26
MAIL_RELAY_IMAGE_REPO=ghcr.io/jesseb0rn/judge26-mail-relay

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33mwarning:\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[31merror:\033[0m %s\n' "$*" >&2
  exit 1
}
has() { command -v "$1" >/dev/null 2>&1; }

fetch() { # fetch <url> <file>
  if has curl; then
    curl -fsSL --retry 3 -o "$2" "$1"
  else
    wget -q -O "$2" "$1"
  fi
}

fetch_stdout() {
  if has curl; then curl -fsSL --retry 3 "$1"; else wget -q -O - "$1"; fi
}

# Asking works even when the script itself arrives on stdin (curl | sh).
can_ask() { [ "${NONINTERACTIVE:-0}" != 1 ] && (: </dev/tty) 2>/dev/null; }

ask() { # ask <variable> <question> <default>
  eval "current=\${$1:-}"
  if [ -z "$current" ] && can_ask; then
    printf '%s [%s]: ' "$2" "$3" >/dev/tty
    read -r answer </dev/tty || answer=
    current=${answer:-$3}
  fi
  [ -n "$current" ] || current=$3
  eval "$1=\$current"
}

random() { # random <length>
  LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1"
}

set_env() { # set_env <key> <value>: replace the key in .env or append it
  if grep -q "^$1=" .env; then
    escaped=$(printf '%s' "$2" | sed 's/[\\|&]/\\&/g')
    sed "s|^$1=.*|$1=$escaped|" .env >.env.tmp && cat .env.tmp >.env && rm -f .env.tmp
  else
    printf '%s=%s\n' "$1" "$2" >>.env
  fi
}

get_env() { sed -n "s/^$1=//p" .env | tail -n 1; }

latest_version() {
  fetch_stdout "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null |
    sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -n 1
}

install_docker() {
  if has docker && docker compose version >/dev/null 2>&1; then
    return
  fi
  [ "${INSTALL_DOCKER:-1}" = 1 ] || die "Docker with the Compose plugin is required (INSTALL_DOCKER=0)."
  say "Installing Docker (get.docker.com)"
  fetch https://get.docker.com /tmp/judge26-get-docker.sh
  sh /tmp/judge26-get-docker.sh
  rm -f /tmp/judge26-get-docker.sh
  if has systemctl; then systemctl enable --now docker >/dev/null 2>&1 || true; fi
  docker compose version >/dev/null 2>&1 || die "Docker was installed but 'docker compose' does not work."
}

download_files() { # download_files <version>
  source=${JUDGE26_SOURCE:-https://raw.githubusercontent.com/$REPO/v$1}
  mkdir -p docker
  for file in docker-compose.yml docker-compose.caddy.yml docker/Caddyfile .env.example; do
    case $source in
      http://* | https://*) fetch "$source/$file" "$file.new" || die "Could not download $source/$file" ;;
      *) cp "$source/$file" "$file.new" || die "Could not copy $source/$file" ;;
    esac
    mv "$file.new" "$file"
  done
}

# Best effort: a backup (in the app's backup list, pb_data/backups) before migrations of a new
# version run, so an upgrade can be rolled back with the restore runbook.
backup_before_upgrade() { # backup_before_upgrade <name>
  docker compose ps --status running --services 2>/dev/null | grep -qx app || return 0
  email=$(get_env PB_SUPERUSER_EMAIL)
  password=$(get_env PB_SUPERUSER_PASSWORD)
  [ -n "$email" ] && [ -n "$password" ] || {
    warn "No superuser in .env: no backup taken before the upgrade."
    return 0
  }
  api=http://127.0.0.1:8090/api
  token=$(docker compose exec -T app wget -qO- --header 'Content-Type: application/json' \
    --post-data "{\"identity\":\"$email\",\"password\":\"$password\"}" \
    "$api/collections/_superusers/auth-with-password" 2>/dev/null |
    sed -n 's/.*"token":"\([^"]*\)".*/\1/p') || true
  if [ -n "$token" ] && docker compose exec -T app wget -qO- --header "Authorization: $token" \
    --header 'Content-Type: application/json' --post-data "{\"name\":\"$1\"}" \
    "$api/backups" >/dev/null 2>&1; then
    say "Backup $1 created (Dashboard → Settings → Backups)"
  else
    warn "Could not create a backup before the upgrade; take one now if the data matters."
    if can_ask; then
      printf 'Continue anyway? [y/N]: ' >/dev/tty
      read -r answer </dev/tty || answer=
      case $answer in y | Y | yes) ;; *) die "Aborted, nothing was changed." ;; esac
    fi
  fi
}

# The mode follows DOMAIN in .env on every run, so the compose files always match it: HTTPS with
# Caddy when a domain is set, plain HTTP otherwise.
configure_mode() { # configure_mode <domain given on this run: 1 or empty>
  if [ -n "$1" ]; then
    set_env DOMAIN "$DOMAIN"
    [ -z "${ACME_EMAIL:-}" ] || set_env ACME_EMAIL "$ACME_EMAIL"
    if [ -n "$DOMAIN" ]; then
      set_env APP_URL "https://$DOMAIN"
    else
      set_env APP_URL "http://$(public_address):$(get_env JUDGE26_PORT)"
    fi
  fi
  domain=$(get_env DOMAIN)
  if [ -n "$domain" ]; then
    set_env COMPOSE_FILE docker-compose.yml:docker-compose.caddy.yml
    say "Mode: HTTPS with Caddy for $domain (DNS must point here, ports 80 and 443 open)"
  else
    set_env COMPOSE_FILE docker-compose.yml
    say "Mode: plain HTTP on port $(get_env JUDGE26_PORT), no Caddy (no DOMAIN set)"
  fi
}

# The mail relay (M9-D) runs exactly when .env asks for OAuth email.
configure_mail() {
  if [ "$(get_env SMTP_AUTH)" = oauth2 ]; then
    set_env COMPOSE_PROFILES mail-oauth
    say "Email: OAuth 2.0 through the mail relay (SMTP_OAUTH_* in .env)"
  else
    set_env COMPOSE_PROFILES ''
  fi
}

public_address() {
  address=$(hostname -I 2>/dev/null | awk '{print $1}') || true
  echo "${address:-localhost}"
}

main() {
  [ "$(uname -s)" = Linux ] || die "Judge26 is installed on Linux hosts."
  [ "$(id -u)" = 0 ] || die "Run as root, e.g. curl -fsSL … | sudo sh"
  has curl || has wget || die "curl or wget is required."

  dir=${JUDGE26_DIR:-/opt/judge26}
  domain_given=${DOMAIN+1}
  version=${JUDGE26_VERSION:-}
  if [ -z "$version" ]; then
    version=$(latest_version)
    [ -n "$version" ] || die "Could not determine the latest release; set JUDGE26_VERSION."
  fi
  version=${version#v}
  image=${JUDGE26_IMAGE:-$IMAGE_REPO:$version}
  relay_image=${JUDGE26_MAIL_RELAY_IMAGE:-$MAIL_RELAY_IMAGE_REPO:$version}

  mkdir -p "$dir"
  cd "$dir"
  fresh=1
  [ -f .env ] && fresh=0

  if [ "$fresh" = 1 ]; then
    say "Installing Judge26 $version in $dir"
    if [ -z "$domain_given" ] && ! can_ask; then
      warn "No DOMAIN given and no terminal to ask: installing with plain HTTP, without Caddy."
      warn "For HTTPS run: curl -fsSL … | sudo DOMAIN=judge.example.org sh"
    fi
    ask DOMAIN "Domain name for HTTPS (empty: plain HTTP on port ${JUDGE26_PORT:-8090})" ""
    domain_given=1
    if [ -n "$DOMAIN" ]; then
      ask ACME_EMAIL "Email for Let's Encrypt (optional)" ""
    fi
    ask SUPERUSER_EMAIL "Superuser email for the dashboard" "${ACME_EMAIL:-admin@${DOMAIN:-judge26.local}}"
  else
    say "Upgrading Judge26 in $dir to $version (.env is kept)"
    previous=$(get_env APP_VERSION)
  fi

  install_docker
  if [ "$fresh" = 0 ]; then
    backup_before_upgrade "pre-upgrade-$(echo "${previous:-unknown}-to-$version" | tr -c 'a-z0-9_\n-' '_')-$(date +%Y%m%d%H%M%S).zip"
  fi
  download_files "$version"

  if [ "$fresh" = 1 ]; then
    umask 077
    cp .env.example .env
    password=$(random 24)
    set_env JUDGE26_PORT "${JUDGE26_PORT:-8090}"
    set_env PB_SUPERUSER_EMAIL "$SUPERUSER_EMAIL"
    set_env PB_SUPERUSER_PASSWORD "$password"
    set_env PB_ENCRYPTION_KEY "$(random 32)"
  fi
  [ -n "$(get_env JUDGE26_PORT)" ] || set_env JUDGE26_PORT 8090
  configure_mode "$domain_given"
  configure_mail
  set_env JUDGE26_IMAGE "$image"
  set_env JUDGE26_MAIL_RELAY_IMAGE "$relay_image"
  set_env APP_VERSION "$version"
  chmod 600 .env

  # COMPOSE_FILE in .env selects the files, so plain `docker compose …` works in $dir.
  if [ -n "${JUDGE26_IMAGE:-}" ] && docker image inspect "$image" >/dev/null 2>&1; then
    say "Using local image $image"
  else
    say "Pulling $image"
    docker compose pull --quiet app ||
      die "Could not pull $image. Is the version right (JUDGE26_VERSION) and the package public?"
  fi
  if [ -n "$(get_env COMPOSE_PROFILES)" ] && ! docker image inspect "$relay_image" >/dev/null 2>&1; then
    say "Pulling $relay_image"
    docker compose pull --quiet mail-relay ||
      die "Could not pull $relay_image (the mail relay exists from the release that added M9-D on)."
  fi
  say "Starting (migrations run on start)"
  docker compose up -d --no-build --remove-orphans --wait --wait-timeout 180 ||
    die "Judge26 did not become healthy. Logs: cd $dir && docker compose logs app"

  app_url=$(get_env APP_URL)
  echo
  say "Judge26 $version is running at $app_url"
  if [ "$fresh" = 1 ]; then
    cat <<EOF

  Dashboard   $app_url/_/
  Superuser   $SUPERUSER_EMAIL
  Password    $password
              (also in $dir/.env; keep PB_ENCRYPTION_KEY there unchanged and backed up)

Next steps (docs/operations/deployment.md):
  1. Sign in to the dashboard, check Settings; configure SMTP in $dir/.env for emails
     (Microsoft 365 with OAuth: SMTP_AUTH=oauth2, then run this script again).
  2. Register an account in the app, then give it the admin role in the dashboard:
     collection role_assignments, role "admin", no event.
  3. After editing .env: cd $dir && docker compose up -d

EOF
  else
    echo "  Upgraded from ${previous:-an unknown version}. To roll back: run this script with"
    echo "  JUDGE26_VERSION=${previous:-<previous version>}, then restore the pre-upgrade backup"
    echo "  (docs/operations/backup-and-restore.md), because the new migrations already ran."
  fi
  echo "Operate it from $dir: docker compose ps | logs -f app | restart app"
}

# Everything runs from main, so a partly downloaded script does nothing.
main "$@"
