import ts from "typescript";
import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";

// Geliştirme altyapısı sözleşmesi infradaki compose dosyası ve kök .env.example
// arasında iki taraflıdır; anahtar/kapı listeleri tek yerde tutulur.
const composePath = "infra/docker-compose.dev.yml";
const envExamplePath = ".env.example";
const cleanupPath = "scripts/agtx/cleanup-worktree.sh";
const turboPath = "turbo.json";
const readmePath = "infra/README.md";

const SERVICE_NAMES = ["postgres", "lrs"] as const;
const SENSITIVE_KEYS = [
  "POSTGRES_PASSWORD",
  "LRS_API_KEY",
  "LRS_API_SECRET",
  "LRS_ADMIN_PASS",
] as const;
// Zorunlu ama sır olmayan girdiler (kimlik/veritabanı adı).
const REQUIRED_PLAIN_KEYS = [
  "POSTGRES_USER",
  "POSTGRES_DB",
  "LRS_ADMIN_USER",
] as const;
const EXPECTED_KEYS = [
  "DATABASE_URL",
  "LRS_ENDPOINT",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DB",
  "POSTGRES_PORT",
  "LRS_PORT",
  "LRS_API_KEY",
  "LRS_API_SECRET",
  "LRS_ADMIN_USER",
  "LRS_ADMIN_PASS",
  "XAPI_ACTIVITY_BASE_IRI",
  "XAPI_ACTOR_HOMEPAGE",
  // apps/api (T62) ortam sözleşmesi; değerler boş bırakılır.
  "PORT",
  "NODE_ENV",
  "AUTH_DEV_ENABLED",
  // apps/api SSO adaptörü (T64); değerler boş bırakılır.
  "SSO_PROVIDER",
  "SSO_STATE_SECRET",
] as const;

// Sır taraması: gizli anahtar, kimlik bilgisi taşıyan DSN ve AWS anahtarı.
const SECRET_PATTERN = /BEGIN [\w ]*PRIVATE KEY|postgres(ql)?:\/\/[^:\s]+:[^@\s]+@|AKIA[0-9A-Z]{16}/;
// Toplu okunmaz (AGENTS.md okuma sınırı); sır taşımayan ikili/kilitleme dosyaları
// ve sims/*/src/data ile sims/*/public/assets altındaki büyük veri dosyaları
// taranmaz (plan bu yolları kapsam dışı bırakıyordu).
const SKIPPED_TRACKED_PATTERN =
  /(^|\/)(node_modules|dist|coverage)\/|^sims\/[^/]+\/(src\/data|public\/assets)\/|\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|pdf|zip|gz|tgz|wasm|mp[34]|lock)$/;

function read(path: string): string {
  const content = ts.sys.readFile(path);
  if (content === undefined) {
    throw new Error(`Dosya okunamadı: ${path}`);
  }
  return content;
}

/** Bir blok gövdesini, girintisi anahtar girintisinden büyük olan satırlarla döndürür. */
function indentedBlock(body: string, keyIndent: string): string {
  const lines = body.split("\n");
  const indentLength = keyIndent.length + 2;
  const output: string[] = [];
  for (const line of lines) {
    if (line.trim() === "") {
      output.push(line);
      continue;
    }
    if (line.startsWith(" ".repeat(indentLength))) {
      output.push(line);
    } else {
      break;
    }
  }
  return output.join("\n");
}

function serviceBlock(body: string, service: string): string {
  const match = new RegExp(`^  ${service}:\\s*$`, "m").exec(body);
  if (match === null) {
    throw new Error(`Servis bulunamadı: ${service}`);
  }
  return indentedBlock(body.slice(match.index + match[0].length), "  ");
}

function scalarValue(block: string, key: string): string | undefined {
  const match = new RegExp(`^ {4}${key}: (.+)$`, "m").exec(block);
  return match?.[1]?.trim();
}

function allIndices(haystack: string, needle: string): number[] {
  const indices: number[] = [];
  let from = 0;
  for (;;) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) {
      return indices;
    }
    indices.push(index);
    from = index + needle.length;
  }
}

function dependsOnBlocks(body: string): string[] {
  const blocks: string[] = [];
  for (const index of allIndices(body, "\n    depends_on:")) {
    blocks.push(indentedBlock(body.slice(index + 1), "    "));
  }
  return blocks;
}

function trackedFiles(): string[] {
  const output = execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  return output.split("\0").filter((path) => path !== "");
}

