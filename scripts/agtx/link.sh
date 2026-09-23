#!/usr/bin/env bash
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
mkdir -p "$root/.agtx/plugins"
ln -sfn ../tooling/agtx/config.toml "$root/.agtx/config.toml"
for name in egemed egemed-terse; do
 ln -sfn "../../tooling/agtx/plugins/$name" "$root/.agtx/plugins/$name"
done
