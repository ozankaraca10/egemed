# E2 — Pulse port envanteri (T18a)

Durum: Envanter, uygulama planına girdi. Kaynak: `/Users/ozankaraca/Documents/EGEMED CLIX/EGEMED_PULSE`
@ `3f94259` (ağaç temiz, ölçüm 23 Eylül 2026). İlgili: ADR-006, `docs/specs/E1-sim-port.md`,
`E2-tek-platform-yol-haritası.md` (T18 satırı), `docs/agentic/CODEX-DEVIR.md` §5–6.

> **Durum (24 Eyl 2026):** Motor, durum, müfredat, kalıcılık, host, controller, çizim, ekranlar ve CSS dilimleri tamam;
> SimHost adaptörü (S15a) sürüyor. `nextEvent` yığın taşması portta düzeltildi (kaynağa uygulanması insan kararı).

Okuma sınırı korundu: `public/assets/**`, `**/dist/**`, `*.lock`, büyük veri JSON'ları topluca
okunmadı; `curriculum.js` yalnız uçlar ve sayımlarla incelendi. Kaynak repoya yazılmadı; testler
geçici kopyada koşuldu.

## 1. Kaynak envanteri (ölçüldü)

Bayt değerleri `wc -c`, satırlar `wc -l` iledir. Yoğun satır stili nedeniyle ham satır sayısı
port boyutunu göstermez; bu nedenle biçimlendirilmiş satır tahmini de verilir.

| Dosya | Satır | Bayt | B/satır | Biçimlendirilmiş satır¹ | Rol | DOM |
|---|---|---|---|---|---|---|
| `cardai/model.js` | 53 | 12.538 | 237 | ~313 | EKG/mekanik motor, saf fonksiyon | yok |
| `cardai/state.js` | 26 | 7.760 | 298 | ~194 | v6 şema, örneklem, encode/decode/derive | yok (crypto) |
| `cardai/curriculum.js` | 595 | 166.081 | 279 | ~4.152² | 200 vaka + 200 soru, banka/permütasyon | yok |
| `cardai/scorm.js` | 41 | 9.976 | 243 | ~249 | SCORM 1.2 + localStorage kalıcılık | yok |
| `cardai/app.js` | 173 | 52.923 | 306 | ~1.323 | controller, RAF döngüsü, canvas çizim | yoğun |
| `cardai/features.js` | 181 | 47.535 | 263 | ~1.188 | vaka/soru/sonuç/hakkında ekranları | yoğun |
| `cardai/landing.js` | 54 | 7.439 | 138 | ~186 | landing, WebAudio monitör sesi | yoğun |
| `cardai/index.html` | 145 | 39.091 | 270 | ~977 | 7 görünüm, 6 dialog, SVG kalp | iskelet |
| `cardai/styles.css` | 446 | 73.778 | 165 | ~911³ | tüm stiller; global `:root/body/button` | — |
| **Toplam** | **1.714** | **417.121** | **243** | **~9.500** | | |

¹ Biçimlendirilmiş satır tahmini = bayt / 40 (JS/TS/HTML). Kalibrasyon: Ausculta portunun
biçimlendirilmiş TS/TSX kaynağı 6.064 satır / 251.922 bayt = **41,5 B/satır**; 40 temkinli
üst sınırdır. CSS, 40 B/satır alınırsa ~1.844 satıra çıkar (üst sınır).
² `curriculum.js`'in 160.337 baytı authored veridir (bütçe dışı, S3); kod kısmı 5.732 bayt →
~143 satır.
³ CSS tahmini bayt / 81: Ausculta `styles.css` 1.083 satır / 87.901 bayt = 81,2 B/satır.

Runtime toplamı **1.714 ham satır / 417 KB** (9 dosya); kaynak 138–306 B/satır yoğunluğunda
olduğundan ham satır sayısı biçimlendirilmiş portu 3–7× küçük gösterir. E1'deki "~7.8k satır"
tahmini ham satır ölçümüyle karşılaştırılamaz; biçimlendirilmiş tahmin (~9,5k, CSS üst sınırıyla
~10,4k) aynı mertebededir ve bu envanterle çürütülemez (§11/6). Port boyutlandırması bu bayt ve
biçimlendirilmiş satır tahminleriyle yapılır. Yükleme sırası (`index.html:144`):
`model → scorm → curriculum → state → app → features → landing`; IIFE'ler arası bağ yalnız
`window` global'leriyle kurulur.

