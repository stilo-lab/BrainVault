#!/bin/sh
set -eu
db_path="${DB_PATH:-${RAILWAY_VOLUME_MOUNT_PATH:-/app/data}/sab.sqlite}"
db_dir="$(dirname "$db_path")"
if [ "$(id -u)" = 0 ]; then
  mkdir -p "$db_dir"
  chown node:node "$db_dir"
  for file in "$db_path" "$db_path-wal" "$db_path-shm" "$db_path.lock"; do
    if [ -f "$file" ]; then chown node:node "$file"; fi
  done
  exec gosu node "$@"
fi
exec "$@"
