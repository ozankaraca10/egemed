#!/usr/bin/env bash
set -euo pipefail
[[ $# -ge 3 ]] || { echo "usage: $0 task phase cli [tokens] [cost]" >&2; exit 2; }
file=docs/agentic/maliyet.csv
mkdir -p "$(dirname "$file")"
[[ -f "$file" ]] || echo 'timestamp,task_id,phase,cli,tokens,cost' > "$file"
python3 - "$file" "$@" <<'PYCSV'
import csv,datetime,sys
with open(sys.argv[1],'a',newline='') as f: csv.writer(f).writerow([datetime.datetime.now(datetime.timezone.utc).isoformat(),*sys.argv[2:7]])
PYCSV
