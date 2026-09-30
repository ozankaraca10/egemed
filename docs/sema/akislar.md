# Temel akışlar (sıra diyagramları)

> Kaynak: `apps/api/src/me/simSessions.ts`, `apps/api/src/me/challenges.ts`,
> `apps/api/src/rewards.ts`, `apps/api/src/me/learn.ts`, `apps/api/src/me/gamification.ts`,
> `apps/api/src/auth/routes.ts`, `apps/api/src/auth/sso/routes.ts`,
> `apps/api/src/auth/sso/flow.ts`, `apps/shell/src/reportLearn.ts`,
> `apps/shell/src/SimRoute.tsx`, `apps/shell/src/session.ts`, ilgili ADR'ler
> (009, 010, 007). T286, 2026-09-30.

## 1. Değerlendirme oturumu (ADR-009)

Cevap anahtarı hiçbir zaman istemciye gönderilmez; puanlama `finish` çağrısında
sunucuda yapılır.

```mermaid
sequenceDiagram
  participant Sim as Sim modülü (tarayıcı)
  participant API as apps/api
  participant Bank as assessment-bank (yalnız API içe aktarır)
  participant DB as PostgreSQL (sim_sessions, gami_attempts)

  Sim->>API: POST /me/sims/:simId/sessions {mode: "assessment"}
  API->>API: sim erişimi kontrolü (meActor.simAccess)
  API->>Bank: selectCaseIds("assessment", random)
  API->>DB: sim_sessions INSERT (state jsonb: case_ids, shuffle, boş yanıtlar)
  API-->>Sim: 201 {sessionId, caseCount, süre sınırları} (cevap anahtarı YOK)

  loop Her vaka için
    Sim->>API: GET /me/sims/:simId/sessions/:id/cases/:index
    API->>Bank: buildPublicCase(caseId, ...) — seçenekler oturuma özel karıştırılır
    API-->>Sim: PublicCase (görsel/ses/EKG kimliği, soru, opak seçenek id'leri — correct/bölge/ağırlık YOK)
    opt İpucu istenirse
      Sim->>API: POST .../cases/:index/hint
      API-->>Sim: {hint, hintsUsed}
    end
    Sim->>API: POST .../cases/:index/answer {answer}
    API->>API: sunucu saatiyle süre kontrolü (süresi dolmuş cevap reddedilir)
    API->>DB: sim_sessions UPDATE (state.cases[index].result yazılmaz — yalnız kayıt)
    API-->>Sim: {mode:"assessment", accepted:true} (doğru/yanlış bilgisi YOK)
  end

  Sim->>API: POST /me/sims/:simId/sessions/:id/finish
  API->>Bank: gradeItem(...) her vaka için (scoreCase saf/deterministik)
  API->>DB: gami_attempts INSERT (yalnız actor.gamified=true ise — kodlu summary)
  API->>API: serverAttemptXp(mode, caseCount, hintsUsed, score) → xpGained
  API->>DB: sim_sessions UPDATE (status="finished", total)
  API-->>Sim: {total, passed, cases[] (doğru cevap + açıklama ARTIK dahil), xpGained}
```

Notlar:
- `POST /me/sims/:simId/sessions` API ucu öğrenme kilidini kontrol ETMEZ
  (bkz. `urun.md` "Önemli bulgu"); yalnız `sim_access` kontrol edilir.
- Uygulama modunda (`practice`) `answer` çağrısı hemen `result` döner
  (anında geri bildirim); değerlendirme (`assessment`) ve düello (`challenge`)
  modlarında sonuç yalnız `finish`te açılır.
- `check` ucu (`POST .../cases/:index/check`) yalnız uygulama modunda tek
  soruyu anında kontrol eder; değerlendirmede kullanılmaz.
- Öğretim üyesi/uzmanlık öğrencisi (`actor.gamified=false`) için `finish`
  puanı hesaplar ama `gami_attempts` satırı YAZILMAZ (deneme kaydı tutulmaz).

