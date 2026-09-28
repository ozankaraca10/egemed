# T222 — Ausculta: "Sesi kıs / Sesi aç" aç-kapa kaldırılsın (Z1)

Karar (depo sahibi, 28 Eylül 2026): Ausculta'da sesi aç/kapa (mute) özelliğine artık gerek yok; kaldırılacak.

Kapsam: `packages/sim-ausculta/**`, `tests/sim-ausculta/**`, gerekirse `e2e/**` (bu eylemi arayan testler). Başka paket yok.

## Kaldırılacaklar
1. Birleşik sim çubuğu eylemi: `packages/sim-ausculta/src/ui/chrome.tsx` içinde `label: muted ? "Sesi aç" : "Sesi kıs"` eylemi (ve yalnız ona hizmet eden durum/işleyici).
2. Simülasyon araç çubuğundaki aç/kapa düğmesi: `packages/sim-ausculta/src/ui/Toolbar.tsx` `aria-label={muted ? "Sesi aç" : "Sesi kıs"}` düğmesi. **Ses seviyesi kaydırıcısı KALIR.**
3. Artık kullanılmayan `muted` durumu, reducer eylemi (ör. `toggleMute`), depoya yazılan sessiz tercih ve ses motorundaki `setMuted` çağrıları: yalnız aç/kapa için varsa kaldır. Motor arayüzü (`setMuted`) başka yerde (test sahte motorları hariç) kullanılmıyorsa arayüzden de çıkar. Eski kayıtlarda `muted: true` kalmışsa ses KAPALI BAŞLAMAMALI (okuma sırasında yok sayılır) — test et.

## Testler
- Birleşik çubukta "Sesi kıs/aç" eylemi yok; araç çubuğunda aç/kapa düğmesi yok; ses kaydırıcısı var ve çalışıyor.
- Eski `muted: true` kaydıyla açılışta ses sessiz değil.
- Bu eylemi/düğmeyi arayan mevcut birim/e2e testleri güncellenir (ör. `clickSimBarAction(page, "Sesi kıs")`).

## Kabul
`pnpm turbo lint typecheck test` yeşil; Ausculta'ya dokunan e2e spec'leri yeşil (`E2E_PORT_BASE=<5600-5699>`). `.egemed-run/summary.md`. COMMIT/MERGE/PUSH YOK.
