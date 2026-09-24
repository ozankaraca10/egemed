---
name: agtx-review
description: EGEMED review fazı
---

Görevi AGTX MCP get_task ile al. `git diff dev...HEAD`, plan.md ve summary.md dosyalarını oku. Kod değiştirme. review.md ilk satırı `VERDICT: APPROVE` veya `VERDICT: CHANGES` olsun. Bulguları dosya:satır ile numarala. Kontrol: plan kapsamı, test kapıları ve mobil 360/768/1440, sözleşmeler, token/i18n/zaman, WCAG, simülatör izolasyonu, sır/gerçek veri/bağımlılık/girdi doğrulama, davranış testleri, diff boyutu.
