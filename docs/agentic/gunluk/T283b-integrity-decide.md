# T283b-integrity-decide

- Tarih: 2026-10-01 09:29
- Commit: T283b: bütünlük işareti yönetici kararı ve rekabet engeli — yalnız onayla, kaldırılabilir (Sonnet; review: Claude)
- Dal: task/T283b-integrity-decide

---

# T283b — Bütünlük işareti: yönetici kararı ve rekabet engeli — özet

## Yaklaşım
T283a'nın `integrity_flags` (status=pending) kaydına yönetici karar ucu eklendi
(`decide`: cleared/confirmed) ve ayrı bir `competition_bans` tablosu/deposu ile
rekabet engeli yaşam döngüsü kuruldu. Otomatik ceza YOK: engel yalnız
`confirmed` kararıyla açılır (`bans.open`, kullanıcı başına tek AKTİF engel —
kısmi benzersiz dizin `(user_id) where lifted_at is null`, `on conflict ...
do nothing` ile idempotent), yalnız `POST /admin/integrity/bans/:userId/lift`
ile kapanır. Engelin aşağı akış etkileri (Meydan Okuma, liderlik/aylık ödül,
değerlendirme/düello XP'si) mevcut akışların her birine `bans` bağımlılığı
enjekte edilerek, en az invaziv noktada uygulandı:

- **Meydan Okuma** (`me/challenges.ts`): `POST /me/challenges` ve `/join`
  rotalarına `gamified` kontrolünden hemen sonra, gövde ayrıştırılmadan ÖNCE
  `bans.isActive(userId)` eklendi → 403 `forbidden` + `issues:[{code:"competition_banned"}]`.
- **Liderlik + aylık ödül** (`me/leaderboard.ts`, `me/gamification.ts`, `rewards.ts`):
  `buildLeaderboardRows` artık `bannedUserIds?: ReadonlySet<string>` alıyor ve
  eşleşen kullanıcıyı listeden tamamen çıkarıyor (kendi görünümü dahil — "listelenmez").
  Hem PG hem bellek `getLeaderboard` bu parametreyi aynı fonksiyona iletiyor; tek
  filtre mantığı, iki depoda tekrar yok. Liderlik HTTP ucu ve ödül `finalize` ucu
  `bans.activeUserIds(institutionId)` ile bu seti dolduruyor — aylık ödül kazanan
  seçimi zaten `getLeaderboard`'dan türediği için AYRI bir filtre yazmaya gerek
  kalmadı (plan §4'teki "yeni gerekçe ekleme" kısıtına uyuldu).
- **XP** (`me/gamification.ts` `serverAttemptXp`, `me/simSessions.ts` `/finish`):
  `GamiAttemptInput`/`serverAttemptXp` girdisine `competitionBanned?: boolean`
  eklendi; `mode !== "practice"` ve banned ise XP sıfır döner, `practice` hiç
  etkilenmez. Deneme kaydı (`gami_attempts`) ve rozet değerlendirmesi NORMAL
  yazılır — öğrenme verisi silinmez, yalnız kazanılan XP sıfırlanır.
- **`/me/gamification`**: yanıta `competitionBanned: boolean` eklendi (yalnız
  üç-sim özet ucunda; tek-sim ucuna EKLENMEDİ — bkz. "Kapsam kararları").

## Değişen/yeni dosyalar
- `apps/api/migrations/016_competition_bans.sql` (yeni) — tablo + kısmi
  benzersiz dizin + `user_id, created_at desc` dizini.
- `apps/api/src/integrity/bans.ts` (yeni) — `CompetitionBansRepo`
  (`open`/`lift`/`isActive`/`activeUserIds`), PG + bellek uygulaması.
- `apps/api/src/integrity/repo.ts` — `IntegrityRepo.decide` (yalnız `pending`
  işareti karara bağlar; PG iki adımlı SELECT+UPDATE — ilk SELECT institution
  eşleşmesini/`not_found`u, ikinci UPDATE `status='pending'` koşuluyla yarış
  durumunu `conflict`e çevirir). Bellek deposu artık karar durumunu ayrı bir
  `Map`te tutuyor; `rows` (ham yazım) testler için DOKUNULMADAN bırakıldı.
- `apps/api/src/integrity/adminRoutes.ts` — `POST /:flagId/decision`,
  `POST /bans/:userId/lift`, `GET /admin/integrity` yanıtına `banned` alanı.
- `apps/api/src/me/challenges.ts`, `me/gamification.ts`, `me/leaderboard.ts`,
  `me/simSessions.ts`, `rewards.ts`, `app.ts`, `server.ts` — `bans` bağımlılığı
  enjeksiyonu ve yukarıdaki etkiler.
- `packages/contracts/src/schemas/integrity.ts` (yeni) — `integrityDecisionRequestSchema`.
- `packages/contracts/src/schemas/gamification.ts` — `gamiAllResponseSchema.data.competitionBanned`
  (OPSİYONEL — bkz. kapsam kararları).
- `docs/sema/veritabani.md` — `competition_bans` ER varlığı + ilişkiler + kural notu.
- `docs/sema/akislar.md` — Bölüm 1/2/3 notları güncellendi, yeni **Bölüm 6**
  (yönetici karar ucu + engel sıra diyagramı).
- `docs/sema/urun.md` — yeni **"Rekabet engeli (T283b)"** alt bölümü (rol → etki).
- `tests/api/admin-harness.ts` — `bans` deposu bellek harness'ine eklendi (`h.bans`).
- `tests/api/migrations.test.ts` — `expectedColumns.competition_bans` eklendi
  (E3 §c tam tablo kümesi testi; `schema-docs.test.ts` zaten otomatik geçti).
- `tests/api/integrity-decision.test.ts` (yeni, 4 test) — karar akışı ve engel
  etkileri.

## Test yazım kapısı (TEST-POLİTİKASI §1)
`tests/api/integrity-decision.test.ts` için 4 soru:
1. **Davranış/sözleşme:** karar ucunun yetki/durum makinesi (403/409/200) ve
   `confirmed` kararının Meydan Okuma/liderlik/`/me/gamification`/XP'ye etkisi,
   `lift`in bu etkileri geri alması — plan §1-§4'ün birebir sözleşmesi.
2. **Gerçekçi hata:** ban kontrolünün yanlış yere konması (ör. body
   ayrıştırmadan sonra), `serverAttemptXp`'nin `practice`'i de sıfırlaması,
   `buildLeaderboardRows`'un filtreyi unutması, `open`'ın partial-unique
   dizini yanlış kullanıp ikinci `confirmed`de ikinci satır açması.
3. **Mevcut testler neden yakalamaz:** `integrity-flagging.test.ts` yalnız
   TESPİTİ test eder (T283a kapsamı, karar ucu yoktu); `challenges.test.ts`/
   `me-gamification*.test.ts`/`rewards.test.ts` hiç banned kullanıcı
   senaryosu içermiyordu.
4. **Test-only açıklık:** yok — yalnız gerçek uçlar (`POST /admin/integrity/...`,
   `POST /me/challenges`, `GET /me/gamification*`, `POST /me/sims/.../finish`)
   ve harness'in zaten var olan `h.integrity.write`/`h.bans` (repo arayüzünün
   kendisi, test-only export değil) kullanıldı.

Sinyal/eşik hesapları ve tespit kablolaması burada TEKRAR edilmedi (en güçlü
katmanda zaten test edilmiş, bkz. `integrity-flagging.test.ts`,
`integrity-signals.test.ts`).

## Kapsam kararları / varsayımlar
1. **`competitionBanned` yalnız `/me/gamification` (üç-sim özet) ucunda**,
   `/me/gamification/:simId` (tek-sim) ucunda DEĞİL. Gerekçe: alan tüm simlerde
   aynı (sime özgü değil); tek-sim uca da eklemek `gamiSimSummarySchema`'yı
   (3 yerden paylaşılan, strict) değiştirmeyi gerektirirdi — gereksiz yayılım.
   T283d istemci arayüzü bunu tek bir yerden okuyabilir.
2. **`gamiAllResponseSchema.data.competitionBanned` OPSİYONEL** (`z.boolean().optional()`),
   ZORUNLU değil. Gerekçe: `tests/contracts/gamification.test.ts` ve
   `apps/shell` tarafındaki mevcut/olası `GamiAllResponse` sabit nesneleri bu
   alanı taşımıyordu; zorunlu yapmak apps/shell'de (plan kapsamı dışı bir
   pakette) typecheck kırılmasına yol açabilirdi. Sunucu yanıtı HER ZAMAN
   alanı yazıyor (opsiyonellik yalnız şema tarafında, geriye uyumluluk için).
