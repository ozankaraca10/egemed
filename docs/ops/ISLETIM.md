# EGEMED İşletim Kılavuzu (üretim)

Bu kılavuz, platformun tek sunucu dağıtımını (egemed.ege.edu.tr) kurmayı,
çalıştırmayı, yedeklemeyi ve geri almayı kapsar. Kaynak dosyalar:
`infra/prod/Dockerfile` (API imajı), `infra/prod/docker-compose.prod.yml`
(api + postgres), `infra/prod/nginx-egemed.conf` (ters vekil örneği),
`infra/prod/.env.prod.example` (boş değerli ortam örneği).

## 1. Dağıtım birimleri

- **Statik kabuk:** `pnpm --filter @egemed/shell build` çıktısı `apps/shell/dist`
  (sim varlıkları `dist/sims/<id>/` dâhil; bkz. ADR-006/ADR-002). Nginx sunar.
- **API:** `infra/prod/Dockerfile` imajı — node:22 digest-pinli, non-root,
  yalnız prod bağımlılıkları (ADR-002). `127.0.0.1:3000` üzerinden ters
  vekile açıktır. İmaj çalışma zamanında tamdır: prod `node_modules` deps
  aşamasından kopyalanır, `ts-register.mjs`/`ts-resolve.mjs` kancası,
  `apps/api/src` + `migrations` ve workspace paket kaynakları
  (`@egemed/contracts`, `@egemed/gamification-core`, `@egemed/gami-catalogs`)
  imajdadır; derleme makinesinin node_modules'ına bağımlı değildir. Sunucu Node 22'nin yerleşik
  TypeScript desteğiyle bayraksız başlar (`CMD ["node", "--import",
  "./ts-register.mjs", "src/server.ts"]`); API-01 düzeltmesiyle (T85)
  gamification-core'daki parametre property'si kaldırıldı, strip-only kip
  yeterlidir (bkz. audit API-01/API-02). Derleme bağlamı BuildKit altında
  `infra/prod/Dockerfile.dockerignore` ile budaılır.
- **PostgreSQL 18:** compose'da adlandırılmış `postgres-data` volume'ü ile.
- **LRS:** kurum altyapısındadır; EGEMED hiçbir yüzeyde ifade saklamaz
  (ADR-004). Tarayıcı LRS'ye doğrudan bağlanır; nginx CSP `connect-src`
  adresi kurum LRS uç noktasıyla değiştirilir.

## 2. Kurulum

Derleme makinesinde (Node 22, pnpm — `.nvmrc`):

```sh
pnpm i
pnpm --filter @egemed/sim-opaca sync:xray        # git-dışı xray çalışma zamanı
pnpm --filter @egemed/sim-ausculta sync:audio     # git-dışı audio çalışma zamanı
pnpm --filter @egemed/shell build                 # varlıkları dist'e taşır
```

Sunucuya aktarım: izlenen dosyaların kopyası (`git archive` veya rsync ile,
`/srv/egemed` altına) + `apps/shell/dist` + `infra/prod/.env.prod` (repoda
yoktur; elle kopyalanır, izinler 600).

```sh
cp infra/prod/.env.prod.example infra/prod/.env.prod   # değerleri doldurun
docker compose --env-file infra/prod/.env.prod \
  -f infra/prod/docker-compose.prod.yml up -d --build --wait
```

`up --wait`, her iki servisin healthcheck'i yeşile basana dek bekler. Sırlar
yalnız `.env.prod` içindedir; eksik değer `${VAR:?}` interpolasyonuyla net
hatayla durur. Dev altyapısıyla aynı makinede çalışabilir: üretim postgres'i
port yayımlamaz, proje adı (`egemed-prod`) geliştirme (`egemed-local`)
projelerinden ayrıdır.

