# Veritabanı şeması (ER)

> Kaynak: `apps/api/migrations/001_identity_access.sql` … `014_gami_learn.sql`
> (T286, 2026-09-30). Tablo/sütun adları migration'lardaki gibi İngilizce
> bırakıldı; açıklamalar Türkçe. Kod DEĞİŞMEDİ, bu belge yalnız koddan türetilen
> bir görünümdür — şema değişince bu dosya da güncellenmelidir.

## Okuma notları

- Sütun satırındaki `PK`/`FK`/`UK` Mermaid'in anahtar işaretidir; tırnak
  içindeki metin gerçek PostgreSQL tipini, `CHECK`/varsayılan değeri ve nullable
  durumunu taşır (Mermaid erDiagram tip alanı köşeli parantez veya boşluk kabul
  etmediği için `text_array`/`int_array` gibi güvenli takma adlar kullanıldı;
  gerçek tip yorumda yazılıdır).
- Okunabilirlik için diyagramlarda yalnız **birincil** ilişkiler çizilir
  (varlığı tanımlayan FK'lar: `institution_id`, `user_id`, `batch_id`,
  `reward_id` vb.). "Kim yaptı / kim verdi" türü ikincil `users` FK'ları
  (`granted_by`, `uploaded_by`, `updated_by`, `actor_user_id`, `matched_user_id`,
  `winner_id`) ok olarak çizilmez; sütun listesinde `FK` işaretiyle belirtilir.
- Tablolar 6 alana gruplanmıştır (plan başlıklarından: kimlik/kullanıcı ve
  kurum/birim/rol tek grupta, sim oturumları ve düello tek grupta birleştirildi
  — ilişkileri iç içe geçtiği için ayrı diyagram okunabilirliği düşürüyordu).

## Genel bakış

```mermaid
flowchart TD
  subgraph G1["Kimlik ve kullanıcı"]
    institutions["institutions"]
    units["units"]
    users["users"]
    user_roles["user_roles"]
    sim_access["sim_access"]
    sessions["sessions"]
  end
  subgraph G2["Oyunlaştırma"]
    gami_profiles["gami_profiles"]
    gami_badges["gami_badges"]
    gami_attempts["gami_attempts"]
    gami_learn["gami_learn"]
  end
  subgraph G3["Sim oturumları ve Meydan Okuma"]
    sim_sessions["sim_sessions"]
    sim_learn_completions["sim_learn_completions"]
    challenges["challenges"]
  end
  subgraph G4["Aylık ödüller"]
    monthly_rewards["monthly_rewards"]
    reward_winners["reward_winners"]
  end
  subgraph G5["İçe aktarma"]
    import_batches["import_batches"]
    import_rows["import_rows"]
  end
  subgraph G6["Denetim"]
    audit_log["audit_log"]
  end

  institutions --> units
  institutions --> users
  units --> users
  users --> user_roles
  users --> sim_access
  users --> sessions
  users --> gami_profiles
  gami_profiles --> gami_badges
  users --> gami_attempts
  users --> gami_learn
  users --> sim_sessions
  users --> sim_learn_completions
  users --> challenges
  challenges -.->|"challenge_id (FK kısıtı yok)"| sim_sessions
  institutions --> monthly_rewards
  monthly_rewards --> reward_winners
  institutions --> import_batches
  import_batches --> import_rows
  users -.->|"actor_user_id"| audit_log
  institutions -.->|"institution_id"| audit_log
```

## 1. Kimlik ve kullanıcı

Kaynak: `001_identity_access.sql`, `006_leaderboard_opt_out.sql` (`users.leaderboard_visible`),
`007_faculty_role.sql` + `012_resident_role.sql` (`user_roles.role` CHECK genişletildi).