## 2. Motor / arayüz sınırı

- **Korunur (davranış değişmez):** `model.js` tamamı (`CardiacModel`, `MODES`, `LEADS`, `NO_P`,
  `fiducials`, `limb`, ST haritaları, `hash`), `state.js` şema ve türetme mantığı,
  `curriculum.js` verisi ve `seededPermutation`, `scorm.js`'teki 4096 bayt/bozuk kayıt politikası
  (kalıcılık arayüzü olarak).
- **Taşınır (DOM/yan etki):** `app.js`, `features.js`, `landing.js`, `index.html`, `styles.css`.
- **Platformda yer almaz:** `scorm.js`'in SCORM API çağrıları ve SCORM paketleme (ADR-006); xAPI
  eşlemesi K2/K3 sonrası T22/T23'ün işidir. Geçici kalıcılık `PersistencePort` ile localStorage.
- **Ekran sahipliği:** landing, mod çerçevesi ve ortak bileşenler T20'nin; Pulse yalnız sim
  içeriğini (kalp/EKG/açıklama/vaka/soru/sonuç) SimHost içinde çalıştırır.

## 3. Ekran haritası

| Görünüm | Kök (index.html) | Üreten | Not |
|---|---|---|---|
| Landing | `#landingPage` (4) | `landing.js` | Platform girişiyle değişir; monitör sesi opsiyonel |
| Mod seçimi | `#modesView` (131) | `renderModes` (app.js:117) | T20 mod kartı çerçevesi |
| İnceleme | `#simView` (19) | `applyMode/draw` (app.js:105-106), `renderHeart` (51), `renderECG` (72), `renderText` (90) | Ana klinik ekran |
| Öğretici | `#tutorialPanel` (132) | features.js:118-131 | İlk kullanım 3 adım |
| Uygulama (vaka) | `#caseView` (127) | `renderCase` (features.js:84) | 10 vaka, kaliper, "simülatörde aç" |
| Değerlendirme | `#quizView` (129) | `renderQuiz` (app.js:145) | 10 soru, gönderim kilidi |
| Sonuçlar | `#resultsView` (131) | `renderResults` (features.js:160) | Alan bazlı performans + rapor |
| Hakkında | `#aboutView` (131) | `renderAbout` (features.js:143) | `sources.json` fetch + inline yedek |
| Dialoglar | 137-142 | app.js/features.js/landing.js | info, quizExit, finish, resample, reset, fullscreenPrompt |

`showView` anahtarları (app.js:108): `sim, case, quiz, about, modes, tutorial, results`.
Şemada `educator` değeri de var (`state.js:19`) ama hiçbir görünüm yok — **ölü değer**, portta
düşürülür. `state.activeView` yalnız bu 7 değere daraltılmalı (varsayım, §11).

## 4. window global'leri ve olaylar

| Global | Tanım | Tüketen |
|---|---|---|
| `CardAIModel` | model.js:52 | app.js:2, state.js:3, features.js:4/70/116, landing.js:2 |
| `PulseCurriculum` | curriculum.js sonu | app.js:18, state.js:3, features.js:79/151, landing.js:2 |
| `PulseState` | state.js:25 | app.js:2/20-21, scorm.js:24 |
| `CardAIScorm` | scorm.js:40 | app.js:2/21/94/98/122/167, features.js:2/178, landing.js:12 |
| `CardAIController` | app.js:170 | features.js:2, landing.js:12-14/31, scorm.js:39 |
| `CardAIDiagnostics` | app.js:171 | yalnız denetim betikleri |
| `CardAResults` | features.js:176 | app.js:121/156 |
| `CardAILanding` | landing.js:52 | app.js:113/130, features.js:178 |
| `CardAITutorial` | features.js:131 | landing.js:12 |

Olaylar (CustomEvent, `window`): `cardai:tick` (app.js:90), `cardai:mode` (105), `cardai:view`
(108), `cardai:session` (109-110), `cardai:reset` (122). Port kuralı: global yazımı yok; açık
`import` + `SimContext.emit`; olay adları T21 sözlüğüne taşınır (ağ yok).

