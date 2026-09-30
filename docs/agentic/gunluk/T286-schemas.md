# T286-schemas

- Tarih: 2026-10-01 01:58
- Commit: T286: docs/sema — veritabanı (ER), ürün, mimari, akış şemaları (Claude denetimli) + şema-kod uyum testi + 'testte şemaya danış, değişikliği şemaya işle' kuralı (Sonnet; review: Claude)
- Dal: task/T286-schemas

---

# T286 — Platform şemaları: özet

## Yaklaşım

Kod DEĞİŞTİRİLMEDİ; yalnız `docs/sema/` altında 5 belge oluşturuldu. Her
diyagram tek tek kaynaktan türetildi, tahmin edilen ilişki yazılmadı:

- **veritabani.md**: `apps/api/migrations/001…014*.sql` dosyalarının TAMAMI
  okundu (593 satır); sonraki `ALTER TABLE`'lar (006, 005, 007, 010, 012, 013)
  ilgili tabloların son hâline dahil edildi.
- **urun.md**: `packages/contracts/src/ids.ts` (roller), `packages/sim-host/src/SimHost.ts`
  (`SimAudience`, `SIM_SCREEN_KEYS`, `audienceCanUseMode`), `apps/shell/src/routes.ts`,
  `apps/shell/src/session.ts` (`isFacultyLike`, `isLearnUnlocked`), API kilit
  kontrolleri (`apps/api/src/me/challenges.ts`, `simSessions.ts`) grep/hedefli
  okuma ile incelendi.
- **mimari.md**: 14 `package.json` dosyasının `dependencies` alanları
  (`node -e "require(...)"` ile) okunarak bağımlılık grafiği çıkarıldı;
  `packages/sim-host/src/SimHost.ts` (507 satır) tam okunarak sözleşme tablosu
  yazıldı; `infra/prod/nginx-egemed.conf` ve `docker-compose.prod.yml` tam okundu.
- **akislar.md**: 5 sıra diyagramı için ilgili API route dosyaları
  (`simSessions.ts`, `challenges.ts`, `rewards.ts`, `learn.ts`, `auth/routes.ts`,
  `auth/sso/routes.ts`, `auth/sso/flow.ts`) hedefli `grep`/`sed -n` ile
  endpoint imzaları ve iş kuralları doğrulandı; `apps/shell/src/reportLearn.ts`
  ve `apps/shell/src/SimRoute.tsx` öğrenme kaydı akışı için okundu.
- Okuma sınırı uygulandı: `packages/sim-*/src/data/*.json` ve
  `packages/assessment-bank/data/**` hiç okunmadı; bu dosyalardaki iş verisi
  hiçbir diyagrama yansımadı.

## Oluşturulan dosyalar (mutlak yollar)

- `/Users/ozankaraca/Documents/Codex/2026-09-23/egemed-clinical-learning-experience-platform-clix/.agtx/worktrees/T286-schemas/docs/sema/README.md`
- `/Users/ozankaraca/Documents/Codex/2026-09-23/egemed-clinical-learning-experience-platform-clix/.agtx/worktrees/T286-schemas/docs/sema/veritabani.md`
- `/Users/ozankaraca/Documents/Codex/2026-09-23/egemed-clinical-learning-experience-platform-clix/.agtx/worktrees/T286-schemas/docs/sema/urun.md`
- `/Users/ozankaraca/Documents/Codex/2026-09-23/egemed-clinical-learning-experience-platform-clix/.agtx/worktrees/T286-schemas/docs/sema/mimari.md`
- `/Users/ozankaraca/Documents/Codex/2026-09-23/egemed-clinical-learning-experience-platform-clix/.agtx/worktrees/T286-schemas/docs/sema/akislar.md`

Kapsam dışına çıkılmadı: `git status --porcelain` yalnız `docs/sema/`'yı
üretilmiş (untracked) dosya olarak gösteriyor, başka hiçbir dosya değişmedi.

## Tablo/diyagram sayısı

