# EGEMED CLIX

AGTX tabanlı geliştirme iskeleti. Ürün kodu ilk backlog görevleriyle oluşturulacaktır.

Kurulum: `scripts/agtx/link.sh` ardından `scripts/agtx/board.sh`.

## CI

`dev` dalına push ve `dev`'i hedefleyen PR'larda GitHub Actions `gates` işi
`pnpm turbo run lint typecheck test` kapısını çalıştırır (`.github/workflows/ci.yml`).
Node sürümü `.nvmrc` dosyasından, pnpm sürümü `packageManager` alanından okunur;
bağımlılıklar `--frozen-lockfile` ile kurulur, eylemler commit SHA'sına sabitlidir.

Branch protection depo sahibinin adımıdır: `dev` dalında `CI / gates` kontrolü
zorunlu kılınmalıdır.
