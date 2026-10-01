# T283a-integrity-signals

- Tarih: 2026-10-01 02:09
- Commit: T283a: sunucu davranış sinyalleri ve bütünlük işaretleri (yalnız tespit; 10 vakaya normalize puan, GET /admin/integrity, şemalar güncel) (Sonnet; review+kalibrasyon: Claude)
- Dal: task/T283a-integrity-signals

---

# T283a — sunucu davranış sinyalleri ve işaretleme: özet

## Ne yapıldı

Plandaki kapsamla birebir: `packages/contracts` (yalnız cevap isteğine isteğe bağlı
`integrity` alanı), `apps/api` (yeni `src/integrity/` modülü, `me/simSessions.ts`
entegrasyonu, migration `015_integrity_flags.sql`) ve testler. Kabuk (`apps/shell`)
ve sim paketlerine (`packages/sim-*`) dokunulmadı.

Bu görev **yalnız tespit ve işaretleme**dir: hiçbir puan/XP/rozet/liderlik/ödül
hesabı değişmedi; hiçbir kullanıcı engellenmedi. `finish` ucu aynen eskisi gibi
denemeyi yazar; sinyaller bunun DIŞINDA, ayrı bir yol olarak toplanır.

## Değişen / eklenen dosyalar

**Sözleşme**
- `packages/contracts/src/schemas/simSession.ts` — `simIntegritySchema` (yeni,
  isteğe bağlı) + `simSessionAnswerRequestSchema`'ya `integrity?` alanı.
- `packages/contracts/src/index.ts` — `simIntegritySchema`/`SimIntegrity` dışa aktarımı.

**Yeni `apps/api/src/integrity/` modülü**
- `thresholds.ts` — tüm eşikler ve ağırlıklar tek yerde, adlandırılmış sabitler.
- `signals.ts` — saf fonksiyonlar: `computeCaseSignals`, `median`,
  `isConsistentFast`, `integrityScore`, `shouldFlag`, `buildFlagSignals`. DB/HTTP'ye
  bağımsız; hepsi `tests/api/integrity-signals.test.ts`'de birim test edildi.
- `repo.ts` — `IntegrityRepo` arayüzü, `createPgIntegrityRepo` (gerçek SQL,
  `users` ile JOIN'li liste), `createMemoryIntegrityRepo` (test/DB'siz geliştirme;
  kullanıcı kurum/ad çözümü enjekte edilen `lookupUser` ile, `auth.users.getMeContext`
  üzerinden — DB'siz varsayılanda ayrı bir "admin store" bağımlılığı gerekmedi).
- `adminRoutes.ts` — `GET /admin/integrity?status=&page=&pageSize=`; mevcut
  `registerAdminAuditRoutes` deseniyle birebir (kurum kapsamlı, `/admin/*`
  ara katmanından SONRA kaydedilir, `toIstanbulIso`).

**`apps/api/src/me/simSessions.ts`**
- `SimCaseState.integritySignals: IntegritySignalName[]` (varsayılan `[]`);
  hiç açılmamış/finish'te sentetik puanlanan vakada boş kalır (yalnız gerçek
  `/answer` çağrısı doldurur).