const compose = read(composePath);
const envExample = read(envExamplePath);
const body = compose.split(/^services:\s*$/m)[1] ?? "";
const topLevelLines = body.split("\n").filter((line) => /^ {2}\S/.test(line));
const serviceNames = topLevelLines.map((line) => line.replace(/^ {2}/, "").replace(/:.*$/, ""));
const imageByService: Record<string, string> = {
  postgres: scalarValue(serviceBlock(body, "postgres"), "image") ?? "",
  lrs: scalarValue(serviceBlock(body, "lrs"), "image") ?? "",
};

describe("geliştirme compose'u", () => {
  it("tam olarak postgres ve lrs servislerini tanımlar", () => {
    expect(serviceNames).toEqual([...SERVICE_NAMES]);
  });

  it("her serviste sağlık kontrolünü tanımlar", () => {
    for (const service of SERVICE_NAMES) {
      const block = serviceBlock(body, service);
      expect(block, service).toContain("healthcheck:");
      expect(block, service).toContain("test:");
      expect(block, service).toContain("start_period:");
    }
  });

  it("veriyi kalıcı kılmaz: volume tanımlamaz", () => {
    expect(body).not.toMatch(/^\s{4}volumes:/m);
    expect(compose).not.toMatch(/^volumes:\s*$/m);
  });

  it("imajları etiket ve digest ile sabitler", () => {
    expect(imageByService.postgres).toMatch(/^postgres:\d+\.\d+-alpine@sha256:[0-9a-f]{64}$/);
    expect(imageByService.lrs).toMatch(
      /^yetanalytics\/lrsql:v\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/,
    );
    for (const image of Object.values(imageByService)) {
      expect(image).not.toContain(":latest");
    }
  });

  it("LRS'yi EGEMED platformu Postgres'ine bağlamaz", () => {
    const lrs = serviceBlock(body, "lrs");
    expect(lrs).not.toContain("LRSQL_DB_");
    expect(lrs).not.toContain("depends_on:");
    expect(lrs).toContain("LRSQL_API_KEY_DEFAULT");
    expect(lrs).toContain("LRSQL_API_SECRET_DEFAULT");
  });

  it("her depends_on bloğunda yalnız service_healthy koşulu ister", () => {
    // Şu an servisler arası bağımlılık yok (LRS kasıtlı olarak Postgres'e
    // bağlanmaz); kural gelecekteki api servisi için korunur.
    const blocks = dependsOnBlocks(body);
    expect(blocks).toHaveLength(0);
    for (const block of body.split("depends_on:").slice(1)) {
      expect(block).toContain("condition: service_healthy");
      expect(block).not.toMatch(/^\s*(?!condition:)\S/m);
    }
  });

  it("hassas anahtarları yalnız ${VAR:?} interpolasyonuyla verir", () => {
    for (const key of SENSITIVE_KEYS) {
      // Ölçüt komşu değil içeriktir: `${key}` tam olarak bir kez, zorunlu
      // interpolasyon olarak geçmeli. (YAML anahtarı LRSQL_* olabilir.)
      const usages = [...compose.matchAll(new RegExp(`\\$\\{(${key})(:\\?[^}]*)?\\}`, "g"))];
      expect(usages, key).toHaveLength(1);
      expect(usages[0]![2], key).toMatch(/^:\?/);
    }
    // Compose'da hiçbir YAML değeri düz metin parola/anahtar taşımaz.
    for (const match of compose.matchAll(/^\s+([A-Z_]+): (.+)$/gm)) {
      const [whole, name, value] = match;
      if (!/PASSWORD|SECRET|_KEY|PASS$|TOKEN/.test(name!) || value === undefined) {
        continue;
      }
      expect(value.trim(), whole).toMatch(/^\$\{[A-Z_]+:\?[^}]*\}$/);
    }
  });

  it("bilinmeyen bir değeri sessizce varsayılanla geçmez", () => {
    const interpolations = [...compose.matchAll(/\$\{([A-Z_]+)(?:(:[-?])[^}]*)?\}/g)];
    expect(interpolations.length).toBeGreaterThan(0);
    for (const match of interpolations) {
      const name = match[1]!;
      if (["POSTGRES_PORT", "LRS_PORT"].includes(name)) {
        // Portlar varsayılanlıdır; yerel port çakışmasında ezilebilir.
        expect(match[2], name).toBe(":-");
      } else {
        expect([...SENSITIVE_KEYS, ...REQUIRED_PLAIN_KEYS], name).toContain(name);
        expect(match[2], name).toBe(":?");
      }
    }
  });
});

