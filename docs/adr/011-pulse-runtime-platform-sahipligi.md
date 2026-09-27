# ADR-011 — Pulse runtime'ının yetkili kaynağı platformdur

- Durum: Kabul
- Kabul eden: depo sahibi (canlı oturum), 2026-09-27 ("Platform sahiplensin").
- Yönlendirme: depo sahibi, 2026-09-27. Yaklaşan beş yeni ritim (AV bloklar) EKG motorunun çekirdeğini değiştireceği için find/replace yama modeli sürdürülemez bulundu.
- Astra ikinci görüşü: Bekleniyor.
- İlgili: ADR-006 (simülatörler iç modül), ADR-009 (sunucuda puanlama; Pulse aşaması host katmanını etkiler)

## Bağlam

Pulse runtime'ı bugüne dek `~/Documents/EGEMED CLIX/EGEMED_PULSE/cardai` kaynak deposundan `packages/sim-pulse/tools/sync-runtime.mjs` ile üretiliyordu. Betik kaynağı salt okur, `PATCHES` listesindeki find/replace yamalarını uygular ve `src/runtime/vendor/` altına üretilmiş dosyalar yazar; `vendor/manifest.json` her kaynak dosyanın SHA-256 değerini ve uygulanan yamaları kaydederdi.

Bu model iki nedenle tıkandı:

- Yaklaşan beş yeni ritim (AV bloklar) EKG motorunun çekirdeğini değiştirecek; find/replace yamalarıyla çekirdek değişiklikler sürdürülemez.
- Yetkili kaynak platformun dışındadır; platformun ihtiyaç duyduğu davranış değişiklikleri ayrı bir depoya bağımlı kalır.

## Karar

1. `packages/sim-pulse/src/runtime/vendor/*` dosyaları platformun yetkili kaynağıdır ve doğrudan düzenlenir.
2. `tools/sync-runtime.mjs`, ürettiği `vendor/manifest.json` ve `package.json`'daki `sync:runtime` betiği kaldırılır.
3. Kaynak depo (`EGEMED_PULSE/cardai`) artık yetkili değildir; yalnız tarihsel referanstır ve okunmaz/yazılmaz. 2026-09-27 anlık görüntüsü koddaki köken yorumlarında belirtilir.
4. Vendor içeriği testle korunur: üretilmiş dosya işareti ve manifest bulunmaz; davranış doğrulamaları `tests/sim-pulse/` altında sürer.
5. Otomatik senkron kurulmaz. Kaynakla karşılaştırma gerekirse yalnız bir kerelik anlık görüntü referans alınır.

## Sonuçlar

- **Olumlu:**
  - Çekirdek EKG değişiklikleri doğrudan yapılabilir; yama listesi bakımı biter.
  - Tek yetkili kaynak platform olur; üretilmiş dosya ile kaynak arasındaki sapma riski kalkar.
- **Olumsuz:**
  - Kaynak depodaki geliştirmeler otomatik akmaz; bilinçli taşıma gerekir.
- **Risk:** Vendor dosyaları üretilmiş işaretini yitirdiği için elle düzenleme disiplini kod incelemesine ve testlere bağlıdır.

## EK — Tarihsel yama kaydı

`tools/sync-runtime.mjs` kaldırılmadan önceki son yama listesi (id + neden). Kaynak depoya artık yazılmadığı için bu kayıt tarihsel referanstır.

### `landing.js`

| id | why |
|---|---|
| EGEMED-NO-FULLSCREEN-PROMPT | Kullanıcı kararı (25 Eylül 2026): platformda zorla tam ekran önerisi (popup) açılmaz; tam ekran yalnız birleşik bardaki ikondan. Depo tercihine (pulse.fsPromptDone) bağlı kalmadan istem hiç gösterilmez. |

### `app.js`

| id | why |
|---|---|
| PULSE-A11Y-QUIZ-OPT-ROLE | Kaynak erişilebilirlik kusuru (PULSE-10): seçenek etiketi role=radio taşıyor ve içinde yerel radyo girdisi var (axe nested-interactive). Anlam ve klavye (ok tuşları) zaten yerel girdiden gelir; etiketteki rol ve aria-checked kaldırılır. |
| PULSE-A11Y-QUIZ-OPT-SYNC | Rolü kaldırılan etikette aria-checked geçersiz olur (aria-allowed-attr); seçim durumu yerel girdide kalır. |
| PULSE-ADR006-SCORM-TEXT | ADR-006 ile SCORM/iframe LMS modeli kalktı; platform kendi API'siyle ilerlemeyi kaydeder. Sınav mod kartındaki kullanıcıya görünen 'SCORM puanı' ifadesi öğrenciyi artık var olmayan bir SCORM kaydına yönlendirmesin diye nötr bir ifadeyle değiştirilir. |
| PULSE-NO-LMS-QUIZ-TEXT | Kullanıcı kararı (26 Eylül 2026): Moodle/LMS ile bağ yok; platformda SCORM algılanmaz. Sınav açıklamasındaki 'en iyi puan LMS'ye yazılır' ifadesi öğrenciyi var olmayan bir LMS kaydına yönlendirmesin diye nötr bir ifadeyle değiştirilir. (S.detected/S.isLMS'e bağlı saveStatus metinleri bu dalda çalışmadığından kasıtlı olarak dokunulmadı; bkz. T160 summary.) |

### `features.js`

| id | why |
|---|---|
| PULSE-ASSET-BASE | Göreli varlık yolu kabuğun kökünde değil /sims/pulse/ altında çözülmeli. |
| KAYNAK-01-SCORE-VS-MODULE | Kaynak kusuru (Astra KAYNAK-01): sınav sonucu modül tamamlama (tüm ritimler + vakalar + ≥80) ile puan eşiğini tek 'passed'da birleştiriyor; doğrudan sınava girip 100 alan öğrenci 'Hedefin altında' görüyor. Sonuç ekranında sınav durumu yalnız puan eşiğine (80) bağlanır; modül tamamlanmadıysa ayrı not gösterilir. SCORM/kayıt 'passed' anlamı değişmez. |
| KAYNAK-01-MODULE-NOTE | Modül tamamlama koşulu puan eşiğinden ayrı gösterilir (KAYNAK-01). |
| PULSE-A11Y-CASE-OPT-ROLE | Kaynak erişilebilirlik kusuru (PULSE-10): seçenek etiketi role=radio taşıyor ve içinde yerel radyo girdisi var (axe nested-interactive). Anlam ve klavye (ok tuşları) zaten yerel girdiden gelir; etiketteki rol ve aria-checked kaldırılır. |
| PULSE-A11Y-CASE-OPT-SYNC | Rolü kaldırılan etikette aria-checked geçersiz olur (aria-allowed-attr); seçim durumu yerel girdide kalır. |

### `index.html` (`MARKUP_PATCHES`)

| id | why |
|---|---|
| PULSE-A11Y-EXPLAIN-TABS-ROLE | Açıklama sekmeleri role=tablist taşıyor ama çocukları role=tab değil (axe aria-required-children); düğmeler aç/kapa grubu olarak işaretlenir. |
| PULSE-A11Y-LANDING-HELP-NAME | Mobilde etiket gizlenince düğmenin erişilebilir adı kalmıyor (axe button-name). |
| PULSE-A11Y-LANDING-ABOUT-NAME | Mobilde etiket gizlenince düğmenin erişilebilir adı kalmıyor (axe button-name). |
