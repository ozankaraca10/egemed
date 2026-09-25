#!/usr/bin/env bash
# API-02 kabulü (Astra 2026-09-24): üretim imajı temiz checkout'tan derlenir ve çalışır.
# Denetlenen: non-root kullanıcı, migration, /health ve /health/db 200, üretimde
# AUTH_DEV_ENABLED=true reddi. Geçici ağ/konteyner/imaj sonunda temizlenir.
# Kullanım: scripts/ops/verify-prod-image.sh   (depo kökünde; docker gerekir)
set -euo pipefail

TAG="egemed-api:verify-$$"
NET="egemed-verify-$$"
PG="egemed-verify-pg-$$"
API="egemed-verify-api-$$"
PORT="${VERIFY_PORT:-3199}"
CTX="$(mktemp -d)"
# Doğrulama için geçici değerler; sır değildir ve yalnız bu geçici konteynerde kullanılır.
PGUSER_TMP="egemed_verify"
PGPASS_TMP="verify-gecici"

cleanup() {
  docker rm -f "$API" "$PG" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  docker rmi "$TAG" >/dev/null 2>&1 || true
  rm -rf "$CTX"
}
trap cleanup EXIT

echo "1) Temiz bağlam (git archive, node_modules yok) ve imaj derleme"
git archive HEAD | tar -x -C "$CTX"
docker build -q -f "$CTX/infra/prod/Dockerfile" -t "$TAG" "$CTX" >/dev/null

echo "2) Non-root kullanıcı"
uid="$(docker run --rm "$TAG" id -u)"
[ "$uid" != "0" ] || { echo "HATA: imaj root olarak çalışıyor"; exit 1; }

echo "3) Geçici PostgreSQL ve migration"
docker network create "$NET" >/dev/null
docker run -d --name "$PG" --network "$NET" -e POSTGRES_USER="$PGUSER_TMP" -e POSTGRES_PASSWORD="$PGPASS_TMP" -e POSTGRES_DB="$PGUSER_TMP" postgres:18.4-alpine >/dev/null
for _ in $(seq 1 60); do docker exec "$PG" pg_isready -U "$PGUSER_TMP" >/dev/null 2>&1 && break; sleep 1; done
URL="postgres://${PGUSER_TMP}:${PGPASS_TMP}@${PG}:5432/${PGUSER_TMP}"
docker run --rm --network "$NET" -e DATABASE_URL="$URL" "$TAG" node_modules/.bin/node-pg-migrate up --migrations-dir migrations >/dev/null

echo "4) Sağlık uçları"
docker run -d --name "$API" --network "$NET" -p "127.0.0.1:${PORT}:3000" -e DATABASE_URL="$URL" -e NODE_ENV=production "$TAG" >/dev/null
for _ in $(seq 1 30); do curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 && break; sleep 1; done
[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/health")" = "200" ] || { echo "HATA: /health"; exit 1; }
[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/health/db")" = "200" ] || { echo "HATA: /health/db"; exit 1; }

echo "5) Üretimde geliştirme girişi reddedilir"
if docker run --rm -e DATABASE_URL="$URL" -e NODE_ENV=production -e AUTH_DEV_ENABLED=true "$TAG" >/dev/null 2>&1; then
  echo "HATA: NODE_ENV=production ile AUTH_DEV_ENABLED=true kabul edildi"; exit 1
fi

echo "TAMAM: üretim imajı doğrulandı ($(docker images "$TAG" --format '{{.Size}}'))."