```mermaid
erDiagram
  institutions {
    uuid id PK
    text code UK "^[a-z0-9][a-z0-9-]{1,31}$"
    text name "2-200 karakter"
    text status "active | archived, varsayılan active"
    timestamptz created_at
    timestamptz updated_at
    timestamptz deleted_at "nullable, yumuşak silme"
  }
  units {
    uuid id PK
    uuid institution_id FK
    uuid parent_id FK "nullable, self (üst birim)"
    text code "^[a-z0-9][a-z0-9-]{0,31}$"
    text name "2-200 karakter"
    timestamptz created_at
    timestamptz updated_at
    timestamptz deleted_at "nullable"
  }
  users {
    uuid id PK
    uuid institution_id FK
    uuid unit_id FK "nullable"
    text username "nullable, KVKK"
    text email "nullable, KVKK"
    text display_name "KVKK, 2-120 karakter"
    text auth_method "sso | dev"
    text sso_subject "nullable, KVKK"
    text status "invited|active|suspended|deleted"
    text xapi_actor_id UK "opak (ADR-005/007), KVKK dışı"
    boolean leaderboard_visible "varsayılan true (006)"
    timestamptz created_at
    timestamptz updated_at
    timestamptz last_login_at "nullable"
    timestamptz deleted_at "nullable"
  }
  user_roles {
    uuid id PK
    uuid user_id FK
    text role "admin|kullanici|ogretim_uyesi|uzmanlik_ogrencisi"
    uuid granted_by FK "nullable, users"
    timestamptz granted_at
  }
  sim_access {
    uuid id PK
    uuid user_id FK
    text sim_id "pulse|ausculta|opaca"
    uuid granted_by FK "nullable, users"
    timestamptz granted_at
  }
  sessions {
    uuid id PK "uygulama üretir, default yok"
    uuid user_id FK
    text auth_method "sso | dev"
    timestamptz created_at
    timestamptz last_seen_at
    timestamptz expires_at
    timestamptz revoked_at "nullable"
  }

  institutions ||--o{ units : "kapsar"
  institutions ||--o{ users : "kapsar"
  units |o--o{ users : "atanır (opsiyonel)"
  users ||--o{ user_roles : "rolleri vardır"
  users ||--o{ sim_access : "erişimi vardır"
  users ||--o{ sessions : "oturum açar"
```

Notlar:
- `users_mapping_key_check`: `username` veya `email`'den en az biri dolu olmalı.
- `users_deleted_at_check`: `status = 'deleted'` ise `deleted_at` dolu olmalı.
- Benzersizlik `deleted_at is null` kısmi indeksleriyle yalnız yaşayan satırlara uygulanır
  (yumuşak silinmiş kullanıcı adı/e-postası yeniden kullanılabilir).
- `user_roles.role` CHECK'i sırasıyla `admin,kullanici` (001) → `+ogretim_uyesi` (007)
  → `+uzmanlik_ogrencisi` (012) olarak genişledi; tablo yukarıda son hâliyle gösterildi.

## 2. Oyunlaştırma

