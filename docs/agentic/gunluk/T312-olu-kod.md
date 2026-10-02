# T312-olu-kod

- Tarih: 2026-10-02 18:00
- Commit: T312: ölü dışa aktarım temizliği (knip; api, shell, contracts, gami-ui, ui — 220 sembol)
- Dal: task/T312-olu-kod

---

# T312 — Ölü dışa aktarım temizliği (sim dışı paketler) — Özet

Durum: Tamamlandı. Commit/merge/push yapılmadı.

## Sayılar

- Kapsam: `knip-kapsam.md` içindeki **78 dosya / 220 sembol**.
- Dokunulan: **220/220 sembol, 78/78 dosya** (kapsam dışına çıkılmadı; `git status` yalnız bu 78 dosyayı gösterir).
- **Bildirimi tümüyle silinen: 3**
  - `apps/api/src/integrity/thresholds.ts` — `INTEGRITY_SIGNAL_NAMES`
  - `apps/shell/src/admin/importsDataSource.ts` — `IMPORT_MODES`
  - `apps/shell/src/home/badgeCatalog.ts` — `badgeCatalogSize`
- **Yalnız `export` anahtar sözcüğü kaldırılan (bildirim yerinde kaldı): 202**
  - 201'i bildirimden `export` kaldırıldı; 1'i (`apps/shell/src/home/gamificationSource.ts` — `SimId`) yerel yeniden dışa aktarım listesinden (`export type { GamiSimSummary, SimId };`) çıkarıldı; import içeride kullanıldığı için duruyor.
  - Bu grupta kullanılmayan import kalmadı; silinen bildirimlerden boşalan import'lar temizlendi (ör. `GamiGains.tsx` `ReactNode`, `GamiModal.tsx` `GamiIcon`).
- **Kaynağı başka dosyada olan, ölü zincir nedeniyle dışa aktarımı listeden çıkarılan: 15**
  - `apps/api/src/mail/index.ts`: `AccountCreatedData`, `PasswordResetData`, `ChallengeInviteData`, `ChallengeResultData`, `MonthlyRewardWinnerData`, `MonthlySummaryData`, `MonthlySummarySimBlock` (7) + `MailRenderResult` (satır tümüyle boşaldı, silindi).
  - `packages/gami-ui/src/types.ts`: `ChartPoint`, `Cohort`, `MonthlyReward`, `RewardWinner`, `WeeklyGoal` (paylaşılan `export type {...}` satırından; ilgili adlar import satırından da temizlendi).
  - `packages/gami-ui/src/GamiGains.tsx` — `export type { ReactNode };` satırı; `packages/gami-ui/src/GamiModal.tsx` — `export type { GamiIcon };` satırı.
- **Dokunulmayan: 0.** Kural 1 gereği yapılan `grep -rn "\bAD\b" apps packages tests e2e` taramasında 35 sembol için kendi dosyası dışında eşleşme çıktı; her biri tek tek incelendi:
  - 19'u başka modüllerdeki **aynı adlı bağımsız bildirim** (ör. `trDate`/`startOfWeekTr` → `packages/gamification-core`, `IMPORT_MODES` → `api-client`/`apps/api`, `initialsOf` → `packages/ui`, `Focusable` → `sim-opaca`, gami-ui tip adları → `gamification-core`, `ReactNode` → `react`). Bunlar listelenen sembole referans değildir.
  - 1'i **yorum satırı** (`apps/api/src/seed/repo.ts` `SeedDb` → `demo.ts` yorumu).
  - 15'i **ölü yeniden dışa aktarım zincirinin kenarı** (mail şablonları ↔ `mail/index.ts`, 7 şablon girdisi + 8 index girdisi); kural 4 gereği adlar re-export satırlarından çıkarıldı, kaynak bildirimler de-export edildi.
  - Taramada `e2e/` kapsamındaki tek eşleşme (`gamificationSource.SimId` ↔ `e2e/sim-flows.ts`) ayrı yerel bildirimdir; e2e kırılmadı.
- Paket dağılımı (düzenlenen sembol): `apps/api` 145, `apps/shell` 65, `packages/contracts` 2, `packages/gami-ui` 7, `packages/ui` 1.
- `packages/{api-client,gami-catalogs,gamification-core,sim-host,xapi-profile,tokens}` ve sim paketlerinde listede sembol yoktu; dokunulmadı. `package.json`/`pnpm-lock.yaml` değişmedi.

## Doğrulama

- `pnpm turbo lint typecheck test` → **17/17 successful** (14'ü önbelleksiz; ~2 dk). Kabul kapısı yeşil.
- Ek kontrol: 220 sembolün tamamı için "hâlâ dışa aktarılıyor mu?" AST taraması → 0. Silinen/de-export edilen hiçbir ad kalmadı.
- Davranış değişikliği, yeniden adlandırma, biçim/yorum "iyileştirmesi" yapılmadı; yalnız görünürlük ve ölü bildirimler kaldırıldı.

## Sapmalar / notlar

- Düzenlemeler AST tabanlı codemod ile atomik uygulandı; bu yüzden plan'daki "her paketten sonra kapı" yerine tüm kapsam bitince tek tam kapı koşusu yapıldı (sonuç 17/17). Paket bazında tekrar koşu aynı çalışma ağacını doğrulayacağından ek bilgi üretmezdi.
- Kural 1'deki `grep` "kullanım" yorumu, sembol çözümlemesiyle uygulandı: yalnız aynı adlı başka bildirim/yorum/ölü re-export kenarı bulunduğu için hiçbir sembol atlanmadı; bu 35 eşleşmenin dökümü yukarıda. Gerçek bir dış referans olsaydı sembol korunacaktı.
- Analiz çıktıları (git dışı): `.egemed-run/.classify.json`, `.egemed-run/.actions.json`.
- Commit/merge/push yapılmadı.