## 2. Meydan Okuma düellosu (ADR-010)

```mermaid
sequenceDiagram
  participant D as Davet eden (öğrenci)
  participant K as Karşı taraf (öğrenci)
  participant API as apps/api (me/challenges.ts)
  participant DB as PostgreSQL (challenges, sim_sessions)

  D->>API: POST /me/challenges {simId}
  API->>API: gamified? + learnCompleted(simId)? + açık davet/günlük sınır kontrolü
  API->>DB: challenges INSERT (code_hash=sha256(6 haneli kod), case_ids, shuffle_seed, status="open")
  API-->>D: {challengeId, code (yalnız bu yanıtta düz metin), expiresAt}
  D--)K: Kod/bağlantı paylaşımı (davet edenin kendi eylemi — arama/liste YOK)

  K->>API: POST /me/challenges/join {code}
  API->>API: gamified? + kendi daveti değil mi? + sim erişimi? + learnCompleted(simId)?
  API->>DB: challenges UPDATE (opponent_id, status="accepted")
  API-->>K: {challengeId, status:"accepted", ...}

  par Davet eden oynar
    D->>API: POST /me/challenges/:id/session
    API->>DB: sim_sessions INSERT (mode="challenge", challenge_id, aynı case_ids+shuffle_seed)
    API-->>D: sim_session (Bölüm 1'deki case/hint/answer/finish akışı aynen uygulanır)
    D->>API: POST /me/sims/:simId/sessions/:sid/finish
  and Karşı taraf oynar (farklı zamanda olabilir)
    K->>API: POST /me/challenges/:id/session
    API->>DB: sim_sessions INSERT (mode="challenge", aynı challenge_id)
    K->>API: POST /me/sims/:simId/sessions/:sid2/finish
  end

  API->>API: finish sonrası challengeFinishedHook: iki taraf da "finished" mi?
  alt İkisi de bitirdi
    API->>API: decideWinner(duelScore(D), duelScore(K)) — önce doğru sayısı, eşitlikte süre
    API->>DB: challenges UPDATE (winner_id, finished_at, status="finished")
    API->>DB: awardDuelBadges(...) — "Düellocu" rozet ailesi
    API-->>D: GET /me/challenges/:id → sonuç + vaka vaka karşılaştırma + açıklamalar
    API-->>K: GET /me/challenges/:id → aynı sonuç
  else Yalnız biri bitirdi
    API-->>D: GET /me/challenges/:id → status="accepted" (açıklamalar henüz gizli)
  end
```

Notlar:
- `ogretim_uyesi` ve ziyaretçi düello oluşturamaz/kabul edemez (`actor.gamified`
  kontrolü `role_not_permitted` ile reddeder; ziyaretçi zaten oturumsuzdur).
- Düello puanı normal değerlendirmenin yarısı XP verir ve aylık liderlik/ödüle
  GİRMEZ (`mode="challenge"` ayrı işlenir — bu görevde ayrım noktası koddan
  değil ADR-010 metninden alındı, `gami_attempts.mode` içinde "challenge"
  değeri ayrı sayılır).
- `sim_sessions.challenge_id`'nin DB'de FK kısıtı yoktur (bkz. `veritabani.md`
  Açık sorular); eşleşme uygulama kodundadır.

## 3. Aylık ödül ve liderlik (depo sahibi kararı, 26 Eyl 2026)

