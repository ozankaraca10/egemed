# E2 — Opaca port envanteri ve motor sınırı (T15a)

Durum: **Envanter / öneri.** Ürün kodu değiştirmez; T15b port dilimlerinin ve kabul testlerinin
girdisidir. Kaynak: ADR-006 (kabul), E2 yol haritası (T19 worktree'si), E1-sim-port, kaynak depo
`/Users/ozankaraca/Documents/EGEMED CLIX/egemed-opaca` (yerel çalışma kopyası, 2026-09-23).

> **Durum (24 Eyl 2026):** Port tamamlandı ve modül kabukta canlı (`#/sims/opaca`): S1–S24, oyunlaştırma G1–G2 ve
> CSS dilimleri bitti.

> Not: Görev metninde geçen `docs/specs/E2-tek-platform-yol-haritasi.md` bu worktree'de yoktu;
> dosya `.agtx/worktrees/T19-platform-roadmap/docs/specs/` altında bulundu ve okundu. E2 tablosuna
> göre T15a → T14b'ye, T15b → T15a+T20'ye bağlıdır.

## 1. Yöntem ve okuma sınırı

- Kaynak repoda `src/data/*.json`, `public/assets/**`, `dist/**`, lock dosyaları topluca okunmadı;
  yalnız `jq` ile anahtar/sayı, `find`/`wc`/`grep` ile yapı çıkarıldı. Ürün koduna dokunulmadı.
- Test sayıları kaynak repoda `./node_modules/.bin/vitest run --reporter=json` ile ölçüldü.
- Platform kapıları bu worktree'de `pnpm turbo lint typecheck test --force` ile doğrulandı:
  **17 test dosyası / 115 test, 7/7 görev yeşil.**

## 2. Kanıt / varsayım ayrımı

| İfade | Kanıt | Durum |
|---|---|---|
| "Opaca 119 test" | `README.md:242` "3 test dosyası, 119 test"; `CODEX-DEVIR.md` §5 "15 dosya / 119 test" | **Güncel değil.** Ölçüm: 15 dosya / **209 test** (runtime 153 + build-time 56) |
| "187 vaka" | `README.md:102` | **Güncel değil.** `cases-auto.json` 188 vaka; `cases.json` 0 vaka |
| "images.json 597 kayıt" | README + `jq '.records | length'` | Doğrulandı (595 xray + 2 ct `runtimeUrl`) |
| Görüntüler depoda | `git ls-files public` = 157 (144 ct + 13 brand) | `public/assets/xray/runtime/` **621 dosya / 20 MB git-dışı** (`.gitignore:31`); temiz klonda yok |
| SimHost sözleşmesi hazır | `task/T14-sim-host` 2d8f2d5: `packages/sim-host/src/SimHost.ts` (mount→dispose, epoch, `now`) | T14a yazıldı, **dev'e merge değil**; T14b (kabuk rotaları) yok |
| Opaca token'ları hazır | `packages/tokens/opaca.css` snapshot | Paket `opaca.css`'i **ihraç etmiyor**, hiçbir yerde import edilmiyor |
| Kaynak kod strict TS | `egemed-opaca/tsconfig.app.json`'da `strict` yok; `lib: ES2023+DOM` | Platform strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`), kökte DOM lib yok |
| Gamification üç simde zorunlu | E2 §50–52 | Karar (23 Eyl 2026, revize): oyunlaştırma Opaca, Pulse ve Ausculta dilimlerinde zorunlu; bayrak (`?gami=1` / `VITE_GAMI`) varsayılan kapalı |
| Paket yerleşimi `packages/sim-opaca` | E1 açık sorusu, öneri | **Karar (23 Eyl 2026, K-P1):** `packages/sim-opaca`; `sims/*` arşiv/boş kalır |

## 3. Modül envanteri (kaynak `src/`, 8050 satır TS/TSX)

| Alan | Dosyalar (satır) | Toplam |
|---|---|---|
| `src/core/` | `store.tsx` 457, `types.ts` 269, `scorm.ts` 166, `session.ts` 144, `scoring.ts` 110, `geometry.ts` 107, `suspend.ts` 99, `flow.ts` 95, `validation.ts` 92, `images.ts` 50, `events.ts` 24, `answers.ts` 13 | 1626 |
| `src/data/` | `terminology.ts` 108, `metrics.ts` 38, `pool.ts` 14, `zones.ts` 9 + 7 JSON (~1,7 MB) | 169 + JSON |
| `src/ui/` | `FilmViewer.tsx` 651, `FilmInfoPanel.tsx` 191, `chrome.tsx` 182, `Questions.tsx` 153, `icons.tsx` 110, `ConfirmModal.tsx` 75, `HelpModal.tsx` 74, `ZoneChips.tsx` 64, `TutorialSteps.tsx` 25 | 1525 |
| `src/ui/gami/` | 12 dosya, 846 satır | 846 |
| `src/screens/` | `SimulationScreen.tsx` 458, `LearnScreen.tsx` 307, `ResultsScreen.tsx` 269, `SourcesScreen.tsx` 246, `AchievementsScreen.tsx` 143, `LeaderboardScreen.tsx` 139, `ModeSelectScreen.tsx` 139, `StartScreen.tsx` 127, `TutorialScreen.tsx` 92, `DevPanel.tsx` 35 | 1955 |
| `src/gamification/` | 21 dosya, 1852 satır (`repo.ts` 218, `demo.ts` 221, `stats.ts` 133, `mock.ts` 118, `types.ts` 112, `badges.ts` 112, `ranking.ts` 108, …) | 1852 |
| `src/App.tsx`, `src/main.tsx` | 65 + 12 | 77 |
| CSS | `styles.css` 1186 (645 üst düzey blok, 279 tekil üst düzey sınıf), `styles-gami.css` 380, `styles-v2.css` 103 | 1669 |

Giriş noktası: `src/main.tsx` → `createRoot(document.getElementById('root')!)` + üç global CSS +
`src/App.tsx` (`StoreProvider` + ekran anahtarı + `Header` + `DevPanel`). Ekranlar: start, modes,
tutorial, learn, simulation, results, sources, achievements, leaderboard.

Motor sınırı (ADR-006 "korunur" tarafı): `core/geometry.ts` (normalize koordinat, işaret/kutu),
`core/scoring.ts`, `core/answers.ts`, `core/session.ts` (deterministik örnekleme), `core/suspend.ts`,
`core/images.ts`, `data/*` (JSON), `ui/FilmViewer.tsx`'in görüntü etkileşim mantığı. React tarafı:
tüm `screens/`, `ui/*`, `core/store.tsx` provider/reducer, `App.tsx`.

## 4. Bağımlılık envanteri

| Katman | Kaynak (`egemed-opaca/package.json`) | Platform karşılığı | Not |
|---|---|---|---|
| Runtime | `react` ^19.2.8, `react-dom` ^19.2.8 | 19.3.0 pinli (kök + `packages/ui`) | Yeni bağımlılık gerekmez; çift React örneği yasak |
| Derleme | `vite` ^8.3.0, `@vitejs/plugin-react` ^6.1.1, TS ~6.0.2 | Vite 8.3.0, plugin 6.1.1, TS 5.9.3 strict | `verbatimModuleSyntax`/strict farkı port maliyeti |
| Test | `vitest` ^5.0.1 (yapılandırmasız, varsayılan) | vitest 3.2.7, `tests/**/*.test.ts`, DOM ortamı yok | jsdom/testing-library yasak; `react-dom/server` + saf fonksiyon |
| Lint | `oxlint` ^1.81.0 | eslint 9 flat + `Date.now` yasağı | Taşınan kodda 18 `Date.now()` çağrısı |
| Yalnız scripts | `jszip`, `sharp`, `playwright-core` | — | Build/import hattı platform dışı; devDependency eklenmez |

## 5. Veri ve asset yolları

| Varlık | Yol | Boyut / adet | İzleniyor mu? |
|---|---|---|---|
| Vakalar | `src/data/cases-auto.json` | 976 KB, 188 vaka (assessment 124, practice 188, assessment∩validated 124) | Evet |
| Vakalar (çekirdek) | `src/data/cases.json` | 249 B, 0 vaka | Evet |
| Görüntü manifesti | `src/data/images.json` | 587 KB, 597 kayıt; 2 kayıtta `stack` (144 kare) | Evet |
| Kütüphane | `src/data/library.json` | 130 KB, 10 grup | Evet |
| Bulgular / bölgeler / kaynaklar | `findings.json` 5,5 KB, `reading-zones.json` 3,8 KB, `sources.json` 11 KB | — | Evet |
| XR görüntüleri | `public/assets/xray/runtime/*.webp` | 621 dosya / 20 MB; 595 kayıt bu yolu kullanır | **Hayır (git-dışı)** |
| CT yığınları | `public/assets/ct/{ct_intro_01,nodule_mass_01}/{lung,mediastinum}/NNN.webp` | 144 dosya / 4,1 MB; 2 kayıt | Evet |
| Marka | `public/brand/*.png` | 13 dosya / 688 KB; kodda `src/ui/chrome.tsx:9,159`, `screens/SourcesScreen.tsx:129`, `screens/StartScreen.tsx:92` göreli `brand/...` yolu | Evet |

Kod yolları: JSON'lar `import` ile derleme zamanında paketlenir (`core/images.ts:1`, `data/pool.ts:2-3`,
`data/terminology.ts:1-2`, `data/zones.ts:1`, `data/metrics.ts:1`, `screens/SourcesScreen.tsx:3`,
`screens/StartScreen.tsx:8`). Çalışma zamanı görüntü yolu `ImageRecord.runtimeUrl` /
`stack[].frames[]`; `FilmViewer.tsx:100,110` bunu doğrudan `<img src>` yapar. Kaynak `vite.config.ts`
`base: './'`, platform kabuğu da `base: './'`; hash yönlendirmede belge URL'i `/` kaldığı için göreli
`brand/...` ve `assets/...` yolları kökten çözülür — modül varlıkları `/sims/opaca/` altına taşınırsa
yollar kırılır. **[Öneri]** Taşıma ya kök `public/` düzenini korur ya da tüm yollar
`import.meta.env.BASE_URL`/modül tabanıyla üretilir; karar T15b-0'da verilir ve
`tests/sim-opaca/assets.test.ts` ile kapıya bağlanır.

