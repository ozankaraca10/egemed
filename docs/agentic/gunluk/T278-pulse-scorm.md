# T278-pulse-scorm

- Tarih: 2026-10-01 16:01
- Commit: T278: Pulse SCORM/LMS katmanı kaldırıldı, yerel kalıcılık korundu
- Dal: task/T278-pulse-scorm

---

# T278 — Pulse: SCORM/LMS kalıntılarını kaldır (Z3)

- Tarih: 2026-10-01
- Worktree: `.agtx/worktrees/T278-pulse-scorm` (dal `task/T278-pulse-scorm`)
- Plan: `.egemed-run/plan.md`

## Özet

Pulse vendor runtime'ından SCORM 1.2 / LMS iletişimi tamamen kaldırıldı; `window.CardAIScorm`
adı ve yerel (localStorage) kalıcılık davranışı (4096 bayt sınırı, bozuk kayıt/sürüm koruması,
legacy anahtarlar, `save`/`load`/`finish` sözleşmesi) aynen korundu. Kullanıcıya görünen
SCORM/LMS metinleri nötrleştirildi, T276b'den beri erişilemeyen `#aboutData` ("Yerel veriler")
bölümü ve ona bağlı vendor kodu kaldırıldı.

## Değişen dosyalar

- `packages/sim-pulse/src/runtime/vendor/scorm.js` → `vendor/persistence.js` (yeniden adlandırıldı):
  - Kaldırıldı: `findAPI` (API/API_1484_11 penceresi arama), `invoke`, `LMSInitialize`/`LMSGetValue`/
    `LMSSetValue`/`LMSCommit`/`LMSFinish` çağrıları, `cmi.*` alanları, `interaction`/`queueFromState`,
    LMS'e bağlı `previousStatus`/`statusReadOK`/`interactionCountReady` durumu ve
    `isLMS`/`detected`/`previousStatus`/`pendingInteractions` üyeleri.
  - Korundu: `KEY='egemed-pulse-6.0'` + `LEGACY_KEYS`, `load` (4096 bayt/JSON/sürüm denetimi,
    bozuk kayıtta yazma kilidi), `save` (yerel yazma + ölçek denetimi), `finish`, `clearLocal`,
    `acknowledgeReset`, `setActivity`, `sessionTime`, `ended`, `resumeBlocked`, `lastResult`,
    `activeMilliseconds`, `visibilitychange`/`pagehide` kaydı.
- `vendor/persistence.d.ts`: `.d.ts` eş adı (içerik değişmedi).
- `packages/sim-pulse/src/runtime/host.ts`: import/SCRIPTS etiketi `persistence`, BUILD.md sırası ve
  `pagehide` yorumu güncellendi; `CardAIScorm` global geçişi aynen duruyor.
- `packages/sim-pulse/src/runtime/gami.ts`: yerel `scorm` değişkeni ve `SourceScorm` arayüzü
  `persistence`/`SourcePersistence` oldu; `handle.global("CardAIScorm")` sözleşmesi ve `save`
  sarmalama davranışı değişmedi.
- `vendor/state.js`: `derive()` içindeki LMS mirası `|| root.CardAIScorm.previousStatus==='passed'`
  kaldırıldı; `passed` artık yalnız yerel tamamlanma + puan kapısı. Kullanılmayan `CardAIScorm`
  env destructure'dan çıkarıldı.
- `vendor/app.js`: `statusText` yalnız yerel/kayıt mesajları (`Tarayıcı kaydı okunamadı … Yeniden dene.`,
  `İlerleme kaydedildi · tarayıcı`); `persist()` içindeki LMS etkileşim raporu durumu
  (`interactions==='failed-pending'`) kaldırıldı.
- `vendor/features.js`: `#downloadReport` (CSV) ve `#resetProgress`/reset diyaloğu bağları ve
  bunlarla yetim kalan `featureNames` sabiti kaldırıldı; `#aboutData` ile ölen
  `resetAll` çağrısı tek bağdı, bu yüzden bağ kalktı (aşağıda karar notu).
- `vendor/markup.js`: `#aboutView` içindeki `<section id="aboutData">…</section>` ve
  `<dialog id="resetDialog">…</dialog>` kaldırıldı; `finishDialog` metnindeki "modülü LMS'ye
  bitmiş olarak bildirir" ifadesi "simülatör oturumunu kapatır" oldu. `aboutView` iskeleti ve
  `#aboutContent` dokunulmadı.
- `vendor/landing.js`: "SCORM 1.2 / Puan ve durum LMS'e raporlanır." kartı kaldırıldı.
- `vendor/styles.js` + `packages/sim-pulse/src/styles/responsive.css`: ölen
  `#aboutData .report-actions` kuralı, artık hiçbir yerde kullanılmayan `.report-actions` ve
  `.danger-btn` seçicileri ve bayat "veri araçları Hakkında'da" yorumu temizlendi.
