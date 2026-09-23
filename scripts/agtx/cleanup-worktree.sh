#!/usr/bin/env bash
set -euo pipefail
if [[ -f infra/docker-compose.dev.yml ]] && command -v docker >/dev/null; then
 # .env.local varsa --env-file geçir; yoksa compose'daki ${VAR:?} down'u kırar.
 env_file=""; [[ -f .env.local ]] && env_file="--env-file .env.local"
 # shellcheck disable=SC2086 # env_file bilinçli olarak kelimelere ayrılır
 docker compose -p "egemed-${AGTX_TASK_ID:-local}" $env_file -f infra/docker-compose.dev.yml down --remove-orphans
fi
