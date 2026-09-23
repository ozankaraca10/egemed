#!/usr/bin/env bash
set -euo pipefail
root="$(dirname "$(git -C "$(dirname "$0")" rev-parse --git-common-dir)")"
export AGTX_CONFIG_DIR="$root/.agtx/local-config"
export AGTX_DATA_DIR="$root/.agtx/local-data"
exec agtx mcp-serve "$root"