3. **Liderlik filtresi kendi satırını da gizliyor**: banned kullanıcı KENDİ
   liderlik görünümünde de yok — plan "listelenmez" diyor, "anonim görünür"
   demiyor (opt-out'tan farklı: opt-out anonimleştirir, engel tamamen çıkarır).
   T283d istemcisi bunu bilmeli: banner liderlik tablosundan DEĞİL,
   `competitionBanned` alanından okunmalı.
4. **Zaten kabul edilmiş/devam eden Meydan Okuma ve açık sim oturumları engelden
   ETKİLENMEZ** — yalnız YENİ oluşturma/katılma ve YENİ denemenin XP'si. Plan
   bunu açıkça istemiyordu ama "otomatik ceza yok" ilkesiyle ve geri dönüşü
   zor bir kapsam genişletmesi olacağı için (oyundaki rakibin düellosunu
   iptal etmek) dokunulmadı.
5. **Admin karar/lift uçları `audit_log`a yazıyor** (`integrity.decision`,
   `integrity.ban_lift`) — plan açıkça istemedi ama depodaki TÜM admin
   mutasyonları bu deseni izliyor (roller, ödüller); tutarlılık için eklendi.
6. **`note` alanı** yalnız yönetici notu, zorunlu DEĞİL, 1-500 karakter
   (`z.string().trim().min(1).max(500).optional()`); boş string reddedilir
   (trim+min(1)) — KVKK'ya uygun, kişisel veri alanı yok (şema zorlamaz, bu
   operasyonel bir kural, plan §4'te de "şema zorlamaz" notu var).

## Kapı sonuçları
`export PATH=~/.npm-global/bin:$PATH && pnpm turbo lint typecheck test`:
**17/17 görev başarılı** (lint, typecheck × tüm paketler, test). Son tam koşu:
232 test dosyası, 1943 test geçti, 1 skip (önceden var olan, bu görevle
ilgisiz). `tests/config/schema-docs.test.ts` dahil (ER şeması ↔ migration
sütun eşleşmesi, sim-host alanları) — yeşil.

Ayrıca hedefli doğrulamalar: `tsc --noEmit` (apps/api, packages/contracts,
apps/shell — üçü de temiz); `tests/api/integrity-decision.test.ts` (4/4),
`tests/api/migrations.test.ts` (51/51, yeni `competition_bans` dahil).

## Doğrulanamayanlar / dışarıda bırakılanlar
- Gerçek PostgreSQL'de migration up→down→up turu (`pnpm --filter @egemed/api
  test:db`) BU GÖREVDE ÇALIŞTIRILMADI — CI kapısına girmiyor, yerel DB
  gerektiriyor. SQL'in biçimi diğer migration'larla (`015_integrity_flags.sql`)
  birebir aynı desende yazıldı (partial unique index Postgres 9.5+'ta
  `ON CONFLICT ... WHERE ... DO NOTHING` ile desteklenir).
- İstemci arayüzü (banner, "engelli" rozeti, admin panelinde karar/lift
  düğmeleri) T283d kapsamındadır — bu görevde YOK, plan da istemiyordu.
- `docs/sema/urun.md`'deki "Mod kilitleri" akış şemasına (mermaid flowchart)
  rekabet engeli dalı eklenmedi; bunun yerine ayrı bir prosa alt bölüm
  eklendi (mevcut flowchart zaten öğrenme kilidine odaklı, engeli oraya
  sıkıştırmak okunabilirliği düşürürdü).

## Kabul durumu
Plan §1-§6 uygulandı, `pnpm turbo lint typecheck test` tamamen yeşil. Commit/
merge yapılmadı (kural gereği). Ana ağaca yazılmadı, `.env*` okunmadı.
