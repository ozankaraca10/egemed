/**
 * `@types/node` repoda kurulu değil (yeni bağımlılık yasak); oturum
 * çekirdeğinin ihtiyaç duyduğu dar `node:crypto` yüzeyi burada bildirilir
 * (`pg.d.ts`, `node-process.d.ts` ile aynı yaklaşım).
 */
declare module "node:crypto" {
  export interface Hasher {
    update(data: string, inputEncoding?: "utf8"): Hasher;
    digest(encoding: "hex" | "base64url"): string;
  }

  export function createHash(algorithm: "sha256"): Hasher;
  export function randomBytes(size: number): { toString(encoding: "base64url"): string };
}
