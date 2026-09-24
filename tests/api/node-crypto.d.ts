/**
 * `@types/node` repoda kurulu değil (yeni bağımlılık yasak). Kök tsconfig
 * programı (testler) `apps/api/src` altındaki `.d.ts` dosyalarını kapsamadığı
 * için oturum çekirdeğinin ihtiyaç duyduğu `node:crypto` yüzeyi test programı
 * adına burada bildirilir; uygulama kopyası `apps/api/src/node-crypto.d.ts`
 * içindedir.
 */
declare module "node:crypto" {
  export interface Hasher {
    update(data: string, inputEncoding?: "utf8"): Hasher;
    digest(encoding: "hex" | "base64url"): string;
  }

  export function createHash(algorithm: "sha256"): Hasher;
  export function randomBytes(size: number): { toString(encoding: "base64url"): string };
}
