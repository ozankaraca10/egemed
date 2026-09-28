# T220 — A3.4: Pulse istemcisinden cevap anahtarını kaldır + üretim sızıntı testi (Z3)

ADR-009 Pulse ayağı, son adım. T217 ile Pulse vaka ve sınav akışı yalnız sunucu oturumuyla çalışıyor (`runtime/serverItems.ts`); sunucu modunda istemci `correct/explanations/feedback` OKUMUYOR. Ama bu alanlar hâlâ istemci paketindeki müfredatta duruyor: `packages/sim-pulse/src/runtime/vendor/curriculum.js` (600 madde) ve TS aynası `packages/sim-pulse/src/data/curriculum.ts`. Ausculta (T196) ve Opaca (T212b) aynı temizliği yaptı.

Tek doğruluk kaynağı artık sunucu bankası `packages/assessment-bank/data/pulse/items.json` (T215). Kapsam: `packages/sim-pulse/**`, `packages/assessment-bank/**` (dışa aktarma betiğinin yeri/girdisi değişirse), `tests/**`, `e2e/**`.

## İstenen
1. **Kaynağı bankaya taşı:** Madde gövdeleri (vaka kökü, soru, seçenekler, doğru, gerekçeler, feedback, vitals, ecg) artık bankanın `items.json`'ında yaşar. `tools/export-bank.mjs` tersine çevrilmez; bunun yerine:
   - `curriculum.js`'ten `caseRows/quizRows/extraCases/extraQuestions/banks/itemMeta` (madde içeriği) KALDIRILIR. İstemcide kalanlar: `labels`, `modeSources`, `leads`, `limitations`, sayılar (`caseCount`, `quizCount`, patern başına sayı — bankanın `inventory` çıktısıyla eşit; test et), `version`, `sessionSize`.
   - `export-bank.mjs` ve `export:bank` betiği kaldırılır (banka verisi artık doğrudan düzenlenir); banka verisinin bütünlük testi (`tests/assessment-bank/pulse.test.ts`) curriculum senkron testi yerine şemaya/sayılara dayanır.
   - `src/data/curriculum.ts` TS aynası: madde içeriği varsa aynı şekilde kaldır; yalnız etiket/sayı/kaynak kalır. Onu kullanan eski TS yolu (`engine/*`, `mount.ts` — kabukta kullanılmayan eski yol) derlenmeye devam etmeli; gerekirse yalnız sayılarla çalışacak şekilde sadeleştir ya da kullanılmıyorsa kaldır (T201 kuralı: yalnız testte kullanılan canlı sayılmaz).
2. **Sunucu kanalı yokken** (API yok, test) Pulse vaka/sınav kapalı kalır (T217'de var; korunur). Öğrenme modu ve "Simülatörde aç" etkilenmez.
3. **İstemcinin müfredata ihtiyaç duyduğu yerler** (sonuç ekranı başlıkları, "Simülatörde aç", sistematik okuma, oturum doğrulama `state.js validateSession`): sunucu verisinden ya da sayılardan çalışacak şekilde uyarla; `state.js` artık madde kimliği ↔ byId araması yapmaz (sunucu oturumunda yerel örneklem yok) — eski kayıtlı yerel oturumlar güvenle yok sayılır (test).
4. **Üretim sızıntı testi:** `e2e/auth-prod.spec.ts`'e (Ausculta T196 testi deseni) Pulse için: üretim paketinde bankadaki 600 maddenin hiçbirinin gerekçe (`explanations`) metni ve `feedback` metni geçmez (her maddeden en az bir ayırt edici gerekçe cümlesi aranır); `C001`/`Q001` biçimli kimlikler geçmez.

## Testler
- `tests/sim-pulse/`: curriculum'da `correct/explanations/feedback/cases/questions` alanları yok; sayılar bankayla eşit; eski yerel oturum kaydı güvenle yok sayılır; mevcut T217 köprü testleri yeşil.
- Pulse e2e (runtime/a11y) ve api-dev Pulse testleri yeşil.

## Kabul
`pnpm turbo lint typecheck test` yeşil; `E2E_PORT_BASE=<5700-5799> CI=true pnpm exec playwright test e2e/pulse-runtime.spec.ts e2e/pulse-a11y.spec.ts e2e/auth-prod.spec.ts` yeşil; üretim paketinde Pulse gerekçe/feedback metni yok (ölçüp summary'ye yaz). `.egemed-run/summary.md`. COMMIT/MERGE/PUSH YOK.
