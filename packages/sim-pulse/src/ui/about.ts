import sourcesData from "../data/sources.json";

interface PulseAboutEvidence {
  readonly statement: string;
  readonly citation: string;
  readonly doi: string;
  readonly url: string;
}

interface PulseAboutModule {
  readonly name: string;
  readonly subtitle: string;
  readonly institution: string;
  readonly description: string;
  readonly logo: string;
  readonly logoSource: string;
  readonly evidence: PulseAboutEvidence;
}

interface PulseAboutPerson {
  readonly name: string;
  readonly url?: string;
}

interface PulseAboutCreditGroup {
  readonly role: string;
  readonly people: readonly PulseAboutPerson[];
}

interface PulseAboutReference {
  readonly id: string;
  readonly title: string;
  readonly org: string;
  readonly year: number;
  readonly url: string;
  readonly use: string;
}

export interface PulseSourcesDocument {
  readonly module: PulseAboutModule;
  readonly credits: readonly PulseAboutCreditGroup[];
  readonly references: readonly PulseAboutReference[];
  readonly note: string;
}

export interface PulseAboutViewPerson extends PulseAboutPerson {
  readonly initials: string;
}

export interface PulseAboutViewCreditGroup {
  readonly role: string;
  readonly people: readonly PulseAboutViewPerson[];
}

export interface PulseAboutView {
  readonly subtitle: string;
  readonly module: PulseAboutModule & { readonly logoUrl: string };
  readonly credits: readonly PulseAboutViewCreditGroup[];
  readonly references: readonly PulseAboutReference[];
  readonly limitations: readonly [string, string, string];
  readonly note: string;
}

export interface CreatePulseAboutViewOptions {
  readonly curriculumLimitations: string;
  readonly assetBase?: string;
}

const TITLE_TOKENS = new Set(["Prof.", "Doç.", "Dr.", "Öğr.", "Uzm.", "Arş.", "Gör.", "Op."]);

const ABOUT_SUBTITLE =
  "EGEMED Pulse™ Etkileşimli EKG Simülatörü’nü geliştiren ekip, kurum bilgisi ve modülde kullanılan EKG verilerinin atıf ve lisans bilgileri.";

const LIMITATION_DISCLAIMER =
  "Simülasyon eğitim amaçlıdır; tek başına klinik tanı koymak için kullanılamaz.";

const LIMITATION_SYNTHETIC_DATA =
  "EKG sinyalleri sentetiktir; harici EKG veri seti kullanılmamıştır. Atıf ve katkı verileri sources.json dosyasında saklanır.";

export const PULSE_SOURCES = sourcesData as PulseSourcesDocument;

export function withAssetBase(assetBase: string, path: string): string {
  if (/^https?:\/\//iu.test(path)) return path;
  const normalizedPath = path.replace(/^\/+/u, "");
  if (!assetBase) return normalizedPath;
  return `${assetBase.replace(/\/+$/u, "")}/${normalizedPath}`;
}

export function initials(name: string): string {
  const filtered = name
    .split(/\s+/u)
    .filter((token) => token.length > 0 && !TITLE_TOKENS.has(token));
  const letters = filtered.slice(0, 2).map((token) => token[0] ?? "");
  return letters.join("").toLocaleUpperCase("tr") || "…";
}

export function buildAboutLimitations(curriculumLimitations: string): readonly [string, string, string] {
  return [curriculumLimitations, LIMITATION_DISCLAIMER, LIMITATION_SYNTHETIC_DATA];
}

export function createPulseAboutView(options: CreatePulseAboutViewOptions): PulseAboutView {
  const assetBase = options.assetBase ?? "";
  return {
    subtitle: ABOUT_SUBTITLE,
    module: {
      ...PULSE_SOURCES.module,
      logoUrl: withAssetBase(assetBase, PULSE_SOURCES.module.logo),
    },
    credits: PULSE_SOURCES.credits.map((group) => ({
      role: group.role,
      people: group.people.map((person) => ({
        ...person,
        initials: initials(person.name),
      })),
    })),
    references: PULSE_SOURCES.references,
    limitations: buildAboutLimitations(options.curriculumLimitations),
    note: PULSE_SOURCES.note,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

export function renderPulseAboutMarkup(view: PulseAboutView): string {
  const creditsMarkup = view.credits
    .map((group) => (
      `<div class="credit-group">` +
      `<span class="credit-role">${escapeHtml(group.role)}</span>` +
      `<ul class="credit-people">${group.people.map((person) => (
        `<li>${person.url
          ? `<a class="credit-person" href="${escapeHtml(person.url)}" target="_blank" rel="noreferrer"><span class="credit-avatar">${escapeHtml(person.initials)}</span>${escapeHtml(person.name)}</a>`
          : `<span class="credit-person placeholder"><span class="credit-avatar">${escapeHtml(person.initials)}</span>${escapeHtml(person.name)}</span>`
        }</li>`
      )).join("")}</ul>` +
      `</div>`
    ))
    .join("");
  const referencesMarkup = view.references
    .map((reference) => (
      `<article class="ref-card">` +
      `<h3>${escapeHtml(reference.title)}</h3>` +
      `<span>${escapeHtml(reference.org)} · ${reference.year}</span>` +
      `<p>${escapeHtml(reference.use)}</p>` +
      `<a href="${escapeHtml(reference.url)}" target="_blank" rel="noreferrer">${escapeHtml(reference.id)}</a>` +
      `</article>`
    ))
    .join("");
  return (
    `<p class="view-intro">${escapeHtml(view.subtitle)}</p>` +
    `<section class="about-section"><h2>Geliştiriciler</h2>${creditsMarkup}</section>` +
    `<section class="about-section"><h2>Kurum</h2><div class="inst-card">` +
    `<img src="${escapeHtml(view.module.logoUrl)}" alt="Ege Üniversitesi Tıp Fakültesi">` +
    `<div><h3>${escapeHtml(view.module.name)} — ${escapeHtml(view.module.subtitle)}</h3>` +
    `<p>${escapeHtml(view.module.description)}</p>` +
    `<p class="inst-evidence">${escapeHtml(view.module.evidence.statement)} ` +
    `<a href="${escapeHtml(view.module.evidence.url)}" target="_blank" rel="noreferrer">doi:${escapeHtml(view.module.evidence.doi)}</a></p>` +
    `</div></div></section>` +
    `<section class="about-section"><h2>Kaynaklar</h2><div class="ref-grid">${referencesMarkup}</div></section>` +
    `<section class="about-section"><h2>Validasyon, sınırlılıklar ve sorumluluk</h2>` +
    `<p class="about-note">${view.limitations.map((line) => escapeHtml(line)).join(" ")}</p>` +
    `<p class="about-note">${escapeHtml(view.note)}</p>` +
    `</section>`
  );
}