## 5. Belge çapı DOM aramaları

`$ = document.getElementById` (app.js:2) ve doğrudan `document.querySelector*` çağrıları:

- app.js: `.rhythm-tab[data-mode]` ×2 (102, 124), `.lead-select` ×2 (103, 125),
  `[data-phase]` ×2 (90, 127), `[data-phase="atrial"]` (105), `.back-sim` (130),
  `.coronary-particle` (50), `[data-question-lead="…"]` (142), `dialog[open]` ×2 (28, 166).
- features.js: `.caliper-handle` ×2 (57, 180), `.lead-select` (44), `.panel-focus` (13),
  `[data-explain-tab]` ×2 (40-41), `[data-focus-panel]` (14), `[data-measure]` (52),
  `.caliper-handle.a/.b` (54), `.rhythm-tabs` (128), `#caseCaliper .a/.b` (83), `dialog[open]` (116).
- landing.js: `.landing-lead` (3), `.rhythm-tab.selected` (12), `dialog[open]` (26).

Port kuralı: `query(root, selector)` yardımcısı; `document.body.dataset.mode` → kök `dataset`;
`body.landing-open` → `SimContext` bayrağı; `dialog[open]` → kök altındaki açık dialog kaydı;
`window`/`document` listener'ları mount'ta eklenir, `dispose`'ta çıkarılır.

## 6. Zamanlayıcı, RAF, listener ve gözlemci temizliği

| Kaynak | Ne | Mevcut temizlik | Port aksiyonu |
|---|---|---|---|
| app.js:123 | her karede yeniden `requestAnimationFrame(frame)` | yok | `SimContext.requestFrame` + `dispose`'ta `cancelFrame` |
| app.js:97 | 1 sn `setInterval` (sınav saati) | yok | scheduler'a bağla; dispose'da `clearInterval` |
| app.js:37 | `ResizeObserver` (EKG canvas) | yok | `disconnect()` dispose'a |
| app.js:136-140 | `ResizeObserver` (soru canvas) | kısmi `disconnect` (140) | mount başına tek observer, dispose'da kapat |
| app.js:168 | `MutationObserver` (body open/hidden) | yok | kök gözlemi; dispose'da `disconnect` |
| app.js:166-169 | `keydown, visibilitychange, pagehide, pageshow, scroll` | yok | tek `AbortController` sinyali |
| features.js:12 | `fullscreenchange` ×2 | yok | platform (T20) sahipliğine devret |
| features.js:48/105/110/113/145/177 | `cardai:*` olay dinleyicileri | yok | host emitter aboneliği; dispose'da çöz |
| features.js:53/104 | `document` click | yok | kök kapsamlı; dispose'da çöz |
| features.js:57-59 | `pointerdown/move/up` | yok | AbortController; drag sırasında dispose güvenli |
| features.js:8/59/64/66/88 | `setTimeout` (not, kaliper, görev, ipucu, flash) | bazıları yok | timer seti; dispose'da hepsini `clearTimeout` |
| features.js:120-125 | öğretici `setTimeout` | `clearTimeout` var | korunur |
| landing.js:30 | tam ekran önerisi `setTimeout(400)` | yok | platform prompt'una devret |
| landing.js:41-43 | WebAudio `setInterval` + `AudioContext` | `stop` var, `close` yok | `AudioPort`; dispose'da `ctx.close()` |
| landing.js:48-51 | `pointerdown/keydown/visibilitychange` | yok | AbortController |
| scorm.js:38-39 | `visibilitychange/pagehide` | yok | `PersistencePort` + host yaşam döngüsü |

## 7. Asset ve veri yolları

- **Görseller (4):** `assets/egemed-pulse-favicon.png` (favicon, üst çubuk, footer),
  `assets/egemed-pulse-landing.png` (landing), `assets/ege-tip-logo.png`,
  `assets/brand/ege-tip-seal-128.png` (`#instLogo`, index.html:131). Platformda rota tabanı
  `context.assetBase` (`/sims/pulse/…`); mutlak `/assets` varsayımı yasak (E2 Opaca dersi).
- **`sources.json` (5,1 KB):** `fetch('sources.json')` (features.js:143); dosya protokolünde
  `#pulse-sources` inline JSON yedeği (index.html:143). Port: tip tipli içe aktarım veya
  `assetBase` üzerinden fetch + inline yedek; atıf/lisans metni korunur.
