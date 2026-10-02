# T318-opaca-redesign

- Tarih: 2026-10-02 21:55
- Commit: T318: Opaca öğrenme modu yeniden tasarımı — hasta kartı sağ çerçeve, konu başına 1–4 klinik öncelikli örnek

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
- Dal: task/T318-opaca-redesign

---

# T318 — Opaca öğrenme modu yeniden tasarımı (Opus 5.5)
- Düzen Pulse/Ausculta zemini: konu rayı · film + örnekler · sağ çerçeve hasta kartı (onaylı maket) + konu bilgisi kartları.
- Örnekler: konu başına 1–4 görüntü, klinik metinli görüntü önce; yoksa klinik metinsiz (17 konu).
- Klinik bağlam: src/data/clinical-context.json (gerçek kayıt çevirisi, kurgu yok); kurgusal öykü/ayırıcı tanı hekim onayına kadar yok.
- Kaldırıldı: öğrenme sekmeleri, film bilgi paneli, "Bu konuda uygulama yap" (Ausculta ile tutarlı; uygulama mod kartından).
- Testler: learn statik render, örnek sınırı/klinik öncelik; e2e startTopicPractice mod kartına, learn-lock ve UAT geri/ileri güncellendi.
- a11y: sim-side odaklanabilir kaydırma bölgesi; rapor tablosu "doğru" rengi green-800 (hover kontrastı).
