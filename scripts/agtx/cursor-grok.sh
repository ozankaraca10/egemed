#!/usr/bin/env bash
set -euo pipefail
# Grok 4.7 uses high effort by default in Cursor. Use inside a selected task worktree.
exec agent --model grok-4.7 "$@"
