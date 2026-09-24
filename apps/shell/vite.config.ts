/**
 * `node:fs`/`node:path`/`node:url` dar tip yüzeyi `src/node-fs-shims.d.ts`
 * içinde bildirilir (`@types/node` yok; yeni bağımlılık yasak).
 */
import { cpSync, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

const SHELL_ROOT = dirname(fileURLToPath(import.meta.url));

/**
 * `@egemed/sim-opaca` paketinin genel klasörü. Opaca `core/images.ts`
 * varsayılan olarak `/sims/opaca/` taban yolunu bekler (T14a); bu eklenti o
 * yolu dev sunucusunda okur, build çıktısında `dist/sims/opaca/`ya kopyalar.
 */
const OPACA_PUBLIC_DIR = resolve(SHELL_ROOT, "../../packages/sim-opaca/public");
const OPACA_ROUTE_PREFIX = "/sims/opaca/";
/** Git-dışı, `sync:xray` ile doldurulan büyük varlık klasörü (AGENTS.md okuma sınırı). */
const OPACA_XRAY_RUNTIME_DIR = resolve(OPACA_PUBLIC_DIR, "assets/xray/runtime");

const MIME_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function mimeTypeFor(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/**
 * `/sims/opaca/<alt yol>` isteğini paket genel klasöründeki dosyaya çözer.
 * Saf fonksiyon (fs'e dokunmaz): `..`/kaçış girişimleri veya kök dışına
 * çözülen mutlak yollar `null` döner (yol geçişi koruması). Testler bu
 * fonksiyonu doğrudan çağırır.
 */
export function resolveOpacaAssetPath(
  requestUrl: string,
  publicDir: string = OPACA_PUBLIC_DIR,
): string | null {
  if (!requestUrl.startsWith(OPACA_ROUTE_PREFIX)) return null;
  const rawPath = requestUrl.slice(OPACA_ROUTE_PREFIX.length).split(/[?#]/)[0] ?? "";
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (decodedPath.length === 0) return null;
  const resolvedPath = resolve(publicDir, decodedPath);
  if (resolvedPath === publicDir) return null;
  const relativePath = relative(publicDir, resolvedPath);
  const escapesRoot = relativePath === ".." || relativePath.startsWith(`..${sep}`);
  return escapesRoot ? null : resolvedPath;
}

/** Dev sunucusu orta katmanının en dar istek/yanıt yüzeyi (node:http'e bağımlı değil). */
interface OpacaRequestLike {
  readonly url?: string;
}
interface OpacaResponseLike {
  setHeader(name: string, value: string): void;
  end(chunk: Uint8Array): void;
}

/**
 * Bağımlılıksız Opaca varlık eklentisi (T14c): dev sunucusunda
 * `/sims/opaca/**`'yı paket genel klasöründen okur; build sonrası
 * `closeBundle`de aynı klasörü `dist/sims/opaca/`ya kopyalar. Git-dışı xray
 * klasörü yoksa uyarır, derlemeyi kırmaz.
 */
function opacaAssetsPlugin(): Plugin {
  let outDir = resolve(SHELL_ROOT, "dist");
  return {
    name: "egemed-opaca-assets",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const request = req as unknown as OpacaRequestLike;
        const response = res as unknown as OpacaResponseLike;
        const filePath = resolveOpacaAssetPath(request.url ?? "");
        if (filePath === null || !existsSync(filePath) || !statSync(filePath).isFile()) {
          next();
          return;
        }
        response.setHeader("Content-Type", mimeTypeFor(filePath));
        response.end(readFileSync(filePath));
      });
    },
    closeBundle() {
      if (!existsSync(OPACA_PUBLIC_DIR)) {
        this.warn(
          "Opaca genel klasörü bulunamadı (packages/sim-opaca/public); /sims/opaca/ varlıkları kopyalanmadı.",
        );
        return;
      }
      if (!existsSync(OPACA_XRAY_RUNTIME_DIR)) {
        this.warn(
          "Opaca xray çalışma zamanı klasörü git-dışıdır ve yerelde yok; derleme bu görüntüler olmadan sürer (bkz. `pnpm --filter @egemed/sim-opaca sync:xray`).",
        );
      }
      cpSync(OPACA_PUBLIC_DIR, resolve(outDir, "sims/opaca"), { recursive: true });
    },
  };
}

/**
 * T57 — API'li geliştirme sunucusu: `VITE_API_PROXY_TARGET` doluysa `/api/**`
 * istekleri hedefe aktarılır ve ön ek (`/api`) atılır. Kabuk API ile aynı
 * kökenden konuşur; böylece çerez oturumu ve `Origin` kontrolü bozulmaz.
 * Yalnız geliştirme sunucusunu etkiler; üretim derlemesine girmez.
 */
function apiProxyConfig(env: Record<string, string>): Record<string, unknown> {
  const target = env.VITE_API_PROXY_TARGET?.trim();
  if (target === undefined || target.length === 0) return {};
  return {
    server: {
      proxy: {
        "/api": {
          target,
          changeOrigin: false,
          rewrite: (path: string) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react(), opacaAssetsPlugin()],
  ...apiProxyConfig(loadEnv(mode, SHELL_ROOT, "VITE_")),
}));
