#!/usr/bin/env bash
set -euo pipefail
# AGTX writes agent MCP files after the project init script. Patch them here.
project_root="$(dirname "$(git rev-parse --git-common-dir)")"
[[ "$PWD" != "$project_root" ]] || { echo "Worktree only" >&2; exit 2; }
python3 - "$project_root" <<'PY'
import json,sys
from pathlib import Path
root=Path(sys.argv[1]); wd=Path.cwd()
env={'AGTX_CONFIG_DIR':str(root/'.agtx/local-config'),'AGTX_DATA_DIR':str(root/'.agtx/local-data')}
server={'command':str(root/'scripts/agtx/mcp.sh'),'args':[],'env':env}
for name in ('.mcp.json','.cursor/mcp.json'):
 p=wd/name;p.parent.mkdir(parents=True,exist_ok=True)
 data=json.loads(p.read_text()) if p.exists() else {}
 data.setdefault('mcpServers',{})['agtx']=server
 p.write_text(json.dumps(data,indent=2)+'\n')
p=wd/'opencode.json';data=json.loads((root/'opencode.json').read_text())
data['mcp']['agtx']={'type':'local','command':[str(root/'scripts/agtx/mcp.sh')],'enabled':True,'environment':env}
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
p=wd/'.codex/config.toml';p.parent.mkdir(parents=True,exist_ok=True)
p.write_text('model = "gpt-6-astra"\napproval_policy = "on-request"\nsandbox_mode = "workspace-write"\n\n[mcp_servers.agtx]\ncommand = "'+str(root/'scripts/agtx/mcp.sh')+'"\nargs = []\n\n[mcp_servers.agtx.env]\nAGTX_CONFIG_DIR = "'+env['AGTX_CONFIG_DIR']+'"\nAGTX_DATA_DIR = "'+env['AGTX_DATA_DIR']+'"\n')
PY