Kabuğun yerleşimi (nginx root'un gösterdiği dizin; atomik geçiş):

```sh
rsync -a --delete apps/shell/dist/ /srv/egemed/releases/<sürüm>/
ln -sfn /srv/egemed/releases/<sürüm> /srv/egemed/shell-dist
```

## 3. Migration (node-pg-migrate)

Migration'lar imaj içinde `apps/api/migrations` dizinindedir; API açılışta
migration çalıştırmaz. Komut non-root (node, uid 1000) olarak çalışır ve
`.bin` yolu apps/api'nin kendi node_modules'ından çözülür (pnpm düzeni). Yeni sürümde sıra: api'yi durdur → migration → api'yi
aç.

```sh
docker compose --env-file infra/prod/.env.prod -f infra/prod/docker-compose.prod.yml stop api
docker compose --env-file infra/prod/.env.prod -f infra/prod/docker-compose.prod.yml \
  run --rm api ./node_modules/.bin/node-pg-migrate up --migrations-dir migrations
docker compose --env-file infra/prod/.env.prod -f infra/prod/docker-compose.prod.yml up -d --wait
```

`migrate:down` şeması geri döndürür ama veri yıkıcı olabilir; yalnız
yedekten sonra ve farkı okuyarak kullanın (bkz. §6).

Migration 005 (API-05): `gami_attempts` tablosuna `mode`, `case_count`,
`hints_used` ve `xp` kolonları varsayılanlarla eklenir; XP bundan sonra
sunucuda hesaplanır ve deneme ile profil XP/düzey/seri tek ifadede yazılır
(istemcinin kodlu özetindeki `xp` yetkili değildir). Migration veri
dönüştürmez: 005 öncesi denemeler `xp = 0` alır, bu yüzden o satırlar haftalık
hedefin `currentXp` toplamına katkı vermez (profil XP'si değişmez). Geri alma
kolonları düşürür (§6 kuralı: yalnız yedekten sonra).

Migration 006 (T100): `users` tablosuna `leaderboard_visible`
(`boolean not null default true`) eklenir. Kullanıcı `PATCH /me/preferences`
ile `false` yaparak liderlik tablosundan çıkar; opt-out yalnız başkalarının
listelerinden gizler, kullanıcı kendi satırını ve sıralama özetini görmeye
devam eder. Tercih üç simde ortaktır ve veri dönüşümü yoktur. Geri alma
kolonu düşürür; yeniden uygulanırsa tercihler varsayılana (`true`) döner
(§6 kuralı).

Rozetler sunucuda değerlendirilir (ADR-008) ve bu yeni migration gerektirmez:
yeni deneme yazılınca `@egemed/gami-catalogs` kataloğuyla kodlu özetten
türetilen istatistik `gami_badges`e idempotent (`on conflict do nothing`)
yazılır; kaçan bir yazım sonraki denemede tamamlanır.

## 4. İlk admin tohumu (seed:admin)

Üretimde `--allow-production` (veya `SEED_ALLOW_PRODUCTION=true`) zorunludur;
yoksa tohum üretimde durur. Kurum/birim bilgisi `.env.prod`'da
`SEED_INSTITUTION_CODE` ve `SEED_INSTITUTION_NAME` olarak verilir (ADR-007).

```sh
docker compose --env-file infra/prod/.env.prod -f infra/prod/docker-compose.prod.yml \
  run --rm api node --import ./ts-register.mjs src/seed/main.ts admin \
  --username <admin-kullanıcı-adı> --display-name "<Görünen Ad>" --allow-production
```

Çıktı yalnız sonuç ve kimlik taşır; sır yazmaz. Bu hesap SSO ile giriş yapar
(SSO_PROVIDER seçilene dek `dev` sağlayıcı üretimde kapalıdır).

## 5. Yedekleme

Yedekler kişisel veri içerir (kullanıcı kaydı, oyunlaştırma özeti): şifreli
diskte/kasada tutulur, repoya hiç girmez.

```sh
# /etc/cron.d/egemed-yedek — cron'da % karakteri \% olarak yazılır
15 2 * * * root cd /srv/egemed && docker compose --env-file infra/prod/.env.prod \
  -f infra/prod/docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip \
  > /srv/egemed/backups/egemed-$(date +\%F).sql.gz
```

Öneri saklama planı (süreler insan kararıdır): günlük 14, haftalık 8, aylık 12
kopya; süresi geçen dosya imha edilir. Geri yükleme:

```sh
gunzip -c /srv/egemed/backups/<dosya>.sql.gz | \
  docker compose --env-file infra/prod/.env.prod -f infra/prod/docker-compose.prod.yml \
  exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Zaman içinde nokta kurtarma (WAL/PITR) bu kılavuzun kapsamı dışındadır;
gerekiyorsa ayrı onaylı görevle açılır.

## 6. Sürüm geri alma

- **Kabuk:** önceki `releases/<sha>` klasörüne symlink'i çevirin; nginx
  yeniden yükleme gerektirmez (`index.html` no-cache'tir).
- **API:** dağıtım öncesi imajı etiketleyin
  (`docker tag egemed-prod-api egemed-api:<sha>`); geri alma aynı kaynaktan
  `up -d --build` ile yapılır (taban imaj digest-pinli, aynı kod aynı imajı
  üretir).
- **Veritabanı:** migration'lar tek yönlü varsayılır. Geri alma önce yedek
  alındıktan sonra: `node-pg-migrate down` (veri yıkıcı olabilir) veya
  §5'teki geri yükleme. Rollback penceresinde hem kabuk hem API sürümü
  birlikte döndürülür; git-dışı sim varlıkları eski sürümle uyumluysa
  değiştirilmez.

## 7. İzleme ve sağlık uçları

- `GET /health` — süreç canlılığı (compose healthcheck bunu kullanır).
- `GET /health/db` — Postgres dâhil okuma (`select 1`); izleme panosu buna
  bağlanır. Nginx üzerinden: `/api/health`, `/api/health/db`.
- `docker compose ps`, `docker compose logs -f api` ile yerel takip; json-file
  rotasyonu compose'dadır (max-size 10m, max-file 5).

## 8. E2E API zorunluluk kapağı

`playwright.config.ts`, API ayakta değilken `api-dev` Playwright projesini hiç
tanımlamaz; bu testler koşum listesinden sessizce çıkar. API'nin çalışması
zorunluyken sessiz atlanmayı engellemek için `E2E_REQUIRE_API=1` verin: API
`/health` ucuna yanıt vermezse yapılandırma anlaşılır bir Türkçe hatayla
açıkça durur. Bu koşum için kök betik: `pnpm e2e:api` (API'yi önce
`pnpm --filter @egemed/api dev` gibi bir komutla ayakta tutun). Değişken
verilmediğinde bugünkü davranış korunur; yalnız konsola "api-dev projesi
atlandı" uyarısı basılır.

### CI koşuları

`.github/workflows/ci.yml` beş iş çalıştırır: `gates` (lint/typecheck/test),
`e2e` (Playwright mobil), `api-e2e` (bu bölümdeki `pnpm e2e:api`; gerçek API +
PostgreSQL), `api-db` (migration turu + gerçek PostgreSQL testleri) ve
`prod-image` (temiz checkout imajı; yukarıdaki betik). Git-dışı
sim varlıkları (Opaca xray, Ausculta ses) CI'da yoktur; bu varlıklara bağlı e2e
senaryoları CI'da tam doğrulanamaz ve risk olarak izlenir. Yerelde eksik
varlıkla koşmadan önce §2'deki `sync:xray` / `sync:audio` adımlarını çalıştırın.

### Gerçek PostgreSQL testleri (`pnpm --filter @egemed/api test:db`, T126)

`apps/api/vitest.db.config.ts`, `apps/api/test/db/**/*.test.ts` dosyalarını
koşar: migration turunun yanında oyunlaştırma SQL'i (deneme + profil tek
ifadesi, API-05), ADR-008 rozet değerlendirmesi, liderlik katılım tercihi
(T100) ve toplu işlem kimlikleri (API-07) gerçek PostgreSQL'de doğrulanır.
`DATABASE_URL` tanımlı değilse suite açık mesajla atlanır (FAIL etmez). Her
test dosyası kendi geçici şemasını (`t126_*`) kurar, migration'ları o şemaya
uygular ve sonunda `drop schema ... cascade` ile siler; public şema, migration
tablosu ve mevcut veriye dokunulmaz — bu yüzden dosyalar paralel koşabilir.

Yerel koşum: `egemed-local-postgres` konteyneri ayakta olmalı. Geçici
veritabanı `docker exec egemed-local-postgres-1 createdb ...` ile açılır,
`DATABASE_URL` yalnız ortamdan verilir (sır yazdırılmaz; `pg` eksik parolayı
`PGPASSWORD`'den okur, bkz. §8 CI notu) ve koşum sonunda `dropdb --force` ile
kapatılır. CI'da `api-db` işi aynı `test:db` komutunu çalıştırır; yeni test
dosyaları include deseniyle kapsam içindedir, ayrı bir iş gerekmez.

### Deneme yazımı korumaları (T149; T226)

`POST /me/gamification/:simId/attempts` puanlı deneme kabul etmez (A4/ADR-009):
uygulama, değerlendirme ve düello denemesini sunucu oturumu yazar; istemci
puanlı gövde (mod, skor, özet vb.) gönderirse **403 `server_scored`** alır. Uçta
kalan tek yazma biçimi puansız öğrenme kaydıdır: `{ topic }` gövdesi `gami_learn`
tablosuna kullanıcı × sim × konu başına bir kez yazılır (migration 014); ilk kayıt
201 ve sabit XP (`DEFAULT_RULES.xp.learnTopicFirstView`) döner, aynı konu tekrarı
200 ve `xpGained: 0` ile **idempotenttir**; XP miktarını istemci bildirmez.
Öğretim üyesi ve uzmanlık öğrencisi bu uca yazamaz (403 `role_not_permitted`).
Kullanıcı başına saatlik yazım sınırı `ATTEMPT_RATE_MAX` (1–10000; **varsayılan
60**; bellek içi, süreç başına) ile ayarlanır; aşımda `429 rate_limited`. İstek
gövdesi 1 MB ile sınırlıdır (CSV içe aktarma ucu 3 MB); aşımda `413
payload_too_large`. Admin kendi hesabını askıya alamaz, silemez ve toplu askıya
almaya dahil edemez (`403 role_not_permitted`).

### Giriş hız sınırı (T81; T124)

Giriş hız sınırı kullanıcı adı başına **15 dakikada 8 denemedir** ve API
sürecinin belleğinde tutulur (`apps/api/src/auth/rate-limit.ts`; anahtar ham
kullanıcı adı taşımaz, SHA-256'dır). Sınır `AUTH_LOGIN_RATE_MAX` ile
ayarlanabilir (1–1000; **varsayılan 8**; üretimde varsayılan kalmalıdır).
CI'daki `api-e2e` işi seri api-dev senaryoları aynı tohum kullanıcılarla sık
giriş yaptığı için değişkeni `200` verir; `e2e` işi her koşuda **taze bir API
süreci** başlattığı için bu sınır sorun değildir: hız sınırı penceresi her
koşuda boş başlar. Yerelde ise `pnpm e2e:api`'yi tekrar koşmadan önce API'yi
**yeniden başlatın** (`pnpm --filter @egemed/api dev` sürecini durdurup yeniden
açın) veya sınırı geçici olarak yükseltin: bellek içi sayaç süreci yaşamaya
devam ettiği sürece silinmez ve bir önceki koşumun denemeleri 15 dakikalık
pencerede birikmiş olabilir; aksi hâlde giriş uçları `429` döndürür.

## 9. KVKK notu

Veri sorumluluğu ve hukuki dayanak insan/hukuk kararıdır (ADR-007); bu
kılavuz hukuki tavsiye değildir. Uygulama notları:

- Kayıtlar kurum altyapısındaki EGEMED Postgres'inde kalır; kurumlar arası
  birleştirme ve dışa aktarım yoktur. Ham xAPI ifadesi hiçbir tabloda
  tutulmaz (ADR-004).
- Yedekler kişisel veri içerir: erişimi sınırlı, şifreli ve süreli tutulur;
  imha kaydı tutulur.
- Liderlik tablosu görünürlüğü kullanıcı tercihidir (`users.leaderboard_visible`,
  migration 006): çıkan kullanıcı başkalarının listelerinde görünmez, kendi
  satırını görür; tercih üç simde ortaktır ve yedeklerde de bulunur.
- Silme/anonimleştirme akışı (yumuşak silme → erişim kesme → saklama
  penceresi → anonimleştirme) `docs/specs/E3-kullanici-yonetimi.md`
  ve ADR-007'de tanımlıdır; süreler insan kararıdır.
- Aydınlatma metninin sahibi ve hukuki dayanak insan kararıdır; admin
  kayıt ekranındaki KVKK bağlantısı bu metne gider.

## Üretim imajı doğrulaması (API-02)

`bash scripts/ops/verify-prod-image.sh` (depo kökü, docker gerekir): temiz checkout'tan
(`git archive`, host `node_modules` kullanılmaz) `infra/prod/Dockerfile` ile imajı derler; imajın
root olmayan kullanıcıyla çalıştığını, geçici PostgreSQL 18'de migration'ların uygulandığını,
`/health` ve `/health/db` uçlarının 200 döndüğünü ve `NODE_ENV=production` ile
`AUTH_DEV_ENABLED=true` birleşiminin reddedildiğini doğrular; geçici ağ/konteyner/imajı siler.
CI'da `prod-image` işi aynı betiği koşar. 25 Eylül 2026 yerel doğrulama: imaj 262 MB, uid 1000.
