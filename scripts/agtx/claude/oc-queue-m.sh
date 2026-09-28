#!/bin/zsh
# DeepSeek kuyruğu: her satır "worktree|log|prompt". En fazla 2 eşzamanlı; 5 dk'da 0 bayt kalan iş öldürülüp 1 kez yeniden denenir.
# Kullanım: oc-queue.sh <kuyruk-dosyası>
export PATH=~/.npm-global/bin:$PATH
W=~/Documents/Codex/2026-09-23/egemed-clinical-learning-experience-platform-clix/.agtx/worktrees
Q=$1
MAX=${MAX:-2}

run_one() {
  local wt=$1 log=$2 prompt=$3 attempt=1
  while (( attempt <= 2 )); do
    ( cd $W/$wt && opencode run --model ${OC_MODEL:-opencode-go/deepseek-v4.1-flash} --variant max --format json --auto "$prompt" > .egemed-run/$log 2>&1 < /dev/null ) &
    local pid=$! waited=0
    while kill -0 $pid 2>/dev/null; do
      sleep 15; waited=$((waited+15))
      if (( waited >= 300 )) && [[ ! -s $W/$wt/.egemed-run/$log ]]; then
        echo "$(date +%H:%M) $wt: 5 dk çıktı yok, öldürülüyor (deneme $attempt)"
        pkill -P $pid 2>/dev/null; kill $pid 2>/dev/null; break
      fi
    done
    wait $pid 2>/dev/null
    if [[ -s $W/$wt/.egemed-run/$log ]] && ! { grep -q '"type":"error"' $W/$wt/.egemed-run/$log && [[ ! $W/$wt/.egemed-run/summary.md -nt $W/$wt/.egemed-run/plan.md ]]; }; then echo "$(date +%H:%M) $wt: bitti"; return 0; fi
    echo "$(date +%H:%M) $wt: hata/özet yok (deneme $attempt) — yeniden denenecek"; sleep 30
    attempt=$((attempt+1))
  done
  echo "$(date +%H:%M) $wt: BAŞARISIZ"
}

while IFS='|' read -r wt log prompt; do
  [[ -z $wt || $wt == \#* ]] && continue
  # küresel sınır: sistemde çalışan tüm opencode run süreçleri sayılır (başka kuyruklar dahil)
  while (( $(pgrep -f "opencode run --model" | wc -l) >= MAX )); do sleep 10; done
  echo "$(date +%H:%M) $wt: başladı"
  run_one "$wt" "$log" "$prompt" &
  sleep 20   # başlangıçlar üst üste binmesin (db kilidi)
done < $Q
wait
echo "$(date +%H:%M) KUYRUK BİTTİ"