describe(".env.example", () => {
  it("her satırı yorum ya da boş değerli anahtardır", () => {
    for (const line of envExample.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) {
        continue;
      }
      expect(line, line).toMatch(/^[A-Z][A-Z0-9_]*=$/);
    }
  });

  it("sözleşmedeki anahtarların tamamını içerir", () => {
    const keys = [...envExample.matchAll(/^([A-Z][A-Z0-9_]*)=$/gm)].map((match) => match[1]);
    expect([...keys].sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it("mevcut uygulama anahtarlarını korur", () => {
    expect(envExample).toMatch(/^DATABASE_URL=$/m);
    expect(envExample).toMatch(/^LRS_ENDPOINT=$/m);
  });
});

describe("cleanup-worktree.sh", () => {
  const cleanup = read(cleanupPath);

  it("compose sözleşmesini (yol ve proje öneki) korur", () => {
    expect(cleanup).toContain("infra/docker-compose.dev.yml");
    expect(cleanup).toContain('-p "egemed-${AGTX_TASK_ID:-local}"');
  });

  it("down'u interpolasyon gerektirmeyen yoldan çağırır", () => {
    // Boş .env.local ile `${VAR:?}` down'u kırar (B1); bu yüzden compose
    // dosyası ve env dosyası geçirilmez, yalnız proje adı kullanılır.
    expect(cleanup).toContain("down --remove-orphans");
    expect(cleanup).not.toContain("--env-file");
    expect(cleanup).not.toMatch(/-f infra\/docker-compose\.dev\.yml down/);
  });
});

describe("turbo test girdileri", () => {
  it("infra, .env.example ve agtx betiklerini izler", () => {
    const turbo = read(turboPath);
    expect(turbo).toContain("infra/**/*.yml");
    expect(turbo).toContain(".env.example");
    expect(turbo).toContain("scripts/agtx/*.sh");
  });
});

describe("depo sır taraması", () => {
  let tracked: string[];

  beforeAll(() => {
    tracked = trackedFiles();
  });

  it(".env ve .env.local gibi yerel sır dosyalarını izlemez", () => {
    expect(tracked).not.toContain(".env");
    expect(tracked).not.toContain(".env.local");
    expect(tracked).toContain(".env.example");
  });

  it("izlenen metin dosyalarında gizli anahtar, DSN parolası veya AWS anahtarı yok", () => {
    const findings: string[] = [];
    for (const path of tracked) {
      if (SKIPPED_TRACKED_PATTERN.test(path)) {
        continue;
      }
      const content = ts.sys.readFile(path);
      if (content === undefined) {
        continue;
      }
      const match = SECRET_PATTERN.exec(content);
      if (match !== null) {
        // Bulguda sırrın kendisi raporlanmaz; yalnız konum ve desen adı.
        findings.push(`${path}: ${match[0].slice(0, 16)}…`);
      }
    }
    expect(findings).toEqual([]);
  });

  it("sır deseni sahte sırları yakalar (negatif durum kanıtı)", () => {
    // Dizeler parçalanarak yazılır: tarama bu test dosyasını da tarar ve
    // kendi kendini yakalamamalıdır. Desen bozulursa tarama sessizce
    // "temiz" der; bu test onu engeller.
    const samples = [
      "postgres" + "://kullanici:parola@localhost:5432/db",
      "-----BEGIN RSA " + "PRIVATE KEY-----",
      "AKIA" + "ABCDEFGHIJKLMNOP",
    ];
    for (const sample of samples) {
      expect(SECRET_PATTERN.test(sample), sample.slice(0, 12)).toBe(true);
    }
  });

  it("infra README'si kullanım ve LRS onay notunu taşır", () => {
    const readme = read(readmePath);
    expect(readme).toContain("infra:up");
    expect(readme).toMatch(/onay|veto/i);
  });
});

// --- T32: üretim dağıtım sözleşmesi (infra/prod) ----------------------------
const dockerfilePath = "infra/prod/Dockerfile";
const prodComposePath = "infra/prod/docker-compose.prod.yml";
const prodEnvExamplePath = "infra/prod/.env.prod.example";
const nginxPath = "infra/prod/nginx-egemed.conf";
const gitignorePath = ".gitignore";

const PROD_SERVICES = ["api", "postgres"] as const;
// .env.prod.example'daki anahtar kümesi; değerler boştur (sır dosyada değildir).
const PROD_ENV_KEYS = [
  "DATABASE_URL",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DB",
  "SSO_PROVIDER",
  "SSO_STATE_SECRET",
] as const;
// Compose metninde DSN olarak birleşmemesi için DATABASE_URL ve şifre ayrı
// interpolasyonlardan geçer; ikisi de zorunludur (:?).
const PROD_SENSITIVE_KEYS = ["DATABASE_URL", "POSTGRES_PASSWORD"] as const;
const PINNED_NODE_IMAGE_PATTERN = /^node:22\.\d+(\.\d+)?-alpine@sha256:[0-9a-f]{64}$/;

const dockerfile = read(dockerfilePath);
const prodCompose = read(prodComposePath);
const prodEnvExample = read(prodEnvExamplePath);
const nginx = read(nginxPath);
const gitignore = read(gitignorePath);
const prodBody = prodCompose.split(/^services:\s*$/m)[1] ?? "";
// Servis adları yalnız services bölümünden okunur; sonraki üst düzey
// `volumes:` bölümü servis listesine karışmasın.
const prodServicesBody = prodBody.split(/^volumes:\s*$/m)[0] ?? prodBody;
const prodServiceNames = prodServicesBody
  .split("\n")
  .filter((line) => /^ {2}\S/.test(line))
  .map((line) => line.replace(/^ {2}/, "").replace(/:.*$/, ""));

describe("üretim Dockerfile", () => {
  it("taban imajı etiket ve digest ile sabitler, iki aşamada aynı imajı kullanır", () => {
    const argValue = /^ARG NODE_IMAGE=(\S+)$/m.exec(dockerfile)?.[1] ?? "";
    expect(argValue).toMatch(PINNED_NODE_IMAGE_PATTERN);
    const fromLines = [...dockerfile.matchAll(/^FROM (.+)$/gm)].map((match) => match[1]!);
    expect(fromLines).toHaveLength(2);
    for (const line of fromLines) {
      expect(line.startsWith("${NODE_IMAGE}"), line).toBe(true);
    }
    expect(dockerfile).not.toContain(":latest");
  });

  it("non-root çalışır: süreç node kullanıcısıdır, root izinli değildir", () => {
    expect(dockerfile).toMatch(/^USER node$/m);
    expect(dockerfile).not.toMatch(/^USER (root|0)\b/m);
  });

  it("yalnız prod bağımlılıklarını kilitli kurulumla alır", () => {
    expect(dockerfile).toContain("install --prod --frozen-lockfile");
  });

  it("giriş noktası ts-register kancasıyla Node'dur", () => {
    expect(dockerfile).toMatch(
      /^CMD \["node", "--import", "\.\/ts-register\.mjs", "src\/server\.ts"\]$/m,
    );
  });

  it("sır taşımaz", () => {
    expect(SECRET_PATTERN.test(dockerfile)).toBe(false);
  });
});

describe("üretim compose'u", () => {
  it("tam olarak api ve postgres servislerini tanımlar", () => {
    expect([...prodServiceNames].sort()).toEqual([...PROD_SERVICES].sort());
  });

  it("postgres imajını geliştirme compose'u ile aynı digest'te sabitler", () => {
    const image = scalarValue(serviceBlock(prodBody, "postgres"), "image") ?? "";
    expect(image).toMatch(/^postgres:\d+\.\d+-alpine@sha256:[0-9a-f]{64}$/);
    expect(image).toBe(imageByService.postgres);
  });

  it("üretim verisini kalıcı kılar: adlandırılmış volume tanımlar", () => {
    expect(prodBody).toContain("postgres-data:/var/lib/postgresql/data");
    expect(prodCompose).toMatch(/^volumes:\s*$/m);
  });

  it("her servis sağlık kontrolü ve restart ilkesi taşır", () => {
    for (const service of PROD_SERVICES) {
      const block = serviceBlock(prodBody, service);
      expect(block, service).toContain("healthcheck:");
      expect(block, service).toContain("start_period:");
      expect(block, service).toContain("restart: unless-stopped");
    }
  });

  it("api, postgres'e yalnız service_healthy koşuluyla bağlıdır", () => {
    expect(prodBody.split("depends_on:").length - 1).toBe(1);
    const api = serviceBlock(prodBody, "api");
    expect(api).toMatch(/depends_on:\n {6}postgres:\n {8}condition: service_healthy/);
  });

  it("hassas anahtarları yalnız ${VAR:?} interpolasyonuyla verir", () => {
    for (const key of PROD_SENSITIVE_KEYS) {
      const usages = [...prodCompose.matchAll(new RegExp(`\\$\\{(${key})(:\\?[^}]*)?\\}`, "g"))];
      expect(usages, key).toHaveLength(1);
      expect(usages[0]![2], key).toMatch(/^:\?/);
    }
    for (const match of prodCompose.matchAll(/^\s+([A-Z_]+): (.+)$/gm)) {
      const [whole, name, value] = match;
      if (name === "SSO_STATE_SECRET") {
        // SSO seçilene dek boş varsayılan geçerli; env.ts açılışta zorlar.
        expect(value, whole).toBe("${SSO_STATE_SECRET:-}");
        continue;
      }
      if (!/PASSWORD|SECRET|_KEY|PASS$|TOKEN/.test(name!) || value === undefined) {
        continue;
      }
      expect(value.trim(), whole).toMatch(/^\$\{[A-Z_]+:\?[^}]*\}$/);
    }
  });

  it("interpolasyonlar ya zorunludur ya belgelenmiş boş varsayılan taşır", () => {
    const interpolations = [...prodCompose.matchAll(/\$\{([A-Z_]+)(?:(:[-?])[^}]*)?\}/g)];
    expect(interpolations.length).toBeGreaterThan(0);
    for (const match of interpolations) {
      const name = match[1]!;
      if (["SSO_PROVIDER", "SSO_STATE_SECRET"].includes(name)) {
        expect(match[2], name).toMatch(/^:-/);
      } else {
        expect(match[2], name).toBe(":?");
      }
    }
  });

  it("API'yi yalnız ana makineye yayınlar; ağa açık port yoktur", () => {
    const ports = [...prodCompose.matchAll(/^ {6}- "(.+)"$/gm)].map((match) => match[1]!);
    expect(ports).toEqual(["127.0.0.1:3000:3000"]);
  });

  it("AUTH_DEV_ENABLED kapalı ve NODE_ENV production sabitlenmiştir", () => {
    expect(prodBody).toMatch(/^ {6}NODE_ENV: "production"$/m);
    expect(prodBody).toMatch(/^ {6}AUTH_DEV_ENABLED: "false"$/m);
    expect(prodBody).not.toMatch(/^ {6}AUTH_DEV_ENABLED: "true"$/m);
  });

  it("DSN ve parola metni compose'da görünmez", () => {
    expect(prodCompose).not.toContain("postgres://");
    expect(SECRET_PATTERN.test(prodCompose)).toBe(false);
  });
});

