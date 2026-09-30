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

/**
 * `@egemed/sim-pulse` paketinin genel klasörü (T14d). Pulse `ui/about.ts`
 * `withAssetBase` ile `/sims/pulse/` taban yolunu bekler (ör. kaynak logosu);
 * Opaca ile aynı eklenti deseni bu yolu da dev sunucusunda okur, build
 * çıktısında `dist/sims/pulse/`ya kopyalar. Klasör henüz git-dışıdır/boştur;
 * yoksa `closeBundle` uyarır, derlemeyi kırmaz (Opaca xray deseniyle aynı).
 */
const PULSE_PUBLIC_DIR = resolve(SHELL_ROOT, "../../packages/sim-pulse/public");
const PULSE_ROUTE_PREFIX = "/sims/pulse/";

/**
 * `@egemed/sim-ausculta` paketinin genel klasörü (T14e). Ses kayıtları
 * (git-dışı `assets/audio/runtime/`) ve gövde/marka görselleri buradan gelir;
 * `/sims/ausculta/` öneki dev sunucusunda okunur, build çıktısında
 * `dist/sims/ausculta/`ya kopyalanır.
 */
const AUSCULTA_PUBLIC_DIR = resolve(SHELL_ROOT, "../../packages/sim-ausculta/public");
const AUSCULTA_ROUTE_PREFIX = "/sims/ausculta/";
/** Git-dışı, `sync:audio` ile doldurulan ses klasörü (AGENTS.md okuma sınırı). */
const AUSCULTA_AUDIO_RUNTIME_DIR = resolve(AUSCULTA_PUBLIC_DIR, "assets/audio/runtime");

/**
 * Kabuğun kendi genel klasörü ve Ausculta'nın KÖK-GÖRELİ istediği varlık
 * önekleri (T14e). Gömülü modül gövde görsellerini (`assets/body/*.jpg`) ve
 * marka görsellerini (`brand/*.png`) kaynak uygulamadaki gibi belge köküne
 * göreli ister; kabuk altında bu istekler `/` köküne çözülür. Ses yolları
 * kök-göreli değildir; onları `/sims/ausculta/` önekli eklenti karşılar.
 */
const SHELL_PUBLIC_DIR = resolve(SHELL_ROOT, "public");
const AUSCULTA_ROOT_PREFIXES: readonly string[] = ["assets/body", "brand"];

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

/** Ausculta eşdeğeri (T14e); ses kayıtları bu önekten sunulur/kopyalanır. */
export function resolveAuscultaAssetPath(
  requestUrl: string,
  publicDir: string = AUSCULTA_PUBLIC_DIR,
): string | null {
  return resolveScopedAssetPath(AUSCULTA_ROUTE_PREFIX, publicDir, requestUrl);
}

/**
 * Kök-göreli (`/assets/body/**`, `/brand/**`) Ausculta isteğini paket genel
 * klasörüne çözer. Dosya hem genel klasör içinde hem de eşleşen önekin
 * dizininde kalmalıdır: `/assets/body/../brand/x.png` gibi normalizasyonla
 * önek dışına taşan istekler `null` döner. Önek kümesi dışındaki yollar da
 * `null`dur. Kabuğun kendi genel klasöründe aynı yol varsa kararı çağıran
 * verir (kabuk kazanır).
 */
