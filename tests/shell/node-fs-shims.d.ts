/**
 * `@types/node` repoda kurulu değil (yeni bağımlılık yasak). Kök tsconfig
 * programı (testler) `apps/shell/src` altındaki `.d.ts` dosyalarını kapsamadığı
 * için Opaca varlık eklentisinin ihtiyaç duyduğu `node:fs`/`node:path`/
 * `node:url` yüzeyi test programı adına burada bildirilir; uygulama kopyası
 * `apps/shell/src/node-fs-shims.d.ts` içindedir (bkz. `tests/api/node-crypto.d.ts`
 * ile aynı yaklaşım).
 */
declare module "node:fs" {
  export function statSync(path: string): { isFile(): boolean };
  export function readFileSync(path: string): Uint8Array;
  export function cpSync(
    source: string,
    destination: string,
    options: { recursive: boolean },
  ): void;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function extname(path: string): string;
  export function relative(from: string, to: string): string;
  export function resolve(...segments: readonly string[]): string;
  export const sep: string;
}

declare module "node:url" {
  export function fileURLToPath(url: string): string;
}

/**
 * `vite/client` tipleri kök test programına yalnızca
 * `apps/shell/src/EntryPage.tsx` içindeki
 * `/// <reference types="vite/client" />` yönergesi üzerinden (o dosyayı içe
 * aktaran testler aracılığıyla) giriyordu; T53a temizliğinde o testler
 * kaldırılınca
 * `apps/shell/vite.config.ts` (`import.meta.url`) ve
 * `packages/sim-opaca/src/SimModule.tsx` (`import.meta.env.DEV`) bildirimsiz
 * kaldı. Kök program bu paketlerin `.d.ts` dosyalarını kapsamadığı için
 * gereken en dar `ImportMeta` yüzeyi burada bildirilir; adlar
 * `packages/sim-opaca/src/vite-env.d.ts` ile aynıdır (vite/client ile
 * birleşebilir).
 */
interface ImportMetaEnv {
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
  readonly url: string;
}
