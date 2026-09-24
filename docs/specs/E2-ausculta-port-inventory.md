# E2 — Ausculta port envanteri ve dilim planı

Durum: **Envanter + dilim planı** (T17a çıktısı). Dilim tablosu §9'dadır (kanonik); T17a'da ürün koduna dokunulmadı.
Kaynak: `/Users/ozankaraca/Documents/EGEMED CLIX/egemed-ausculta` @ `3d60ef7` (temiz çalışma ağacı).
İlişkili: ADR-006 (kabul), `docs/specs/E1-sim-port.md`, T19 `E2-tek-platform-yol-haritasi.md` §Ausculta.
Bu belgede **[K]** kanıt (okunan dosya:satır), **[V]** varsayım/doğrulanacak bilgi anlamına gelir.

> **Durum (24 Eyl 2026):** Çekirdek, veri/ses, ses motoru (singleton/iptal/sızıntı düzeltmeleri), store/runtime, UI ve
> ekranlar büyük ölçüde tamam; S16 Sonuç/Kaynaklar, S17 CSS ve S18 SimHost adaptörü sırada.

## 1. Yöntem ve okuma sınırı

- `public/assets`, `dist`, veri JSON'ları ve lock dosyaları topluca okunmadı; yalnız sayım, boyut ve
  iki alanlık `jq` (`runtimeUrl`, kayıt sayısı) kullanıldı.
- Kaynak kod TS/TSX/CSS dosyaları ve `tests/core.test.ts` hedefli okundu; platform tarafında
  tsconfig/eslint/turbo/vitest/shell/tokens incelendi.
- Bu envanter aynı zamanda port planıdır (§9, kanonik); sözleşme değişikliği (SimHost) tüketicisinden (S18a) önce birleşir (E2 §İş sırası; T14a merge kapısı).

## 2. Kaynak envanteri

| Ölçü | Değer |
|---|---|
| `src/` TS/TSX/CSS | **7.147 satır** |
| `tests/core.test.ts` | **1.091 satır / 114 `it` / 22 `describe`** |
| Veri JSON | **1,1 MB** (`cases-auto.json` 804K, `sounds.json` 188K, `cases.json` 128K, diğerleri ≤16K) |
| `public/` | **31 MB / 266 dosya** (249 wav, 13 png, 4 jpg); `public/assets/audio/runtime/{heart,lung,mixed,external/circor}` |
| Kaynak yığın | React 19.2.8, Vite 8.3.0, vitest 5.0.1, TS ~6.0.2, oxlint (kaynak `package.json`) |
| Kaynak davranış testi | 1 dosya; DOM ortamı yok (platformla aynı felsefe), JSON + `.mjs` import ediyor |

## 3. Bileşen / motor / test haritası

Satır sayıları `wc -l` ile alındı **[K]**. "Motor" = davranışı korunacak saf/yarı-saf katman.

### 3.1 Çekirdek (motor adayı)

| Dosya | Satır | İçerik | Port notu |
|---|---|---|---|
| `src/core/types.ts` | 242 | Şema sözleşmesi: `CaseDef`, `SoundRecord`, `Question`, `SuspendPayload`, `SimEvent` | Saf; ilk taşınacak |
| `src/core/suspend.ts` | 114 | `serializeSuspend`/`deserializeSuspend`, 1.2/2004 limitleri, 5 kademeli küçültme | Saf; SCORM'dan bağımsız korunur |
| `src/core/scoring.ts` | 123 | `scoreCase`, `aggregateResults`, `practiceAdjusted`, `MASTERY_THRESHOLD` | Saf motor |
| `src/core/flow.ts` | 140 | `nextActionForSubmit`, `resampleActiveMode`, `regionChipState`, zayıf alan analizi | Saf motor |
| `src/core/session.ts` | 77 | Deterministik tohumlu 10 vaka örneklemi, `shuffledOptions` | Saf motor (determinizm şart) |
| `src/core/validation.ts` | 97 | `validateCase`, `filterAssessmentPool` | Saf motor |
| `src/core/resolver.ts` | 146 | Ses atama çözücü; posterior→anterior fallback dürüstlük kuralı | JSON manifestoya bağlı |
| `src/core/events.ts` | 24 | Modül düzeyi `EventBus` (`bus`) + 2000 kayıt log | Global; mount başına örnek olmalı |
| `src/core/scorm.ts` | 166 | 2004/1.2 algılama (`parent`/`opener`), MockAdapter, `makeScorm` | Karar: kaldır/seam |
| `src/core/store.tsx` | 536 | Reducer + `StoreProvider` + `ScormRuntime` (SCORM/localStorage/listener) | S7 + S8a-S8d |

### 3.2 Ses katmanı

| Dosya | Satır | İçerik | Risk |
|---|---|---|---|
| `src/audio/engine.ts` | 202 | Tek `AudioEngine`: context, master/limiter, DSP, çapraz geçiş, `dispose` | §4 |
| `src/audio/engineSingleton.ts` | 4 | Modül düzeyi `new AudioEngine()` | Global; kaldırılacak |
| `src/audio/audioConfig.ts` | 45 | DSP/kazanç/limiter/zaman sabitleri | Saf |
| `src/audio/waveform.ts` | 69 | `computePeaks`, `drawWave`; `window`/`document` erişimi | DOM bağımlı, saf kısım ayrılabilir |

### 3.3 Arayüz bileşenleri

| Dosya | Satır | Not |
|---|---|---|
| `src/ui/PatientStage.tsx` | 425 | Hotspot + stetoskop sürükleme/klavye + ses yaşam döngüsü; S9a (saf) + S9b (bileşen) |
| `src/ui/chrome.tsx` | 329 | Header/Footer + landing ambient ses + tam ekran önerisi + localStorage |
| `src/ui/Toolbar.tsx` | 147 | Ses/filtre/görünüm; `engine.setMuted/setVolume` |
| `src/ui/Questions.tsx` | 148 | Soru/geri bildirim kartı |
| `src/ui/WaveformView.tsx` | 170 | Canvas + RAF/interval + `engine.load/play/stop` |
| `src/ui/icons.tsx` | 93 | SVG ikonlar |
| `src/ui/PediatricRefModal.tsx` | 78 | Modal |
| `src/ui/HelpModal.tsx` | 74 | Modal + odak tuzağı |
| `src/ui/ConfirmModal.tsx` | 69 | Modal |
| `src/ui/RegionChips.tsx` | 49 | Bölge çipleri |
| `src/ui/TutorialSteps.tsx` | 46 | Öğretici adımları |
| `src/ui/stethoscope.tsx` | 42 | Stetoskop görseli |
| `src/ui/torso-pediatric.tsx` | 211 | Pediatrik şematik gövde |

