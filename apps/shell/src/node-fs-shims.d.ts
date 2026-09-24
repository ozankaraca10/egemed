/**
 * `@types/node` repoda kurulu değil (yeni bağımlılık yasak). `vite.config.ts`
 * içindeki sim varlık eklentilerinin (Opaca T14c, Pulse T14d, Ausculta T14e)
 * ihtiyaç duyduğu dar `node:fs`/`node:path`/`node:url` yüzeyi burada
 * bildirilir (bkz. `apps/api/src/node-crypto.d.ts` ile aynı yaklaşım).
 * Ambient modül bildirimi yalnız içe/dışa aktarımı olmayan `.d.ts`
 * dosyalarında yeni modül sayılır; bu yüzden `vite.config.ts`'in kendisine
 * taşınamaz. `force: false` Ausculta kök varlıklarında var olan dosyayı
 * atlar (kabuk genel klasörü kazanır).
 */
declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function statSync(path: string): { isFile(): boolean };
  export function readFileSync(path: string): Uint8Array;
  export function cpSync(
    source: string,
    destination: string,
    options: { recursive: boolean; force?: boolean },
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
