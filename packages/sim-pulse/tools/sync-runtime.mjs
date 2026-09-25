#!/usr/bin/env node
/**
 * Pulse kaynak runtime'ını (EGEMED_PULSE/cardai) platforma aktarır.
 *
 * Kaynak depo yetkili runtime'dır (BUILD.md); bu betik onu SALT OKUR ve
 * `src/runtime/vendor/` altına üretilmiş modüller yazar. Her kaynak betik
 * değiştirilmeden bir `run(env)` işlevine sarılır; `window`, `document`,
 * `localStorage`, zamanlayıcılar ve kaynak betiklerin birbirine açtığı
 * globaller `env` üzerinden gölgelenir (bkz. `src/runtime/host.ts`).
 *
 * Kaynaktan bilinçli sapmalar yalnız aşağıdaki PATCHES listesindedir; her yama
 * tam bir kez uygulanmazsa betik hata verir. Üretilen `manifest.json` her kaynak
 * dosyanın SHA-256 değerini ve uygulanan yamaları kaydeder.
 *
 * Kullanım: node tools/sync-runtime.mjs [--source <cardai dizini>]
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { console, process } = globalThis;

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argIndex = process.argv.indexOf("--source");
const SOURCE =
  argIndex > -1
    ? resolve(process.argv[argIndex + 1])
    : resolve(homedir(), "Documents/EGEMED CLIX/EGEMED_PULSE/cardai");
const OUT = resolve(PKG, "src/runtime/vendor");
const PUBLIC = resolve(PKG, "public");

/** index.html'deki yükleme sırası (BUILD.md). */
const SCRIPTS = ["model", "scorm", "curriculum", "state", "app", "features", "landing"];
const ASSETS = [
  "assets/egemed-pulse-favicon.png",
  "assets/egemed-pulse-landing.png",
  "assets/ege-tip-logo.png",
  "assets/brand/ege-tip-seal-128.png",
];

/** Kaynak betiklerin gölgelenen adları; `host.ts` `PulseScriptEnv` ile aynı. */
const ENV_NAMES = [
  "window",
  "document",
  "localStorage",
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "ResizeObserver",
  "CardAIModel",
  "CardAIScorm",
  "PulseCurriculum",
  "PulseState",
];

/**
 * Kaynaktan bilinçli sapmalar. `find` kaynakta tam bir kez geçmelidir.
 * @type {Record<string, {id: string, why: string, find: string, replace: string, all?: boolean}[]>}
 */
const PATCHES = {
  model: [
    {
      id: "PULSE-NEXTEVENT-RECURSION",
      why:
        "Kaynak hatası: önbellek dışındaki kısa aralıkta between() aynı girdilerle kendini çağırıp yığın taşırıyor (~30 adım sonra). Port düzeltmesiyle (T18b-FIX, engine/beats.ts) aynı: taşan uçtan önbelleği yenile.",
      find: "if(a<this.cacheFrom-1.2||b>this.cacheTo+1.2){const result=[];",
      replace:
        "if(a<this.cacheFrom-1.2||b>this.cacheTo+1.2){if(b-a<=6){this.ensure(b>this.cacheTo+1.2?b:a);return this.beats.slice(this.lowerBound(a),this.lowerBound(b+1e-10));}const result=[];",
    },
  ],
  features: [
    {
      id: "PULSE-ASSET-BASE",
      why: "Göreli varlık yolu kabuğun kökünde değil /sims/pulse/ altında çözülmeli.",
      find: "'assets/",
      replace: "window.__pulseAssetBase+'assets/",
      all: true,
    },
    {
      id: "KAYNAK-01-SCORE-VS-MODULE",
      why:
        "Kaynak kusuru (Astra KAYNAK-01): sınav sonucu modül tamamlama (tüm ritimler + vakalar + ≥80) ile puan eşiğini tek 'passed'da birleştiriyor; doğrudan sınava girip 100 alan öğrenci 'Hedefin altında' görüyor. Sonuç ekranında sınav durumu yalnız puan eşiğine (80) bağlanır; modül tamamlanmadıysa ayrı not gösterilir. SCORM/kayıt 'passed' anlamı değişmez.",
      find: "passed=section==='quiz'?state.passed:correct>=8,",
      replace: "passed=section==='quiz'?score>=80:correct>=8,moduleDone=section!=='quiz'||state.passed,",
    },
    {
      id: "KAYNAK-01-MODULE-NOTE",
      why: "Modül tamamlama koşulu puan eşiğinden ayrı gösterilir (KAYNAK-01).",
      find: '<span class="rs-lbl">Durum (eşik 80)</span></div>`]',
      replace:
        '<span class="rs-lbl">Durum (eşik 80)</span>${moduleDone?\'\':\'<span class="rs-lbl" data-egemed-module-note>Modül henüz tamamlanmadı: tüm ritimleri inceleyip vakaları bitirin.</span>\'}</div>`]',
    },
  ],
};

