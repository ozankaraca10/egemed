#!/usr/bin/env bash
set -euo pipefail
root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
export AGTX_CONFIG_DIR="$root/.agtx/local-config"
export AGTX_DATA_DIR="$root/.agtx/local-data"
export AGTX_NO_UPDATE_CHECK=1
cd "$root"
exec agtx "$@"