Veri tutarlılığı uyarısı (kanıt): 9 kayıt `modality: "CT"` işaretli, ancak 7'sinin `runtimeUrl`'i
`assets/xray/runtime/*.webp`; `cases-auto.json` 188 (README 187). Bunlar port hatası değil, kaynak
veri notudur; taşımada değiştirilmez, ayrı veri görevi açar.

## 6. Test envanteri — gerçek sayılar ve gruplar

Ölçüm: 15 test dosyası / **209 test** (kaynak repoda tamamı yeşil, ~0,8 sn). Platforma taşınan
**153 çalışma zamanı testi** (66 core + 87 gamification); 56 betik testi taşınmaz, kaynak depoda arşiv
kalır (Karar 23 Eyl 2026).

| Dosya | Test | `describe` grupları | Port kararı |
|---|---|---|---|
| `tests/core.test.ts` | 66 | geometri · yanıt doğruluğu · skor · vaka doğrulama · akış · oturum örnekleme · suspend · SCORM çalışma zamanı · reducer · reducer — konu uygulaması dönüşü · en iyi puan (bestScore) · paketlenen veri | Taşınır (S1–S7) |
| `tests/gamification/*.test.ts` (13 dosya) | 87 | zaman/TR takvimi 16 · ranking 12 · repo 11 · xp 10 · badges 8 · streak-goals 7 · leaderboardView 7 · attempt 4 · badgeView 4 · chart 4 · flag 2 · ui-meta 2 | Taşınır, bayrak kapalı (G1–G5) |
| `tests/scripts.test.ts` | 45 | CSV · DICOM · ortak yardımcılar · vaka seçimi (V1/V10) · soru imzası · güvenli çeldirici · bilgi sorusu tavanı · içe aktarıcılar | **Taşınmaz — kaynak depoda arşiv (veri üretimi + LMS paketleme), Karar 23 Eyl 2026** |
| `tests/remote-zip.test.ts` | 11 | remote-zip Range okuma · Commons lisans filtresi · pediatrik oran | **Taşınmaz — kaynak depoda arşiv (veri üretimi + LMS paketleme), Karar 23 Eyl 2026** |