- `SimSessionRow.integrityStatus: "unverified" | "verified" | null` (varsayılan
  `null`; bu görevde yalnız `"unverified"` yazılır, `"verified"` T283b'nindir).
- `/answer` ucu: sonuç hesaplandıktan sonra `computeCaseSignals` çağrılır
  (sunucu saatiyle `latencyMs = at − item.openedAt`; eski istemci `integrity`
  göndermezse ilgili sinyaller atlanır, yalnız `too_fast`/Ausculta'nın
  "dinlenmemiş nokta" kontrolü her zaman çalışır çünkü bunlar `integrity`
  alanına bağımlı değildir).
- `/finish` ucu: `caseSignalLists` toplanır; değerlendirme/düello modunda
  (`isTimedSessionMode`) `deps.sessions.listRecentFinished` ile önceki 2 bitmiş
  oturum + bu oturumun kendi verisiyle `isConsistentFast` çağrılır; skor
  `integrityScore` ile hesaplanır; `shouldFlag` eşiği aşarsa
  `row.integrityStatus = "unverified"` (normal `save()` çağrısıyla birlikte
  yazılır) ve `deps.integrity.write(...)` ile `integrity_flags`'e `status:'pending'`
  satırı eklenir. Puan/XP/deneme bloğu YUKARIDA, bu koddan önce ve ondan
  bağımsız çalışır — değişmedi.
- `SimSessionRepo.listRecentFinished(userId, modes, limit)` eklendi (Pg: SQL
  `mode = any($2) and status='finished' order by finished_at desc limit $3`;
  bellek: filtre+sırala+kes). `realCaseLatencies(row)` yardımcı fonksiyonu:
  yalnız GERÇEKTEN açılıp yanıtlanmış vakaları sayar (`openedAt`/`answeredAt`
  ikisi de dolu) — `finish`'te sentetik puanlanan vakalar `openedAt=null` kaldığı
  için otomatik dışarıda kalır, ayrı bir "gerçek mi" bayrağı gerekmedi.
- `createPgSimSessionRepo`: `get`/`save` `integrity_status` kolonunu da taşır.

**`apps/api/src/app.ts` / `apps/api/src/server.ts`**
- `AppDeps.integrity?: IntegrityRepo` (yoksa bellek varsayılanı, kullanıcı
  kurum/adını `auth.users.getMeContext` ile çözer).
- `registerAdminIntegrityRoutes(app, integrity)` — `/admin/*` ara katmanından
  sonra kaydedildi.
- `registerSimSessionRoutes`'a `integrity` enjekte edildi;
  `AppDeps.simSessions` tipi `integrity`yi Omit ediyor (çakışmasın diye, tıpkı
  `gamification`/`onFinished` gibi).
- `server.ts`: `createPgIntegrityRepo(db)` üretim bağlantısı eklendi.

**Migration**
- `apps/api/migrations/015_integrity_flags.sql` — `integrity_flags` tablosu
  (plandaki şemayla birebir: `id, session_id, user_id, sim_id, mode, score,
  signals jsonb, status, created_at, reviewed_by, reviewed_at, note`) +
  `sim_sessions.integrity_status` kolonu + CHECK. `note`/`reviewed_*` bu görevde
  hiç yazılmıyor (T283b'nin karar uçları içindir).

**Testler**
- `tests/api/integrity-signals.test.ts` (23 test) — saf sinyal/skor/tutarlılık/
  KVKK birim testleri (DB/HTTP yok, en ucuz katman).
- `tests/api/integrity-flagging.test.ts` (7 test) — uçtan uca API/DB kablolaması:
  too_fast ile işaretleme + tabloya yazım, yanlış yanıtta too_fast yok,
  `no_interaction_correct`, eski istemci (integrity alanı yok) işaretlenmez,
  tutarlılık sinyali (3 oturumun gerçek `listRecentFinished` zinciri), yalnız
  2 oturumda sinyal doğmaz, admin ucu yetki (401/403/200) + KVKK (yanıt yalnız
  sayı/bilinen sinyal adı). **Pulse** seçildi (tek soru, ses yok) — Ausculta'nın
  "hiç dinlenmemiş nokta" kontrolü testte hep doğru çıkıp senaryoları
  bulandırıyordu; bu kablolama testinde Pulse ile izole edildi, Ausculta'ya özgü
  o dal ayrıca birim testinde (`integrity-signals.test.ts`) doğrulandı.
- `tests/api/migrations.test.ts` — yeni tablo/kolon `expectedColumns`'a eklendi,
  `sim_id IN (...)` CHECK sayısı 8→9 güncellendi (migration 015 bir CHECK daha
  ekliyor).
- `tests/api/admin-harness.ts` — `integrity` (bellek deposu) `createApp`'e
  bağlandı ve harness döndürdüğü nesneye eklendi (`h.integrity.rows`).
- `tests/api/opaca-sessions.test.ts` — mevcut `pinCases` yardımcısına yeni
  zorunlu `integritySignals: []` alanı eklendi (SimCaseState tipi genişledi,
  cerrahi/zorunlu düzeltme).

## Sinyal tablosu, eşikler ve ağırlıklar (`apps/api/src/integrity/thresholds.ts`)

| Sinyal | Koşul | Ağırlık |
| --- | --- | --- |
| `too_fast` | doğru (mastery) VE `latencyMs` < eşik (pulse 4000 ms, opaca 5000 ms, ausculta 6000 ms) | 3 (ağır) |
| `no_interaction_correct` | doğru VE (`integrity.interactions===0` VEYA [yalnız Ausculta] hiç dinlenmiş nokta yok) | 3 (ağır) |
| `tab_hidden` | `hiddenCount≥1` VE `hiddenMs≥3000` | 1 (hafif) |
| `blur_many` | `blurCount≥3` | 1 (hafif) |
| `paste` | `pasteCount≥1` | 1 (hafif) |
| `consistent_fast` | son 3 değerlendirme/düello oturumunun HEPSİNDE puan≥90 VE medyan gecikme < eşiğin 1.5 katı | 5 |

**İşaret eşiği:** `integrity_score ≥ 5` → oturum `unverified`, `integrity_flags`'e
`status:'pending'` satırı. Gerekçe: tek hafif sinyal (1) ya da tek ağır sinyal
(3) yalnız başına işaretlemez (gürültüye dayanıklı); iki ağır sinyal (3+3=6)
ya da tutarlılık sinyali (5) tek başına işaretler. Değerler ilk kalibrasyondur
(plan §"eşikler sonra ayarlanacak"); kod içinde yorumla gerekçelendirildi,
kullanım verisiyle T283b'de ayarlanabilir.

## Doğrulama çıktıları

- `pnpm turbo lint typecheck test` (kök, tüm 16 paket + kök): **tamamen yeşil**
  — 17/17 görev başarılı, 225 test dosyası, 1898 test geçti, 1 skip (T283a
  öncesinden, bana ait değil).
- Yeni testler ayrı ayrı da çalıştırıldı: `integrity-signals.test.ts` (23/23),
  `integrity-flagging.test.ts` (7/7), `migrations.test.ts` (49/49).
- `pnpm --filter @egemed/api migrate:up`: **doğrulanamadı**. Bu ortamda paylaşılan
  bir yerel Postgres konteyneri (`egemed-local-postgres-1`, tüm worktree'lerin
  ortak geliştirme DB'si) çalışıyor; aynı anda başka worktree'lerdeki ajanların
  kullanıyor olabileceği bu paylaşılan DB'ye şema değişikliği uygulayıp geri
  almak riskli görüldüğü için atlandı. Migration'ın yapısal doğruluğu (up/down
  simetrisi, kolon/kısıt/indeks kümesi, "tohum veri yok", "timestamp değil
  timestamptz", audit_log append-only dokunulmadı vb.) `tests/api/migrations.test.ts`
  ile statik olarak tam kapsamlı doğrulandı (49 test, hepsi yeşil). Depo sahibi
  isterse boş/izole bir DB'de `pnpm --filter @egemed/api migrate:up` ardından
  `migrate:down` ile ayrıca doğrulayabilir.

## Varsayımlar

1. **"Doğru yanıt" tanımı:** `SimCaseResult.mastery` (vaka düzeyinde tam/geçer
   puan) `too_fast`/`no_interaction_correct` için "doğru yanıt" vekili olarak
   kullanıldı (plan bunu açıkça tanımlamıyordu). Soru düzeyinde değil vaka
   düzeyinde, çünkü sinyaller "vaka başı" tanımlanmış.
2. **`consistent_fast` doğruluk vekili:** oturumun 0–100 `total` puanı "% doğru"
   için kullanıldı (plan "%90 doğru" diyor, kesin metrik vermiyor).
3. **`consistent_fast` kapsamı:** yalnız `assessment`/`challenge` modunda
   hesaplanır (plan "değerlendirme/düello" diyor); `practice`'te hiç çalışmaz.
   Bu, tek başına diğer per-case sinyallerden (too_fast vb.) bağımsızdır —
   practice'te too_fast/tab_hidden/blur/paste/no_interaction_correct yine
   hesaplanır, yalnız tutarlılık hesaba katılmaz.
4. **Skor eşiği ve ağırlıklar** ilk kalibrasyon tahminidir (yukarıdaki tablo);
   plan zaten "sonra ayarlanacak" diyor.
5. **`actor.gamified` gate'i integrity'ye uygulanmadı:** oyunlaştırma dışı
   roller (öğretim üyesi, uzmanlık öğrencisi) için de sinyaller hesaplanır ve
   gerekirse işaretlenir — ADR-009 §6'nın çerçevesi XP'den bağımsız genel bir
   "tespit" katmanı öngörüyor, rol bazlı istisna plan metninde yok.
6. **`integrity_flags` kurum sütunu yok:** plandaki şema institution_id
   taşımıyor; admin listesi `users.institution_id` ile JOIN'lenerek kapsandı
   (audit_log'un aksine, ki o doğrudan sütun taşıyor — ADR/plan farkı, bilinçli
   tercih: plana sadık kalındı).

## T283b için notlar

- `integrity_flags.status` bu görevde hep `'pending'`; clear/confirm uçları yok.
  T283b muhtemelen `PATCH /admin/integrity/:id` (`status`, `reviewed_by`,
  `reviewed_at`, `note`) ekleyecek — kolonlar migration'da hazır.
  `IntegrityRepo`'ya bir `updateStatus`/`review` metodu eklemek yeterli olur.
- Engelleme/ceza mantığı (rekabetli alanlardan çıkarma) `sim_sessions.integrity_status`
  ve/veya `integrity_flags.status='confirmed'` okunarak T283b'de eklenir; bu
  görev hiçbir okuma/engelleme yolu eklemedi (yalnız yazma + admin listesi).
- Eşik/ağırlık kalibrasyonu `apps/api/src/integrity/thresholds.ts`'de tek
  yerde; üretim verisiyle ayarlanacaksa yalnız bu dosya değişir.

## Açık sorular (varsa depo sahibine)

- `consistent_fast` için "%90 doğru" ölçütünün oturum toplam puanı mı yoksa
  soru bazlı doğruluk yüzdesi mi olması gerektiği netleştirilebilir (şu an
  oturum `total`/100 kullanıldı).
- Practice modunda `consistent_fast` hiç hesaplanmıyor; isteniyorsa kapsam
  genişletilebilir (plan metni "değerlendirme/düello" diyor, bilerek dar tutuldu).

## Claude incelemesi (1 Eki 2026)
- Puan 10 vakaya normalize edildi (`perTen`), `INTEGRITY_FLAG_SCORE_THRESHOLD = 8`, `consistent_fast: 8`: 10 vakada 3 çok hızlı cevap işaretler, 2 işaretlemez (test güncellendi). Ham toplam kısa oturumları cezalandırıyordu.
- Şemalar: `docs/sema/veritabani.md` (integrity_flags + sim_sessions.integrity_status, ilişkiler) ve `docs/sema/akislar.md` (answer/finish akışında sinyal ve işaret adımı) güncellendi; `tests/config/schema-docs.test.ts` yeşil.
