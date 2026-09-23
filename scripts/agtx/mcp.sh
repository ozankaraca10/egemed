#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
export AGTX_CONFIG_DIR="$root/.agtx/local-config"
export AGTX_DATA_DIR="$root/.agtx/local-data"
exec agtx mcp-serve "$root"
