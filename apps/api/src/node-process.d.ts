/**
 * `@types/node` repoda kurulu değil (yeni bağımlılık yasak); sunucunun ihtiyaç
 * duyduğu `process` yüzeyi burada dar biçimde bildirilir.
 */
declare module "node:process" {
  const process: {
    /** T68 — tohum CLI'ı argümanları buradan okur. */
    readonly argv: readonly string[];
    readonly env: Record<string, string | undefined>;
    readonly stdout: { write(text: string): void };
    readonly stderr: { write(text: string): void };
    /** Tohum CLI'ı hata durumunda 1 yazar. */
    exitCode: number;
    /** T170 — önizleme betiği çıktı klasörünü çalışma dizinine göre çözer. */
    cwd(): string;
  };
  export default process;
}