Kaynak: `004_gamification.sql`, `005_attempt_server_xp.sql` (mod/case_count/hints_used/xp
kolonları), `010_challenges.sql` (mode CHECK'ine `challenge` eklendi), `014_gami_learn.sql`.

```mermaid
erDiagram
  gami_profiles {
    uuid user_id PK, FK
    text sim_id PK "pulse|ausculta|opaca"
    int xp "varsayılan 0, >= 0"
    int level "varsayılan 1, >= 1"
    int streak_current "varsayılan 0"
    int streak_best "varsayılan 0"
    date streak_last_date "nullable"
    timestamptz updated_at
  }
  gami_badges {
    uuid id PK
    uuid user_id FK "bileşik FK: gami_profiles(user_id, sim_id)"
    text sim_id FK "bileşik FK'nın 2. sütunu"
    text badge_key "sim kapsamlı, ^[a-z0-9][a-z0-9-]{0,63}$"
    timestamptz awarded_at
  }
  gami_attempts {
    uuid id PK "uygulama üretir, default yok"
    uuid user_id FK
    text sim_id "pulse|ausculta|opaca"
    int attempt_no "> 0"
    timestamptz started_at
    timestamptz finished_at
    int score "nullable; dolu ise <= max_score ve >= 0"
    int max_score "nullable; dolu ise > 0"
    boolean passed "nullable"
    jsonb summary "kodlu özet; ham öğrenci yanıtı YOK (KVKK)"
    text mode "practice|assessment|challenge (005,010)"
    int case_count "1-100, varsayılan 1 (005)"
    int hints_used "0-1000, varsayılan 0 (005)"
    int xp "sunucu hesaplı, varsayılan 0, >= 0 (005)"
    timestamptz created_at
  }
  gami_learn {
    uuid id PK
    uuid user_id FK
    text sim_id "pulse|ausculta|opaca"
    text topic "sim ad alanlı anahtar, ^[a-z0-9][a-z0-9:._-]{0,119}$"
    int xp "sabit sunucu kuralı, >= 0"
    timestamptz learned_at
    timestamptz created_at
  }

  gami_profiles ||--o{ gami_badges : "kazanır"
```

`gami_attempts_user_sim_attempt_key unique(user_id, sim_id, attempt_no)` ve
`gami_learn_user_sim_topic_key unique(user_id, sim_id, topic)` idempotency'yi DB
seviyesinde garanti eder (aynı konu/deneme tekrar XP üretmez).

### Görünüm: `gami_leaderboard` (004, tablo değil)

```sql
select institution_id, sim_id, user_id, xp, level,
       rank() over (partition by institution_id, sim_id order by xp desc, updated_at asc) as rank
from gami_profiles join users on users.id = gami_profiles.user_id
where users.status = 'active' and users.deleted_at is null
```

`users.leaderboard_visible = false` olan kullanıcılar bu görünümde filtrelenmez
(görünürlük API katmanında uygulanır, bkz. `apps/api/src/me/leaderboard.ts` — kod
okuma kapsamı dışında bırakıldı, yalnız migration'daki view koda dayanır).
T295 (1 Eki 2026): API anonimi izleyenin kendisi olsa bile listeye almaz ve özet
sıralamasını görünür satırlar üzerinden yeniden numaralar (boşluksuz).

## 3. Sim oturumları ve Meydan Okuma

Kaynak: `009_sim_sessions.sql`, `010_challenges.sql`, `011_sim_learn_completions.sql`,
`013_duel_results.sql`, `015_integrity_flags.sql`, `016_competition_bans.sql`.

```mermaid
erDiagram
  sim_sessions {
    uuid id PK
    uuid user_id FK
    uuid institution_id FK
    text sim_id "pulse|ausculta|opaca"
    text mode "practice|assessment|challenge (010)"
    text status "open|finished|expired, varsayılan open"
    jsonb state "sunucu-yalnız oturum durumu; istemciye asla dönmez (ADR-009)"
    timestamptz started_at
    timestamptz expires_at
    timestamptz finished_at "nullable"
    uuid challenge_id "nullable (010); FK KISITI TANIMLI DEĞİL"
    text integrity_status "nullable, unverified|verified (015)"
  }
  integrity_flags {
    uuid id PK
    uuid session_id FK "sim_sessions, on delete cascade"
    uuid user_id FK "users, on delete cascade"
    text sim_id "pulse|ausculta|opaca"
    text mode "practice|assessment|challenge"
    numeric score ">= 0; 10 vakaya normalize sinyal puanı"
    jsonb signals "yalnız sinyal adı + sayı; serbest metin yok (KVKK)"
    text status "pending|cleared|confirmed, varsayılan pending"
    timestamptz created_at
    uuid reviewed_by FK "nullable, users, on delete set null"
    timestamptz reviewed_at "nullable"
    text note "nullable; yalnız yönetici notu (T283b)"
  }
  competition_bans {
    uuid id PK
    uuid user_id FK "users, on delete cascade"
    uuid flag_id FK "nullable, integrity_flags, on delete set null"
    uuid created_by FK "nullable, users, on delete set null"
    timestamptz created_at
    timestamptz lifted_at "nullable; dolu ise engel kalkmıştır"
    uuid lifted_by FK "nullable, users, on delete set null"
  }
  sim_learn_completions {
    uuid user_id PK, FK
    text sim_id PK "pulse|ausculta|opaca"
    timestamptz completed_at "ilk tamamlanma korunur"
    text content_version "^[a-z0-9._-]{1,40}$, yeniden tamamlamada güncellenir"
  }
  challenges {
    uuid id PK
    uuid institution_id FK
    text sim_id "pulse|ausculta|opaca"
    uuid inviter_id FK "users, on delete cascade"
    uuid opponent_id FK "nullable, users, on delete set null"
    text code_hash "sha256; düz metin davet kodu saklanmaz"
    text_array case_ids "text[], iki tarafa aynı vakalar aynı sırayla"
    bigint shuffle_seed "seçenek karışım tohumu"
    text status "open|accepted|finished|expired, varsayılan open"
    timestamptz created_at
    timestamptz expires_at
    timestamptz accepted_at "nullable"
    uuid winner_id FK "nullable, users, on delete set null (013)"
    timestamptz finished_at "nullable (013)"
  }

  challenges |o..o{ sim_sessions : "challenge_id (uygulama düzeyinde eşleşir, DB FK'sı yok)"
  sim_sessions ||--o{ integrity_flags : "şüpheli oturum işaretlenir (T283a, yalnız tespit)"
  users ||--o{ integrity_flags : "işaretlenen kullanıcı"
  users ||--o{ competition_bans : "engellenen kullanıcı (T283b, yalnız yönetici 'confirmed' kararıyla)"
  integrity_flags |o--o{ competition_bans : "engeli açan işaretleme (nullable)"
```

`competition_bans` kullanıcı başına tek AKTİF engel tutar: kısmi benzersiz dizin
`(user_id) where lifted_at is null`. Otomatik ceza YOK — satır yalnız
`POST /admin/integrity/:flagId/decision` (`confirmed`) ile açılır,
`POST /admin/integrity/bans/:userId/lift` ile kapatılır (`lifted_at`/`lifted_by`
dolar, satır silinmez). Etkiler: Meydan Okuma oluşturma/katılma 403
`competition_banned`; liderlik + aylık ödül adaylığından düşme; değerlendirme/
düello XP'si sıfır (öğrenme/uygulama etkilenmez) — bkz. `docs/sema/akislar.md`.

## 4. Aylık ödüller

Kaynak: `008_monthly_rewards.sql`.

```mermaid
erDiagram
  monthly_rewards {
    uuid id PK
    uuid institution_id FK
    text sim_id "pulse|ausculta|opaca"
    text month "^[0-9]{4}-(0[1-9]|1[0-2])$"
    text title
    text description
    text sponsor
    int winners_count "1-10"
    int_array cohorts "int[]"
    int min_assessments "0-100"
    boolean require_public_name "varsayılan true"
    text_array terms "text[], varsayılan {}"
    timestamptz finalized_at "nullable; dolduğunda kesinleşmiştir"
    timestamptz created_at
    timestamptz updated_at
    uuid updated_by FK "nullable, users, on delete set null"
  }
  reward_winners {
    uuid id PK
    uuid reward_id FK "on delete cascade"
    int rank "1-10"
    text display_name "KVKK: yalnız adla görünmeyi seçen (uygun) öğrenci"
    numeric score "numeric(6,2)"
  }

  monthly_rewards ||--o{ reward_winners : "kesinleşince kazananları vardır"
```

`monthly_rewards_institution_sim_month_key unique(institution_id, sim_id, month)`:
kurum × sim × ay başına tek ödül kaydı (ADR ile uyumlu — simler arası ödül yok).

## 5. İçe aktarma

Kaynak: `002_import_staging.sql`.

```mermaid
erDiagram
  import_batches {
    uuid id PK
    uuid institution_id FK
    uuid uploaded_by FK "users"
    text file_name "1-200 karakter"
    text mode "ekle|guncelle"
    text status "uploaded|validated|applied|failed|expired"
    text template_version
    int row_count "varsayılan 0"
    int valid_count "varsayılan 0"
    int error_count "varsayılan 0"
    int applied_count "varsayılan 0"
    timestamptz created_at "nullable, migration'da default yok"
    timestamptz validated_at "nullable"
    timestamptz applied_at "nullable"
    timestamptz expires_at "nullable"
  }
  import_rows {
    uuid id PK
    uuid batch_id FK "on delete cascade"
    int row_no
    jsonb raw "KVKK: ham CSV satırı, kişisel veri; imha işiyle silinir"
    jsonb normalized "nullable"
    text status "valid|error|applied|skipped"
    jsonb errors "nullable"
    uuid matched_user_id FK "nullable, users"
    timestamptz created_at "nullable"
    timestamptz applied_at "nullable"
  }

  import_batches ||--o{ import_rows : "satırlarını tutar"
```

## 6. Denetim

Kaynak: `003_audit_log.sql`.

```mermaid
erDiagram
  audit_log {
    bigint id PK "identity"
    timestamptz occurred_at
    uuid actor_user_id FK "nullable, users"
    text actor_role "nullable"
    uuid institution_id FK "nullable"
    text action
    text target_type "nullable"
    uuid target_id "nullable"
    jsonb summary_before "nullable; sır/parola/ham yanıt YOK"
    jsonb summary_after "nullable; sır/parola/ham yanıt YOK"
    text request_id "nullable"
  }
```

`audit_log` append-only'dir: `BEFORE UPDATE OR DELETE OR TRUNCATE` tetikleyicisi
her girişimi `P0010` SQLSTATE'i ile reddeder (uygulama rolünün UPDATE/DELETE
yetkisi olsa bile). İmha işleri (§c, içe aktarma ham satırları) bu tabloyu
etkilemez; istisna tanımlı değildir.

## Tablo amaçları ve KVKK notları

| Tablo | Amaç (1 satır) | KVKK |
|---|---|---|
| `institutions` | Kurum kaydı (şu an tek kurum varsayımı, sınıflandırma amaçlı) | Kişisel veri yok |
| `units` | Kurum içi birim/dönem/grup sınıflandırması | Kişisel veri yok |
| `users` | Platform kullanıcı kaydı; SSO/dev girişin eşleme anahtarı | **Var**: `username`, `email`, `display_name`, `sso_subject` |
| `user_roles` | Kullanıcı↔rol ataması (admin/kullanici/ogretim_uyesi/uzmanlik_ogrencisi) | Yalnız FK (dolaylı) |
| `sim_access` | Kullanıcının erişebildiği sim(ler) | Yalnız FK (dolaylı) |
| `sessions` | Sunucu tarafı oturum (httpOnly çerez karşılığı) | Yalnız FK + zaman damgası |
| `import_batches` | Toplu CSV içe aktarma işi ve sayaçları | Sayaç/özet; kişisel veri yok |
| `import_rows` | İçe aktarmanın ham/normalize satırı, kısa ömürlü | **Var**: `raw` jsonb (ham CSV satırı) |
| `audit_log` | Değiştirilemez (append-only) denetim günlüğü | `actor_user_id` FK; özetler dolaylı kişisel veri taşıyabilir |
| `gami_profiles` | Kullanıcı × sim XP/seviye/seri özeti | Yalnız FK (ad/e-posta yok) |
| `gami_badges` | Kazanılan rozetler (sim kapsamlı anahtar) | Yalnız FK |
| `gami_attempts` | Deneme özeti (kodlu; ham yanıt yok) | `summary` kodlu jsonb; ham yanıt **tutulmaz** |
| `gami_learn` | Puansız öğrenme kaydı (konu başına tek, idempotent XP) | Yalnız FK |
| `gami_leaderboard` (görünüm) | Kurum × sim liderlik sıralaması | Yalnız FK; `leaderboard_visible=false` API'de filtrelenir |
| `sim_sessions` | Sunucu vaka oturumu (seçilen vakalar, yanıtlar) | `state` yalnız kodlu seçenek/ses/görüntü jetonu taşır, serbest metin yok |
| `sim_learn_completions` | "Öğrenme bitti" kilidi kaydı | Yalnız FK |
| `challenges` | Meydan Okuma (düello) daveti ve sonucu | `inviter_id`/`opponent_id`/`winner_id` FK; davet kodu hash'li |
| `monthly_rewards` | Kurum × sim × ay ödül tanımı | Kişisel veri yok |
| `reward_winners` | Kesinleşmiş ay kazananlarının anlık görüntüsü | **Var**: `display_name` (yalnız uygun ve adla görünmeyi seçen öğrenci) |

## Açık sorular

- `sim_sessions.challenge_id` sütununda (migration 010) foreign key kısıtı
  tanımlanmamış; eşleşme yalnız uygulama kodunda (`apps/api/src/me/challenges.ts`)
  kuruluyor. Kasıtlı mı (esneklik) yoksa eksik mi kaldı, migration'dan anlaşılmıyor.
- ADR-010 "Veri" bölümü `challenges` yanında ayrı bir `challenge_participants`
  tablosu öngörüyordu (`challenge_id, user_id, session_id, score, duration_ms,
  finished_at`); gerçek uygulamada bu tablo hiç oluşturulmadı — katılımcı/skor
  bilgisi `sim_sessions.challenge_id` + `sim_sessions.mode='challenge'` ile
  çözülmüş. ADR metni bu noktada güncel değil.
- `import_batches.created_at/validated_at/applied_at/expires_at` `NOT NULL`
  değil ve migration'da varsayılan yok; bu alanların her zaman uygulama
  tarafından dolduruluyor olup olmadığı yalnız migration'dan doğrulanamıyor
  (API kodu okuma kapsamı dışında bırakıldı).
- ADR-007'deki açık insan kararları (SSO protokolü, saklama/imha süreleri,
  ilk admin kaydının oluşturulma yolu) şemaya henüz yansımamış; örn. otomatik
  imha/anonimleştirme işi için ayrı bir iş kuyruğu tablosu yok.
