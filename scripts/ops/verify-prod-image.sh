#!/usr/bin/env bash
# T132 — temiz checkout'tan üretim imajı: non-root, migration, /health,
# /health/db ve üretimde AUTH_DEV_ENABLED=true reddi. Geçici dizin, ağ,
# konteyner ve imaj sonda silinir. Parola CI-özel sahtedir; sır değildir.
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
tag="${EGEMED_PROD_IMAGE_TAG:-egemed-api:t132}"
suffix="$(date +%s)-$$"
net="egemed-t132-${suffix}"
pg="egemed-t132-pg-${suffix}"
api="egemed-t132-api-${suffix}"
reject="egemed-t132-reject-${suffix}"
ctx=$(mktemp -d "${TMPDIR:-/tmp}/egemed-t132.XXXXXX")

pg_user="egemed_ci"
pg_pass="egemed-ci-sifre"
pg_db="egemed_ci"
pg_image="postgres:18.4-alpine@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15"
# Parola DSN'e gömülmez; pg ve node-pg-migrate eksik parolayı PGPASSWORD'den okur.
db_url="postgres://${pg_user}@${pg}:5432/${pg_db}"

cleanup() {
  docker rm -f "$api" "$reject" "$pg" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
  docker image rm "$tag" >/dev/null 2>&1 || true
  rm -rf "$ctx"
}
trap cleanup EXIT

git -C "$root" archive HEAD | tar -x -C "$ctx"
# Commit öncesi çalışma ağacı da doğrulanır; CI checkout'unda fark boştur.
if ! git -C "$root" diff --quiet HEAD; then
  git -C "$root" diff HEAD | git -C "$ctx" apply --binary
fi

export DOCKER_BUILDKIT=1
docker build -f "$ctx/infra/prod/Dockerfile" -t "$tag" "$ctx"
size=$(docker image inspect "$tag" --format '{{.Size}}')

docker network create "$net" >/dev/null
docker run -d --name "$pg" --network "$net" \
  -e POSTGRES_USER="$pg_user" \
  -e POSTGRES_PASSWORD="$pg_pass" \
  -e POSTGRES_DB="$pg_db" \
  "$pg_image" >/dev/null

for _ in $(seq 1 30); do
  if docker exec "$pg" pg_isready -U "$pg_user" -d "$pg_db" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$pg" pg_isready -U "$pg_user" -d "$pg_db" >/dev/null

docker run --rm --network "$net" \
  -e DATABASE_URL="$db_url" \
  -e PGPASSWORD="$pg_pass" \
  -e NODE_ENV=production \
  "$tag" \
  ./node_modules/.bin/node-pg-migrate up --migrations-dir migrations

docker run -d --name "$api" --network "$net" -p "127.0.0.1::3000" \
  -e DATABASE_URL="$db_url" \
  -e PGPASSWORD="$pg_pass" \
  -e NODE_ENV=production \
  -e AUTH_DEV_ENABLED=false \
  "$tag" >/dev/null

uid=$(docker exec "$api" id -u)
if [[ "$uid" == "0" ]]; then
  echo "API süreci root olarak çalışıyor" >&2
  exit 1
fi

port=$(docker port "$api" 3000/tcp | awk -F: 'NR==1 { print $NF }')
health_ok=0
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
    health_ok=1
    break
  fi
  sleep 1
done
if [[ "$health_ok" != "1" ]]; then
  echo "API /health yanıt vermedi" >&2
  docker logs "$api" >&2 || true
  exit 1
fi

health=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}/health")
health_db=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}/health/db")
if [[ "$health" != "200" || "$health_db" != "200" ]]; then
  echo "/health=${health} /health/db=${health_db}" >&2
  docker logs "$api" >&2 || true
  exit 1
fi

set +e
docker run --name "$reject" --network "$net" \
  -e DATABASE_URL="$db_url" \
  -e PGPASSWORD="$pg_pass" \
  -e NODE_ENV=production \
  -e AUTH_DEV_ENABLED=true \
  "$tag" >"$ctx/reject.log" 2>&1
reject_rc=$?
set -e
if [[ "$reject_rc" -eq 0 ]]; then
  echo "AUTH_DEV_ENABLED=true üretimde kabul edildi" >&2
  exit 1
fi
if ! grep -q "AUTH_DEV_ENABLED" "$ctx/reject.log"; then
  echo "Üretim reddi AUTH_DEV_ENABLED anahtarını bildirmedi" >&2
  cat "$ctx/reject.log" >&2
  exit 1
fi

echo "tag=${tag} size_bytes=${size} uid=${uid} health=${health} health_db=${health_db} auth_dev_rejected=1"
