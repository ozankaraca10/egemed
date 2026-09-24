import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

declare const process: {
  readonly execPath: string;
  cwd(): string;
};

// @types/node yok (yeni bağımlılık yasak): kullanılan en dar zamanlayıcı yüzeyi.
declare function setTimeout(handler: () => void, timeout: number): unknown;
declare function clearTimeout(handle: unknown): void;

// T85 — API-01: Node strip-only kipi TypeScript parametre property'sini (ör.
// `constructor(readonly method: string)`) çalıştıramaz; süreç
// ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX ile daha açılışta kapanır. Bu duman testi
// API giriş modülünü `start` ile aynı bayraklarla (strip-only + uzantısız
// göreli importları çözen kanca) alt süreçte çalıştırır: tüm import zinciri
// (@egemed/contracts, @egemed/gamification-core, apps/api) sözdizimi hatası
// olmadan yüklendiği için süreç yalnız ortam doğrulamasında durur.

const CHILD_TIMEOUT_MS = 20_000;

interface ChildOutput {
  readonly code: number | null;
  readonly stderr: string;
}

/** API giriş modülünü strip-only alt süreçte çalıştırır; çıkış kodunu ve stderr'i döndürür. */
function runApiEntry(): Promise<ChildOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--experimental-strip-types",
        "--import",
        "./apps/api/ts-register.mjs",
        "./apps/api/src/server.ts",
      ],
      {
        cwd: process.cwd(),
        // Kasıtlı geçersiz DSN: ortam doğrulaması ağa çıkmadan durur ve
        // süreç yaşam döngüsü deterministik kalır.
        env: {
          PATH: "/usr/bin:/bin",
          NODE_ENV: "test",
          DATABASE_URL: "mysql://t85-invalid",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("API giriş modülü zaman aşımında kapatıldı."));
    }, CHILD_TIMEOUT_MS);
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

describe("API giriş modülü strip-only uyumluluğu", () => {
  it("import zincirini sözdizimi hatası olmadan yükler", async () => {
    const result = await runApiEntry();
    expect(result.stderr).not.toContain("ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX");
    expect(result.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
    // EnvValidationError yalnızca tüm import zinciri değerlendirildikten sonra
    // server.ts gövdesi çalıştığında oluşur; varlığı zincirin yüklendiğini kanıtlar.
    expect(result.stderr).toContain("EnvValidationError");
    expect(result.code).toBe(1);
  }, CHILD_TIMEOUT_MS + 5_000);
});