```mermaid
sequenceDiagram
  participant Admin as Admin (panel)
  participant API as apps/api (rewards.ts, gamification.ts)
  participant DB as PostgreSQL (monthly_rewards, reward_winners, gami_profiles)
  participant Sim as Sim ekranları / dashboard

  Admin->>API: PUT /admin/rewards/:simId/:month {title, sponsor, winnersCount, cohorts, minAssessments, ...}
  API->>DB: monthly_rewards UPSERT (kurum × sim × ay tekil)
  API->>DB: audit_log INSERT (action="reward.upsert")
  API-->>Admin: 200 {reward}

  Note over Sim,API: Ay boyunca öğrenciler değerlendirme çözer (Bölüm 1) → gami_profiles.xp güncellenir
  Sim->>API: GET /me/gamification/:simId/leaderboard
  API->>DB: gami_leaderboard görünümü (rank() over institution_id,sim_id — leaderboard_visible=false filtrelenir)
  API-->>Sim: sıralama satırları

  Note over Admin: Ay kapandıktan SONRA (path.month < bu ayın anahtarı)
  Admin->>API: POST /admin/rewards/:simId/:month/finalize
  API->>API: finalizedAt zaten dolu mu? (tek seferlik, "conflict" ile reddedilir)
  API->>DB: getLeaderboard(period="month", cohort="all", at=ayın sonu)
  API->>API: uygunluk filtresi: minAssessments, requirePublicName→isPublic, cohorts.includes
  API->>DB: reward_winners INSERT (ilk winnersCount satır, rank/displayName/score)
  API->>DB: monthly_rewards UPDATE (finalized_at)
  API->>DB: audit_log INSERT (action="reward.finalize")
  API-->>Admin: {reward, winners[]}

  Sim->>API: GET /me/rewards/:simId
  API->>DB: monthly_rewards + reward_winners (kesinleşmiş son 6 ay)
  API-->>Sim: {current, winners[]} → SimRewardsSource.snapshot()/subscribe() ile sim ekranına iletilir
```

Notlar:
- Ödül kurum × sim × ay başınadır; simler arası birleşik ödül yoktur (ADR-006).
- `require_public_name=true` ise yalnız `leaderboard_visible=true` (adla
  görünmeyi seçmiş) öğrenciler kazanan olabilir (`row.isPublic` kontrolü).
- Düello (`challenge`) denemeleri liderlik hesabına girmez (Bölüm 2 notu).

## 4. Öğrenme kaydı ve XP (tek sefer, idempotent)

İki ayrı mekanizma vardır: (a) sim içeriğinin **tamamının** görülmesi (mod
kilidini açar), (b) tek bir **konunun** ilk görülmesi (sabit XP verir).

```mermaid
sequenceDiagram
  participant Sim as Sim modülü
  participant Shell as apps/shell (SimRoute, reportLearn.ts)
  participant API as apps/api (learn.ts, gamification.ts)
  participant DB as PostgreSQL (sim_learn_completions, gami_learn, gami_profiles)

  Note over Sim,Shell: (a) İçerik tamamlandı — mod kilidini açar
  Sim->>Shell: context.learn.markComplete(contentVersion)
  Shell->>API: POST /me/sims/:simId/learn/complete {contentVersion}
  API->>API: sim erişimi var mı? (yoksa 403 forbidden)
  API->>DB: sim_learn_completions UPSERT (user_id,sim_id) — ilk completed_at KORUNUR, content_version güncellenir
  API-->>Shell: GET /me/learn ile aynı gövde — 3 simin AYRI durumu
  Shell-->>Sim: learn.complete = true (bir sonraki mount'ta)

  Note over Sim,Shell: (b) Tek konu görüldü — sabit XP (idempotent)
  Sim->>Shell: context.reportLearn({topic: "pulse:mode:af"})
  Shell->>API: POST /me/gamification/:simId/attempts {topic} (gamified=false ise hiç çağrılmaz)
  API->>API: actor.gamified? (değilse 403 role_not_permitted)
  API->>DB: gami_learn INSERT ... ON CONFLICT (user_id,sim_id,topic) DO NOTHING
  alt İlk kez görüldü
    API->>DB: gami_profiles.xp += DEFAULT_RULES.xp.learnTopicFirstView
  else Zaten vardı
    API->>API: hiçbir şey değişmez (yeni satır/yeni XP YOK)
  end
  API-->>Shell: güncel özet
```

Notlar:
- `POST /me/gamification/:simId/attempts` eski puanlı deneme ucudur; A4
  (28 Eyl 2026, T226) sonrası yalnız `{topic}` gövdesini kabul eder, puanlı
  gövdeyi `403 server_scored` ile reddeder (ADR-009 güncellemesi).
