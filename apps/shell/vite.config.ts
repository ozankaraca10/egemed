/**
 * `node:fs`/`node:path`/`node:url` dar tip yüzeyi `src/node-fs-shims.d.ts`
 * içinde bildirilir (`@types/node` yok; yeni bağımlılık yasak).
 */
import { cpSync, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

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

/**
 * `@egemed/sim-pulse` paketinin genel klasörü (T14d). Pulse `ui/about.ts`
 * `withAssetBase` ile `/sims/pulse/` taban yolunu bekler (ör. kaynak logosu);
 * Opaca ile aynı eklenti deseni bu yolu da dev sunucusunda okur, build
 * çıktısında `dist/sims/pulse/`ya kopyalar. Klasör henüz git-dışıdır/boştur;
 * yoksa `closeBundle` uyarır, derlemeyi kırmaz (Opaca xray deseniyle aynı).
 */
const PULSE_PUBLIC_DIR = resolve(SHELL_ROOT, "../../packages/sim-pulse/public");
const PULSE_ROUTE_PREFIX = "/sims/pulse/";

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
 * `<routePrefix><alt yol>` isteğini paket genel klasöründeki dosyaya çözer.
 * Saf fonksiyon (fs'e dokunmaz): `..`/kaçış girişimleri veya kök dışına
 * çözülen mutlak yollar `null` döner (yol geçişi koruması). Opaca ve Pulse
 * eklentileri aynı çözümleyiciyi paylaşır (T14d); dışa aktarılan sarmalayıcılar
 * testlerin doğrudan çağırdığı sözleşmedir.
 */
function resolveScopedAssetPath(
  routePrefix: string,
  publicDir: string,
  requestUrl: string,
): string | null {
  if (!requestUrl.startsWith(routePrefix)) return null;
  const rawPath = requestUrl.slice(routePrefix.length).split(/[?#]/)[0] ?? "";
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

/** Testler bu sarmalayıcıyı doğrudan çağırır (bkz. tests/shell/opaca-assets-plugin.test.ts). */
export function resolveOpacaAssetPath(
  requestUrl: string,
  publicDir: string = OPACA_PUBLIC_DIR,
): string | null {
  return resolveScopedAssetPath(OPACA_ROUTE_PREFIX, publicDir, requestUrl);
}

/** Pulse eşdeğeri (T14d); aynı yol geçişi koruması, ayrı taban dizin/önek. */
export function resolvePulseAssetPath(
  requestUrl: string,
  publicDir: string = PULSE_PUBLIC_DIR,
): string | null {
  return resolveScopedAssetPath(PULSE_ROUTE_PREFIX, publicDir, requestUrl);
}

/** Dev sunucusu orta katmanının en dar istek/yanıt yüzeyi (node:http'e bağımlı değil). */
interface SimAssetRequestLike {
  readonly url?: string;
}
interface SimAssetResponseLike {
  setHeader(name: string, value: string): void;
  end(chunk: Uint8Array): void;
}

interface ScopedAssetsPluginOptions {
  readonly name: string;
  readonly routePrefix: string;
  readonly publicDir: string;
  readonly outSubdir: string;
  readonly missingDirWarning: string;
  /** Opaca'nın git-dışı xray çalışma zamanı klasörü gibi ikincil bir uyarı. */
  readonly missingSubDir?: { readonly path: string; readonly warning: string };
}

/**
 * Bağımlılıksız sim varlık eklentisi (Opaca T14c, Pulse T14d): dev
 * sunucusunda `<routePrefix>**`'ı paket genel klasöründen okur; build
 * sonrası `closeBundle`de aynı klasörü `dist/<outSubdir>`a kopyalar. Genel
 * klasör (veya alt klasörü) git-dışı/yerelde yoksa uyarır, derlemeyi kırmaz.
 */
function scopedAssetsPlugin(options: ScopedAssetsPluginOptions): Plugin {
  let outDir = resolve(SHELL_ROOT, "dist");
  return {
    name: options.name,
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const request = req as unknown as SimAssetRequestLike;
        const response = res as unknown as SimAssetResponseLike;
        const filePath = resolveScopedAssetPath(options.routePrefix, options.publicDir, request.url ?? "");
        if (filePath === null || !existsSync(filePath) || !statSync(filePath).isFile()) {
          next();
          return;
        }
        response.setHeader("Content-Type", mimeTypeFor(filePath));
        response.end(readFileSync(filePath));
      });
    },
    closeBundle() {
      if (!existsSync(options.publicDir)) {
        this.warn(options.missingDirWarning);
        return;
      }
      if (options.missingSubDir && !existsSync(options.missingSubDir.path)) {
        this.warn(options.missingSubDir.warning);
      }
      cpSync(options.publicDir, resolve(outDir, options.outSubdir), { recursive: true });
    },
  };
}

function opacaAssetsPlugin(): Plugin {
  return scopedAssetsPlugin({
    missingDirWarning:
      "Opaca genel klasörü bulunamadı (packages/sim-opaca/public); /sims/opaca/ varlıkları kopyalanmadı.",
    missingSubDir: {
      path: OPACA_XRAY_RUNTIME_DIR,
      warning:
        "Opaca xray çalışma zamanı klasörü git-dışıdır ve yerelde yok; derleme bu görüntüler olmadan sürer (bkz. `pnpm --filter @egemed/sim-opaca sync:xray`).",
    },
    name: "egemed-opaca-assets",
    outSubdir: "sims/opaca",
    publicDir: OPACA_PUBLIC_DIR,
    routePrefix: OPACA_ROUTE_PREFIX,
  });
}

/** Pulse varlık eklentisi (T14d); genel klasör henüz git-dışı/boş olsa da dev/build kırılmaz. */
function pulseAssetsPlugin(): Plugin {
  return scopedAssetsPlugin({
    missingDirWarning:
      "Pulse genel klasörü bulunamadı (packages/sim-pulse/public); /sims/pulse/ varlıkları kopyalanmadı.",
    name: "egemed-pulse-assets",
    outSubdir: "sims/pulse",
    publicDir: PULSE_PUBLIC_DIR,
    routePrefix: PULSE_ROUTE_PREFIX,
  });
}

export default defineConfig({
  base: "./",
  plugins: [react(), opacaAssetsPlugin(), pulseAssetsPlugin()],
});
