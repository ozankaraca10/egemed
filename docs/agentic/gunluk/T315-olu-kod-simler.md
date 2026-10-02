# T315-olu-kod-simler

- Tarih: 2026-10-02 18:38
- Commit: T315: ölü dışa aktarım temizliği (Ausculta, Pulse, değerlendirme bankası, API testleri — 87 sembol)
- Dal: task/T315-olu-kod-simler

---

# T315 — Ölü dışa aktarım temizliği (Ausculta, Pulse, değerlendirme bankası, API testleri)

Kaynak: knip@5 taraması (2 Eki 2026, dev `46417704`); kapsam listesi `.egemed-run/knip-kapsam.md` (34 dosya, 87 sembol).

## Sonuç
- `pnpm turbo lint typecheck test` → **17/17 yeşil** (235 test dosyası, 1950 test geçti, 1 atlandı).
- Diff: **35 dosya, +71 / −202 satır**. Commit/merge/push **yapılmadı**.
- Ek dosya: `packages/sim-ausculta/src/index.ts` (kural 4: yeniden dışa aktarım satırı; kapsam listesinde dosya yok ama sembol temizliği gerektirdi).

## Sembol sayıları (87 = 71 + 14 + 1 + 1)
| İşlem | Sembol |
| --- | --- |
| Yalnız `export` kaldırıldı (kendi dosyasında kullanılıyor) | **71** |
| Bildirimi tümüyle silindi (hiç kullanılmıyor) | **14** |
| Yeniden dışa aktarım satırı temizlendi (rule 4) | **1** (`SimulationPointerEvent`) |
| Dokunulmadı (dosyası dışında kullanım var) | **1** (`resolveLibrarySoundEx`) |

### Silinen 14 bildirim
- `packages/assessment-bank/src/ausculta/resolver.ts`: `EXTERNAL_RECORDS`, `getSound`, `resolveCaseSounds`, `availableCount`, `assessmentPool`
- `packages/sim-ausculta/src/core/serverSession.ts`: `isServerCaseId`
- `packages/sim-ausculta/src/audio/waveform.ts`: `progressOf`
- `packages/sim-ausculta/src/audio/config.ts`: `HeadDsp`
- `packages/sim-pulse/src/learn/workspace.ts`: `pulseLearnPatterns`, `pulseLearnPattern`
- `packages/sim-ausculta/tools/learning-samples.mjs`: `REAL_DATASET_ORDER`, `patientKeyOf`, `selectTopicSamples`, `buildLearningSamples`

### Sembol dışı zorunlu silmeler (kaskad)
- `packages/sim-ausculta/tools/learning-samples.mjs`: `buildLearningSamples` silinince `selectTopicSamples`; ardından yalnız onların kullandığı `realGroups`, `poolOf`, `teachable` ve `MANIKIN_DATASET` öksüz kaldı. Bu 4 yardımcı da silindi; aksi hâlde `no-unused-vars` lint kapısı kırılırdı. Dosyada yalnız `MAX_SAMPLES` kaldı (`import-circor.mjs` kullanıyor). Üst başlık yorumu kural 5 gereği değiştirilmedi.
- `LibrarySoundResult` (assessment-bank): `export` kaldırıldı ama arayüz kaldı; `resolveLibrarySoundEx` dönüş tipi olarak kullanıyor.

## Dokunulmayanlar ve neden
- `packages/assessment-bank/src/ausculta/resolver.ts` — **`resolveLibrarySoundEx`**: knip "kullanılmayan dışa aktarım" dedi, ancak `tests/sim-ausculta/mixed-posterior.test.ts` `COPIES` döngüsünde assessment-bank resolver'ını namespace olarak alıp (`import * as bankResolver`) **çalışma zamanında** `resolver.resolveLibrarySoundEx` çağırıyor (satır 95/101/106); aynı döngü `resolveAssignmentEx`, `resolveCaseSoundsEx`, `assessmentPointFilter` için de geçerli. Dinamik özellik erişimi knip'te yanlış pozitif üretmiş. Kural 1 gereği dokunulmadı. (İlk denemede silinince `mixed-posterior` testi kırıldı; değişiklik geri alınıp yalnız `export`u kaldırılmadan bırakıldı.)

## Bilinçli sınırlar / notlar
- `packages/sim-pulse/src/runtime/vendor/**` (ADR-011 gömülü çalışma zamanı) ve genel olarak sim-opaca, tests/sim-opaca, `tools/*.d.mts`, `package.json`, `pnpm-lock.yaml` **dokunulmadı**. Kapsam listesinde vendor yolu yoktu.
- `.d.mts` dosyaları (`patient-info.d.mts`, `learning-samples.d.mts`) hâlâ kaldırılan adları bildiriyor; plan gereği kapsam dışı bırakıldı. `tsconfig` yalnız `src/**` derlediği ve bu adları kimse içe aktarmadığı için kapı etkilenmedi.
- `SimulationPointerEvent` arayüzünün kendisi `screens/simulation/runtime.ts` içinde canlı ve kullanımda; silinen yalnız `SimulationScreen.tsx` ve `src/index.ts` üzerindeki ölü yeniden dışa aktarım zinciriydi.
- `assessment-bank` resolver kopyası ile `sim-ausculta` kopyası arasındaki birebir ayna artık silinen yardımcılar için farklı; `mixed-posterior.test.ts` yalnız ortak yüzeyi karşılaştırdığı için davranış değişmedi.
- Şema/akış değişikliği yok (rota, sözleşme, oturum, ödül akışı elle yönetilmedi); `docs/sema/` güncellemesi gerekmedi.
- Doğrulama: her paket sonrası yerel typecheck/lint + hedef testler, sonda tam kapı çalıştırıldı.
