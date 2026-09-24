/**
 * `@types/node` repoda kurulu değil (yeni bağımlılık yasak). Kök tsconfig
 * programı (testler) `apps/api/src` altındaki `.d.ts` dosyalarını kapsamadığı
 * için SSO state çerezini base64url taşıyan `node:buffer` yüzeyi test programı
 * adına burada bildirilir; uygulama kopyası `apps/api/src/node-buffer.d.ts`
 * içindedir.
 */
declare module "node:buffer" {
  export class Buffer extends Uint8Array {
    static from(data: string, encoding?: "utf8" | "base64url"): Buffer;
    toString(encoding: "base64url" | "utf8"): string;
  }
}
