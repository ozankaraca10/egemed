import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveOpacaAssetPath } from "../../apps/shell/vite.config";

/**
 * `resolveOpacaAssetPath` saf fonksiyondur (fs'e dokunmaz); testler sahte bir
 * genel klasör yoluyla çağırır. T14c: `apps/shell/vite.config.ts` içindeki
 * Opaca varlık eklentisinin dev sunucusu ve build kopyası bu fonksiyonu
 * paylaşır (bkz. plan.md madde 2, "yol geçişi koruması").
 */
const PUBLIC_DIR = resolve("/tmp/egemed-opaca-public");

describe("resolveOpacaAssetPath (yol geçişi koruması)", () => {
  it("/sims/opaca/ altındaki göreli yolu genel klasöre çözer", () => {
    expect(resolveOpacaAssetPath("/sims/opaca/brand/logo.png", PUBLIC_DIR)).toBe(
      resolve(PUBLIC_DIR, "brand/logo.png"),
    );
    expect(resolveOpacaAssetPath("/sims/opaca/assets/xray/runtime/a.webp", PUBLIC_DIR)).toBe(
      resolve(PUBLIC_DIR, "assets/xray/runtime/a.webp"),
    );
  });

  it("sorgu ve çapayı yok sayar", () => {
    expect(resolveOpacaAssetPath("/sims/opaca/brand/logo.png?x=1", PUBLIC_DIR)).toBe(
      resolve(PUBLIC_DIR, "brand/logo.png"),
    );
    expect(resolveOpacaAssetPath("/sims/opaca/brand/logo.png#frag", PUBLIC_DIR)).toBe(
      resolve(PUBLIC_DIR, "brand/logo.png"),
    );
  });

  it("önek eşleşmeyen veya boş alt yollu isteklerde null döner", () => {
    expect(resolveOpacaAssetPath("/sims/pulse/brand/logo.png", PUBLIC_DIR)).toBeNull();
    expect(resolveOpacaAssetPath("/sims/opaca/", PUBLIC_DIR)).toBeNull();
    expect(resolveOpacaAssetPath("/sims/opaca", PUBLIC_DIR)).toBeNull();
    expect(resolveOpacaAssetPath("/", PUBLIC_DIR)).toBeNull();
  });

  it("düz '..' yol geçişini kök dışına çıkarsa reddeder", () => {
    expect(resolveOpacaAssetPath("/sims/opaca/../../../etc/passwd", PUBLIC_DIR)).toBeNull();
    expect(resolveOpacaAssetPath("/sims/opaca/../opaca-secrets.env", PUBLIC_DIR)).toBeNull();
  });

  it("yüzde kodlu (%2e%2e, %2f) yol geçişini de reddeder", () => {
    expect(resolveOpacaAssetPath("/sims/opaca/..%2f..%2f..%2fetc%2fpasswd", PUBLIC_DIR)).toBeNull();
    expect(resolveOpacaAssetPath("/sims/opaca/%2e%2e/%2e%2e/etc/passwd", PUBLIC_DIR)).toBeNull();
  });

  it("bozuk yüzde kodlamasında güvenli biçimde null döner (fırlatmaz)", () => {
    expect(resolveOpacaAssetPath("/sims/opaca/%", PUBLIC_DIR)).toBeNull();
  });

  it("geçişsiz iç içe yolları kabul eder (ör. çok segmentli xray runtime yolu)", () => {
    const path = "/sims/opaca/assets/xray/runtime/klasor/dosya.webp";
    expect(resolveOpacaAssetPath(path, PUBLIC_DIR)).toBe(
      resolve(PUBLIC_DIR, "assets/xray/runtime/klasor/dosya.webp"),
    );
  });
});
