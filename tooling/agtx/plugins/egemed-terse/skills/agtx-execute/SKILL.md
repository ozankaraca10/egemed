---
name: agtx-execute
description: EGEMED CLIX execute fazı
---

Görevi AGTX MCP get_task ile al. plan.md dosyasını oku. Yalnız plandaki dosyaları değiştir. Plan dışı ihtiyaçta summary.md içine `BLOCKED:` yaz ve dur. `scripts/agtx/gates.sh` çalıştır. summary.md içine değişen dosyaları, kapı sonuçlarını ve eksikleri yaz. `feat(<paket>): … [task:<id>]` commit mesajı kullan. Yanıt en fazla 8 satır; ek açıklama yok.
