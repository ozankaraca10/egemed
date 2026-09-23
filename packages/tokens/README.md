# @egemed/tokens

EGEMED CLIX için ortak tasarım tokenları. `AGENTS.md` kuralı "Renkler
`packages/tokens` üzerinden" bu paketle somutlaşır.

## Amaç

Aile paletini ve Opaca'nın `:root` tokenlarını tek yerde tutmak; ADR-006 ile
kabul edilen tek React platformunda kabuk ve ortak UI'ın aynı
renk/tipografi/boşluk ölçeğini kullanmasını sağlamak.

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

Bu paket **tek React platformunun ortak katmanı** içindir. Kabuk (`apps/shell`)
`@egemed/tokens/family-tokens.css` dosyasını tek girişten import eder; ortak UI
(`@egemed/ui`) renk/tipografi/boşluk değişkenlerini `var(--…)` üzerinden tüketir.
CSS'te hex yasaktır; yalnız aile token'ı veya `--eg-*` yerel değişken kullanılır.

ADR-006 ile simülatörler platformun **iç modülleri**dir; standalone SCORM/HTML
paketi ve sandbox iframe modeli geçersizdir. Sim motorları (EKG üretimi,
oskültasyon ses mantığı, görüntü işaretleme) vanilla/TS olarak korunur ve React
host bileşenlerinden mount/unmount edilir. Opaca ve Ausculta'nın mevcut React
ekranları ortak UI bileşenlerine uyarlanır; Pulse'un düz JS ekranları ise port
sırasında kademeli React'e taşınır (port: T14–T18).

Sınırlar:

- **Ortak:** aile paleti, tipografi, boşluk, radius ve gölge; kabuk ile ortak UI
  aynı ölçeği paylaşır.
- **Sim başına ayrık:** her sim kendi klinik durumunu ve stil sınırını korur.
  `opaca.css` çalışan bir stil değil, paket export'u olmayan kaynak anlık
  görüntüsüdür (`package.json` yalnız `family-tokens.css`'i dışa açar).
  Simlerin mevcut CSS'i global seçiciler (`:root`, `body`, `*`) içerir; portta
  bu stiller sim köküne scope'lanır. Port edilen ekranlar ortak UI bileşenlerini
  kullansa da sim başına CSS/klinik sınırı değişmez. Simülatör verisi hiçbir
  yüzeyde birleştirilmez (veri izolasyonu: `AGENTS.md`).

## Kurallar

- **Köprü token kuralı:** eski ürün değişken adları aile token'larına eşlenir;
  eski adlar silinmez, köprü olarak korunur.
- **Değerler elle düzenlenmez, kaynaktan senkron edilir.** Anlık görüntüdeki
  farklar (ör. `--r-xs`/`--gap` yokluğu) "düzeltilmez".
- Yeniden senkron ayrı bir görevdir; kaynak yol ve tarih başlık yorumlarındadır.