- **`curriculum.js`:** ayrı JSON yok, veri kod içinde (166 KB); çalışma zamanı
  `cases.length===200 && questions.length===200` guard'ı var. Portta tip tipli veri modülü +
  aynı guard; QC dışa aktarımı (`qa/export_items.mjs`) kaynak repoda kalır.
- **Başka ağ bağımlılığı yok**; kaynak bağlantıları (ESC/AHA DOI) isteğe bağlı dış link.

## 8. Mevcut test durumu (bu oturumda koşuldu, geçici kopya)

| Koşum | Sonuç |
|---|---|
| `python3 qa/sol_package_tests.py` | **5/5 OK** (0.279 sn) |
| `qa/independent_state.mjs` | **5/5 PASS** |
| `qa/independent_model.mjs` | **79/79 PASS** (12 mod, QRS/PR/QT/hız, bellek, determinizm) |
| `qa/independent_scorm.mjs` | **16/16 PASS** (API taklidi, arıza enjeksiyonu) |
| `qa/independent_runtime.mjs` | **6/6 PASS** (yerel 8765 sunucusu) |
| `qa/mode_flow_audit.mjs` | **27/27 PASS** (akış/kilit/tam ekran/ses) |
| `qa/independent_content.mjs` | **2/3 — FAIL:** `T04-unique-content-and-position-distribution` |

Benzersizlik hatası ölçümü: `cases` 198/200 (`vf:vfFlow`×2, `vf:noQrs`×2), `questions` 199/200
(`vf:noQrs`×2); denetim 200/200 bekliyor. Bu kaynak deponun mevcut durumudur; port "tüm kaynak
testleri yeşil" varsayamaz. Karar (havuzu düzelt / assertion'ı gerekçeli daralt) insanındır.

