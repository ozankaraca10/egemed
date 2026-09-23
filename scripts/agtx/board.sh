#!/usr/bin/env bash
set -euo pipefail
root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
export PATH="$root/scripts/agtx/bin:$PATH"
export AGTX_CONFIG_DIR="$root/.agtx/local-config"
export AGTX_DATA_DIR="$root/.agtx/local-data"
export AGTX_NO_UPDATE_CHECK=1
cd "$root"
tmux -L agtx set-environment -g PATH "$PATH" 2>/dev/null || true
exec agtx "$@"
