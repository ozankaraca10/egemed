/**
 * `@types/node` repoda kurulu değil (yeni bağımlılık yasak). Kök tsconfig
 * programı `apps/api/src` altındaki `.d.ts` dosyalarını kapsamadığı için T85
 * strip-only duman testinin ihtiyaç duyduğu dar `node:child_process` yüzeyi
 * test programı adına burada bildirilir; `tests/config/node-child-process.d.ts`
 * ve `tests/shell/node-fs-shims.d.ts` bildirimleriyle birleşir.
 */
declare module "node:child_process" {
  export interface ChildProcess {
    readonly stderr: { on(event: "data", listener: (chunk: { toString(): string }) => void): void };
    on(event: "error", listener: (error: Error) => void): void;
    on(event: "close", listener: (code: number | null) => void): void;
    kill(): boolean;
  }

  export function spawn(
    command: string,
    args: readonly string[],
    options: {
      readonly cwd: string;
      readonly env: Readonly<Record<string, string>>;
      readonly stdio: readonly ["ignore", "pipe", "pipe"];
    },
  ): ChildProcess;
}
