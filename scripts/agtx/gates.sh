#!/usr/bin/env bash
set -euo pipefail
pnpm turbo lint typecheck test
if [[ -n "${EGEMED_E2E_AFFECTED:-}" ]]; then pnpm e2e:mobile; fi
