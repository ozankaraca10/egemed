#!/usr/bin/env bash
set -euo pipefail
mkdir -p .egemed-run
if [[ ! -e .env.local && -f .env.example ]]; then cp .env.example .env.local; fi
if [[ -f pnpm-lock.yaml ]]; then
  pnpm install --frozen-lockfile --prefer-offline
else
  echo "pnpm-lock.yaml henüz yok; T01 bootstrap için install atlandı"
fi
