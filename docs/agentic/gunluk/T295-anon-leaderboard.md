# T295-anon-leaderboard

- Tarih: 2026-10-01 15:58
- Commit: T295: anonim kullanıcılar hiçbir liderlik sıralamasında yer almaz
- Dal: task/T295-anon-leaderboard

---

# T295 — Anonim hesaplar hiçbir liderlik sıralamasına girmez (özet)

## Devralınan durum
Worktree temizdi (`git status` boş, `git diff dev...HEAD` boş); önceki ajan yalnız
plan/AGENTS/TEST-POLITIKASI okumuş, kod bırakmamıştı (`.egemed-run/oc.jsonl`).
Devralınacak yarım değişiklik yoktu; görev sıfırdan uygulandı.

## Yapılanlar
- **Kural tek noktada:** `apps/api/src/me/leaderboard.ts` `buildLeaderboardRows`
  artık `public=false` satırı ve adı çözülemeyen satırı hiç üretmez
  (`resolveLeaderboardDisplayName` null döner). `ANONYMOUS_LEADERBOARD_LABEL`
  kaldırıldı; sıra numaraları kalan satırlar üzerinden hesaplandığı için boşluk
  oluşmaz.
- **API (PG):** `getLeaderboard` SQL'inden `or u.id = $3` (izleyen istisnası)
  kaldırıldı → anonim izleyen kendi satırını da görmez. `getSummary` sıralaması
  `gami_leaderboard` görünümünün anonimleri sayan rank'ı yerine görünür satırlar
  üzerinden `row_number()` ile yeniden numaralanır; anonim izleyenin sırası yok
  (`rank = total + 1`).
- **API (bellek deposu):** `getLeaderboard`/`getSummary` anonimleri (tercih +
  profil) hiç saymaz; izleyen istisnası kaldırıldı.
- **Ödül:** `POST /admin/rewards/:simId/:month/finalize` satırları
  `getLeaderboard`'dan aldığı için yeni kesinleştirmeler anonimi kazanan yazmaz.
  Eski kesinleşmiş kayıtlara dokunulmadı (plan gereği).