export function resolveAuscultaRootAssetPath(
  requestUrl: string,
  publicDir: string = AUSCULTA_PUBLIC_DIR,
): string | null {
  const withoutQuery = (requestUrl.split(/[?#]/)[0] ?? "").replace(/^\/+/, "");
  const prefix = AUSCULTA_ROOT_PREFIXES.find((candidate) =>
    withoutQuery.startsWith(`${candidate}/`),
  );
  if (prefix === undefined) return null;
  const resolvedPath = resolveScopedAssetPath("/", publicDir, requestUrl);
  if (resolvedPath === null) return null;
  const relativePath = relative(resolve(publicDir, prefix), resolvedPath);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`)) return null;
  return resolvedPath;
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

/** Ausculta varlık eklentisi (T14e); ses runtime git-dışıysa uyarır, derlemeyi kırmaz. */
function auscultaAssetsPlugin(): Plugin {
  return scopedAssetsPlugin({
    missingDirWarning:
      "Ausculta genel klasörü bulunamadı (packages/sim-ausculta/public); /sims/ausculta/ varlıkları kopyalanmadı.",
    missingSubDir: {
      path: AUSCULTA_AUDIO_RUNTIME_DIR,
      warning:
        "Ausculta ses çalışma zamanı klasörü git-dışıdır ve yerelde yok; derleme ses kayıtları olmadan sürer (bkz. `pnpm --filter @egemed/sim-ausculta sync:audio`).",
    },
    name: "egemed-ausculta-assets",
    outSubdir: "sims/ausculta",
    publicDir: AUSCULTA_PUBLIC_DIR,
    routePrefix: AUSCULTA_ROUTE_PREFIX,
  });
}

/**
 * Ausculta kök-göreli varlık köprüsü (T14e). Dev sunucusunda kabuğun kendi
 * genel klasöründe bulunmayan `/assets/body/**` ve `/brand/**` isteklerini
 * Ausculta genel klasöründen karşılar; çakışmada kabuk kazanır (ör.
 * `/brand/ege-tip-logo.png`). Build'de aynı dosyaları yalnız eksikse kopyalar
 * (`force: false`), böylece kabuğun `public/` dosyaları ezilmez.
 */
function auscultaRootAssetsPlugin(): Plugin {
  let outDir = resolve(SHELL_ROOT, "dist");
  return {
    name: "egemed-ausculta-root-assets",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const request = req as unknown as SimAssetRequestLike;
        const response = res as unknown as SimAssetResponseLike;
        const requestUrl = request.url ?? "";
        const shellPath = resolveScopedAssetPath("/", SHELL_PUBLIC_DIR, requestUrl);
        if (shellPath !== null && existsSync(shellPath)) {
          next();
          return;
        }
        const filePath = resolveAuscultaRootAssetPath(requestUrl);
        if (filePath === null || !existsSync(filePath) || !statSync(filePath).isFile()) {
          next();
          return;
        }
        response.setHeader("Content-Type", mimeTypeFor(filePath));
        response.end(readFileSync(filePath));
      });
    },
    closeBundle() {
      if (!existsSync(AUSCULTA_PUBLIC_DIR)) {
        this.warn(
          "Ausculta genel klasörü bulunamadı (packages/sim-ausculta/public); kök-göreli varlıklar kopyalanmadı.",
        );
        return;
      }
      for (const prefix of AUSCULTA_ROOT_PREFIXES) {
        const source = resolve(AUSCULTA_PUBLIC_DIR, prefix);
        if (!existsSync(source)) continue;
        cpSync(source, resolve(outDir, prefix), { force: false, recursive: true });
      }
    },
  };
}

/**
 * Sim modülleri tembel yüklenir; geliştirme sunucusunda ilk istek büyük sim
 * parçasını (Opaca ≈ 1,25 MB + veri) soğuk derler. Paralel e2e yükünde bu
 * 5 sn bekleme sınırını aşıp sim kökünü "bulunamadı" yapıyordu (audit 30 Eyl).
 * Açılışta önceden dönüştürülür; üretim derlemesini etkilemez.
 */
const SIM_WARMUP_FILES = [
  "./src/sims/loaders.ts",
  "../../packages/sim-opaca/src/index.ts",
  "../../packages/sim-ausculta/src/index.ts",
  "../../packages/sim-pulse/src/index.ts",
];

export default defineConfig(({ mode }) => {
  const proxy = apiProxyConfig(loadEnv(mode, SHELL_ROOT, "VITE_")) as { server?: Record<string, unknown> };
  return {
    base: "./",
    plugins: [
      react(),
      opacaAssetsPlugin(),
      pulseAssetsPlugin(),
      auscultaAssetsPlugin(),
      auscultaRootAssetsPlugin(),
    ],
    server: { ...proxy.server, warmup: { clientFiles: SIM_WARMUP_FILES } },
  };
});
