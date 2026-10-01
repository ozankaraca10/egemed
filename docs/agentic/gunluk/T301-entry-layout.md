# T301-entry-layout

- Tarih: 2026-10-01 20:49
- Commit: T301: giriş sol paneli — logolar başlığın üstünde, alıntı çiplerin 3 satır altında; 'Türkiye'nin ilk oyunlaştırılmış', 'öğren, uygula, yarış', çerçevesiz büyük sim logoları, yeni alt metin (DeepSeek + Claude)
- Dal: task/T301-entry-layout

---

# T301 — Giriş sayfası sol panel yerleşimi (özet)

## Değişiklik
Yalnız `apps/shell/src/shell.css` T296 bloğu; TSX/metin/bağımlılık değişmedi (3 satır, +3/−3):

1. `.eg-shell-entry__brand` (satır 1137): `justify-content: space-between; gap: var(--sp-6)` → `justify-content: center; gap: 0` — logo, metin ve alıntı tek grup olarak dikeyde ortalanır.
2. `.eg-shell-entry__brandTop` (satır 1145): `margin-bottom: var(--sp-5)` eklendi — logolar doğrudan turuncu eyebrow'un üstünde.
3. `.eg-shell-entry__quote` (satır 1158): `margin: 0` → `margin: calc(3 * 1.5em) 0 0` — alıntı ürün çiplerinin 3 satır altında, sola hizalı (sol kenar 56px = panel iç boşluğu).

Boşluklar token ile: `--sp-5: 24px`, `--sp-4: 16px` (`packages/tokens/family-tokens.css`); yeni literal metin/renk yok.

## Doğrulama
- `pnpm turbo lint typecheck test`: 17/17 görev başarılı (1953 test geçti, 1 atlandı). Ek olarak `pnpm turbo lint typecheck test --filter=@egemed/shell --force` (önbelleksiz): 12/12 başarılı.
- `E2E_PORT_BASE=5597 pnpm exec playwright test e2e/app-frame.spec.ts e2e/uat-journeys.spec.ts`: **48/48 geçti** (mobile-360, tablet-768, desktop-1440).
- Ekran görüntüleri: dev sunucu `127.0.0.1:5599`, `/#/giris/test-ogrenci` → `.egemed-run/entry-1440.png`, `.egemed-run/entry-360.png`.

## Ölçümler (getBoundingClientRect)
| Ölçüm | 1440×900 | 360×780 |
|---|---|---|
| `brandTop` alt → `eyebrow` üst | **24px** (= `--sp-5`; logolar başlığın hemen üstünde) | 40px (= `--sp-4` mobil flex gap + `--sp-5` marj; sıra korunuyor) |
| `sims` (ürün çipleri) alt → `quote` üst | **58,5px = 3 × 1,5 × 13px** (`--fs-sm`; tam 3 satır) | `quote` `display: none` (T296 ≤900px kuralı; değiştirilmedi) |
| `quote` sol kenar | 56px (sola hizalı) | — |
| Yatay kaydırma | 0 | 0 |
| Dikey kaydırma | 13px (sağ panel yüksekliği 912,8px; değişiklikten bağımsız, dev formundan) | 656px (normal dikey akış) |

Grup konumu (1440): `brandTop` üst 222,75 – `quote` alt 690,03; 900px viewport'ta panel içinde dikey ortalı, tamamı görünür.

## Notlar / varsayımlar
- Plan maddeleri birebir uygulandı; mobil `@media` bloklarına (768/380px ve 900px) dokunulmadı. 360px'te alıntının gizli olması T296'nın mevcut kararı; depo sahibinin istediği "3 satır altı" konumu 1440'ta ölçüldü.
- CSS-only görsel değişiklik; rota, sözleşme, veri modeli veya şema etkisi yok (`docs/sema/` güncellemesi gerekmez).
- Adım 4 gereği 360/768/1440 doğrulandı, yatay kaydırma yok; dokunma hedefleri değişmedi.
- Commit/merge yapılmadı (talimat gereği); değişiklik çalışma ağacında.

## Ek (Claude, 1 Eki 2026 — depo sahibi istekleri)
- `entry.claim` "Türkiye'nin ilk oyunlaştırılmış" — "Klinik Öğrenme Deneyimi Platformu" üst başlığının üstünde (beyaz, aynı büyük harf aralığı).
- `entry.headline` "… öğren, uygula, yarış." (karşılaş → yarış).
- `entry.quote` "Ege Üniversitesi Tıp Fakültesi öğrencileri için geliştirilmiştir. Tıbbi yöntem ve verilerin doğruluğu öğretim üyelerimizce denetlenmektedir."
- Simülatör logoları çerçevesiz (çip arka planı/kenarı kaldırıldı), 3,5 rem; ≤900 px'te 2,5 rem ve tek satır.
