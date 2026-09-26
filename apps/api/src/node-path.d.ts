/**
 * `@types/node` repoda kurulu değil (yeni bağımlılık yasak); e-posta
 * önizleme betiğinin (T170) ihtiyaç duyduğu dar `node:path` yüzeyi burada
 * bildirilir (`node-crypto.d.ts` ile aynı yaklaşım).
 */
declare module "node:path" {
  const path: { resolve(...segments: string[]): string; join(...segments: string[]): string };
  export default path;
}