describe(".env.prod.example", () => {
  it("her satırı yorum ya da boş değerli anahtardır (değer yok)", () => {
    for (const line of prodEnvExample.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) {
        continue;
      }
      expect(line).toMatch(/^[A-Z][A-Z0-9_]*=$/);
    }
  });

  it("anahtar kümesi compose sözleşmesiyle birebir eşleşir", () => {
    const keys = [...prodEnvExample.matchAll(/^([A-Z][A-Z0-9_]*)=$/gm)].map((match) => match[1]!);
    expect([...keys].sort()).toEqual([...PROD_ENV_KEYS].sort());
  });

  it("sır taşımaz", () => {
    expect(SECRET_PATTERN.test(prodEnvExample)).toBe(false);
  });
});

describe("nginx-egemed.conf", () => {
  it("kabuk statik, API vekil ve güvenlik başlıklarını taşır", () => {
    expect(nginx).toContain("server_name egemed.ege.edu.tr");
    expect(nginx).toContain("root /srv/egemed/shell-dist");
    expect(nginx).toContain("proxy_pass http://127.0.0.1:3000/");
    expect(nginx).toMatch(/Strict-Transport-Security/);
    expect(nginx).toMatch(/X-Content-Type-Options "nosniff"/);
    expect(nginx).toMatch(/Referrer-Policy "no-referrer"/);
    expect(nginx).toMatch(/Content-Security-Policy/);
    expect(nginx).toMatch(/frame-ancestors 'none'/);
  });

  it("önbellek sözleşmesini uygular: index no-cache, hash'li varlık uzun", () => {
    expect(nginx).toMatch(/^ {4}location = \/index\.html \{$/m);
    expect(nginx).toMatch(/Cache-Control "no-cache"/);
    expect(nginx).toMatch(/^ {4}location \/assets\/ \{$/m);
    expect(nginx).toContain("max-age=31536000, immutable");
  });

  it("gzip'i açar ve brotli çağrısını taşır", () => {
    expect(nginx).toMatch(/^ {4}gzip on;$/m);
    expect(nginx).toContain("brotli");
  });

  it("sır taşımaz", () => {
    expect(SECRET_PATTERN.test(nginx)).toBe(false);
  });
});

describe(".gitignore (T32)", () => {
  it("gerçek üretim sır dosyasını izlemez, örneğini dışlamaz", () => {
    expect(gitignore).toMatch(/^\.env\.prod$/m);
    expect(gitignore).toMatch(/^infra\/prod\/\.env\.prod$/m);
    expect(gitignore).not.toMatch(/^\.env\.prod\.example$/m);
  });
});
