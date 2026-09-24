/**
 * `@types/node` repoda kurulu değil (yeni bağımlılık yasak); sunucunun ihtiyaç
 * duyduğu `process` yüzeyi burada dar biçimde bildirilir.
 */
declare module "node:process" {
  const process: {
    readonly env: Record<string, string | undefined>;
    readonly stdout: { write(text: string): void };
  };
  export default process;
}
