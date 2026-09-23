#!/usr/bin/env bash
set -euo pipefail
# Select Cursor's explicit Grok 4.7 High model.
exec agent --model grok-4.7-high "$@"
