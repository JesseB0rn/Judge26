#!/bin/sh
# Container entrypoint (M7-14): see docs/operations/deployment.md.
#
# 1. Data written by older images (which ran as root) is handed over to the unprivileged user.
# 2. With PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD, the superuser is created or its password
#    reset on every start, so a fresh installation needs no manual step.
# 3. PocketBase runs as user judge26 (uid 10001).
set -eu

DATA=/pb/pb_data
RUN_AS=judge26

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA"
  if [ -n "$(find "$DATA" ! -user "$RUN_AS" -print -quit 2>/dev/null)" ]; then
    echo "entrypoint: handing $DATA over to $RUN_AS"
    chown -R "$RUN_AS:$RUN_AS" "$DATA"
  fi
  EXEC="su-exec $RUN_AS"
else
  EXEC=""
fi

if [ -n "${PB_SUPERUSER_EMAIL:-}" ] && [ -n "${PB_SUPERUSER_PASSWORD:-}" ]; then
  $EXEC /pb/pocketbase superuser upsert "$PB_SUPERUSER_EMAIL" "$PB_SUPERUSER_PASSWORD" \
    --dir="$DATA" --migrationsDir=/pb/migrations --hooksDir=/pb/hooks \
    --encryptionEnv=PB_ENCRYPTION_KEY >/dev/null
  echo "entrypoint: superuser $PB_SUPERUSER_EMAIL is set up"
fi

exec $EXEC "$@"
