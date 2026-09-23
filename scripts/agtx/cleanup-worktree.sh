#!/usr/bin/env bash
set -euo pipefail
if [[ -f infra/docker-compose.dev.yml ]] && command -v docker >/dev/null; then
 docker compose -p "egemed-${AGTX_TASK_ID:-local}" -f infra/docker-compose.dev.yml down --remove-orphans
fi