Koşulmayanlar: `independent_e2e.mjs`, `ui_audit.mjs`, `independent_gallery.mjs`,
`independent_native_visibility.mjs`, `independent_visibility_probe.mjs`, `export_items.mjs`
(uzun/headed/~80 MB çıktı). Altyapı engelleri: Playwright 5 betikte mutlak cache yolundan
import edilir; `127.0.0.1:8765` sunucusu elle başlatılır; kanıtlar `qa/evidence/final/` altına
yazılır (`export/` dışındakiler git'te). Bu haliyle kapıya (`pnpm turbo test`) bağlanamazlar;
portta vitest'e taşınacak regresyon kaynağıdırlar.

## 9. Deterministik test seam'leri

- **Motor:** `CardiacModel` tamamen deterministik (`hash` tamsayı karıştırma, model.js:18);
  `Math.random`/`Date` yok. Golden vektörler: mod başına QRS 80/140/160/180 ms, hızlar
  75–167/dk, VF `flow===0`, ekstremite kimlikleri (`III=II−I`, `aVR=−(I+II)/2`), seek
  determinizmi (checkpoint <1500, beat <200).
- **Örneklem:** `randomInt` `crypto.getRandomValues`/`Math.random` (state.js:6-7) → `SimContext.randomInt`
  enjekte edilir; tohumlu RNG ile 1000 çekilişin benzersizliği test edilir.
- **Saat:** `Date.now()` (app.js:96,108) ve `performance.now()` (app.js:23,98,123; scorm.js:4,16)
  → `SimContext.now`; AGENTS gereği doğrudan kullanım yasak.
- **Kare döngüsü:** `requestAnimationFrame` → `requestFrame/cancelFrame`; sahte scheduler ile
  16 sn gözlem, gizli sekme, duraklatma, dispose sonrası tick yokluğu test edilir.
- **Görünürlük:** `document.hidden` → `isHidden`; `visibilitychange/pagehide` host yaşam döngüsü.
- **Ses:** WebAudio → `AudioPort { unlock, start, stop, close }` (landing sesi opsiyonel).
- **Kalıcılık:** `PersistencePort { load, save, clear }`; bellek ve localStorage uygulamaları;
  bozuk kayıtta yazma engeli ve 4096 bayt reddi politika olarak korunur.
- **DOM:** tüm aramalar `root` parametreli; `dispose` idempotent; iki örnek aynı sayfada izole.
- **i18n:** chrome metinleri `t()` anahtarlarına; authored içerik (vaka/soru/ipucu) veri olarak
  kalır (varsayım, §11).

## 10. Port dilimleri (sıralı, her biri derlenebilir/testlenebilir, ≤~400 satır diff)

Yerleşim (Karar 23 Eyl 2026, K-P1): **`packages/sim-pulse/`** — `sims/**` workspace ve eslint dışı
olduğundan (`pnpm-workspace.yaml:2-3`, `eslint.config.js:6`) kapılar ancak workspace paketinde çalışır;
`sims/*` arşiv/boş kalır. Her dilimde `pnpm turbo lint typecheck test` yeşil; testler kökte
`tests/sim-pulse/*.test.ts` (vitest `include`, `vitest.config.ts:5`).

**Boyut yöntemi:** `~diff` = biçimlendirilmiş kaynak tahmini (bayt / 40; §1¹) + yeni kabul testi
tahmini. Kaynak QA betikleri port edilmez; testler yeni yazıldığından test payı tahminidir.
Ham satır sayıları yoğun stil nedeniyle kullanılmaz; 400'ü aşan dilimler bölünmüştür.

### Kapılar (dilim ön koşulu)

| Kapı | Bağlı dilimler | Etki |
|---|---|---|
| **K-P1** paket yerleşimi | **S0a** (zorunlu) | **Karar (23 Eyl 2026): `packages/sim-pulse`**; `sims/*` arşiv/boş kalır. Workspace/eslint/turbo/tsconfig sözleşmesi bu yola göre kurulur |
| **K-P2** SCORM | S5a, S7a, S12b, S15a | ADR-006: SCORM API çağrıları ve paketleme kaldırılır; 4096 bayt/bozuk kayıt politikası `PersistencePort`'ta korunur; `finish`/etkileşim raporu seam mi, kaldırma mı |
| **K-P3** yerel depolama | S5a, S5b, S13b | `egemed-pulse-6.0` + legacy anahtarlar, ses tercihi ve tam ekran istemi kabukta mı simde mi; öğrenci verisi ADR-005 |
| **K-P4** varlık sunumu | S13b, S15b | 4 görsel + `sources.json` kökü (`context.assetBase`); mutlak `/assets` varsayımı yasak |
| **K-P5** i18n kapsamı | S10a, S10b, S11b, S12a, S12b, S13a, S13b | Chrome metinleri `packages/ui/i18n/tr.ts` (`sim.pulse.*`); authored içerik veri kalır |
| **T14a merge** | **S6**, **S15a** (zorunlu) | SimHost sözleşmesi tüketicisinden önce birleşir; S15a merge edilmeden S15b başlamaz |
| **S3 boyut istisnası** | **S3** (zorunlu) | 160 KB verbatim veri ~400 satır hedefi dışı; onaylanmazsa banka/vaka/soru olarak üçe bölünür |
| **T04 içerik hatası** | S4, port kabulü | Benzersizlik denetimi 2/3 (§8); havuz düzeltmesi ya da gerekçeli dar assertion insan kararı |

### Dilimler

| # | Dilim | Kaynak (satır / bayt) | Hedef dosyalar | ~diff | Bağımlılık | Kabul testi |
|---|---|---|---|---|---|---|
| S0a | Platform config + sim kaydı | `pnpm-workspace.yaml`, `turbo.json`, `vitest.config.ts`, `eslint.config.js`, kök `tsconfig` | — | ~100 | **K-P1** | `pnpm turbo lint typecheck test` yeşil; sözleşme testi sim paketini tarar |
| S0b | Sim paketi iskeleti | — | `packages/sim-pulse/{package.json,tsconfig.json,src/index.ts}` | ~120 | S0a | Paket derlenir; boş `mount` smoke testi |
| S0c | Model temeli (şekil/hash/limb/ST) | `model.js:5-21` (2,4 KB) | `src/engine/shapes.ts` | ~150 | S0b | Golden: limb kimlikleri, ST haritaları, hash determinizmi |
| S0d | Beat üretimi + önbellek | `model.js:22-33` (3,8 KB) | `src/engine/beats.ts` | ~185 | S0c | QRS 80/140/160/180 ms, hız 75–167/dk, seek determinizmi |
| S0e | Sinyal + snapshot + metrik | `model.js:34-52` (6,1 KB) | `src/engine/model.ts` | ~275 | S0d | VF `flow===0`, faz/fiducial, metrik yuvarlama |
| S1 | Durum şeması + göç | `state.js:1-5,11-26` (5,8 KB) | `src/engine/state.ts` | ~235 | S0e | decode/encode roundtrip, v1–v6 göç, XSS temizliği, 4096 sınırı (kaynak kanıtı 1.678 bayt) |
| S2 | Örneklem + RNG | `state.js:6-10` (2,0 KB) | `src/engine/{sample,rng}.ts` | ~120 | S1 | `randomInt` seam'i, 1000 çekiliş benzersizliği, oturum kimliği/roundtrip |
| S3 | Curriculum verisi (verbatim) | `curriculum.js:7-570` (160,3 KB) | `src/data/curriculum.ts` | ~60¹ | S1 | Sayım testi: 200/200, `version`; **S3 boyut istisnası** |
| S4 | İçerik invariantları | `curriculum.js:1-6,571-594` (5,7 KB) | `src/engine/curriculumIndex.ts` | ~245 | S3 | 400 madde, 5 benzersiz seçenek, O1–O6, sayısal hedefler; **T04 kapısı** |
| S5a | Kalıcılık politikası + bellek | `scorm.js:1-20` (5,4 KB) | `src/persistence/{types,policy,memory}.ts` | ~225 | **K-P2**, **K-P3** | Bozuk/oversize yazma engeli, 4096 bayt reddi |
| S5b | localStorage uygulaması | `scorm.js:21-41` (4,6 KB) | `src/persistence/localStorage.ts` | ~195 | S5a | Legacy anahtar göçü, `clear`; **K-P3** |
| S6 | SimHost yardımcıları | — (T14a sözleşmesi) | `src/host/{dom,events}.ts` | ~240 | **T14a merge** | `query(root)`, emitter, `AbortController`; iki örnek izolasyonu, global yok |
| S7a | Controller init + gözlem/scheduler | `app.js:1-2,18-35,91-101,123-128` (7,4 KB) | `src/engine/{controller,scheduler}.ts` | ~305 | S1, S2, S5a, **K-P2** | 16 sn gözlem, hız, görünürlük; dispose'da tick yok |
| S7b | Mod/lead/görünüm geçişi | `app.js:102-113,115-122` (9,7 KB) | `src/engine/actions.ts`, `src/ui/modes.ts` | ~355 | S7a | `showView` anahtarları, `applyMode`, mod kartları |
| S8a | Kalp SVG + sahne geometrisi | `index.html:38-103` (9,3 KB) | `src/ui/sim/{heart,heartMarkup}.ts` | ~315 | S0e | SVG veri/template; saf görünüm hesabı ayrı |
| S8b | Canvas kalp + koroner parçacıklar | `app.js:36-50,51-71` (5,3 KB) | `src/ui/sim/heartCanvas.ts` | ~200 | S8a | Parçacık konumları deterministik |
| S9 | EKG canvas + item EKG + zoom | `app.js:72-89,129-143` (9,8 KB) | `src/ui/sim/{ecg,ecgGeometry,itemEcg}.ts` | ~345 | S0e, S7b | 3 sütun, 25 mm/sn–10 mm/mV, aktif sütun, normal overlay, zoom |
| S10a | Mod içeriği sözlüğü (authored) | `app.js:3-17` (11,1 KB) | `src/data/content.ts` | ~320 | S0b | 13 modun başlık/özet/ipucu/kartları; **K-P5** sınırı |
| S10b | Metrik + açıklama + sistematik | `app.js:90`, `features.js:18-53` (8,1 KB) | `src/ui/sim/{metrics,explain}.ts` | ~290 | S10a | Faz/faz etiketleri, 6 adım sistematik okuma, i18n |
| S11a | Kaliper + görev/ipucu + rehber | `features.js:54-76` (7,2 KB) | `src/ui/case/{caliper,challenge,guide}.ts` | ~270 | S9 | Sürükleme + klavye, görev doğrulama |
| S11b | Vaka ekranı | `features.js:77-104` (10,0 KB) | `src/ui/case.ts` | ~350 | S11a, S10b | 10 vaka akışı, rapor/yanlış inceleme; T20 kart/çerçeve |
| S12a | Quiz | `app.js:144-159` (5,4 KB) | `src/ui/quiz.ts` | ~225 | S9, S11b | Gönderim kilidi, 10 soru, `grade` |
| S12b | Sonuçlar + rapor/CSV + reset | `features.js:105-113,150-181` (10,6 KB) | `src/ui/results.ts` | ~365 | S12a, **K-P2** | Alan raporu, 8/10 eşiği, CSV; skor kaydı K-P2 |
| S13a | Hakkında + öğretici | `features.js:114-120,121-149` (9,5 KB) | `src/ui/{about,tutorial}.ts` | ~330 | S10a, **K-P5** | `sources.json` `assetBase`'ten; atıf korunur; öğretici 3 adım |
| S13b | Landing + monitör sesi | `index.html:4`, `landing.js:1-54` (11,4 KB) | `src/ui/landing.ts`, `src/audio/monitor.ts` | ~365 | **K-P3**, **K-P4** | `AudioPort`; ses tercihi; T20 sahipliği netleşene dek opsiyonel |
| S14a | Token köprüsü + global kapsam + kabuk | `styles.css:2-18` (20,4 KB) | `src/styles/{tokens,base}.css` | ~310 | S0b | Hex yok; `:root/body/button` globali yok; `--eg-pulse-*` çözülür |
| S14b | CSS 2 — odak/taşıma + anatomi/EKG | `styles.css:19-80` (14,5 KB) | `src/styles/sim.css` | ~230 | S14a, S8b | `eg-pulse-` öneki; odak/taşıma düzeni |
| S14c | CSS 3 — mod/öğretici + vaka | `styles.css:81-180` (14,4 KB) | `src/styles/explain.css` | ~230 | S14a, S10b | Önek/kapsam kuralı |
| S14d | CSS 4 — vaka + quiz/sonuç | `styles.css:181-300` (12,5 KB) | `src/styles/case.css` | ~205 | S14a, S11b | 360/768/1440 taşma yok |
| S14e | CSS 5 — sonuç/hakkında + duyarlılık/hareket | `styles.css:301-446` (12,0 KB) | `src/styles/responsive.css` | ~200 | S14a, S13a | 31 `@media`, `prefers-reduced-motion` korunur |
| S15a | Sim adaptörü (sim paketi) | `app.js:160-173` (2,7 KB), `index.html:143-145` | `src/mount.tsx` | ~270 | **T14a merge**, S13b, S14e | mount→dispose→remount, StrictMode, sızıntı yok |
| — | **Review/merge kapısı** | S15a (`packages/sim-pulse`) birleşmeden S15b (`apps/shell`) başlamaz | — | — | S15a `VERDICT: APPROVE` + merge (depo sahibi) | — |
| S15b | Shell lazy rotası (`apps/shell`) | `apps/shell/src/routes.ts:24-30` | `apps/shell` rota + lazy import | ~150 | **S15a merge**, **K-P4** | Rota testi + mount smoke; `/sims/pulse/` |
| S16 | Oyunlaştırma (Opaca sonrası, `packages/gamification-core` tüketicisi) | — (yeni) | `packages/sim-pulse/src/gami/*`; çekirdek `packages/gamification-core`'dan | ≤~400 (bölünür) | **Opaca portu + `packages/gamification-core` merge**, S15a | Karar (23 Eyl 2026, revize): oyunlaştırma üç simde de (Ausculta dahil) zorunlu; Pulse kendi rozet kataloğunu/hedeflerini taşır, sime özgü ekranlar sim paketinde, sim verisi ayrı kalır |
| T09 | Mobil e2e (ayrı görev, T09) | — | `e2e/pulse.spec.ts` | (T09 kapsamı) | S15b | 360/768/1440, klavye, 44 px, yatay taşma yok |

¹ Verbatim veri kopyası satır bütçesine sayılmaz; ~diff yalnız sayım testi/manifest içindir
(Ausculta S3a/S3b kalıbı). S14a–S14e aralıkları bitişik kaynak satırlarıdır; kaynak CSS'te
bölümler iç içe olduğundan dilim adları baskın içeriği anlatır, port çıktısı kapsam köküne göre
yeniden düzenlenir.

Sıra: S0a–S0e motor çekirdeği hemen başlar; S1–S4 durum/veri; S5–S6 kalıcılık/host
(**S6 için T14a**); S7–S13 görünüm (T20 çerçevesi); S14 CSS en son (görünüm sabitlenince);
S15a adaptör → **review/merge kapısı** → S15b shell rotası; S16 oyunlaştırma Opaca portu
(`packages/gamification-core`) sonrası; T09 e2e ayrı görev. T21 olay sözlüğü gelince S6/S7a
`emit` çağrıları tiplenir; ağ yazımı yok (K2/K3 kapıları).

## 11. Varsayım / kanıt ayrımı

**Kanıt (ölçüm, kod, koşum):** satır/bayt sayıları (§1); global ve olay listesi (§4);
querySelector envanteri (§5); zamanlayıcı/gözlemci listesi (§6); asset yolları (§7);
test sonuçları ve benzersizlik sayıları (§8); `sims/**` eslint/workspace dışı; vitest DOM'suz
ortam; `Date.now()` yasağı; ADR-006'nın SCORM dağıtımını kaldırması; E2'nin T18 satırı ve
`mount(root, context) → dispose` sözleşme metni.

**Varsayım (doğrulanmadı, karar gerektirir):**
1. Hedef paket `packages/sim-pulse/` — Karar (23 Eyl 2026, K-P1). `SimContext` alanları (§10) — E1 açık
   sorusu; T14a sabitler.
2. `educator` görünüm değerinin ölü olduğu ve düşürüleceği.
3. Chrome metinlerinin `packages/ui/i18n/tr.ts` içine `sim.pulse.*` ile taşınacağı; authored
   içeriğin veri kalacağı.
4. SCORM etkileşim raporunun T21/T22'ye kadar raporlanmadan yalnız olay üretileceği.
5. Landing ekranı ve monitör sesinin platform/T20 sahipliğinde opsiyonel olacağı.
6. E1'deki "~7.8k satır" tahmininin **kapsamı** (hangi dosyalar) doğrulanmadı; ham satır sayısı
   (1.714) karşılaştırma için uygun değil. Biçimlendirilmiş tahmin (~9,5k) aynı mertebede
   olduğundan tahmin yanlış sayılamaz; port boyutlandırması §1'deki bayt/tahmin sütunlarına dayanır.
7. T09 e2e dosya yolu (`e2e/pulse.spec.ts`) — henüz klasör yok.

## 12. Riskler ve açık sorular

1. **400 satır hedefi:** S3 veri taşıması **boyut istisnası** §10 Kapılar tablosunda; onaylanmazsa
   dosya banka/vaka/soru olarak üçe bölünür, ancak `makeItems`/`freeze` tutarlılığı riske girer.
2. **İçerik benzersizlik hatası** (§8): **T04 kapısı**; düzeltilmeden port kabulü "kaynak denetimi
   yeşil" diyemez; havuz düzeltmesi ya da gerekçeli dar assertion insan kararıdır.
3. **Sözleşme yokluğu:** **T14a merge kapısı**; S6 ve S15a T14a'ya bağlı, S15a merge edilmeden
   S15b (`apps/shell`) başlamaz; aksi halde adaptör yeniden yazılır.
4. **DOM'suz test sınırı:** jsdom onaysız yasak; motor saflığı korunmazsa dilim test edilemez.
5. **Kalıcılık kararı:** **K-P2/K-P3 kapıları**; 4096 bayt sınırı SCORM mirası, localStorage'da
   korunmalı mı? (öneri: koru); hangi anahtarlar kabuğa taşınır?
6. **Tıbbi içerik/atıf:** `sources.json` credits ve "sentetik, tanı aracı değil" metinleri aynen
   taşınmalı; lisans "tüm hakları saklıdır" (kaynak README §Lisans); **K-P4/K-P5** ile bağlı.
7. **İnsan kapıları:** K-P1 çözüldü (Karar 23 Eyl 2026: `packages/sim-pulse`); K-P2…K-P5, S3 istisnası
   ve T04 hatası §10 Kapılar tablosunda dilimlere bağlandı; K2/K3 (xAPI/LRS) bu envanterin dışında;
   T18a yalnız port girdisini üretir.
