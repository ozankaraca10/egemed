#!/bin/zsh
# merge-gated.sh <worktree> "<commit mesajı>" <yol...> — kapılar 100% yeşilse commit + dev'e merge; değilse durur.
set -u
G=/Applications/Xcode.app/Contents/Developer/usr/bin/git; R=~/Documents/Codex/2026-09-23/egemed-clinical-learning-experience-platform-clix
wt=$1; msg=$2; shift 2
cd $R/.agtx/worktrees/$wt || exit 1
export PATH=~/.npm-global/bin:$PATH; export FORCE_COLOR=0 NO_COLOR=1
OUT=$(pnpm turbo lint typecheck test --force 2>&1)
line=$(echo "$OUT" | grep -E "Tasks: +[0-9]+ successful, [0-9]+ total")
echo "$line"; echo "$OUT" | grep -E "Tests +[0-9]"
ok=$(echo "$line" | awk '{ if ($2==$4) print "yes" }')
[[ $ok != yes ]] && { echo "KAPI KIRMIZI — merge YOK"; echo "$OUT" | grep -E "error|FAIL" | head -8; exit 2; }
$G diff --check || { echo "diff --check hata"; exit 3; }
$G add -A "$@"; $G diff --quiet pnpm-lock.yaml 2>/dev/null || $G add pnpm-lock.yaml; $G commit -q -m "$msg" || true
before=$($G -C $R rev-parse HEAD)
$G -C $R merge -q --no-ff --no-edit task/$wt || { $G -C $R merge --abort; echo "ÇAKIŞMA — merge iptal ($wt)"; exit 5; }
# Birleşik sonuç kapısı (dev üzerinde)
POST=$(cd $R && pnpm i --frozen-lockfile >/dev/null 2>&1; pnpm turbo lint typecheck test 2>&1 | grep -E "Tasks: +[0-9]+ successful, [0-9]+ total")
pok=$(echo "$POST" | awk '{ if ($2==$4) print "yes" }')
if [[ $pok != yes ]]; then $G -C $R reset -q --hard $before; echo "BİRLEŞİK KAPI KIRMIZI ($POST) — dev geri alındı, $wt merge EDİLMEDİ"; exit 6; fi
if echo "$*" | grep -qE "apps/shell|packages/sim-|packages/ui|e2e"; then
  e2efail(){ for p in 5297 5298 5299; do lsof -ti tcp:$p | xargs kill 2>/dev/null; done; (cd $R && EGEMED_E2E_API_URL=http://127.0.0.1:9 E2E_PORT_BASE=5297 CI=true pnpm e2e:mobile --reporter=line 2>&1 | grep -oE "[0-9]+ failed" | grep -oE "[0-9]+" | tail -1); }
  after=$(e2efail); after=${after:-0}
  base=$(cat $R/.agtx/e2e-baseline 2>/dev/null || echo 0)
  if (( after > base )); then $G -C $R reset -q --hard $before; echo "E2E YENİ KIRMIZI (önce $base, sonra $after) — dev geri alındı, $wt merge EDİLMEDİ"; exit 7; fi
  echo $after > $R/.agtx/e2e-baseline
  POST="$POST | e2e failed: $after (taban $base)"
fi
echo "MERGED $wt ($POST)"
