# T317-olu-kod-opaca

- Tarih: 2026-10-02 18:59
- Commit: T317: Opaca ölü dışa aktarım temizliği (37 sembol)
- Dal: task/T317-olu-kod-opaca

---

# T317 — Ölü dışa aktarım temizliği (Opaca) — Özet

Plan: `.egemed-run/plan.md`; liste: `.egemed-run/knip-kapsam.md` (18 dosya, 37 sembol).
Kapsam yalnız `packages/sim-opaca` + `tests/sim-opaca`; 18 dosyada 26 ekleme / 151 silme.
Commit/merge/push yapılmadı.

## Sembol sayıları

| İşlem | Adet |
| --- | --- |
| Tümüyle silinen bildirim | 11 |
| Yalnız `export`'u kaldırılan (bildirim korundu) | 26 |
| Dokunulmayan | 0 |
| **Toplam** | **37** |

## Silinen bildirimler (11)

Hiçbir modülden tüketilmiyordu; kullanımsız kalan importlar da silindi.

1. `resolveGamiFlags` — `gamification/flag.ts` (birlikte `locationSearch` importu düştü; `searchParam` kaldı).
2. `openedKeyOnImageReady` — `core/learnLock.ts` (doc yorumuyla).
3. `createResizeObserver` — `platform-dom.ts`.
4. `ResizeEntry` — `platform-dom.ts` (3 silinince kullanımsız kaldı).
5. `ResizeObserverLike` — `platform-dom.ts` (aynı nedenle).
6. `periodLabel` — `gamification/leaderboardView.ts`.
7. `tableItems` — `leaderboardView.ts`.
8. `countdownText` — `leaderboardView.ts`.
9. `meRewardStatus` — `leaderboardView.ts`.
10. `TableItem` — `leaderboardView.ts` (7 silinince kullanımsız kaldı).
11. `MeStatus` — `leaderboardView.ts` (9 silinince kullanımsız kaldı).

Yan temizlik (`leaderboardView.ts`): `MONTHS`, `parts`, `startOfWeekTr`, `MonthlyReward`,
`RewardStandingResult`, `./types`'tan `LeaderboardRow` importları kaldırıldı.
`previousPeriodNow` (kullanılıyor: `LeaderboardScreen`) ve `daysLeft` (kullanılıyor:
`sessionGains`) korundu; `endOfMonthTr`/`periodRangeTr` bu ikisi için kaldı.

## Yalnız `export`'u kaldırılanlar (26)

Kendi dosyası içinde kullanılıyor; bildirim yerinde, dışa aktarım kaldırıldı.

- `demoStateEmpty`, `demoStateFull`, `demoStateWinner` — `gamification/demo.ts` (`demoStateFor` kullanır).
- `OpacaAboutContent` — `screens/SourcesScreen.tsx` (`OpacaAbout`, `SourcesScreen` kullanır).
- `isLocalRepo` — `gamification/bindings.ts`: `export { getGamiRepo, isLocalRepo }` listesinden ad çıkarıldı (**kural 2**).
  Deklarasyon `repo.ts`'te; `index.ts` paket API'sinden dışa aktarımı ve tüm iç tüketiciler aynen duruyor.
- `Focusable`, `ScrollTarget`, `DocLike`, `KeyLike`, `StorageLike` — `platform-dom.ts` (birbirlerini ve `documentLike`/`localStorageLike` dönüşlerini kullanır).
- `AttemptInput` — `gamification/attempt.ts` (`buildAttemptRecord`).
- `OpacaBadgeRules`, `OpacaGamiRules` — `gamification/rules.ts` (`OPACA_RULES`).
- `HookHarness` — `tests/sim-opaca/nav-harness.ts` (`createHookHarness` dönüşü).
- `LocalRepoOptions` — `gamification/repo.ts` (`LocalRepo`, `getGamiRepo`).
- `FakeSessions` — `tests/sim-opaca/session-fixture.ts` (`fakeSessions` dönüşü).
- `DemoPeer`, `DemoPeerPeriodRow` — `gamification/mock.ts` (`DEMO_PEERS`, `demoPeriodRow`).
- `RewardsTracker` — `gamification/rewardsChannel.ts` (`createRewardsTracker` dönüşü).
- `AvatarTone` — `gamification/avatar.ts` (`TONES`, `avatarTone` dönüşü).
- `ScreenHeadingProps`, `SectionHeadingProps` — `ui/ScreenHeading.tsx`.
- `GamiView` — `gamification/useGami.ts` (`useGami` dönüşü).
- `Cohort`, `CohortFilter`, `Period` — `gamification/types.ts`: ölü `export type { ... }` yeniden dışa aktarımı
  ve kullanımsız kalan importları kaldırıldı; tipler `@egemed/gamification-core`'da yaşamaya devam ediyor.

## Dokunulmayanlar

Yok (0). Hiçbir listede sembol, "kendi dosyası dışında tüketiliyor" gerekçesiyle tamamen atlanmadı.

## Varsayımlar ve yorum kararları

- **Kural 1 ölçütü:** "Kullanım" için ad eşleşmesi değil, **bu modülden ithal/tüketim** esas alındı.
  Aynı adlı bağımsız bildirimler yanlış pozitif sayıldı ve engel oluşturmadı:
  `gami-ui/src/model.ts` (periodLabel/tableItems/countdownText/meRewardStatus), `gami-ui/src/GamiProgressChart.tsx`
  (ResizeEntry/ResizeObserverLike), `ui/Modal.tsx` (Focusable), `apps/shell/src/pages.tsx` (ScrollTarget),
  `sim-ausculta/src/ui/ScreenHeading.tsx` (ScreenHeading tipleri), core `Cohort`/`CohortFilter`/`Period` tüketicileri.
- **`isLocalRepo`:** hem `bindings.ts` içinde kullanıldığı (kural 2) hem paket genelinde yaşadığı için bildirim
  silinmedi; yalnız `bindings.ts`'teki gereksiz yeniden dışa aktarım adı çıkarıldı. Paket girişi (`index.ts`)
  `isLocalRepo`'yu `repo.ts`'ten dışa aktarmaya devam eder — genel API değişmedi.
- **`index.ts`:** Silinen/çıplaklaştırılan adların hiçbiri `index.ts` satırlarında geçmiyor; bu yüzden giriş
  noktasında değişiklik gerekmedi (`OpacaAbout`, `SourcesScreen` vb. aynen duruyor).
- Davranış değişikliği, yeniden adlandırma, biçim düzeltmesi veya yorum "iyileştirmesi" yapılmadı; doc yorumları
  yalnız silinen bildirimlerle birlikte gitti.

## Doğrulama

- `pnpm turbo lint typecheck test` → **17/17 successful**; testler: 235 dosya, 1949 geçti, 1 atlandı.
- `pnpm turbo lint typecheck test --force` (önbelleksiz taze koşu, son hâl) → **17/17 successful**.
- Test kırılmadı; geri alınan değişiklik olmadı. Plan'daki "her paketten sonra" adımı tek paket
  (`sim-opaca`) olduğu için tüm düzenlemeler bitince bir kez, ardından `--force` ile tekrar koşuldu.
