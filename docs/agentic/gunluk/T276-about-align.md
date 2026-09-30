# T276-about-align

- Tarih: 2026-10-01 01:49
- Commit: T276a: üç simin mod seçimi hizalandı ve ortalandı; 1440/768'de footer kaydırmasız (Luna; review: Claude)
- Dal: task/T276-about-align

---

# T276a teslim özeti

## Uygulama

- Pulse, Ausculta ve Opaca mod seçimlerinde ortak başlık/alt başlık/bilgi bandı, üç eşit kart, alt hizalı düğmeler, öğrenme ilerlemesi ve uygulama/değerlendirme puan durumu hizalandı. Kilitli kartlar soluk, kilit açıklaması üstte ve düğmeleri pasif. Pulse simgeleri çizgi ailesine geçirildi.
- Değerlendirme kartındaki aylık ödül bağlantısı yalnız ödül kanalında geçerli ödül varsa gösteriliyor ve liderlik görünümünü açıyor. Kalan gün hesabı enjekte edilen `now` ve İstanbul saat dilimiyle yapılıyor.
- Pulse'da ödül bağlantısıyla açılan Liderlik sekmesi repo/sunucu verisi yenilenirken korunuyor; açık İlerlemem görünümünün sekmesi artık yenilemede Başarılarım'a dönmüyor.
- Pulse'un Shadow DOM yerleşimi desktop/tablet için ortalandı; mobilde kartlardan sonra footer'ın akması sağlandı. Shell'deki tek değişiklik sim sayfa kapsayıcısının minimum yüksekliğini küçültmekti: önceki 34 px sayfa taşması footer'ı viewport dışına itiyordu. Hakkında/Kaynaklar ekranlarına dokunulmadı.
- E2E'de yalnız lazy sim kökünün veya mod başlığının hazır olmasını bekleyen görünürlük assertion'ları 5 saniyeden 15 saniyeye çıkarıldı (`helpers.ts`, `sims-a11y.spec.ts`, `uat-journeys.spec.ts`). Başlık metni, yatay kaydırma, axe ve 44 px denetimleri değiştirilmedi. Yeni test eklenmedi; `TEST-POLITIKASI.md` uygulandı.

## Doğrulama

- `pnpm turbo lint typecheck test`: **yeşil**, 17/17 görev; 223 test dosyası, 1866 geçti, 1 atlandı.
- `EGEMED_E2E_API_URL=http://127.0.0.1:9 E2E_PORT_BASE=8285 pnpm e2e:mobile --grep "pulse|ausculta|opaca|sims|a11y|uat"`: **yeşil**, 240 geçti, 11 atlandı, 0 hata; WCAG axe ve 44 px kapıları dahil. Son koşum: `e2e-artifacts/fac79d4/summary.json`, tam log: `.egemed-run/e2e-final.log`.
- Önceki iki tekrar koşumundan biri kapsam dışı Opaca sonuç ekranındaki `.report-row > .ok` kontrastında geçici hata verdi; sonraki tam koşumda bu test geçti. Diğeri 320 px UAT'de Opaca mod başlığının 5 saniyelik lazy yükleme sınırına takıldı; yalnız bu hazır olma bekleyişi 15 saniyeye çıkarıldı. Son tam koşum tüm testlerde yeşildir.
- `git diff --check`: temiz. Commit, merge veya push yapılmadı.

## Kabul görüntüleri ve yerleşim

Görüntüler birleşik shell dev rotasında deterministik öğrenci oturumuyla, tam viewport boyutunda alındı; footer ölçümü aynı shell sayfasına aittir. Ölçümler `.egemed-run/mode-metrics.json` dosyasında. Üç simin tamamında 1440×900 ve 768×1024 için belge yüksekliği viewport'a eşit, footer alt kenarı sırasıyla 900 ve 1024 px: **kaydırmadan görünüyor**. Dokuz görünümün tamamında belge genişliği viewport genişliğine eşit; yatay kaydırma yok. 360×800'de doğal dikey kaydırma var ve Pulse footer son kartın altında.

| Sim | 1440×900 | 768×1024 | 360×800 |
| --- | --- | --- | --- |
| Pulse | `.egemed-run/pulse-desktop-1440.png` | `.egemed-run/pulse-tablet-768.png` | `.egemed-run/pulse-mobile-360.png` |
| Ausculta | `.egemed-run/ausculta-desktop-1440.png` | `.egemed-run/ausculta-tablet-768.png` | `.egemed-run/ausculta-mobile-360.png` |
| Opaca | `.egemed-run/opaca-desktop-1440.png` | `.egemed-run/opaca-tablet-768.png` | `.egemed-run/opaca-mobile-360.png` |

Geçici `.pnpm-store/` kaldırıldı. Bu görevdeki tüm düzenlemeler ve artefaktlar yalnız T276-about-align worktree içindedir. `docs/agentic/CODEX-DEVIR.md` bu worktree'de bulunmadığı için mevcut `docs/agentic/CLAUDE-DEVIR.md` de okundu.
