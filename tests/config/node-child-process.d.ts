// @types/node repoda kurulu değil (tsconfig "types": [] ve yeni bağımlılık
// yasak). Sır taraması yalnız `git ls-files` çalıştırdığı için gereken dar
// yüzeyi burada bildiririz; testler Node ortamında koşar.
declare module "node:child_process" {
  export function execFileSync(
    file: string,
    args: readonly string[],
    options: { encoding: "utf8"; maxBuffer: number },
  ): string;
}
