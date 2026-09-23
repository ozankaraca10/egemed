# @egemed/tokens

EGEMED CLIX için ortak tasarım tokenları. `AGENTS.md` kuralı "Renkler
`packages/tokens` üzerinden" bu paketle somutlaşır.

## Amaç

Aile paletini ve Opaca'nın `:root` tokenlarını tek yerde tutmak; kabuk ve ortak
UI'ın aynı renk/tipografi/boşluk ölçeğini kullanmasını sağlamak.

## Kaynaklar

| Kaynak | Yol | Tarih |
| --- | --- | --- |
| Aile tokenları | `/Users/ozankaraca/Documents/EGEMED CLIX/egemed-sim-ui-ux-framework/tokens/family-tokens.css` | 21 Eylül 2026 durumu |
| Opaca tokenları | `/Users/ozankaraca/Documents/EGEMED CLIX/egemed-opaca/src/styles.css` (iki `:root` bloğu) | 23 Eylül 2026 durumu |

## Dosyalar

- `package.json` — paket kimliği (`@egemed/tokens`); betik ve bağımlılık yok.
- `family-tokens.css` — aile tokenları; kaynağın birebir kopyası (75 satır).
- `opaca.css` — Opaca'nın iki `:root` bloğunun birebir anlık görüntüsü.

## Tüketim

Bu paket **kabuk ve ortak UI** içindir. Simülatörler SCORM/HTML olarak tek başına
çalışır ve kendi CSS'ini bulundurmaya devam eder; simülatör verisi hiçbir yüzeyde
birleştirilmez (veri izolasyonu: `AGENTS.md`). Import bağlantısı (Vite/React)
T07/T08 görevlerinde yapılır; bu paket kendi başına tüketici bağlamaz.

## Kurallar

- **Köprü token kuralı:** eski ürün değişken adları aile token'larına eşlenir;
  eski adlar silinmez, köprü olarak korunur.
- **Değerler elle düzenlenmez, kaynaktan senkron edilir.** Anlık görüntüdeki
  farklar (ör. `--r-xs`/`--gap` yokluğu) "düzeltilmez".
- Yeniden senkron ayrı bir görevdir; kaynak yol ve tarih başlık yorumlarındadır.