- Skor, doğru sayısı, süre — hiçbiri bu uca gönderilmez; XP miktarı tamamen
  sunucu sabiti (`DEFAULT_RULES.xp.learnTopicFirstView`), istemci beyan etmez.
- Öğretim üyesi ve uzmanlık öğrencisi bu uca yazamaz (403 `role_not_permitted`);
  öğrenme kilidi zaten onlara istemci tarafında uygulanmıyor (bkz. `urun.md`).

## 5. Giriş: SSO ve (yalnız geliştirmede) dev girişi

```mermaid
sequenceDiagram
  participant T as Tarayıcı
  participant API as apps/api (auth/routes.ts, auth/sso/*)
  participant IdP as Kurum IdP (SSO sağlayıcı)
  participant DB as PostgreSQL (users, sessions, audit_log)

  rect rgb(240,240,240)
  Note over T,DB: SSO girişi (üretim)
  T->>API: GET /auth/sso/start?returnTo=...
  API->>API: state+nonce üret, imzalı HttpOnly çerez (SSO_STATE_COOKIE) yaz
  API-->>T: 302 → IdP yetkilendirme URL'i
  T->>IdP: Kullanıcı kimlik doğrular
  IdP-->>T: 302 → /auth/sso/callback?state=...&code/assertion=...
  T->>API: GET /auth/sso/callback
  API->>API: state çerezini doğrula (imza + eşleşme) ve hız sınırı (loginRate)
  API->>IdP: provider.exchange(params) → identity {subject, username/email}
  API->>DB: users SELECT (mapping key: username veya email)
  alt Bilinmeyen kullanıcı / auth_method≠sso / suspended / deleted
    API->>DB: audit_log INSERT (auth denied, sebep)
    API-->>T: hata (auth_denied_unknown_user | auth_denied_suspended)
  else Geçerli kullanıcı
    API->>DB: sso_subject bağla (ilk girişte), sessions INSERT
    API->>DB: users UPDATE (last_login_at)
    API-->>T: Set-Cookie egemed_session (HttpOnly, SameSite=Lax) + CSRF çerezi
  end
  end

  rect rgb(240,240,240)
  Note over T,DB: Dev girişi (yalnız NODE_ENV≠production, AUTH_DEV_ENABLED=true)
  T->>API: POST /auth/dev/login {username} (Origin kontrolü — originGuard)
  API->>DB: users SELECT (auth_method="dev")
  API->>DB: sessions INSERT
  API-->>T: Set-Cookie egemed_session + CSRF çerezi
  end

  T->>API: GET /auth/me (her rota değişiminde — nginx'te ayrı hız bölgesinde DEĞİL)
  API->>DB: sessions + users + user_roles SELECT
  API-->>T: {id, role(ler), simAccess, gamified, ...}

  T->>API: POST /auth/logout
  API->>DB: sessions UPDATE (revoked_at)
  API-->>T: çerezler silinir
```

Notlar:
- Üretimde `AUTH_DEV_ENABLED=false` sabittir (`docker-compose.prod.yml`);
  `/auth/dev/login` üretimde kapalıdır.
- `/auth/sso/*` uçları yalnız bir SSO adaptörü enjekte edilmişse bağlanır;
  yoksa tüm istekler 404 alır (`registerSsoRoutes` erken çıkış).
- Mutasyon uçları (`POST/PUT/PATCH/DELETE`) double-submit CSRF ister
  (`X-CSRF-Token` başlığı + `egemed_csrf` çerezi eşleşmeli) ve Origin
  başlığını isteğin Host'uyla karşılaştırır.
- SSO state çerezi tek kullanımlıktır; callback'te doğrulanır doğrulanmaz
  silinir. Asıl yeniden-oynatma koruması IdP'nin kod/assertion doğrulamasıdır
  (adaptöre bağlı, bu görev kapsamında adaptör implementasyonu incelenmedi).