- **Platform regresyon ağı: 153 test** (66 core + 87 gamification) — Karar (23 Eyl 2026): yalnız çalışma
  zamanı testleri taşınır; `scripts/` hattı (veri üretimi + LMS paketleme) ve 56 betik testi kaynak depoda
  arşiv kalır. `jszip`/`sharp` eklenmez; vaka seti yeniden üretilecekse kaynak depoda üretilip çıktı kopyalanır.
- E1/E2'deki "119 test" hedefi bu ölçümle güncellenir; kabul kapısı 153 test üzerinden sayar.
- Platform test deseni: DOM yok → `renderToStaticMarkup`, saf fonksiyon, dosya okuma `ts.sys.readFile`
  (`tests/shell/layout.test.ts`, `tests/ui/css-tokens.test.ts`). Kaynak testlerin DOM'suz koşanları
  (core, gamification) bu desene uyar; `tests/gamification/helpers.ts:27` bellek içi `localStorage`
  shim'i taşınabilir.

## 7. Riskler (kanıtlı)

### 7.1 SCORM / kimlik (KVKK)
- `core/scorm.ts:32-45` `detectScorm` `window.parent`/`opener` zincirini tarar — iframe/LMS varsayımı;
  platform SPA'da anlamsızdır. `ScormRuntime` `core/store.tsx:258-371` içinde gömülüdür ve
  `init/saveInteractions/saveProgress/reportScore/attachAutoFlush/terminate` API'si vardır.
- `screens/ResultsScreen.tsx:46` `runtime.terminate()` çağırır; `ResultsScreen.tsx:154`
  `runtime.api.get('cmi.learner_name')` sonucunu `getGamiRepo`'ya verir; `gamification/repo.ts:71-90`
  bu adı `localStorage` profilinde görünen ad yapar. **ADR-005 ile uyumsuz** (E2 §52).