/** index.html işaretleme yamaları (kaynak erişilebilirlik kusurları, PULSE-10). */
const MARKUP_PATCHES = [
  {
    id: "PULSE-A11Y-EXPLAIN-TABS-ROLE",
    why: "Açıklama sekmeleri role=tablist taşıyor ama çocukları role=tab değil (axe aria-required-children); düğmeler aç/kapa grubu olarak işaretlenir.",
    find: '<div class="explain-tabs" role="tablist">',
    replace: '<div class="explain-tabs" role="group" aria-label="Açıklama görünümü">',
  },
  {
    id: "PULSE-A11Y-LANDING-HELP-NAME",
    why: "Mobilde etiket gizlenince düğmenin erişilebilir adı kalmıyor (axe button-name).",
    find: '<button class="eg-navbtn" id="landingHelp" type="button">',
    replace: '<button class="eg-navbtn" id="landingHelp" type="button" aria-label="Yardım">',
  },
  {
    id: "PULSE-A11Y-LANDING-ABOUT-NAME",
    why: "Mobilde etiket gizlenince düğmenin erişilebilir adı kalmıyor (axe button-name).",
    find: '<button class="eg-navbtn" id="landingAbout" type="button">',
    replace: '<button class="eg-navbtn" id="landingAbout" type="button" aria-label="Hakkında">',
  },
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function applyPatches(name, code, applied) {
  for (const patch of PATCHES[name] ?? []) {
    const count = code.split(patch.find).length - 1;
    if (count === 0 || (!patch.all && count !== 1)) {
      throw new Error(`${name}.js: '${patch.id}' yaması ${count} kez eşleşti (beklenen ${patch.all ? "≥1" : "1"}).`);
    }
    code = code.split(patch.find).join(patch.replace);
    applied.push({ file: `${name}.js`, id: patch.id, matches: count, why: patch.why });
  }
  return code;
}

function wrapScript(name, code) {
  return [
    `// ÜRETİLMİŞ DOSYA — elle düzenleme. Kaynak: EGEMED_PULSE/cardai/${name}.js`,
    "// Yeniden üretmek için: pnpm --filter @egemed/sim-pulse sync:runtime",
    "/* eslint-disable */",
    "export default function run(env) {",
    `const { ${ENV_NAMES.join(", ")} } = env;`,
    code,
    "}",
    "",
  ].join("\n");
}

/** index.html gövdesi: betik etiketleri çıkar, h1 → h2[data-h1], kaynaklar gömülür. */
function buildMarkup(html, sourcesJson, applied) {
  const start = html.indexOf("<body>");
  const end = html.lastIndexOf("</body>");
  if (start < 0 || end < 0) throw new Error("index.html: <body> bulunamadı.");
  let body = html.slice(start + "<body>".length, end);
  for (const patch of MARKUP_PATCHES) {
    const count = body.split(patch.find).length - 1;
    if (count !== 1) throw new Error(`index.html: '${patch.id}' yaması ${count} kez eşleşti (beklenen 1).`);
    body = body.replace(patch.find, patch.replace);
    applied.push({ file: "index.html", id: patch.id, matches: count, why: patch.why });
  }
  body = body.replace(/<script src="[^"]+"><\/script>\s*/g, "");
  const placeholder = '<script type="application/json" id="pulse-sources"></script>';
  if (body.split(placeholder).length !== 2) throw new Error("index.html: pulse-sources yer tutucusu tek değil.");
  const inert = sourcesJson.replace(/<\//g, "<\\/");
  body = body.replace(placeholder, `<script type="application/json" id="pulse-sources">${inert}</script>`);
  const h1Count = (body.match(/<h1\b/g) ?? []).length;
  body = body.replace(/<h1\b/g, "<h2 data-h1").replace(/<\/h1>/g, "</h2>");
  body = body.replace(/(src|href)="assets\//g, '$1="__PULSE_ASSET_BASE__assets/');
  if (/<script\b(?![^>]*application\/json)/.test(body)) throw new Error("index.html: beklenmeyen script etiketi.");
  return { body, h1Count };
}

/** styles.css: kök seçiciler gölge köke taşınır; h1 seçicileri [data-h1]; tam ekran yüksekliği kabuğa göre. */
function buildCss(css) {
  return css
    .replace(/:root\b/g, ":host")
    .replace(/(?<![\w.#-])html(?![\w-])/g, ".pulse-html")
    .replace(/(?<![\w.#-])body(?![\w-])/g, ".pulse-body")
    .replace(/(?<![\w.#-])h1(?![\w-])/g, "[data-h1]")
    .replace(/100dvh/g, "var(--pulse-vh,100dvh)");
}

function main() {
  if (!existsSync(SOURCE)) {
    console.error(`Kaynak runtime bulunamadı: ${SOURCE}`);
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  const applied = [];
  const files = {};
  const record = (rel) => {
    const buffer = readFileSync(resolve(SOURCE, rel));
    files[rel] = { sha256: sha256(buffer), bytes: buffer.length };
    return buffer.toString("utf8");
  };

  for (const name of SCRIPTS) {
    const code = applyPatches(name, record(`${name}.js`), applied);
    writeFileSync(resolve(OUT, `${name}.js`), wrapScript(name, code));
    writeFileSync(
      resolve(OUT, `${name}.d.ts`),
      `// ÜRETİLMİŞ DOSYA.\nimport type { PulseScriptEnv } from "../env";\ndeclare function run(env: PulseScriptEnv): void;\nexport default run;\n`,
    );
  }

  const { body, h1Count } = buildMarkup(record("index.html"), record("sources.json"), applied);
  writeFileSync(
    resolve(OUT, "markup.js"),
    `// ÜRETİLMİŞ DOSYA. Kaynak: EGEMED_PULSE/cardai/index.html (<body>), sources.json gömülü.\n/* eslint-disable */\nexport default ${JSON.stringify(body)};\n`,
  );
  writeFileSync(resolve(OUT, "markup.d.ts"), "// ÜRETİLMİŞ DOSYA.\ndeclare const markup: string;\nexport default markup;\n");
  writeFileSync(
    resolve(OUT, "styles.js"),
    `// ÜRETİLMİŞ DOSYA. Kaynak: EGEMED_PULSE/cardai/styles.css (gölge köke uyarlanmış).\n/* eslint-disable */\nexport default ${JSON.stringify(buildCss(record("styles.css")))};\n`,
  );
  writeFileSync(resolve(OUT, "styles.d.ts"), "// ÜRETİLMİŞ DOSYA.\ndeclare const styles: string;\nexport default styles;\n");

  for (const rel of ASSETS) {
    const target = resolve(PUBLIC, rel);
    mkdirSync(dirname(target), { recursive: true });
    record(rel);
    copyFileSync(resolve(SOURCE, rel), target);
  }

  const manifest = {
    source: "EGEMED_PULSE/cardai",
    scripts: SCRIPTS,
    files,
    patches: applied,
    markup: { h1ToH2: h1Count },
  };
  writeFileSync(resolve(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Pulse runtime aktarıldı: ${SCRIPTS.length} betik, ${applied.length} yama, ${ASSETS.length} varlık.`);
}

main();
