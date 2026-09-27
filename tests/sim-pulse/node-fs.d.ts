// @types/node repoda kurulu değil (kök tsconfig "types": [] ve yeni bağımlılık
// yasak). ADR-011 vendor testi dizindeki dosyaları listeler; yüzey dar tutulur
// (bkz. `tests/sim-opaca/node-fs.d.ts` ile aynı yaklaşım).
declare module "node:fs" {
  export function readdirSync(path: string): string[];
}
