#!/usr/bin/env bash
set -euo pipefail
mkdir -p .egemed-run
if [[ ! -e .env.local && -f .env.example ]]; then cp .env.example .env.local; fi
pnpm install --frozen-lockfile --prefer-offline