- **veritabani.md**: 18 tablo (`institutions`, `units`, `users`, `user_roles`,
  `sim_access`, `sessions`, `import_batches`, `import_rows`, `audit_log`,
  `gami_profiles`, `gami_badges`, `gami_attempts`, `gami_learn`, `sim_sessions`,
  `sim_learn_completions`, `challenges`, `monthly_rewards`, `reward_winners`)
  + 1 görünüm (`gami_leaderboard`), 6 alan grubuna bölünmüş 6 `erDiagram` bloğu
  + 1 genel bakış `flowchart`.
- **urun.md**: 2 `flowchart` (roller→yüzeyler, mod kilitleri).
- **mimari.md**: 2 `flowchart` (bağımlılık grafiği — 14 workspace paketi;
  üretim dağıtımı), 1 sim-host sözleşme tablosu, 1 ADR referans tablosu.
- **akislar.md**: 5 `sequenceDiagram` (değerlendirme oturumu, düello, aylık
  ödül/liderlik, öğrenme kaydı/XP, SSO+dev girişi).
- **Toplam: 16 Mermaid bloğu** (6 erDiagram + 5 flowchart + 5 sequenceDiagram).

## Kapı sonuçları

- **Mermaid sözdizimi**: Ağ vardı; `npx --yes @mermaid-js/mermaid-cli@12.0.0`
  ile TÜM 16 blok tek tek `.mmd` olarak çıkarılıp render edildi — hepsi hatasız
  SVG üretti. İlk denemede `sequenceDiagram` mesaj metinlerindeki `;` karakteri
  parser'ı bozuyordu (mermaid sequence mesajlarında `;` özel karakter); 6 satırda
  `;` → `—`/`ve` ile değiştirilip yeniden doğrulandı. `challenges ..o{ sim_sessions`
  satırında eksik sol taraf kardinalite işareti (`..o{` → `|o..o{`) düzeltildi.
- **`pnpm turbo lint typecheck test`**: worktree'de `node_modules` yoktu, önce
  `pnpm i` (6s, yerel store'dan, ağ indirmesi yok) çalıştırıldı. Sonrasında kapı
  **tamamen yeşil**: 17/17 görev başarılı, 223 test dosyası, **1866 test geçti, 1
  atlandı**, 0 başarısız. Süre 2m21s. Belge-dışı hiçbir dosya değişmediği için
  bu sonuç beklenen bir doğrulamaydı (regresyon riski yoktu).

## Açık sorular (her dosyanın sonunda da var)

1. `sim_sessions.challenge_id` sütununda (migration 010) FK kısıtı tanımlı
   değil — kod seviyesinde eşleşiyor, DB seviyesinde değil.
2. ADR-010'daki `challenge_participants` tablosu hiç oluşturulmamış; gerçek
   uygulama `sim_sessions.challenge_id` + `mode='challenge'` kullanıyor. ADR
   metni güncel değil.
3. Uygulama/Değerlendirme modu için öğrenme kilidi yalnız istemci tarafında
   (`apps/shell`) uygulanıyor; `POST /me/sims/:simId/sessions` API ucu
   `sim_learn_completions`'ı kontrol ETMİYOR. Yalnız Meydan Okuma
   oluşturma/katılma sunucu tarafında da kilitli. Plan metni tek kural gibi
   yazıyordu, koddan bu asimetri gözlemlendi.
4. `packages/xapi-client` bu worktree'de YOK (AGENTS.md haritası bahsediyor
   ama karşılığı bulunamadı); `packages/xapi-profile` hiçbir workspace
   paketinin bağımlılığında görünmüyor (kullanılmıyor olabilir).
5. `infra/prod/nginx-egemed.conf`'daki `/sims/` location'ı (`frame-ancestors
   'self'` CSP'si) ADR-003 (iframe) kalıntısı gibi görünüyor; ADR-006 sonrası
   güncel mimariyle ilişkisi doğrulanamadı.
6. `import_batches.created_at/validated_at/applied_at/expires_at` migration'da
   `NOT NULL`/default değil; uygulamanın bunları her zaman doldurup
   doldurmadığı API kodu okunmadığı için belirlenemedi.
7. ADR-007'nin açık insan kararları (SSO protokolü, saklama/imha süreleri, ilk
   admin kaydı) şemaya henüz yansımamış.

Hiçbiri riskli/geri dönüşsüz bir adım gerektirmediği için işi durdurmadım;
hepsi ilgili dosyanın "Açık sorular" bölümünde ayrıca listeli.