- `tests/sim-pulse/content.test.ts`: T278 kalıntı taraması eklendi.

## Kararlar ve varsayımlar (etkileşimsiz çalışma notu)

1. **Dosya adı değişikliği:** Plan `scorm.js` adını kullanıyor, ancak kabul ölçütü
   `git grep -i "scorm\|lms" -- packages/sim-pulse/src` çıktısında "yalnız `CardAIScorm` adı ve
   yorumlar" istiyor. Dosya adı/import yolu korunsaydı iki kod satırı ölçütü bozacaktı; bu yüzden
   vendor modülü `persistence.js` olarak yeniden adlandırıldı (köken yorumu korundu).
2. **`resetAll`/`clearLocal`/`acknowledgeReset` korundu:** KESİN KURAL 7 "yerel kalıcılık
   davranışı KORUNUR" diyor. `CardAIController.resetAll` (yerel ilerlemeyi sıfırlama) ve
   `CardAIScorm.clearLocal`/`acknowledgeReset` bu yüzden silinmedi; yalnız UI (aboutData +
   resetDialog + `#confirmReset` bağı) kaldırıldı, yani sıfırlama artık UI'dan erişilemez ama
   platform API'si olarak duruyor. Depo sahibi isterse takip göreviyle tamamen kaldırılabilir.
3. **`previousStatus` sahteleri:** 5 test dosyasında artık okunmayan
   `win["CardAIScorm"] = { previousStatus: "" }` stub'ları kaldı; testleri zayıflatmadıkları ve
   cerrahi değişiklik ilkesi gereği dokunulmadı (isteğe bağlı temizlik).
