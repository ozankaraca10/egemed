/**
 * `@types/node` repoda kurulu değil (yeni bağımlılık yasak); SSO state
 * çerezini base64url taşımak için ihtiyaç duyulan dar `node:buffer` yüzeyi
 * burada bildirilir (`node-crypto.d.ts` ile aynı yaklaşım).
 */
declare module "node:buffer" {
  export class Buffer extends Uint8Array {
    static from(data: string, encoding?: "utf8" | "base64url"): Buffer;
    toString(encoding: "base64url" | "utf8"): string;
  }
}
