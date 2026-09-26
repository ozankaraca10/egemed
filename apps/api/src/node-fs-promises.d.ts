/**
 * `@types/node` repoda kurulu değil (yeni bağımlılık yasak); e-posta
 * önizleme betiğinin (T170) ihtiyaç duyduğu dar `node:fs/promises` yüzeyi
 * burada bildirilir (`node-crypto.d.ts` ile aynı yaklaşım).
 */
declare module "node:fs/promises" {
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>;
  export function writeFile(path: string, data: string, encoding: "utf8"): Promise<void>;
}