- **gami-ui:** `model.ts` `EXCLUDED_REASON.private_profile` ("Ödül dışı · anonim
  görünüyor") ve `meRewardStatus` private_profile dalı kaldırıldı.
  `GamiPrivacyCard` metni: kapalıyken "Sıralamada görünmüyorsun. Görünür olmayı
  seçersen sıralamaya ve ödüle katılırsın."; "anonim görünebilirsin" ifadesi
  "sıralamadan çıkabilirsin; çıkınca sıralamada ve ödülde yer almazsın" oldu.
- **Kabuk:** `home.progress.leaderboardVisible.hint` güncellendi, yeni
  `home.progress.leaderboardVisible.hiddenNote` anahtarı eklendi ve anahtar
  kapalıyken bilgi notu olarak çiziliyor. "İlerlemem" şeridinde tercih kapalıysa
  sıra numarası gizlenir (`weekRank: null` → "Bu hafta sıralamada değilsin").
- **Sim demo/yerel veri:** pulse (repo + runtime), opaca ve ausculta yerel
  liderlik satır üretimi anonimleri (ve adsız demo akranlarını) listelemez;
  `PULSE_ANONYMOUS_LABEL` ve opaca `ANONYMOUS_LABEL` kaldırıldı. Görünür ama adı
  olmayan kendi satırı "Sen" yer tutucusuyla kalır (ausculta emsali).
  `demo.ts` tohumundaki 10 `leaderboard_visible=false` hesap artık hiçbir
  liderlik satırında görünmüyor (seed testi doğruluyor).
- **Belgeler:** `docs/sema/urun.md` (yeni "Liderlik görünürlüğü ve anonimlik"
  bölümü), `docs/sema/akislar.md` (Bölüm 3 akışı + notlar),
  `docs/sema/veritabani.md`, `README.md`, `docs/ops/ISLETIM.md` güncellendi.

## Testler (TEST-POLITIKASI kapısı)
Eklenen/güncellenen testler ve dört soru:
- `tests/api/me-gamification.test.ts` — "anonim kullanıcı özet sıralamasından
  düşer" + opt-out testi güncellendi. (1) Gözlemlenebilir davranış: anonim
  izleyenin liste/sıra toplamından çıkması. (2) Gerçekçi hata: izleyen
  istisnasının geri gelmesi ya da özetin anonimi sayması. (3) Önceki testler
  "kendi satırını görür" davranışını sabitliyordu. (4) Test-only açıklık
  gerekmedi.
- `tests/api/rewards.test.ts` — "anonim öğrenci kesinleşen kazanan listesine
  girmez": en yüksek puanlı anonim aday elenince sıradaki uygun kişi kazanır.
- `tests/api/seed-demo.test.ts` — demo planında anonim hesapların hiçbir
  liderlik satırında olmadığı doğrulanıyor.
- `tests/shell/optout-access.test.ts` — kapalıyken bilgi notu çizilir.
- `tests/sim-pulse/gami-repo.test.ts` + `tests/sim-opaca/gamification/repo.test.ts`
  — anonim profil satırı ve anonim demo akranı listelenmez.
- `tests/gami-ui/views.test.ts` — anonim izleyene satır değil bilgi notu.
- `apps/api/test/db/gamification.pg.test.ts` (DB turu) — anonim izleyen kendi
  satırını görmez, kalan satırlar akranlarıdır; testteki eski "AV/Mİ"
  beklentisi (kod artık tam ad döndürüyor) düzeltildi.

## Doğrulama
- `pnpm turbo lint typecheck test` → **17/17 görev başarılı**, 232 test dosyası,
  **1947 geçti + 1 atlandı** (taban: 1943; net +4 test).
- Yerel PostgreSQL turu (`DATABASE_URL=... pnpm --filter @egemed/api test:db`):
  T295 senaryosu geçti. **Taban kodda da kırık olan 2 test** sürüyor:
  `rozet değerlendirmesi … Pulse özetinden rhythm-streak…` (beklenen rozet
  listesi güncel katalogla uyuşmuyor) ve `migrations.roundtrip` (paylaşılan
  yerel DB'de 013 migration sırası). T295 ile ilgisiz; silinmedi, raporlandı.
- e2e: `E2E_PORT_BASE=5850 pnpm exec playwright test e2e/ui-primitives.spec.ts
  --project=mobile-360` → 6 geçti; 1 kırık **tarih alanı renk kontrastı**
  (`.eg-datefield__day--selected`) T295 dışı ve taban kodda da kırık.
  `e2e/auth-api.spec.ts` API ayakta olmadığı için koşulmadı; liderlik anahtarı
  erişilebilir adı değişmedi, spec beklentisi güncelleme gerektirmiyor.

## Varsayımlar / yorum farkları
- "Anonim" = `leaderboard_visible=false` (tercih). Anonim etiketiyle satır üreten
  yol kaldırıldığı için adı çözülemeyen satır da API'de listelenmez.
- Özet sözleşmesi değiştirilmedi: anonim izleyen `rank = total + 1` alır; kabuk
  bunu tercih kapalıyken gizler. Sim içi "Başarılarım" şeridi sunucu satırında
  `isMe` bulamadığı için zaten "sıralamada değilsin" gösterir.
- `require_public_name` ödül alanı ve `gamification-core` `rewardStandings`
  private_profile gerekçesi korundu (sözleşme/admin yüzeyi); satırlar artık hep
  public olduğundan koşul boşta çalışır. Yalnız gami-ui gösterimi kaldırıldı.
- Pulse/Ausculta simlerinde API oturumunda gizlilik tercihi yerel durumdan gelir
  (sunucu tercihi simlere taşınmıyor) — T295 öncesinden gelen sınırlama, kapsam
  dışı bırakıldı; opaca API deposu `getMe()` ile senkron olduğu için etkilenmez.
- `packages/sim-opaca/src/gamification/leaderboardView.ts` içindeki
  `meRewardStatus` ölü kod; yalnız private_profile dalı kaldırıldı.

## Artefakt
Commit/merge/push yapılmadı. Değişiklikler bu worktree'de çalışma ağacında.