### 3.4 Ekranlar

| Dosya | Satır | Not |
|---|---|---|
| `src/screens/SimulationScreen.tsx` | 552 | Uygulama/değerlendirme; SCORM raporu, `Date.now`, doküman listener'ları; S15a-S15c |
| `src/screens/LearnScreen.tsx` | 306 | Kütüphane; `Date.now` tohum, `document.querySelector` kaydırma |
| `src/screens/SourcesScreen.tsx` | 252 | Kaynak/atıf |
| `src/screens/ResultsScreen.tsx` | 248 | Sonuç; SCORM `terminate` + `window.close` |
| `src/screens/ModeSelectScreen.tsx` | 137 | Mod seçimi; SCORM metni |
| `src/screens/TutorialScreen.tsx` | 135 | Öğretici; `engine` prop'u |
| `src/screens/StartScreen.tsx` | 107 | Hero; ses seviyesi tonu `engine.ensureContext` |
| `src/screens/DevPanel.tsx` | 76 | `?dev=1`; üretim rotasına girmez |
| `src/App.tsx` | 73 | Ekran anahtarı, `engine.stop()` (ekran değişimi), scrollTo |
| `src/main.tsx` | 15 | `createRoot(#root)`, DEV'de `window.__auscultaEngine` |

### 3.5 Veri ve test

| Dosya | Satır/Boyut | Not |
|---|---|---|
| `src/data/terminology.ts` | 236 | Türkçe tıbbi terminoloji; i18n hedefi adayı |
| `src/data/metrics.ts` | 46 | Landing metrikleri; JSON'a bağlı |
| `src/data/pool.ts` | 15 | `ALL_CASES`, `poolFor` |
| `src/data/*.json` | 1,1 MB | Statik import ediliyor (`resolver.ts:2-3`, `pool.ts:2-3`, `chrome.tsx:6`) |
| `tests/core.test.ts` | 1.091 / 114 test | Port regresyon ağı; 22 grup (§10) |
| `scripts/lib/external-mapping.mjs` | 86 | Testin import ettiği `.mjs`; portta taşınmalı veya satır içine alınmalı |

## 4. AudioEngine singleton ve async fetch/decode riskleri

**[K] Bulgular**

1. **Global tek örnek:** `engineSingleton.ts:4`; 7 modül doğrudan import ediyor
   (`App.tsx:3`, `main.tsx:5`, `LearnScreen.tsx:5`, `StartScreen.tsx:2`, `SimulationScreen.tsx:7`,
   `Toolbar.tsx:5`, `TutorialScreen.tsx:3`); `PatientStage`/`WaveformView` prop ile alıyor.
   `dispose()` (`engine.ts:196-201`) hiçbir yerde çağrılmıyor → AudioContext oturumlar arası açık kalır.
2. **İptal edilemez yükleme:** `engine.ts:57-66`; `fetch` + `decodeAudioData` abort edilemez,
   `buffers` Map'i temizlenmez (`dispose` dışında) → uzun oturumda bellek büyür.
3. **Uçuşta dispose/yarış:** `engine.ts:95-155` await sonrası dönem denetimi yok; `stopAll()`
   çağrılıp yeni `AudioBufferSourceNode` bağlanır. `dispose()` araya girerse `this.ctx` kapatılır,
   `this.master` null'lanmaz (`:196-201`) ve `gain.connect(this.master!)` eski/ kapalı grafiğe
   bağlanır. Tarayıcının kapalı context'te düğüm oluşturma davranışı **[V]** doğrulanacak; port
   yine de dönem (epoch) denetimi ve iptal gerektirir.
4. **Zamanlayıcı sızıntısı:** `engine.ts:174` `setTimeout(..., ~150 ms)` iptal edilmiyor;
   `dispose()` sonrası da çalışabilir.
5. **Unmount yarışı (UI):** `PatientStage.tsx:179-207` `seq` denetimi var; ancak unmount temizliği
   (`:335-342`) `placeSeqRef`'i artırmıyor. `App.tsx:35-37` ekran değişiminde `engine.stop()` çağırır
   ama uçuştaki `play` daha sonra çözülürse ses gezinme sonrası başlar. `WaveformView.tsx:89-98`
   `engine.play`'i try/catch'siz çağırır (reddedilen promise).
6. **Test edilemez bağımlılıklar:** `window.AudioContext` (`engine.ts:34`), `performance.now()`
   (`:154,181`), `fetch` (`:61`) enjekte edilmiyor; kaynakta motor testi yok **[K]**.

**Port gereksinimleri (kabul ölçütü adayı)**

- `createAudioEngine(deps)` fabrikası: `{ createContext, fetchImpl, now }` enjekte edilir; modül
  düzeyi singleton kaldırılır, SimHost `context`inden tek örnek geçirilir.
- `play()` başında dönem (epoch) alınır; `dispose()`/`stopAll()` dönemi artırır; await dönüşünde
  dönem değişmişse yükleme sonucu atılır, düğüm oluşturulmaz.
- `dispose()` idempotent: bekleyen `setTimeout` iptal, `buffers.clear()`, `ctx.close()`,
  `master = null`; unmount'ta çağrılır.
- `AbortController` ile `fetch` iptali; `decodeAudioData` sonrası `disposed` denetimi.
- UI temizliği: `PatientStage` unmount'ında `placeSeqRef` artırılır; `WaveformView` play çağrısı
  hata yakalar.

## 5. SCORM, localStorage ve `Date.now`

**[K] Mevcut durum**