4. **Şema:** `docs/sema/` şemaları etkilenmedi; rota, rol, sim-host sözleşmesi, oturum/ödül/akış
   değişikliği yok (kaldırılan bölüm T276b'den beri zaten erişilemezdi).
5. **Kapsam dışı:** `docs/adr`, `docs/specs`, `docs/audits`, `README.md` içindeki tarihsel
   SCORM/LMS ifadeleri değiştirilmedi.

## Test politikası (yeni test — 4 soru)

`tests/sim-pulse/content.test.ts` → "SCORM/LMS kalıntısı kullanıcıya görünen yüzeylerde kalmaz (T278)"
(`app.js`, `features.js`, `landing.js`, `markup.js` içinde `SCORM|LMS` yok).

1. **Korunan davranış/sözleşme:** Açılış sayfası ve diyaloglarda öğrenciye var olmayan
   SCORM/LMS kaydı vaat edilmemesi (ADR-006).
2. **Gerçekçi hata:** Vendor dosyalarının ileride yeniden düzenlenmesi/senkronu ile metnin geri gelmesi.
3. **Mevcut testler neden yakalamıyor:** T138/T160 testleri yalnız `app.js` içindeki iki dizgeyi
   tarıyor; `landing.js`/`markup.js` (ve yeni `features.js`) kapsam dışıydı.
4. **Üretim kodunda test-only açıklık gerekmiyor:** Dosyalar zaten test tarafından okunuyor.

Kaldırılan veya zayıflatılan test yok; SCORM varlığını doğrulayan bir test yoktu. Kalıcılık
sözleşmesi mevcut testlerle (`tests/sim-pulse/persistence.test.ts`) ve e2e PULSE-08 akışıyla
korunmaya devam ediyor.

## Kapı sonuçları

- `pnpm turbo lint typecheck test` → **17/17 görev yeşil**; 232 test dosyası,
  1944 geçti / 1 atlandı (önceden var olan ilgisiz atlama), 0 başarısız.
- `E2E_PORT_BASE=5850 EGEMED_E2E_API_URL=http://127.0.0.1:9 CI=true pnpm exec playwright test e2e/pulse-runtime.spec.ts e2e/pulse-a11y.spec.ts --project=desktop-1440`
  → **15/15 geçti** (uygulama sonrası ve CSS temizliği sonrası olmak üzere iki kez koşuldu).
  Portlar 5850–5852 kullanıldı (5850–5899 aralığında).

## `git grep -i "scorm\|lms" -- packages/sim-pulse/src` çıktısı (22 satır)

```
packages/sim-pulse/src/audio/monitor.ts:  readonly scheduleIntervalMs: number;
packages/sim-pulse/src/audio/monitor.ts:  scheduleIntervalMs: 250,
packages/sim-pulse/src/audio/monitor.ts:      intervalHandle = options.intervals.setInterval(schedulerTick, config.scheduleIntervalMs);
packages/sim-pulse/src/runtime/env.ts:  readonly CardAIScorm: unknown;
packages/sim-pulse/src/runtime/gami.ts: * (`CardAIScorm.save`) izler ve tamamlanan oturumları `buildAttemptRecord`
packages/sim-pulse/src/runtime/gami.ts:  const persistence = handle.global("CardAIScorm") as SourcePersistence | undefined;
packages/sim-pulse/src/runtime/host.ts:  /** Kaynak `window.*` API'leri (CardAIController, CardAIScorm …); testler ve köprü için. */
packages/sim-pulse/src/runtime/host.ts:        CardAIScorm: local["CardAIScorm"],
packages/sim-pulse/src/runtime/serverItems.ts:  visits: {} as Record<string, { dwellMs: number; listenMs: number; visits: number; firstOrder: number }>,
packages/sim-pulse/src/runtime/vendor/app.js:const { window, document, localStorage, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, ResizeObserver, CardAIModel, CardAIScorm, PulseCurriculum, PulseState } = env;
packages/sim-pulse/src/runtime/vendor/app.js:const $=id=>document.getElementById(id),{CardiacModel,ALL_MODES,LEADS,NO_P,anteriorST,inferiorST,clamp}=CardAIModel,S=CardAIScorm,COUNT=window.PulseState.COUNT;
packages/sim-pulse/src/runtime/vendor/curriculum.js:const { window, document, localStorage, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, ResizeObserver, CardAIModel, CardAIScorm, PulseCurriculum, PulseState } = env;
packages/sim-pulse/src/runtime/vendor/features.js:const { window, document, localStorage, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, ResizeObserver, CardAIModel, CardAIScorm, PulseCurriculum, PulseState } = env;
packages/sim-pulse/src/runtime/vendor/features.js:const $=id=>document.getElementById(id),C=window.CardAIController,S=window.CardAIScorm,state=C.state,clamp=window.CardAIModel.clamp;
packages/sim-pulse/src/runtime/vendor/landing.js:const { window, document, localStorage, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, ResizeObserver, CardAIModel, CardAIScorm, PulseCurriculum, PulseState } = env;
packages/sim-pulse/src/runtime/vendor/landing.js:function enter(){window.CardAIController?.revokeObservation();window.CardAIController?.setPlaying(false);landing.hidden=true;app.hidden=false;document.body.classList.remove('landing-open');window.CardAIController?.resize();requestAnimationFrame(()=>window.CardAIController?.draw());const controller=window.CardAIController,state=controller?.state,resumeBlocked=!!window.CardAIScorm?.resumeBlocked,hasProgress=!!state&&['sim','case','quiz'].includes(state.activeView)&&(Object.values(state.viewed).some(value=>value>0)||state.caseSubmitted.some(Boolean)||state.quizSubmitted.some(Boolean));if(!resumeBlocked&&window.CardAITutorial?.shouldRun()){controller?.showView('tutorial');window.CardAITutorial.start();}else controller?.showView(!resumeBlocked&&hasProgress?state.activeView:'modes');document.querySelector('.rhythm-tab.selected')?.focus();stopMonitorSound();}
packages/sim-pulse/src/runtime/vendor/model.js:const { window, document, localStorage, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, ResizeObserver, CardAIModel, CardAIScorm, PulseCurriculum, PulseState } = env;
packages/sim-pulse/src/runtime/vendor/persistence.js:// Köken: EGEMED_PULSE/cardai/scorm.js (2026-09-27 anlık görüntüsü).
packages/sim-pulse/src/runtime/vendor/persistence.js:// T278 (ADR-006): SCORM/LMS iletişimi (API arama, LMS* çağrıları, cmi.* alanları)
packages/sim-pulse/src/runtime/vendor/persistence.js:// kaldırıldı; `CardAIScorm` adı ve yerel (localStorage) kalıcılık davranışı korunur.
packages/sim-pulse/src/runtime/vendor/persistence.js:const { window, document, localStorage, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, ResizeObserver, CardAIModel, CardAIScorm, PulseCurriculum, PulseState } = env;
packages/sim-pulse/src/runtime/vendor/persistence.js:window.CardAIScorm={load,save,finish,clearLocal,acknowledgeReset,setActivity,sessionTime,get ended(){return finished;},get resumeBlocked(){return !resumeReadOK;},get lastResult(){return {...lastResult,errors:[...lastResult.errors]};},get activeMilliseconds(){addTime();return activeMs;},key:KEY};
```

**Değerlendirme:** 22 satırın 18'i `CardAIScorm` adı (env/host/gami/vendor destructure ve
`window.CardAIScorm=` ataması) ya da T278/köken yorumu; kalan 4'ü `-i` büyük-küçük harf
duyarsızlığının yanlış eşlemesi (`scheduleIntervalMs` ×3, `dwellMs` ×1 — içindeki "lMs").
Başka SCORM/LMS metni, `cmi.*` alanı veya LMS çağrısı yok.

## Commit/merge/push

Yapılmadı (talimat gereği).
