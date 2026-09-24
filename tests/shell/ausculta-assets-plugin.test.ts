import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveAuscultaAssetPath,
  resolveAuscultaRootAssetPath,
} from "../../apps/shell/vite.config";

/**
 * T14e: `apps/shell/vite.config.ts` içindeki Ausculta varlık eklentileri iki
 * çözümleyici paylaşır — ses kayıtları `/sims/ausculta/` önekinde, gövde ve
 * marka görselleri ise modülün beklediği kök-göreli yollarda (`/assets/body/**`,
 * `/brand/**`). İkisi de saf fonksiyondur (fs'e dokunmaz) ve aynı yol geçişi
 * korumasını (`resolveScopedAssetPath`) kullanır; kabuk/köprü önceliği
 * (kabuk kendi genel klasöründe varsa kazanır) çağıran orta katmandadır.
 */
const PUBLIC_DIR = resolve("/tmp/egemed-ausculta-public");

describe("resolveAuscultaAssetPath (/sims/ausculta/ öneki)", () => {
  it("ses runtime yolunu paket genel klasörüne çözer (alt klasörler dâhil)", () => {
    expect(
      resolveAuscultaAssetPath("/sims/ausculta/assets/audio/runtime/heart/f_n_rc.wav", PUBLIC_DIR),
    ).toBe(resolve(PUBLIC_DIR, "assets/audio/runtime/heart/f_n_rc.wav"));
  });

  it("sorgu ve çapayı yok sayar; önek eşleşmeyen veya boş alt yollu isteklerde null döner", () => {
    expect(resolveAuscultaAssetPath("/sims/ausculta/brand/logo.png?x=1", PUBLIC_DIR)).toBe(
      resolve(PUBLIC_DIR, "brand/logo.png"),
    );
    expect(resolveAuscultaAssetPath("/sims/opaca/brand/logo.png", PUBLIC_DIR)).toBeNull();
    expect(resolveAuscultaAssetPath("/sims/ausculta/", PUBLIC_DIR)).toBeNull();
    expect(resolveAuscultaAssetPath("/sims/ausculta", PUBLIC_DIR)).toBeNull();
  });

  it("düz ve yüzde kodlu yol geçişini reddeder", () => {
    expect(resolveAuscultaAssetPath("/sims/ausculta/../../etc/passwd", PUBLIC_DIR)).toBeNull();
    expect(resolveAuscultaAssetPath("/sims/ausculta/..%2f..%2fsecrets.env", PUBLIC_DIR)).toBeNull();
  });
});

describe("resolveAuscultaRootAssetPath (kök-göreli köprü)", () => {
  it("gövde ve marka yollarını paket genel klasörüne çözer", () => {
    expect(resolveAuscultaRootAssetPath("/assets/body/front.jpg", PUBLIC_DIR)).toBe(
      resolve(PUBLIC_DIR, "assets/body/front.jpg"),
    );
    expect(resolveAuscultaRootAssetPath("/assets/body/back-female.jpg", PUBLIC_DIR)).toBe(
      resolve(PUBLIC_DIR, "assets/body/back-female.jpg"),
    );
    expect(resolveAuscultaRootAssetPath("/brand/logo-icon-web.png", PUBLIC_DIR)).toBe(
      resolve(PUBLIC_DIR, "brand/logo-icon-web.png"),
    );
  });

  it("sorgu ve çapayı yok sayar", () => {
    expect(resolveAuscultaRootAssetPath("/assets/body/front.jpg?v=2", PUBLIC_DIR)).toBe(
      resolve(PUBLIC_DIR, "assets/body/front.jpg"),
    );
    expect(resolveAuscultaRootAssetPath("/brand/ege-tip-logo.png#frag", PUBLIC_DIR)).toBe(
      resolve(PUBLIC_DIR, "brand/ege-tip-logo.png"),
    );
  });

  it("yalnız köprü öneklerini karşılar; başka kök yolları ve önek sınırı null döner", () => {
    expect(resolveAuscultaRootAssetPath("/assets/index-abc123.js", PUBLIC_DIR)).toBeNull();
    expect(resolveAuscultaRootAssetPath("/favicon.svg", PUBLIC_DIR)).toBeNull();
    expect(resolveAuscultaRootAssetPath("/brand", PUBLIC_DIR)).toBeNull();
    expect(resolveAuscultaRootAssetPath("/brandx/logo.png", PUBLIC_DIR)).toBeNull();
    expect(resolveAuscultaRootAssetPath("/assets/body", PUBLIC_DIR)).toBeNull();
  });

  it("düz ve yüzde kodlu yol geçişini reddeder", () => {
    expect(resolveAuscultaRootAssetPath("/assets/body/../../secrets.env", PUBLIC_DIR)).toBeNull();
    expect(
      resolveAuscultaRootAssetPath("/assets/body/%2e%2e/%2e%2e/secrets.env", PUBLIC_DIR),
    ).toBeNull();
    expect(resolveAuscultaRootAssetPath("/brand/%2e%2e/.env", PUBLIC_DIR)).toBeNull();
  });
});