- **SCORM:** `scorm.ts:32-45` `window.parent`/`opener` zincirinde `API_1484_11`/`API` arar;
  bulunmazsa `MockAdapter` (`:117-139`). `ScormRuntime` (`store.tsx:302-435`) `cmi.suspend_data`
  okur/yazar, interaction ve skor bildirir, `beforeunload`+`visibilitychange` ile flush eder
  (`:402-420`), `pagehide`/`unload`'da `terminate` eder (`:498-504`). `ResultsScreen.tsx:45-48`
  SCORM varsa `terminate()` + `window.close()`. `cmi.learner_name` yalnız eşleme tablosunda
  (`scorm.ts:26-27`); hiçbir yerde okunmuyor/yazılmıyor **[K]**.
- **Kullanıcıya görünen SCORM:** `ModeSelectScreen.tsx:68-69` ("SCORM puanı", "SCORM'a puan yazılır"),
  `StartScreen.tsx:73` ("SCORM uyumlu ölçme ve değerlendirme"), `DevPanel.tsx:39-40`.
- **localStorage:** `ausculta.bestScore` (`store.tsx:92,97,482` — mod başına en iyi puan, kalıcı),
  `ausculta.landingSound` (`chrome.tsx:17,30,77`), `ausculta.fsPromptDone` (`chrome.tsx:18,108,186`).
- **`Date.now()` 19 çağrı / 7 dosya** (SimulationScreen 6, store 6, Toolbar 3, Learn/Results/Mode/Start 1'er);
  `performance.now()` 5 çağrı. Platform ESLint `Date.now`'u yasaklıyor (`eslint.config.js:9-16`),
  ancak `sims/**` yok sayıldığı için port edilen kod bugün denetim dışı kalır; kapsam S20'de kapatılır.

**Karar noktaları (E2 §Ausculta: "SCORM, localStorage ve `Date.now()` portta ayrı karara bağlanır")**

1. SCORM adaptörü: ADR-006 ile paketleme kalktığı için **kaldırma** önerilir; `suspend`
   serileştirme ve oturum devam ettirme davranışı bellek-içi runtime seam'ine taşınır (xAPI
   eşlemesi T21/T23 sonrası). Kaynak SCORM adapter testleri (`tests/core.test.ts:31-85,581-719`)
   bu karara göre uyarlanır veya emekliye ayrılır — insan kararı.
2. localStorage: `bestScore` öğrenci performans verisidir; ADR-005 (asgari veri, EGEMED kayıt
   tutmaz) ile çelişir. Kaldırılması veya oturum-içi tutulması önerilir. `landingSound`/`fsPromptDone`
   platform kabuğunun tercihleri olduğundan sim modülüne taşınmaz.
3. `Date.now()` → enjekte saat (`now`); `performance.now()` → motor saat seam'i. Determinizm
   testleri (`session.test.ts`, örneklem/tohum) korunur.

## 6. Global CSS ve token uyumu

**[K]** `styles.css` 1.083 satır.

- `:root` bloğu (`:4-75`) hex palet tanımlar; `packages/tokens/family-tokens.css` aynı
  navy/blue/ink/radius/`--fs-*`/`--sp-*` değerlerini zaten taşıyor ve başlık yorumunda
  "Ausculta/Opaca kendi eski adlarını aynı mantıkla eşlesin" diyor. Port, `:root`'u silip
  aile token'larına köprü (`--eg-*` yerel takma adlar) kurmalıdır.
- Global seçiciler taşma riski: `*` (`:76`), `html, body` (`:77-78`), `button` (`:87`),
  `:focus-visible` (`:89`), `#root` (`:90-91`), `.app-shell` (`:92`), `.app-bg`/`.app-content`
  (`:99-103`). SimHost alt köküne kapsamlanmalı; `html`/`body`/`#root` simülasyon modülünde kalmamalı.
- Genel sınıf adları shell/ui ile çakışır: `.card` (7 kural), `.btn` (13), `.badge` (6),
  `.container` (2), `.screen` (3), `.footer` (19), `.popover`, `.modal-overlay`, `.small`, `.muted`.
  Portta ya `.eg-ausculta-` öneki ya da kapsamlayıcı kök altında seçici daraltma gerekir.
- 20 `@media` (480/720/860/1024/1080/1100/1280/1500 px, `max-height: 860px`, 2×
  `prefers-reduced-motion`) ve 3 `!important`. Platform doğrulaması 360/768/1440 olduğundan
  kırılım noktaları gözden geçirilir (E2 §T09); `prefers-reduced-motion` davranışı korunur.
- Platform test deseni `tests/ui/css-tokens.test.ts` renk literali yasağını ve token
  çözümlenebilirliğini denetliyor; aynı denetim sim CSS'i için `tests/sim-ausculta/css-scope.test.ts`
  ile S17a'da kurulur (S17b-S17d genişletir).

## 7. Veri ve varlıklar

- JSON'lar statik import ediliyor (`resolver.ts:2-3`, `pool.ts:2-3`, `chrome.tsx:6`,
  `metrics.ts:1-3`, `StartScreen.tsx:7`). JSON modül stratejisi (kök tsconfig
  `resolveJsonModule` veya `.ts` fixture) S0b'de sabitlenir.
- Ses kayıtları göreli URL ile çalışıyor: `assets/audio/runtime/heart/f_n_rc.wav` (jq, ilk kayıt);
  `PatientStage.tsx:366` `assets/body/front.jpg`; `chrome.tsx:21,306` `brand/…`. Vite `base: './'`
  (kaynak `vite.config.ts:7`). Platformda bu yolların kökü shell `public` olacağından 31 MB varlığın
  nereye kopyalanacağı **[K]** açık karar (K-P4); uygulaması S3b, rota doğrulaması S18b'dir.
- `public/` sayımı: 249 wav / 13 png / 4 jpg / 266 dosya. İçerik topluca okunmadı.

## 8. Platform entegrasyon kısıtları

