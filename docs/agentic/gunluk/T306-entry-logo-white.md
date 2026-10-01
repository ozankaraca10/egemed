# T306-entry-logo-white

- Tarih: 2026-10-01 21:57
- Commit: T306: girişte beyaz 3B EGEMED logosu, gölgesiz (DeepSeek; review: Claude)
- Dal: task/T306-entry-logo-white

---

# T306 — Giriş: beyaz 3B EGEMED logosu, gölgesiz (Z1, DeepSeek)

Durum: tamam. Commit/merge yapılmadı (talimat gereği).

## Yapılan değişiklikler
1. `apps/shell/src/EntryPage.tsx:149` — giriş logosu `src="/brand/egemed-logo-3d-white.png"`; `width={900} height={298}` (yeni görselin gerçek piksel boyutu `file` ile doğrulandı: 900×298). `alt={t("shell.brand.full")}` korundu.
2. `apps/shell/src/shell.css:1149-1150` — `.eg-shell-entry__brandLogo` `filter` satırı (hale + gölge) tamamen kaldırıldı; yükseklik `clamp(4.5rem, 6.5vw, 6rem)` aynı kaldı. Yorum "T306: beyaz 3B logo, gölgesiz" olarak güncellendi.
3. `packages/tokens/family-tokens.css:34` — artık kullanılmayan `--logo-halo`, `--logo-halo-soft`, `--logo-drop` token'ları kaldırıldı. Kullanım taraması: yalnız `shell.css` (bu görevde kaldırıldı) ve tarihsel günlük `docs/agentic/gunluk/T305-entry-logo.md` (geçmiş kayıt, dokunulmadı) referans veriyordu.
4. `apps/shell/public/brand/egemed-logo-color.png` silindi (`git rm`); `EntryPage.tsx` ve test dışında referansı yoktu.
5. `tests/shell/entry.test.ts:24-25` — beklenti `src="/brand/egemed-logo-3d-white.png"`; yorum T306 olarak güncellendi.

## Kabul doğrulaması
- `pnpm turbo lint typecheck test`: **17/17 görev yeşil**, 235 test dosyası, 1953 test geçti (1 skipped). `tests/shell/entry.test.ts` ayrıca tek başına koşturuldu: 4/4 geçti.
- `E2E_PORT_BASE=5597 pnpm exec playwright test e2e/app-frame.spec.ts e2e/uat-journeys.spec.ts`: **48 passed**.
- Ekran görüntüleri: `.egemed-run/entry-1440.png` ve `.egemed-run/entry-360.png` — `/#/giris/test-ogrenci`; beyaz 3B logo gölgesiz/halesiz, 360 px'te yatay kaydırma yok. Görüntüler geçici bir Playwright spec'i ile alındı; spec iş bitince silindi (repoda iz kalmadı).

## Notlar ve varsayımlar
- Yeni görsel `apps/shell/public/brand/egemed-logo-3d-white.png` git'te izlenmiyor (`??`); commit yapılmadığı için olduğu gibi bırakıldı. Merge kapısı `git add -A` ile alacağı için kaybolma riski yok.
- `egemed-logo-color.png` silme işlemi `git rm` ile sahnelendi; diğer değişiklikler sahnesiz. Merge script'i `git add -A` kullandığı için fark etmez.
- `docs/agentic/gunluk/T305-entry-logo.md` kaldırılan token'ları ve eski dosyayı anıyor; tarihsel günlük kaydı olduğu için geriye dönük değiştirilmedi.
- `docs/sema/` şemaları etkilenmedi: rota, rol/erişim kuralı, sözleşme veya akış değişikliği yok; yalnız statik marka görseli değişti.