- Port kararı: ilk portta `ScormApi` arayüzü + `MockAdapter`/no-op korunur; `detectScorm` ve CMI
  yazımı alınmaz; xAPI eşlemesi K2/K3 sonrası T22/T23'e bırakılır. `learner_name` yolu port diliminde
  kesilir (test: localStorage'a ad yazılmadığı doğrulanır).

### 7.2 localStorage (öğrenci verisi cihazda)
- Anahtarlar: `opaca.bestScore` (`store.tsx:78,83,416`), `opaca.fsPromptDone` (`StartScreen.tsx:14,26,38`),
  `opaca.gami.v1` (`rules.ts:42`; `storage.ts:35-58`).
- İlk portta gamification kapalıyken `gami.v1` yazılmaz; `bestScore` ve `fsPromptDone` davranışı
  platformda korunmalı mı kararı insanındır (cihaz-yerel veri, kurum altyapısı dışı). **[İnsan onayı]**
  Karar (23 Eyl 2026): depolama K-P3 kararına kadar bir port arkasında kalır; davranışın korunup
  korunmayacağı ve anahtar politikası K-P3/T16/T24'te netleşir.

### 7.3 Global CSS ve çift kabuk
- `styles.css` global `:root` token bloğu (hex'ler), `*`, `html, body`, `#root`, `button`,
  `:focus-visible` seçicileri içerir; 279 üst düzey sınıfın bir kısmı genel (`.container`, `.screen`,
  `.app-shell`, `.app-content`, `.modal-overlay`, `.dev-panel`, `.hide-mobile`). `chrome.tsx` kendi
  `Header` + `.eg-footer`'ını çizer; `App.tsx:41-55` `.app-shell`/`app-content` iskeleti kurar.
- Platform kabuğunda `apps/shell/src/shell.css` yalnız `.eg-shell*` sınıfları, `packages/ui` yalnız
  `.eg-*` sınıfları kullanır; Opaca ise `.eg-header`, `.eg-footer`, `.eg-dev-badge`, `.eg-progress-chip`
  ile aynı `eg-` önekini paylaşır. Çakışma riski: kök token'ların platform token'larını ezmesi,
  `body`/`#root` kurallarının kabuğu etkilemesi, `:root` hex'lerinin lint/token sözleşmesini kırması.
- `packages/tokens/opaca.css` kaynak `styles.css`'in iki `:root` bloğunu birebir taşır (2026-09-23);
  `packages/tokens/package.json` yalnız `family-tokens.css` ihraç ediyor → port diliminde
  `"./opaca.css"` export'u eklenir ve modül bunu import eder; yerel `:root` bloğu kaldırılır.
- **[Öneri]** Tüm Opaca CSS'i `.eg-sim-opaca` kök sınıfı altında kapsamlandırılır; `styles-gami.css`
  bayrak kapalıyken gami dilimine ertelenir. Kabul testi: `tests/sim-opaca/opaca-css.test.ts`.

### 7.4 Event bus ve zaman
- `core/events.ts` modül düzeyinde singleton `bus` (2000 kayıt log, abonelik seti); `DevPanel.tsx:13`
  logu okur. 11 `emit` çağrısı `Date.now()` taşır (`store.tsx:169,188,191,194,197,210`,
  `SimulationScreen.tsx:54,126,152,210`, `StartScreen.tsx:75`); seed/gizli süre için 7 çağrı
  (`SimulationScreen.tsx:36,95,131,142`, `ModeSelectScreen.tsx:18`, `ResultsScreen.tsx:59`,
  `AchievementsScreen.tsx:68`); `new Date()` 5 çağrı (`useGami.ts:21,44`, `repo.ts:215`,
  `LeaderboardScreen.tsx:37`, `GamiGains.tsx:39`). Toplam 18 `Date.now()`; platform eslint yasaklar.
- Port kararı: bus `createBus(now)` fabrikasına döner ve mount başına örnek olur; tüm zaman
  `SimMountContext.now`'dan akar; seed `now()` ile üretilir (determinizm testleri korunur).

### 7.5 Temizlik / yaşam döngüsü
- Cleanup'ı olanlar (kanıt): `FilmViewer.tsx:148` ResizeObserver, `:225` interval, `:321` wheel;
  `chrome.tsx:25,45`; modaller (`ConfirmModal.tsx:49`, `HelpModal.tsx:40`, `GamiModal.tsx:19`,
  `GamiBadge.tsx:112`); `SimulationScreen.tsx:411-415`; `StartScreen.tsx:31`; `LeaderboardScreen.tsx:37`;
  `GamiProgressChart.tsx:15`.
- Cleanup'ı olmayan/yeniden kurulan: `core/store.tsx:345-358` auto-flush (beforeunload/visibilitychange)
  ve `:432` pagehide; bunlar `StoreProvider` unmount'unda **düşürülmüyor** (yalnız terminate ediliyor).
  Mount→unmount→remount ve StrictMode çift mount'ta listener sızıntısı/kilitlenme riski buradadır.
- İlk port kabulü: `tests/sim-opaca/store-lifecycle.test.ts` enjekte edilen pencere/belge double'ıyla
  dispose sonrası tüm listener/timer'ların kaldırıldığını; ikinci dispose'ın no-op olduğunu doğrular.

### 7.6 Strict TypeScript ve DOM sınırı
- Kaynak `tsconfig.app.json` `strict` içermez; platform `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax` ister ve kökte DOM lib yoktur. `store.tsx`,
  `FilmViewer.tsx`, `chrome.tsx` DOM tipleri kullanır → paket `tsconfig.json`'u `lib: ["ES2022","DOM"]`
  ve `types: ["vite/client"]` ile `tsconfig.base.json`'u genişletmelidir (shell ile aynı desen).
- `tests/config/tsconfig.test.ts:75-80` paket listesini sabitler; yeni paket eklenince bu liste
  güncellenir (T14a'da `packages/sim-host` için aynısı yapıldı).
- `import.meta.env.DEV`/`VITE_GAMI` kullanımları (`App.tsx:24`, `store.tsx:159,164,426`,
  `flag.ts:19`) Vite tipleri ve derleme sabitine bağlıdır; modül Vite ile derlenecek şekilde kalır.

### 7.7 Gamification bağımlılığı
- Bayrak kapalıyken bile `chrome.tsx:6`, `LearnScreen.tsx:3-4`, `ModeSelectScreen.tsx:8-9`,
  `ResultsScreen.tsx:14-15` gamification modüllerini import eder; `useGami.ts:17-22` modül düzeyi
  `LocalRepo` singleton'ı kurar ve `new Date()` çağırır. İlk portta bu dosyalar taşınmazsa derleme
  kırılır; taşınırsa 87 test regresyon ağına girer. **Karar (23 Eyl 2026):** Gamification Opaca portuyla
  zorunlu dilimler halinde taşınır (G1–G8, §8); sim-bağımsız çekirdek `packages/gamification-core`'a,
  rozet kataloğu/konfig ve ekranlar sim paketine gider. App bu iki ekranı `GAMI_ENABLED` koşulu + lazy
  import ile bağlar.

## 8. SimHost'a ilk port dilimleri

Ön koşullar: **T14a merge** (`packages/sim-host`, `mount(target, context) → dispose`, `now` enjeksiyonu)
ve **T14b** (kabuk `/sims/opaca` rotası + React host). Her dilim: tek paket, ≤~400 satır kaynak diff
(S12'nin gerekçeli istisnası aşağıda), kendi test grubu, `pnpm turbo lint typecheck test` yeşil.
Dilimler sıralıdır; aynı pakette paralel Running açılmaz.

### T15b-0 — Veri ve asset taşıma (kod dilimi değil, ayrı görev)
- `packages/sim-opaca/src/data/*.json` (7 dosya, ~1,7 MB) + `public/brand` + `public/assets/ct`
  kopyalanır; `public/assets/xray/runtime` (621 dosya/20 MB) **git-dışı** olduğundan yerel kopyadan
  kopyalanır; import betikleriyle yeniden üretim yolu **kullanılmaz** (Karar 23 Eyl 2026). Kopyalama
  hedefi (kök `public/` düzeni mi, `/sims/opaca/` mı) **[insan onayı]**.
- Kabul: `tests/sim-opaca/assets.test.ts` — `images.json`'daki her `runtimeUrl` ve `stack[].frames[]`
  yolu ile `brand` referansları diskte var; eksikse test kırmızı (xray taşınmadan port "bitti" sayılmaz).
- **Sonuç (T15b-0, 24 Eyl 2026):** Kaynak yerel kopyadan `cp`/`rsync` ile taşındı; içerik okunmadı.
  `src/data/*.json` 7 dosya/1.714.077 B; `public/brand` 13 dosya/679.055 B; `public/assets/ct`
  144 dosya/4.000.304 B; `public/assets/xray/runtime` 621 dosya/19.929.040 B (git-dışı, kök
  `.gitignore` girdisi eklendi). `tools/sync-xray.mjs` (`pnpm --filter @egemed/sim-opaca sync:xray`,
  `OPACA_SOURCE_DIR` ile kaynak kökü, hedefte silme yok) yeniden kopyalar; `tools/check-assets.mjs`
  (`check:assets`) 739 benzersiz çalışma zamanı yolu + 4 marka referansını zorunlu doğrular (yerelde
  **0 eksik**). Kabul testi: 5 test — xray klasörü yokken ilgili grup açık mesajla `skipIf` ile atlanır
  (4 geçti/1 atlandı), CT ve marka yolları her koşulda kırmızıdır.

### Zorunlu dilimler (ilk çalışan rota)

| # | Dilim | Dosyalar (kaynak satır) | Yaklaşık | Kabul testi |
|---|---|---|---|---|
| S1 | Paket iskeleti + saf tipler | `packages/sim-opaca/{package.json,tsconfig.json,src/index.ts}` + `core/types.ts` 269 + `core/answers.ts` 13 | ~342 + iskelet | `tests/sim-opaca/package.test.ts`; `tests/config/tsconfig.test.ts` paket listesi güncellenir |
| S2 | Geometri + skor | `core/geometry.ts` 107 + `core/scoring.ts` 110 | ~217 | `tests/sim-opaca/core/geometri.test.ts`, `skor.test.ts` (kaynak `core.test.ts` grupları) |
| S3 | Veri katmanı | `core/images.ts` 50 + `data/{pool 14,terminology 108,zones 9,metrics 38}.ts` | ~219 + JSON | `tests/sim-opaca/core/paketlenen-veri.test.ts`, `vaka-dogrulama.test.ts` |
| S4 | Akış / oturum / suspend | `core/flow.ts` 95 + `core/session.ts` 144 + `core/suspend.ts` 99 | ~338 | `tests/sim-opaca/core/{akis,oturum-ornekleme,suspend}.test.ts` |
| S5 | SCORM arayüzü + runtime çıkarımı | `core/scorm.ts` 166 (detectScorm'suz) + `core/runtime.ts` (~130, `store.tsx:258-390` çıkarımı, `now` enjekte) | ~296 | `tests/sim-opaca/core/scorm-runtime.test.ts` (kaynak "SCORM çalışma zamanı" grubu) |
| S6 | Event bus + reducer | `core/events.ts` 24 → `createBus(now)` + reducer/state (`store.tsx:1-255`) | ~259 | `tests/sim-opaca/core/{reducer,bestScore}.test.ts` |
| S7 | Provider + yaşam döngüsü | `core/StoreProvider.tsx` (~120) + enjekte edilebilir pencere/belge sınırı (~80) | ~200 | `tests/sim-opaca/store-lifecycle.test.ts` (dispose→listener/timer yok, çift dispose no-op, StrictMode) |
| S8 | Chrome + ikonlar | `ui/chrome.tsx` 182 + `ui/icons.tsx` 110 | ~292 | `tests/sim-opaca/ui/chrome.test.ts` (statik render; tek üst bar; marka yolu) |
| S9 | Sorular / modaller / çipler | `ui/Questions.tsx` 153 + `ConfirmModal` 75 + `HelpModal` 74 + `ZoneChips` 64 + `TutorialSteps` 25 | ~391 | `tests/sim-opaca/ui/{questions,modaller}.test.ts` |
| S10 | FilmViewer saf çekirdek çıkarımı | `ui/FilmViewer.tsx`'ten `ui/film-core.ts` (~200): görünüm dönüşümü (constrain/zoomBy/reset), `toImage`, klavye komut eşlemesi, `measureLen`, kesit filtreleme, `WINDOW_PRESETS` — React/DOM importu yok | ~200 | `tests/sim-opaca/ui/film-core.test.ts` (saf fonksiyon; fixture görüntü kaydı) |
| S11 | Film bilgi paneli | `ui/FilmInfoPanel.tsx` 191 (`FilmCornerBadge` dahil) — `FilmViewer.tsx:5` bunu import ettiği için entegrasyondan önce taşınır | ~191 | `tests/sim-opaca/ui/film-info.test.ts` |
| S12 | FilmViewer entegrasyonu | `ui/FilmViewer.tsx` 651'nin tamamı (tek derlenebilir birim; `film-core.ts` + `FilmInfoPanel` import eder; stack/slice/HUD/işaret/efektler burada) | ~451 (651 − ~200) | `tests/sim-opaca/ui/film-viewer-static.test.ts` (statik render) + geometri testleri |
| S13 | Start / Mode / Tutorial | `screens/{StartScreen 127,ModeSelectScreen 139,TutorialScreen 92}.tsx` | ~358 | `tests/sim-opaca/screens/baslangic.test.ts` |
| S14 | Learn | `screens/LearnScreen.tsx` 307 | ~307 | `tests/sim-opaca/screens/learn.test.ts` |
| S15 | Simulation saf çekirdek çıkarımı | `screens/SimulationScreen.tsx`'ten `screens/simulation-core.ts` (~150): oturum listesi çözümleme/K3 yeniden üretim, vaka metinleri (`sourceNote`/`patientLine`/`fmtSec`), etkileşim kaydı ve birincil aksiyon kararı — `now` parametre, React importu yok | ~150 | `tests/sim-opaca/screens/simulation-core.test.ts` (saf fonksiyon; K3 yeniden üretim, metin, aksiyon kararı) |
| S16 | SimulationScreen entegrasyonu | `screens/SimulationScreen.tsx` 458'in tamamı (tek derlenebilir birim; `simulation-core.ts` import eder; CaseView/JSX/efektler burada) | ~308 (458 − ~150) | `tests/sim-opaca/screens/simulation-davranis.test.ts` (statik render + reducer etkileşimi) |
| S17 | Results | `screens/ResultsScreen.tsx` 269 (`learner_name` yolu kesilir) | ~269 | `tests/sim-opaca/screens/results.test.ts` + localStorage ad yazılmadığı kontrolü |
| S18 | Sources | `screens/SourcesScreen.tsx` 246 | ~246 | `tests/sim-opaca/screens/sources.test.ts` |
| S19 | App + SimHost adaptörü | `App.tsx` 65 (yeniden düzen) + `src/SimModule.tsx` (~90) + `src/index.ts` | ~175 | `tests/sim-opaca/sim-module.test.ts` + `tests/sim-opaca/static-render.test.ts` |
| S20 | Opaca token ihracı | `packages/tokens/package.json` `"./opaca.css"` export'u + modül girişinde import; port kopyasındaki iki `:root` bloğu `packages/tokens/opaca.css`'e taşınır | ~60 değişen satır | `tests/sim-opaca/opaca-css.test.ts` (hex yalnız token dosyasında) |
| S21 | CSS kapsam A — kabuk/ekran | `styles.css`'ten yerleşim/kabuk/screen/container/btn/tipografi seçicileri, `.eg-sim-opaca` altında | ~350 | aynı test: kapsamsız `:root`/`body`/`#root`/`button` yok |
| S22 | CSS kapsam B — FilmViewer | `.film-*`, `.anno-*`, `.zone-*`, `.measure-*`, `.mark-*`, `.seg`, `.popover` | ~300 | aynı test |
| S23 | CSS kapsam C — kalan + v2 | modaller, `dev-panel`, çipler, yardımcı sınıflar, medya sorguları + `styles-v2.css` 103 | ~350 | aynı test |

**Yarım dosya yasağı (S10–S12, S15–S16):** Hiçbir dilim bir TSX dosyasının "ilk yarısı/kalanı"
biçiminde bölünmez; ara adım tek başına derlenmeyen dosya bırakmaz. Büyük bileşenler önce React/DOM'suz
saf çekirdek çıkarımı, sonra bileşenin tamamının tek parça entegrasyonu olarak iki yeşil dilime ayrılır:

- S10 çıktısı yalnız `ui/film-core.ts` + testi; `FilmViewer.tsx` henüz taşınmaz (paket `tsc` yeşil).
- S11 çıktısı `ui/FilmInfoPanel.tsx` (kendi başına derlenir); `FilmViewer.tsx:5` bağımlılığı budur.
- S12 çıktısı `ui/FilmViewer.tsx` 651 satırın tamamı; çekirdeği import eder, yarım kopya yoktur.
  Gövdesi ağırlıklı hareket satırı olduğundan ~451 satırlık bu entegrasyon dilimi ~400 hedefinin
  bilinçli istisnasıdır; alternatifi derlenmeyen yarım dosyadır.
- S15 çıktısı yalnız `screens/simulation-core.ts` + testi; ekran henüz taşınmaz.
- S16 çıktısı `screens/SimulationScreen.tsx` 458 satırın tamamı; çekirdeği import eder.

**CSS dilimleri (S20–S23):** Sıralıdır ve her dilimden sonra `tests/sim-opaca/opaca-css.test.ts` yeşil
olmalıdır. Platforma yalnız `.eg-sim-opaca` kapsamlı seçiciler girer; hiçbir ara dilimde global
`:root`/`html`/`body`/`#root`/çıplak `button` kuralı bulunmaz, böylece kabuk ve `packages/ui` etkilenmez.
Hex yalnız `packages/tokens/opaca.css`'te kalır, modül CSS'i `var(--…)` kullanır. `styles-gami.css` 380
satır bayrak kapalı olduğundan G6–G8 ile taşınır.

SimHost adaptörü tasarımı (S19, **[Öneri]**): `SimModule.mount` içinde `document.createElement('div')`
→ `target.appendChild` → `createRoot(container).render(<OpacaApp now={context.now} />)`; dönen dispose
`root.unmount()` + `container.remove()` yapar, idempotenttir. Test edilebilirlik için
`createOpacaModule(deps?)` seam'i: `deps` = `{ createContainer, createRoot }`; testler DOM'suz double
enjekte eder, üretimde `react-dom/client` kullanılır. `now`, React context ile reducer/bus/runtime'a
akar; `Date.now()` kullanılmaz. `DevPanel` üretim rotasına girmez (yalnız `import.meta.env.DEV` +
`?dev=1`); çift üst bar/footer oluşmaması için Opaca `Header`/`.eg-footer` kabukta gizlenir.

### Zorunlu dilimler — gamification (bayrak kapalı; Opaca portuyla aktarılır)

Karar (23 Eyl 2026, revize): Oyunlaştırma üç simde de (Opaca, Pulse, Ausculta) zorunlu dilimlerdir.
Sim-bağımsız çekirdek (XP, seviye, seri, hedef, zaman, sıralama, ödül, grafik) `packages/gamification-core`'a;
sime özgü rozet kataloğu/konfig ve ekranlar `packages/sim-opaca`'ya gider; rozet kataloğu ve hedefler sim
başına farklıdır. Sim verileri birleşmez: her sim kendi oyunlaştırma deposunu tutar; depolama K-P3
kararına kadar bir port arkasında kalır. Dosya düzeyinde
sınıflandırılamayanlar (`avatar.ts`, `flag.ts`, `attempt.ts`, `stats.ts`) dilim görevinde netleşir; belirsiz
kalanlar **[insan onayı]**.

| # | Dilim | Dosyalar (satır) | Hedef paket (Karar 23 Eyl 2026) | Yaklaşık | Kabul |
|---|---|---|---|---|---|
| G1 | Pure kurallar A | `types.ts` 112 + `rules.ts` 65 + `xp.ts` 62 + `streak.ts` 47 + `avatar.ts` 12 | `packages/gamification-core` (XP, seviye, seri) | ~298 | `tests/sim-opaca/gamification/{xp,streak-goals,ui-meta}.test.ts` |
| G2 | Pure kurallar B | `badges.ts` 112 + `badgeView.ts` 64 + `chart.ts` 47 + `goals.ts` 64 | `packages/gamification-core` (hedef, grafik); rozet kataloğu/konfig `packages/sim-opaca` | ~287 | `badges, badgeView, chart` testleri |
| G3 | Pure kurallar C | `attempt.ts` 71 + `stats.ts` 133 + `ranking.ts` 108 + `rewards.ts` 68 | `packages/gamification-core` (sıralama, ödül) | ~380 | `attempt, ranking` testleri |
| G4 | Zaman + köprü | `time.ts` 97 + `flag.ts` 20 + `useGami.ts` 71 + `storage.ts` 62 | `packages/gamification-core` (zaman); yerel depo/köprü `packages/sim-opaca`, port arkasında | ~250 | `time, flag, repo/storage` testleri (bellek içi shim) |
| G5 | Repo + demo | `repo.ts` 218 + `mock.ts` 118 + `demo.ts` 221 | `packages/sim-opaca` (her sim kendi deposu; port arkasında) | ~557 → ikiye bölünür | `repo, leaderboardView` testleri |
| G6–G8 | Gami UI + 2 ekran | `ui/gami/` 846 + `AchievementsScreen` 143 + `LeaderboardScreen` 139 | `packages/sim-opaca` (ekranlar) | ~376 × 3 | statik render; `GAMI_ENABLED=false` iken arayüzde gami öğesi yok |

## 9. Kabul testleri ve komutlar

| Kapı | Dosya / komut | Ne doğrular |
|---|---|---|
| Paket sözleşmesi | `tests/sim-opaca/package.test.ts`, `tests/config/tsconfig.test.ts` | `id: "opaca"`, `SimModule` tipi, tsconfig strict bayrakları, paket listesi |
| Modül yaşam döngüsü | `tests/sim-opaca/sim-module.test.ts` | mount→dispose→remount; dispose idempotent; geç gelen lazy modül mount edilmez (SimHost epoch) |
| Statik render | `tests/sim-opaca/static-render.test.ts` | `renderToStaticMarkup(<OpacaApp/>)`; Türkçe başlıklar, tek üst bar, `<iframe>` yok |
| Store temizliği | `tests/sim-opaca/store-lifecycle.test.ts` | dispose sonrası beforeunload/visibilitychange/pagehide/timer yok; `now` enjekte |
| Regresyon | `tests/sim-opaca/core/*.test.ts` + `tests/sim-opaca/gamification/*.test.ts` | Kaynak grupların taşınmış hali; hedef **153 test** (66 core + 87 gamification) — Karar 23 Eyl 2026 |
| Asset bütünlüğü | `tests/sim-opaca/assets.test.ts` | `images.json` yolları + `brand` dosyaları diskte (xray/runtime git-dışı kapısı) |
| CSS sözleşmesi | `tests/sim-opaca/opaca-css.test.ts` | Her CSS diliminde (S20–S23): `:root`/`body`/`#root`/`button` yok, sınıflar `.eg-sim-opaca` kapsamlı, hex yalnız `packages/tokens/opaca.css`'te, tüm `var()` tanımlı |
| Kapı komutu | `pnpm turbo lint typecheck test` | 7/7 görev + tüm testler |
| Kaynak regresyon | `egemed-opaca`'da `npx vitest run` | Taşıma sırasında kaynakta 209 testin tamamı (153 taşınan + 56 arşiv) yeşil kalır |
| Diff disiplini | `git diff --check` | Boşluk/çakışma hatası yok |

Not: T14a'nın `tests/sim-host/sim-host.test.ts` dosyası sahte sim ile host davranışını zaten kapsar;
Opaca testleri host'u yeniden test etmez, **modül tarafını** (id, mount, dispose, `now`) doğrular.
T09 mobil e2e (Playwright, 360/768/1440) çalışan rota sonrası T09'a aittir; bu belge kapsamaz.

## 10. Açık kararlar (insan)

1. **Test hedefi — Karar (23 Eyl 2026):** Platform hedefi **153 çalışma zamanı testi** (66 core + 87 gamification).
   `scripts/` hattı (veri üretimi + LMS paketleme) ve 56 betik testi taşınmaz, kaynak depoda arşiv kalır;
   `jszip`/`sharp` eklenmez. Vaka seti yeniden üretilecekse kaynak depoda üretilip çıktı kopyalanır.
2. **Asset politikası — Karar (23 Eyl 2026):** `public/assets/xray/runtime` (20 MB, git-dışı) yerel kopyadan
   kopyalanır; import betikleriyle yeniden üretim yolu kullanılmaz. Modül varlıklarının sunum kökü
   (kök `public/` düzeni mi, `/sims/opaca/` mı) **[insan onayı]**; T15b-0'da netleşir.
3. **Paket yerleşimi — Karar (23 Eyl 2026, K-P1):** `packages/sim-opaca`; `sims/*` arşiv/boş kalır.
4. **Gamification — Karar (23 Eyl 2026, revize):** Oyunlaştırma üç simde de (Opaca, Pulse, Ausculta) zorunlu
   dilimler halinde aktarılır; sim-bağımsız çekirdek `packages/gamification-core`'a, sime özgü rozet
   kataloğu/konfig ve ekranlar sim paketine gider (§8); rozet kataloğu ve hedefler sim başına farklıdır.
   `bestScore`/`fsPromptDone` localStorage davranışı **[insan onayı]**: ADR-005 ile
   gerilimli; K-P3 kararına kadar depolama bir port arkasında kalır.
5. **SCORM → xAPI — açık (insan onayı):** ilk portta MockAdapter/no-op; eşleme K2/K3 kararları sonrası T22/T23.