| Kısıt | Kanıt | Sonuç |
|---|---|---|
| `sims/*` workspace dışı | `pnpm-workspace.yaml` | Karar (23 Eyl 2026, K-P1): `packages/sim-ausculta`; `sims/*` arşiv/boş kalır, workspace sözleşmesi bu yola göre kurulur |
| `sims/**` lint dışı | `eslint.config.js:7` | Port süresince Date.now denetimi dışı; S20'de kapatılır |
| Turbo girdileri sims'i içermiyor | `turbo.json` `//#lint`, `//#test`, `//#typecheck` | S0a'da `sims/**` girdilere eklenmezse önbellek yanlış yeşil verir |
| Test kapsamı kökte | `vitest.config.ts` `tests/**/*.test.ts` | Port testleri kaynak dilimleriyle birlikte `tests/sim-ausculta/` altına taşınır (§10) |
| DOM tipleri | `tsconfig.base.json` lib ES2022; `apps/shell/tsconfig.json` DOM | Sim paketi kendi tsconfig'inde DOM almalı (S0b); kök test tsconfig'i sim'i include etmeli |
| JSON/`.mjs` import yok | `tsconfig.base.json`'da `resolveJsonModule`/`allowJs` yok | Kaynak `tests/core.test.ts` olduğu gibi taşınamaz; strateji S0a/S0b'de sabitlenir |
| tsconfig sözleşmesi | `tests/config/tsconfig.test.ts` yalnız `apps/*`, `packages/*` tarar | S0a'da sim paketini de tarayacak şekilde genişletilir |
| SimHost yok | yalnız E1/E2/devir notu | S18a **T14a merge** şartına bağlı; S0-S17 T14a'dan bağımsız, K-P1/K-P2/K-P3 kapılarına bağlı |
| Rota yer tutucu | `apps/shell/src/routes.ts:24-30` `SIM_PATHS` + ADR-003 notu | Shell lazy rota S18b (S18a merge sonrası); `/sims/ausculta/` |
| i18n | `packages/ui/i18n/tr.ts`'de Ausculta anahtarı yok | Metinler bileşen içinde; i18n taşıması S13a/S13b/S14/S15b/S16a/S16b kabulüne eklenir (**K-P5**) |
| Aile token'ları hazır | `packages/tokens/family-tokens.css` | S17a köprü token'ları buradan beslenir |

## 9. Sıralı port dilimleri (her satır tek başına derlenir/test edilir, ≤~400 satır diff)

Bu bölüm **kanoniktir**: her dilimin kaynak aralığı, hedef dosyaları, yaklaşık diff'i, bağımlılığı ve
kabul testi buradadır; `.egemed-run/plan.md` yalnız yürütme sırası ve kapı özetini taşır.
Satır sırası yürütme sırasıdır; kimlikler inceleme eşlemesi (S0/S8/S9-S10/S12/S15-S17/S19) içindir.

Kurallar:

- Her satır kendi başına `pnpm turbo lint typecheck test` yeşil bırakır.
- Kaynak testler mümkün olduğunca ilgili motor dilimiyle taşınır (§10 eşlemesi); **114 testin tamamı
  tek seferde port edilmez**, sona tek bir test görevi bırakılmaz.
- Yarım dosya taşınmaz: büyük TSX önce bağımsız saf mantık modülüne ayrılır (derlenir + test edilir),
  sonra tamamı derlenen bileşen entegrasyonu gelir; CSS ve test satırları ayrı ve somuttur.
- CSS kapısı (`tests/sim-ausculta/css-scope.test.ts`) S17a'da kurulur, S17b-S17d genişletir.
- SCORM testlerinin (`31-85`, `581-719`) korunacak/uyarlanacak/emekliye ayrılacak **sayısı K-P2
  kararıyla kesinleşir** ve yalnız S19a'da varsayılır.

### Kapılar (dilim ön koşulu)

| Kapı | Bağlı dilimler | Etki |
|---|---|---|
| **K-P1** paket yerleşimi | **S0a** (zorunlu) | **Karar (23 Eyl 2026): `packages/sim-ausculta`**; `sims/*` arşiv/boş kalır. Workspace/tsconfig sözleşmesi ve hedef yollar bu karara göre kurulur |
| **K-P2** SCORM | S8b, S8d, S15c, S16a, S19a | **Karar (port, ADR-006):** LMS/CMI adaptörü yok; bellek seam. S19a sayımı: 13 SCORM testinden 7 uyarlandı, 6 emekli (§13) |
| **K-P3** localStorage | S8c | `bestScore` kaldırma/oturum-içi; `landingSound`/`fsPromptDone` kabuk ya da çıkarma |
| **K-P4** varlık sunumu | S3b, S18b | 31 MB / 249 wav kökü |
| **K-P5** i18n kapsamı | S13a, S13b, S14, S15b, S16a, S16b | Gömülü metinlerin `packages/ui/i18n/tr.ts`'e taşınması |
| **T14a merge** | **S18a** (zorunlu) | SimHost sözleşmesi tüketicisinden önce birleşir; S18a merge edilmeden S18b başlamaz |

S0-S17 dilimleri **T14a SimHost sözleşmesinden bağımsızdır**; S0a K-P1'e, S8\*/S15c/S16a K-P2/K-P3'e,
S3b/S18b K-P4'e bağlıdır. Karar (23 Eyl 2026, K-P1): paket yolu `packages/sim-ausculta`; tablodaki
`sims/ausculta/…` yolları `packages/sim-ausculta/…` olarak okunur.

**Oyunlaştırma (revize Karar 23 Eyl 2026):** Oyunlaştırma üç simde de (Opaca, Pulse, Ausculta) zorunlu;
Ausculta da `packages/gamification-core` tüketicisidir. Dilim, Opaca portu ve çekirdek merge sonrası
eklenir (S21); Ausculta kendi rozet kataloğunu/hedeflerini taşır, sim verisi ayrı kalır.

### Faz A — İskelet, config ve çekirdek tipler

