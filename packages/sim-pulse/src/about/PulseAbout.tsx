/// <reference lib="dom" />
import { useEffect, useRef, type JSX } from "react";
import sourcesData from "../data/sources.json";
import { curriculum } from "../data/curriculum";
import styles from "../runtime/vendor/styles.js";
import { EMBED_CSS } from "../runtime/host";

/**
 * T276b — Pulse'ın eski Hakkında içeriği, kabuğun `#/hakkinda` sayfası için
 * (depo sahibi kararı 1 Eki 2026: Hakkında simlerin içinden kalkar, ana sayfadan
 * tek sayfa olarak açılır). İşaretleme kaynak `features.js` `renderAbout()` ile
 * birebir aynıdır; Pulse stilleri kabuğa sızmasın diye gölge kökte çizilir.
 * Bölüm başlıkları h3'tür (sayfa h1, sim başlığı h2).
 */

interface Person { readonly name: string; readonly url?: string }
interface PulseSources {
  readonly module: {
    readonly name?: string;
    readonly subtitle?: string;
    readonly description?: string;
    readonly logo?: string;
    readonly evidence?: { readonly statement?: string; readonly url?: string; readonly citation?: string; readonly doi?: string };
  };
  readonly credits: readonly { readonly role: string; readonly people: readonly Person[] }[];
  readonly references: readonly { readonly title: string; readonly org: string; readonly year: string | number; readonly use?: string; readonly url: string; readonly id: string }[];
}

const data = sourcesData as unknown as PulseSources;

const esc = (value: unknown): string =>
  String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

const TITLES = new Set(["Prof.", "Doç.", "Dr.", "Öğr.", "Uzm.", "Arş.", "Gör.", "Op."]);
const initials = (name: string): string =>
  name.split(/\s+/).filter((w) => !TITLES.has(w)).slice(0, 2).map((w) => w[0]).join("").toLocaleUpperCase("tr") || "…";

const ICO = {
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21C7 17.5 2 13.4 2 8.9 2 6.2 4.2 4 6.9 4c1.7 0 3.2.8 4.1 2.1L12 7.6l1-1.5C13.9 4.8 15.4 4 17.1 4 19.8 4 22 6.2 22 8.9c0 4.5-5 8.6-10 12.1z"/></svg>',
  doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h7l5 5v15H7zM14 2v5h5M10 13h5M10 17h5"/></svg>',
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v16H4zM13 4h7v16h-7z"/></svg>',
  warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20zM12 9v5M12 17h.01"/></svg>',
} as const;

const section = (icon: keyof typeof ICO, title: string, body: string): string =>
  `<section class="about-section"><h3><span class="ico">${ICO[icon]}</span>${title}</h3>${body}</section>`;

function credits(): string {
  return `<div class="credit-groups">${data.credits
    .map((group) => `<div class="credit-group lead"><span class="credit-role">${esc(group.role)}</span><ul class="credit-people">${group.people
      .map((person) => {
        const body = `<span class="credit-avatar">${esc(initials(person.name))}</span><span>${esc(person.name)}</span>${person.url ? '<span class="ext" aria-hidden="true">↗</span>' : ""}`;
        const placeholder = person.name.replace(/^(?:Prof\.|Doç\.|Dr\.|\s)+/, "") ? "" : " placeholder";
        return `<li>${person.url ? `<a class="credit-person" href="${esc(person.url)}" target="_blank" rel="noreferrer">${body}</a>` : `<span class="credit-person${placeholder}">${body}</span>`}</li>`;
      })
      .join("")}</ul></div>`)
    .join("")}</div>`;
}

function institution(assetBase: string): string {
  const m = data.module;
  const ev = m.evidence ?? {};
  const logo = `${assetBase}assets/brand/ege-tip-seal-128.png`;
  const evidence = ev.statement
    ? `<p class="inst-evidence">${esc(ev.statement)}${ev.url ? `<sup><a href="${esc(ev.url)}" target="_blank" rel="noreferrer" aria-label="Kaynak">[1]</a></sup>` : ""}<br><span class="inst-cite">[1] ${esc(ev.citation ?? "")}${ev.url ? ` <a href="${esc(ev.url)}" target="_blank" rel="noreferrer">doi:${esc(ev.doi ?? ev.url)}</a>` : ""}</span></p>`
    : "";
  return `<div class="inst-card"><img src="${esc(logo)}" alt="Ege Üniversitesi Tıp Fakültesi"><div><h4>${esc(`${m.name ?? "EGEMED Pulse™"} — ${m.subtitle ?? ""}`)}</h4><p>${esc(m.description ?? "")}</p>${evidence}</div></div>`;
}

function references(): string {
  return `<div class="ds-grid">${data.references
    .map((ref) => `<article class="ds-card"><h4>${esc(ref.title)}</h4><span class="org">${esc(ref.org)} · ${esc(ref.year)}</span><p>${esc(ref.use ?? "")}</p><dl><dt>Bağlantı</dt><dd><a href="${esc(ref.url)}" target="_blank" rel="noreferrer">${esc(ref.id)}</a></dd></dl></article>`)
    .join("")}</div>`;
}

function limitations(): string {
  const items = [
    curriculum.limitations,
    "Simülasyon eğitim amaçlıdır; tek başına klinik tanı koymak için kullanılamaz.",
    "Kullanılan veri kümelerinin atıf ve lisans bilgileri Kaynaklar bölümündedir.",
  ];
  return `<p class="about-note">${items.map(esc).join(" ")}</p>`;
}

/** Saf HTML (testlerde ve gölge kökte kullanılır). */
export function pulseAboutHtml(assetBase: string): string {
  return `<section class="about-view" aria-labelledby="pulseAboutTitle"><h2 class="src-title" id="pulseAboutTitle">EGEMED Pulse™ Hakkında</h2><p class="view-intro">EGEMED Pulse™ Etkileşimli EKG Simülatörü’nü geliştiren ekip, kurum bilgisi ve modülde kullanılan EKG verilerinin atıf ve lisans bilgileri.</p><div class="about-content">${section("heart", "Geliştiriciler", credits())}${section("doc", "Kurum", institution(assetBase))}${section("book", "Kaynaklar", references())}${section("warn", "Validasyon, sınırlılıklar ve sorumluluk", limitations())}</div></section>`;
}

/** Kaynak kart başlığı kuralları (`.inst-card h3`, `.ds-card h3`) h4 için yeniden üretilir. */
const CARD_H4_CSS = (styles.match(/[^{}]*\.(?:inst-card|ds-card)[^{}]*\bh3\b[^{}]*\{[^{}]*\}/g) ?? [])
  .map((rule) => rule.replace(/\bh3\b/g, "h4"))
  .join("\n");

/** Kaynak stiller h2/h3 için yazılmıştır; bölüm h3, kart h4 olduğundan eşleri eklenir. */
const ABOUT_CSS = `${CARD_H4_CSS}
:host{display:block}
.about-root{color:var(--text);font:var(--fs-md)/1.5 var(--font)}
.about-section h3{display:flex;align-items:center;gap:9px;margin:0 0 12px;color:var(--navy-800);font-size:var(--fs-xl)}
.about-section h3 .ico{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:var(--r-sm);background:var(--blue-50);color:var(--blue-600)}
.about-section h3 .ico svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
`;

export function PulseAbout({ assetBase }: { readonly assetBase: string }): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const host = ref.current;
    if (host === null) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${styles}\n${EMBED_CSS}\n${ABOUT_CSS}</style><div class="about-root">${pulseAboutHtml(assetBase)}</div>`;
  }, [assetBase]);
  return <div className="egemed-pulse-about" ref={ref} />;
}
