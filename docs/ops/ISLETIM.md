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
  (`@egemed/contracts`, `@egemed/gamification-core`) imajdadır; derleme
  makinesinin node_modules'ına bağımlı değildir. Sunucu Node 22'nin yerleşik
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

## 8. KVKK notu

Veri sorumluluğu ve hukuki dayanak insan/hukuk kararıdır (ADR-007); bu
kılavuz hukuki tavsiye değildir. Uygulama notları:

- Kayıtlar kurum altyapısındaki EGEMED Postgres'inde kalır; kurumlar arası
  birleştirme ve dışa aktarım yoktur. Ham xAPI ifadesi hiçbir tabloda
  tutulmaz (ADR-004).
- Yedekler kişisel veri içerir: erişimi sınırlı, şifreli ve süreli tutulur;
  imha kaydı tutulur.
- Silme/anonimleştirme akışı (yumuşak silme → erişim kesme → saklama
  penceresi → anonimleştirme) `docs/specs/E3-kullanici-yonetimi.md`
  ve ADR-007'de tanımlıdır; süreler insan kararıdır.
- Aydınlatma metninin sahibi ve hukuki dayanak insan kararıdır; admin
  kayıt ekranındaki KVKK bağlantısı bu metne gider.