| # | Dilim | Kaynak (satır) | Hedef dosyalar | ~diff | Bağımlılık | Kabul testi (kaynak → yeni) |
|---|---|---|---|---|---|---|
| S0a | Platform config + sim kaydı | `pnpm-workspace.yaml`, `turbo.json`, `vitest.config.ts`, kök `tsconfig.json`, `tests/config/tsconfig.test.ts` | — | ~90 | **K-P1** | `pnpm turbo lint typecheck test` yeşil; sözleşme testi sim paketini tarar; JSON import kararı sabitlenir |
| S0b | Sim paketi iskeleti + JSON stratejisi | — | `packages/sim-ausculta/{package.json,tsconfig.json}`, `src/index.ts` | ~120 | S0a | yeni `json-import.test.ts` (küçük fixture derlenir) |
| S0c | Çekirdek tipler | `core/types.ts` 242 | `src/core/types.ts` | ~300 | S0b | yeni `types.test.ts` (şema fixture'ı) |
| S0d | Suspend serileştirme | `core/suspend.ts` 114 | `src/core/suspend.ts` | ~260 | S0c | `tests/core.test.ts:87-146,721-758` → `suspend.test.ts` |

### Faz B — Saf motor ve veri

| # | Dilim | Kaynak (satır) | Hedef dosyalar | ~diff | Bağımlılık | Kabul testi (kaynak → yeni) |
|---|---|---|---|---|---|---|
| S1a | Puanlama | `core/scoring.ts` 123 | `src/core/scoring.ts` | ~230 | S0c | `:236-315` → `scoring.test.ts` |
| S1b | Akış | `core/flow.ts` 140 | `src/core/flow.ts` | ~290 | S0c | `:922-1043,1045-1076` → `flow.test.ts` |
| S2a | Vaka doğrulama | `core/validation.ts` 97 | `src/core/validation.ts` | ~170 | S0c | `:317-366` → `validation.test.ts` |
| S3a | Veri JSON kopyası | `src/data/*.json` 8 dosya / 1.173.260 B² | `packages/sim-ausculta/src/data/*.json` (verbatim; `fixture.json` durur) | ~60¹ | S0b | `data-inventory.test.ts` (kayıt sayısı, `runtimeUrl`, kütüphane `key`) |
| S3b | Varlık yerleşimi | `public/brand` 13 / 1.033.264 B, `body` 4 / 369.408 B, `audio/runtime` 249 wav / 30.067.212 B (git-dışı)² | `packages/sim-ausculta/public/…` | ~60¹ | **K-P4**, S0b | `assets.test.ts` (JSON görsel yolları; runtime `skipIf`) + `check:assets` |
| S3c | Ses atama çözücü | `core/resolver.ts` 146 | `src/core/resolver.ts` | ~270 | S3a | `:829-921` → `resolver.test.ts` |
| S3d | Landing metrikleri | `data/metrics.ts` 46 | `src/data/metrics.ts` | ~140 | S3a | `:760-828` → `metrics.test.ts` |
| S2b | Oturum + havuz | `core/session.ts` 77, `data/pool.ts` 15 | `src/core/session.ts`, `src/data/pool.ts` | ~210 | S2a, S3a | `:417-506` → `session.test.ts` |
| S4a | Terminoloji | `data/terminology.ts` 236 | `src/data/terminology.ts` | ~280 | S0c | `:1077-1091` → `terminology.test.ts` |
| S4b | Veri senkronu + tutarlılık testleri | `tests/core.test.ts` (test) | — | ~150 | S2a, S2b, S4a | `:368-415,507-580` → `data-sync.test.ts` |

¹ Verbatim veri/varlık kopyası satır bütçesine sayılmaz; ~diff yalnız manifest ve test içindir.

² **Sonuç (T17b-S3, 24 Eyl 2026):** Kaynak yerel kopyadan `cp`/`rsync` ile taşındı; içerik okunmadı.
S3a: `src/data` 8 JSON / 1.173.260 B (`fixture.json` hariç). S3b: `public/brand` 13 dosya / 1.033.264 B,
`public/assets/body` 4 dosya / 369.408 B (git); `public/assets/audio/runtime` 249 wav / 30.067.212 B
(git-dışı, kök `.gitignore`). Kaynakta runtime dışı izlenen `public/assets/audio` dosyası yok.
`tools/sync-audio.mjs` (`AUSCULTA_SOURCE_DIR`) yeniden kopyalar; `check:assets` runtime dahil zorunludur.

### Faz C — Ses motoru

| # | Dilim | Kaynak (satır) | Hedef dosyalar | ~diff | Bağımlılık | Kabul testi (kaynak → yeni) |
|---|---|---|---|---|---|---|
| S5 | Ses motoru DI/iptal/dispose | `audio/audioConfig.ts` 45, `audio/engine.ts` 202 | `src/audio/{config,engine}.ts` | ~380 | S0b | yeni `engine-lifecycle.test.ts` (sahte fetch/decode/ctx; uçuşta dispose, epoch) |
| S6 | Dalga formu + motor fabrikası | `audio/waveform.ts` 69, `audio/engineSingleton.ts` 4 | `src/audio/{waveform,createEngine}.ts` | ~150 | S5 | yeni `waveform.test.ts` (sahte AudioBuffer) |

### Faz D — Store ve runtime

| # | Dilim | Kaynak (satır) | Hedef dosyalar | ~diff | Bağımlılık | Kabul testi (kaynak → yeni) |
|---|---|---|---|---|---|---|
| S7 | Reducer ayrıştırma | `core/store.tsx:106-299` | `src/core/reducer.ts` | ~300 | S1a, S2b | `:148-234` → `reducer.test.ts` |
| S8a | Olay veri yolu (mount başına) | `core/events.ts` 24 | `src/core/events.ts` | ~70 | S0c | yeni `events.test.ts` |
| S8b | SCORM seam | `core/scorm.ts` 166 | `src/core/scorm.ts` (seam/kaldırma) | ~250 | **K-P2**, S0c | yeni `scorm-seam.test.ts` (DOM'suz hedef enjeksiyonu) |
| S8c | Provider + depolama seam | `core/store.tsx:301-435` | `src/core/provider.tsx` | ~230 | **K-P3**, S7, S8a, S8b | yeni `storage.test.ts` (bestScore kararı) |
| S8d | Runtime flush + now enjeksiyonu | `core/store.tsx:436-536` | `src/core/runtime.ts` | ~250 | S8c | yeni `runtime-flush.test.ts` (sahte hedef, flush/terminate) |

### Faz E — Arayüz (saf mantık → bileşen)

| # | Dilim | Kaynak (satır) | Hedef dosyalar | ~diff | Bağımlılık | Kabul testi (kaynak → yeni) |
|---|---|---|---|---|---|---|
| S9a | PatientStage saf mantığı | `ui/PatientStage.tsx` (geometri/pointer/klavye) | `src/ui/patient-stage/geometry.ts` | ~250 | S0c | yeni `patient-stage-geometry.test.ts` |
| S10 | Stetoskop + pediatrik gövde | `ui/stethoscope.tsx` 42, `ui/torso-pediatric.tsx` 211 | `src/ui/{stethoscope,torso-pediatric}.tsx` | ~340 | S0c | yeni `torso.test.ts` (renderToStaticMarkup) |
| S9b | PatientStage bileşeni + yaşam döngüsü | `ui/PatientStage.tsx` 425 (kalan) | `src/ui/PatientStage.tsx` | ~350 | S9a, S10, S5, S6, S2b, S3b | yeni `patient-stage.test.ts`, `audio-cleanup.test.ts` (unmount'ta seq, geç play) |
| S11a | Araç çubuğu + bölge çipleri | `ui/Toolbar.tsx` 147, `ui/RegionChips.tsx` 49 | `src/ui/{Toolbar,RegionChips}.tsx` | ~270 | S5 | yeni `toolbar.test.ts` |
| S11b | Soru kartı | `ui/Questions.tsx` 148 | `src/ui/Questions.tsx` | ~220 | S1a, S2a | yeni `questions.test.ts` |
| S12a | İkonlar + öğretici adımları | `ui/icons.tsx` 93, `ui/TutorialSteps.tsx` 46 | `src/ui/{icons,TutorialSteps}.tsx` | ~180 | S0c | yeni `icons.test.ts` |
| S12b | Modaller | `ui/{Help,Confirm,PediatricRef}Modal.tsx` 221 | `src/ui/*Modal.tsx` | ~300 | S0c | yeni `modals.test.ts` (odak tuzağı, render) |
| S12c | Dalga görünümü | `ui/WaveformView.tsx` 170 | `src/ui/WaveformView.tsx` | ~280 | S5, S6 | yeni `waveform-view.test.ts` (sahte motor, try/catch) |
| S13a | Giriş + mod seçimi ekranları | `screens/{Start,ModeSelect}Screen.tsx` 244 | `src/screens/…` | ~330 | S5, S8c, S12a, **K-P5** | yeni `screens-entry.test.ts` |
| S13b | Öğretici ekranı | `screens/TutorialScreen.tsx` 135 | `src/screens/TutorialScreen.tsx` | ~200 | S5, S12a, **K-P5** | yeni `tutorial-screen.test.ts` |
| S14 | Öğrenme ekranı | `screens/LearnScreen.tsx` 306 | `src/screens/LearnScreen.tsx` | ~380 | S3d, S13a, **K-P5** | yeni `learn.test.ts`; DevPanel üretim rotasına girmez |
| S15a | Simülasyon saf mantığı | `screens/SimulationScreen.tsx` (akış/skor türetme) | `src/screens/simulation/derive.ts` | ~280 | S1a, S1b, S2b | yeni `simulation-flow.test.ts` |
| S15b | Simülasyon ekranı (UI) | `screens/SimulationScreen.tsx` (gövde) | `src/screens/SimulationScreen.tsx` | ~340 | S15a, S9b, S11a, S11b, S12c, **K-P5** | yeni `simulation.test.ts` (render + vaka akışı) |
| S15c | Simülasyon raporu + yaşam döngüsü | `screens/SimulationScreen.tsx` (rapor/listener) | `src/screens/simulation/runtime.ts` | ~230 | S15b, S8d, **K-P2** | yeni `simulation-runtime.test.ts` (rapor çağrısı, listener temizliği) |
| S16a | Sonuç ekranı | `screens/ResultsScreen.tsx` 248 | `src/screens/ResultsScreen.tsx` | ~320 | S15c, **K-P2**, **K-P5** | yeni `results.test.ts` (terminate seam) |
| S16b | Kaynaklar ekranı | `screens/SourcesScreen.tsx` 252 | `src/screens/SourcesScreen.tsx` | ~320 | S3b, S12a, **K-P5** | yeni `sources.test.ts` |

### Faz F — CSS (ayrı ve sıralı satırlar)

| # | Dilim | Kaynak (satır) | Hedef dosyalar | ~diff | Bağımlılık | Kabul testi |
|---|---|---|---|---|---|---|
| S17a | Token köprüsü | `styles.css:4-75` | `src/styles/tokens.css` | ~150 | S0b | yeni `css-scope.test.ts`: hex yasağı + `--eg-*` çözümleme |
| S17b | Global kapsam | `styles.css:76-103` | `src/styles/base.css` | ~150 | S17a | `css-scope.test.ts`: `html/body/#root` seçicisi yok |
| S17c | Bileşen sınıfları | `styles.css` (`.card`/`.btn`/`.badge`/`.footer` vb.) | `src/styles/components.css` | ~380 | S17b | `css-scope.test.ts`: önek/kapsam kuralı |
| S17d | Duyarlılık + hareket | `styles.css` (20 `@media`, 3 `!important`) | `src/styles/responsive.css` | ~250 | S17c, S16b | `css-scope.test.ts`: 360/768/1440 + `prefers-reduced-motion` korunur |

### Faz G — Entegrasyon (iki ayrı paket, arada review/merge kapısı)

| # | Dilim | Kaynak (satır) | Hedef dosyalar | ~diff | Bağımlılık | Kabul testi |
|---|---|---|---|---|---|---|
| S18a | SimHost adaptörü (sim paketi) | `App.tsx` 73, `main.tsx` 15 | `packages/sim-ausculta/src/mount.tsx` | ~180 | **T14a merge**, S16b, S17d | yeni `mount.test.ts` (mount→dispose→remount, StrictMode, sızıntı) |
| — | **Review/merge kapısı** | S18a (`packages/sim-ausculta`) birleşmeden S18b (`apps/shell`) başlamaz | — | — | S18a `VERDICT: APPROVE` + merge (depo sahibi) | — |
| S18b | Shell lazy rotası (`apps/shell`) | `apps/shell/src/routes.ts:24-30` | `apps/shell` rota + lazy import | ~150 | **S18a merge**, **K-P4** | yeni `tests/shell/ausculta-route.test.ts` + mount smoke |

### Faz H — Kapanış

| # | Dilim | Kaynak (satır) | Hedef dosyalar | ~diff | Bağımlılık | Kabul testi |
|---|---|---|---|---|---|---|
| S19a | SCORM testleri uyarlama/emeklilik | `tests/core.test.ts:31-85,581-719` | `tests/sim-ausculta/runtime-flush.test.ts` | ~200 | **K-P2**, S8d | **Sonuç:** 13 test → 7 uyarlama, 6 emekli, 0 aynen (§13) |
| S19b | 114 test mutabakatı | `tests/core.test.ts` 114 test | `tests/sim-ausculta/*` | ~80 | S0d…S19a | **Sonuç:** 101 port + 7 uyarlama + 6 emekli = 114 (§13) |
| S20 | Lint kapsamı kapanışı | — | `packages/sim-ausculta` (canlı kod); `sims/**` boş arşiv | ~10 | S19b, S5, S7, S8d, S13a, S13b, S14, S15c, S16a | **Sonuç:** `Date.now()` çağrısı 0; `sims/**` kullanılmıyor (§13) |
| S21 | Oyunlaştırma (Opaca sonrası, `packages/gamification-core` tüketicisi) | — (yeni) | `packages/sim-ausculta/src/gami/*`; çekirdek `packages/gamification-core`'dan | ≤~400 (bölünür) | **Opaca portu + `packages/gamification-core` merge**, S18a | yeni `gami.test.ts`; sime özgü rozet kataloğu/hedefler; `GAMI_ENABLED=false` iken arayüzde gami öğesi yok |

## 10. Kabul testi matrisi (kaynak test → dilim eşlemesi)

Kaynak test grupları (`tests/core.test.ts` satır aralıkları) port hedefi ve taşındığı dilimle
eşlenir; testler mümkün olduğunca ilgili motor dilimiyle birlikte taşınır. SCORM gruplarının
(`31-85`, `581-719`) korunacak/uyarlanacak/emekliye ayrılacak sayısı **K-P2** kararıyla kesinleşir
(S19a); başka hiçbir dilim SCORM test sayısı varsaymaz.

| Kaynak grup (satır) | İçerik | Port hedefi | Dilim |
|---|---|---|---|
| 31-85 | SCORM runtime adapter'ları | `runtime-adapter.test.ts` (seam) / emeklilik | S8b, S19a (K-P2) |
| 87-146 | suspend round-trip + 4096 limit | `suspend.test.ts` | S0d |
| 148-234 | reducer: oturum/devam ettirme | `reducer.test.ts` | S7 |
| 236-315 | skor hesaplama (hakimiyet, ipucu, K2) | `scoring.test.ts` | S1a |
| 317-366 | vaka şeması doğrulaması | `validation.test.ts` | S2a |
| 368-415 | veri seti ↔ kütüphane ↔ vaka senkronu | `data-sync.test.ts` | S4b |
| 417-477 | oturum örnekleme (deterministik 10 vaka) | `session.test.ts` | S2b |
| 478-506 | soru seçenek karıştırma | `session.test.ts` | S2b |
| 507-580 | tıbbi tutarlılık (vitaller, seçenek bütünlüğü) | `data-sync.test.ts` | S4b |
| 581-719 | SCORM interactions + auto-flush | `runtime.test.ts` (DOM'suz hedef enjeksiyonu) | S8d, S19a (K-P2) |
| 721-758 | suspend boyut koruması | `suspend.test.ts` | S0d |
| 760-828 | landing metrikleri + veri seti envanteri | `metrics.test.ts` | S3d |
| 829-921 | CirCor dış eşleme + ses eşleme | `resolver.test.ts` | S3c |
| 922-1043 | flow: nextAction/resample/region/zayıf alan | `flow.test.ts` | S1b |
| 1045-1076 | tutorialProgress | `flow.test.ts` | S1b |
| 1077-1091 | libraryShortTitle | `terminology.test.ts` | S4a |

Ek (kaynakta olmayan) port testleri:

- `engine-lifecycle.test.ts` (S5): sahte `fetch`/`decode`/`AudioContext`; uçuşta `dispose`, epoch
  iptali, `setTimeout` temizliği, ikinci `dispose` idempotentliği (§4 gereksinimleri).
- `audio-cleanup.test.ts` (S9b): `PatientStage` unmount'ta ses durur, `placeSeqRef` artar, geç
  çözülen `play` sesi başlatmaz.
- `mount.test.ts` (S18a): `mount(root, context) → dispose`; mount→unmount→remount; listener/timer/
  context sızıntısı yok; StrictMode çift mount; iki opak aktör arası yerel durum sızıntısı yok.
- `css-scope.test.ts` (S17a-S17d): renk literali yasağı, `--eg-*` çözümlenebilirliği, global
  `html/body/#root` seçicisi yok, sınıf öneki/kapsam kuralı.
- Dilim içi saf mantık testleri: `types.test.ts` (S0c), `patient-stage-geometry.test.ts` (S9a),
  `simulation-flow.test.ts` (S15a), `simulation-runtime.test.ts` (S15c), `data-inventory.test.ts`
  (S3a), `asset-paths.test.ts` (S3b), `events.test.ts` (S8a), `storage.test.ts` (S8c).

## 11. Kanıt / varsayım ayrımı

**Kanıt [K]:** satır sayıları; singleton ve çağrılmayan `dispose`; fetch/decode iptalsizliği;
`setTimeout` sızıntısı; `PatientStage` unmount'unun `seq`'i artırmaması; `WaveformView`'in
try/catch'siz `play`'i; localStorage anahtarları; `Date.now` sayısı; SCORM `parent`/`opener`
araması ve `window.close`; CSS global seçiciler/hex/`!important`/media sayıları; platform
workspace/lint/turbo/vitest/tsconfig kısıtları; kaynak testin JSON+`.mjs` importu; `public/`
dosya sayısı ve boyutu; `sims/*` yer tutucuları; family-tokens'ta Ausculta paletinin hazır olması.

**Varsayım / doğrulanacak [V]:**
- Kapalı `AudioContext`'te düğüm oluşturmanın tarayıcıda fırlattığı hata türü (S5 testinde
  sahte context ile sabitlenir; gerçek tarayıcı davranışı T09 e2e'de doğrulanır).
- Statik JSON importunun paket boyutuna etkisi (1,1 MB veri) — ölçüm S3a'da yapılır.
- 31 MB ses varlığının shell `public` kopyasıyla ilk yükleme maliyeti — ölçüm S18b rota smoke'unda.
- `import.meta.env.DEV`'in sim paketinde tip çözümü (vite/client tipleri) — S0b'de netleşir.
- Platform `@egemed/ui` bileşenlerine geçişin Ausculta ekranlarında yol açacağı görsel farklar
  (E2 T16a/T20 kapsamı; bu envanterin dışı).

## 12. İnsan kararı bekleyen açık sorular

1. **K-P1 Paket yerleşimi — Karar (23 Eyl 2026):** `packages/sim-ausculta`; `sims/*` arşiv/boş kalır.
   Karar S0a'yı ve `tests/config/tsconfig.test.ts` genişletmesini belirler; S0a bu karara göre başlar.
2. **K-P2 SCORM — Karar (port, ADR-006; sayım T17b-S19):** LMS/CMI adaptörü kalkar; suspend ve
   oturum seam'i `RuntimeAdapter` üzerindedir. 31-85 ve 581-719: 7 uyarlama, 6 emekli (§13).
3. **K-P3 localStorage:** `bestScore` kaldırılsın mı, oturum-içi mi tutulsun? `landingSound`/
   `fsPromptDone` kabuğa mı taşınsın, simden mi çıkarılsın? Karar S8c'yi açar.
4. **K-P4 Varlık sunumu:** 31 MB/249 wav için shell `public` kopyası mı, sim paketi `public` mi,
   yoksa import tabanlı (`new URL(..., import.meta.url)`) mı? Karar S3b ve S18b'yi açar.
5. **K-P5 i18n kapsamı:** gömülü Türkçe metinler (ör. `StartScreen.tsx:70-101`, `chrome.tsx:124-131`)
   hangi dilimde `packages/ui/i18n/tr.ts`'e taşınır? Öneri: S13a/S13b/S14/S15b/S16a/S16b ekran
   dilimleriyle birlikte.

## 13. Test mutabakatı (T17b-S19, 24 Eyl 2026)

Kaynak `tests/core.test.ts` @ `3d60ef7`: **114** `it`. Sayım: port (aynı iddia, gerçek JSON veya
satır içi saf girdi) + uyarlama (CMI yüzeyi kalkmış seam) + emeklilik = 114. Yeni düşük sinyalli
test eklenmedi. S1a/S2a (`scoring.test.ts`, `validation.test.ts`) `CORE_CASES` /
`poolFor("assessment")` ile `cases.json` üzerindedir; sentetik `CaseDef` yok.

### 13.1 S19a — SCORM grupları (13)

K-P2: pencere taraması, `cmi.*` alan adları, 1.2/2004 ayrımı ve öğrenci kimliği taşınmaz.
Uyarlananlar `tests/sim-ausculta/runtime-flush.test.ts` içindedir.

| Kaynak `it` | Grup | Sonuç |
|---|---|---|
| mock adapter temel CRUD | 31-85 | uyarlama — bellek adaptörü yazım/flush |
| LMS yoksa standalone fallback (`detectScorm`) | 31-85 | emekli — `parent`/`opener` taraması yok |
| 2004 Initialize/SetValue/GetValue sırası | 31-85 | emekli — CMI API yok |
| 1.2 `success_status` → `lesson_status` | 31-85 | emekli — sürüm eşlemesi yok |
| 2004 `"incorrect"` + `PT4S` | 581-719 | uyarlama — `correct: false`, `latencySec: 4` |
| 1.2 `"wrong"`, latency yazılmaz | 581-719 | emekli — tek kayıt biçimi |
| O2 type/id/ayırıcı | 581-719 | uyarlama — `choice`, vaka kimliği, `response: string[]` |
| O2(d) `_count` | 581-719 | uyarlama — önceki kayıtlara ekleme |
| O1 `completion_status` ezmeme | 581-719 | emekli — CMI durum yazımı yok |
| O1 `Scorm12Adapter` `lesson_status` | 581-719 | emekli — 1.2 adaptörü yok |
| O3 `cmi.exit` | 581-719 | uyarlama — `completed` bayrağı |
| D12 terminate sonrası no-op | 581-719 | uyarlama |
| beforeunload `suspend_data` | 581-719 | uyarlama — `flushNow` + konum |

**7 uyarlama, 6 emekli, 0 aynen.** `runtime-flush.test.ts` içindeki `init` geri yükleme ve no-op
testleri S8d seam ekidir; 114 sayımına girmez.

### 13.2 S19b — §10 grupları

| Kaynak grup | `it` | Hedef | Sonuç |
|---|---:|---|---|
| 31-85 | 4 | `runtime-flush.test.ts` | 1 uyarlama, 3 emekli |
| 87-146 | 3 | `suspend.test.ts` | 3 port |
| 148-234 | 7 | `reducer.test.ts` | 7 port |
| 236-315 | 8 | `scoring.test.ts` | 8 port (S1a, `cases.json`) |
| 317-366 | 5 | `validation.test.ts` | 5 port (S2a, `cases.json`) |
| 368-415 | 8 | `data-sync.test.ts` | 8 port |
| 417-477 | 10 | `session.test.ts` | 10 port |
| 478-506 | 2 | `session.test.ts` | 2 port |
| 507-580 | 5 | `data-sync.test.ts` | 5 port |
| 581-719 | 9 | `runtime-flush.test.ts` | 6 uyarlama, 3 emekli |
| 721-758 | 2 | `suspend.test.ts` | 2 port |
| 760-828 | 9 | `metrics.test.ts` | 9 port |
| 829-921 | 14 | `resolver.test.ts` | 14 port |
| 922-1043 | 20 | `flow.test.ts` | 20 port |
| 1045-1076 | 5 | `flow.test.ts` | 5 port |
| 1077-1091 | 3 | `terminology.test.ts` | 3 port |
| **Toplam** | **114** | | **101 port + 7 uyarlama + 6 emekli** |

### 13.3 S20 — `Date.now` ve `sims/**`

`packages/sim-ausculta` altında `Date.now()` çağrısı **0** (yorumlar hariç). Canlı kod
`packages/sim-ausculta` içindedir ve kök ESLint kuralı bu yolu kapsar. `sims/ausculta`,
`sims/opaca`, `sims/pulse` boştur (K-P1 arşiv). `eslint.config.js` bu dilimde değiştirilmedi;
`sims/**` yok sayması boş arşiv yolu içindir.
