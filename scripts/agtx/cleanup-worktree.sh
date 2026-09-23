#!/usr/bin/env bash
set -euo pipefail
if [[ -f infra/docker-compose.dev.yml ]] && command -v docker >/dev/null; then
 # down'u compose dosyası ve env dosyası OLMADAN, yalnız proje adıyla çağır:
 # compose v2 konteynerleri etiketlerinden bulur, ${VAR:?} interpolasyonu
 # gerekmez (init-worktree.sh'in boş .env.local'i down'u kırardı).
 docker compose -p "egemed-${AGTX_TASK_ID:-local}" down --remove-orphans
fi
