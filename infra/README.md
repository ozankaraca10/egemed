# Geliştirme altyapısı (infra)

Yerel geliştirme için iki servis çalıştırır: `postgres` (CLIX geliştirme
veritabanı) ve `lrs` (geliştirme LRS'si; kurum LRS'sinin yerini tutar).
API servisi henüz yoktur (T01 iskeleti). Servisler arasında bağımlılık yoktur:
ADR-004 gereği CLIX ifade saklamaz, LRS de CLIX Postgres'ine bağlanmaz.

## Kullanım

Gerçek değerleri `.env.local` içine yazın (`.env.example` boş anahtar listesidir;
`.env.local` ve `.env` repoda izlenmez). Compose `-f infra/...` ile çağrıldığı
için interpolasyon varsayılan olarak `infra/.env` arar; bu yüzden kök betikler
`.env.local` dosyasını açıkça `--env-file` ile geçirir.

```sh
cp .env.example .env.local   # değerleri doldurun
pnpm infra:up                # up -d --wait: iki servis healthy olana dek bekler
pnpm infra:down              # down --remove-orphans
```

Sırlar yalnızca `${VAR:?}` ile interpolasyon yapar; değer yoksa `up`/`down`
net bir hatayla durur (tanımsız sırla sessizce çalışmaz). Volume tanımlanmaz;
geliştirme verisi geçicidir ve `down` sonrası kaybolur.

Bağlantı noktaları: `POSTGRES_PORT` (varsayılan 5432), `LRS_PORT` (varsayılan
8080). LRS uç noktası biçimi `http://localhost:8080/xapi`; sağlık ucu
`http://localhost:8080/health`, yönetim arayüzü `http://localhost:8080/admin`.

```sh
docker compose -f infra/docker-compose.dev.yml --env-file .env.local config
```

## LRS seçimi

Geliştirme LRS'si olarak **SQL LRS** (`yetanalytics/lrsql`, Apache-2.0, tek
konteyner, gömülü SQLite) seçildi. Aday karşılaştırması `.egemed-run/research.md`
içindedir. Seçim **insan onayına sunuluyor**; veto edilirse `lrs` servisi
kaldırılarak yalnız Postgres ile ilerlenir ya da onaylanan aday aynı `LRS_*`
sözleşmesiyle takılır — bu, `infra/docker-compose.dev.yml` içinde tek servis
değişimiyle yapılabilir. ADR-004'ün açık sorusu bu onayla kapanır.

## Doğrulama

`tests/config/infra.test.ts` dosyası servis/healthcheck/volume/imaj-pinleme,
`${VAR:?}` deseni, `.env.example` anahtar kümesi, cleanup betiği ve depo sır
taramasını denetler; Docker gerektirmez. Docker bulunan bir makinede ayrıca
`docker compose config` ve `pnpm infra:up` elle doğrulanabilir.
