# EGEMED API üretim imajı (T32) — çok aşamalı; yalnız prod bağımlılıkları.
# Taban imaj etiket+digest ile sabitlenir; her iki aşama aynı imajı kullanır
# (bkz. infra/docker-compose.dev.yml'deki pinleme sözleşmesi). Derleme bağlamı
# depo köküdür (docker-compose.prod.yml `context` alanı); imaja yalnız
# apps/api ve packages/contracts kaynakları girer.
# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:22.23.2-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85

# --- 1. aşama: prod bağımlılık kurulumu (pnpm; sürüm packageManager'dan) ---
FROM ${NODE_IMAGE} AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
# Yalnız @egemed/api ve çalışma zamanı bağımlılıkları (contracts dâhil) kurulur;
# devDependencies imaja girmez.
RUN corepack pnpm --filter "@egemed/api..." install --prod --frozen-lockfile

# --- 2. aşama: çalışma zamanı ---
FROM ${NODE_IMAGE} AS runtime

# Ürün Node 22'nin yerleşik TypeScript desteğiyle çalışır; ts-register.mjs
# uzantısız göreli importları `.ts`e tamamlar (apps/api/ts-resolve.mjs).
ENV NODE_ENV=production
WORKDIR /app
COPY apps/api/src apps/api/src
COPY apps/api/migrations apps/api/migrations
COPY packages/contracts packages/contracts
WORKDIR /app/apps/api
# node kullanıcısı (uid 1000); imajda root ile süreç çalışmaz.
USER node
EXPOSE 3000
CMD ["node", "--import", "./ts-register.mjs", "src/server.ts"]
