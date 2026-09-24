// @types/node repoda kurulu değil (tsconfig "types": [] ve yeni bağımlılık
// yasak). Varlık testi yalnız bu dar yüzeyi kullanır; JSON içeriği bağlama
// alınmaz, dosya yolları diskte aranır ve testler Node ortamında koşar.
declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: "utf8"): string;
}
