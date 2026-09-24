# EGEMED API üretim imajı (T32; çalışma zamanı tamamlama T86) — çok aşamalı;
# yalnız prod bağımlılıkları. Taban imaj etiket+digest ile sabitlenir; her iki
# aşama aynı imajı kullanır (bkz. infra/docker-compose.dev.yml'deki pinleme
# sözleşmesi). Derleme bağlamı depo köküdür (docker-compose.prod.yml `context`
# alanı); bağlam budaması Dockerfile'a özel `infra/prod/Dockerfile.dockerignore`
# ile yapılır. İmaja apps/api ile workspace bağımlılıklarının (contracts,
# gamification-core) manifest ve kaynakları girer.
# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:22.23.2-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85

# --- 1. aşama: prod bağımlılık kurulumu (pnpm; sürüm packageManager'dan) ---
FROM ${NODE_IMAGE} AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
# "@egemed/api..." filtresi workspace bağlarını da kurar; manifestleri
# bağlamda bulunmalıdır (deponun tamamı bağlamda yoktur, bkz. dockerignore).
COPY packages/contracts/package.json packages/contracts/
COPY packages/gamification-core/package.json packages/gamification-core/
COPY packages/gami-catalogs/package.json packages/gami-catalogs/
# Yalnız @egemed/api ve çalışma zamanı bağımlılıkları (contracts ve
# gamification-core dâhil) kurulur; devDependencies imaja girmez.
RUN corepack pnpm --filter "@egemed/api..." install --prod --frozen-lockfile

# --- 2. aşama: çalışma zamanı ---
FROM ${NODE_IMAGE} AS runtime

# Ürün Node 22'nin yerleşik TypeScript desteğiyle çalışır; ts-register.mjs
# uzantısız göreli importları `.ts`e tamamlar (apps/api/ts-resolve.mjs).
# gamification-core TypeScript parametre property'si kullanır
# (src/repository.ts — GamiRepositoryUnsupportedError); Node'un strip-only
# modu bu söz dizimini yürütemez, imajda transform modu açılır.
ENV NODE_ENV=production
WORKDIR /app
# deps aşamasından kök: prod node_modules (.pnpm deposu ve göreli bağları) ve
# workspace manifestleri; çalışma zamanı yalnız bu ağaçtaki bağlara bakar,
# derleme makinesinin node_modules'ına bağımlı değildir.
COPY --from=deps /app ./
# Çalışma zamanı kaynakları: API kodu, migration'lar, TS yükleyici kancası ve
# workspace paketlerinin kaynakları (exports doğrudan .ts'i gösterir).
COPY apps/api/src apps/api/src
COPY apps/api/migrations apps/api/migrations
COPY apps/api/ts-register.mjs apps/api/ts-register.mjs
COPY apps/api/ts-resolve.mjs apps/api/ts-resolve.mjs
COPY packages/contracts/src packages/contracts/src
COPY packages/gamification-core/src packages/gamification-core/src
COPY packages/gami-catalogs/src packages/gami-catalogs/src
WORKDIR /app/apps/api
# node kullanıcısı (uid 1000); imajda root ile süreç çalışmaz.
USER node
EXPOSE 3000
CMD ["node", "--import", "./ts-register.mjs", "src/server.ts"]
