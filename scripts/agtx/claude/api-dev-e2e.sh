#!/bin/zsh
# api-dev-e2e.sh <worktree-yolu> [ek playwright argümanları] — geçici DB + 3100 API ile api-dev e2e; sonunda temizler.
set -u
W=$1; shift
export FORCE_COLOR=0
cd $W/apps/api || exit 1
set -a; source ~/Documents/Codex/2026-09-23/egemed-clinical-learning-experience-platform-clix/.env.local >/dev/null 2>&1; set +a
ADMIN_URL="$DATABASE_URL"; DB=egemed_apidev_scratch; export DATABASE_URL="${DATABASE_URL%/*}/$DB"
kill $(lsof -ti tcp:3100) 2>/dev/null; sleep 1
NODE_PATH=$W/apps/api/node_modules node -e 'const pg=require("pg");const c=new pg.Client({connectionString:process.argv[1]});c.connect().then(async()=>{await c.query("drop database if exists '$DB'");await c.query("create database '$DB'");await c.end();})' "$ADMIN_URL" || exit 2
pnpm -s migrate:up >/dev/null 2>&1 && AUTH_DEV_ENABLED=true pnpm -s seed:dev >/dev/null 2>&1 || exit 3
(PORT=3100 AUTH_LOGIN_RATE_MAX=200 AUTH_DEV_ENABLED=true NODE_ENV=development nohup node --import ./ts-register.mjs src/server.ts > /tmp/apidev-api.log 2>&1 &)
for i in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:3100/auth/me && break; sleep 0.5; done
cd $W && E2E_PORT_BASE=5897 CI=true E2E_REQUIRE_API=1 pnpm exec playwright test --project=api-dev --reporter=line "$@" 2>&1 | tail -60
kill $(lsof -ti tcp:3100) 2>/dev/null
NODE_PATH=$W/apps/api/node_modules node -e 'const pg=require("pg");const c=new pg.Client({connectionString:process.argv[1]});c.connect().then(async()=>{await c.query("drop database if exists '$DB'");await c.end();})' "$ADMIN_URL" 2>/dev/null
