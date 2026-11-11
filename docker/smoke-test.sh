#!/bin/sh
# Builds the production image, starts it like a fresh deployment and checks it (M7-14).
# Also verifies the container runs unprivileged and that data survives a restart.
#   docker/smoke-test.sh [image-tag]
set -eu
cd "$(dirname "$0")/.."

IMAGE=${1:-judge26:smoke}
NAME=judge26-smoke-$$
PORT=${SMOKE_PORT:-18091}
VERSION=${APP_VERSION:-smoke}
COMMIT=${GIT_COMMIT:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}
export PB_SUPERUSER_EMAIL=smoke@test.local
export PB_SUPERUSER_PASSWORD=smoke-test-password-123

if [ -z "${SKIP_BUILD:-}" ]; then
  docker build --build-arg APP_VERSION="$VERSION" --build-arg GIT_COMMIT="$COMMIT" -t "$IMAGE" .
fi

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; docker volume rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

start() {
  docker run -d --name "$NAME" -p "$PORT:8090" -v "$NAME:/pb/pb_data" \
    -e PB_SUPERUSER_EMAIL -e PB_SUPERUSER_PASSWORD -e APP_URL="http://127.0.0.1:$PORT" "$IMAGE" >/dev/null
  for _ in $(seq 1 60); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' "$NAME")" = healthy ] && return 0
    if wget -qO- "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 || curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  docker logs "$NAME"; echo "container did not become healthy"; exit 1
}

start
uid=$(docker exec "$NAME" sh -c 'ps -o user= -p 1 2>/dev/null || stat -c %U /proc/1')
[ "$uid" = judge26 ] || { echo "PocketBase runs as '$uid', expected judge26"; exit 1; }
echo "  ok    PocketBase runs as $uid"

EXPECT_VERSION="$VERSION" EXPECT_COMMIT="$COMMIT" node scripts/smoke-test.mjs "http://127.0.0.1:$PORT"

# Data persists across a container restart (M7-T11 for the deployment).
TOKEN=$(curl -fs -X POST -H 'Content-Type: application/json' \
  -d "{\"identity\":\"$PB_SUPERUSER_EMAIL\",\"password\":\"$PB_SUPERUSER_PASSWORD\"}" \
  "http://127.0.0.1:$PORT/api/collections/_superusers/auth-with-password" | sed 's/.*"token":"\([^"]*\)".*/\1/')
curl -fs -X POST -H "Authorization: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Smoke Event","season":2026,"status":"draft"}' \
  "http://127.0.0.1:$PORT/api/collections/events/records" >/dev/null
docker restart "$NAME" >/dev/null
start 2>/dev/null || true
sleep 1
for _ in $(seq 1 30); do curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break; sleep 1; done
TOKEN=$(curl -fs -X POST -H 'Content-Type: application/json' \
  -d "{\"identity\":\"$PB_SUPERUSER_EMAIL\",\"password\":\"$PB_SUPERUSER_PASSWORD\"}" \
  "http://127.0.0.1:$PORT/api/collections/_superusers/auth-with-password" | sed 's/.*"token":"\([^"]*\)".*/\1/')
curl -fs -H "Authorization: $TOKEN" "http://127.0.0.1:$PORT/api/collections/events/records?filter=name%3D%27Smoke%20Event%27" | grep -q '"totalItems":1' \
  || { echo "  FAIL  data lost after restart"; exit 1; }
echo "  ok    data survives a container restart"
