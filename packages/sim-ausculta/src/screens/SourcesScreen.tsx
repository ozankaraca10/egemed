import type { JSX } from "react";
import { useStore } from "../core/StoreProvider";
import sourcesData from "../data/sources.json";
import { EcgDeco, Footer, touchTarget } from "../ui/chrome";
import { EmbeddedProvider, ScreenHeading, SectionHeading } from "../ui/ScreenHeading";
import { IconBook, IconDoc, IconHeart, IconInfo } from "../ui/icons";

/** Kaynaklar (E2 §9 S16b). Atıf, lisans ve validasyon metinleri `sources.json` ile aynıdır.
 *  Öğrenci adı yolu yoktur; krediler kaynak dosyasındaki geliştirici atıflarıdır. */

const HIT = touchTarget();

interface CreditPerson {
  name: string;
  url?: string;
}
interface CreditGroup {
  role: string;
  people: CreditPerson[];
}
interface Dataset {
  id: string;
  title: string;
  authors: string[];
  datasetDoi: string;
  articleDoi?: string;
  license: string;
  licenseUrl?: string;
  usage?: string;
  attributionText: string;
}
interface Asset {
  id: string;
  title: string;
  authors: string[];
  source: string;
  license: string;
  licenseUrl?: string;
  usage: string;
  attributionText: string;
}
interface InventoryItem {
  id: string;
  status: string;
  recordings: number;
  population: string;
}

const data = sourcesData as unknown as {
  module: {
    product: string;
    subtitle: string;
    developedBy: string;
    copyright: string;
    evidence?: { statement: string; citation: string; doi: string; url: string };
    validation?: { full: string; short: string };
  };
  credits: CreditGroup[];
  datasets: Dataset[];
  assets?: Asset[];
  inventory: InventoryItem[];
  disclaimer: string;
};

/** "Doç. Dr. Ozan KARACA" → "OK"; unvanlar atlanır. Yalnız unvan varsa "…". */
function initials(name: string): string {
  const parts = name
    .replace(/\./g, "")
    .split(/\s+/)
    .filter((part) => part && !/^(Prof|Doç|Dr|Uzm|Öğr|Gör|Arş)$/i.test(part));
  if (parts.length === 0) return "…";
  return parts
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function doiHref(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://doi.org/${value}`;
}

function licenseShort(license: string): string {
  const match = license.match(/CC BY(?:-SA)? \d\.\d|ODC-BY \d\.\d|CC0 \d\.\d/i);
  return match ? match[0] : license;
}

export interface SourcesScreenProps {
  readonly embedded?: boolean;
}

/** Eski Hakkında içeriği (mağazasız): sim içi Kaynaklar ekranı ve kabuğun `#/hakkinda` sayfası ortak kullanır. */
export function AuscultaAboutContent(): JSX.Element {
  const inventoryById = new Map(data.inventory.map((item) => [item.id, item]));
  return (
    <>
          <ScreenHeading className="src-title">
            EGEMED Ausculta<sup className="tm">™</sup> Hakkında
          </ScreenHeading>
          <p className="src-sub">
            {data.module.product}
            <sup className="tm">™</sup> {data.module.subtitle}'nü geliştiren ekip, kurum bilgisi ve modülde kullanılan
            klinik ses kayıtlarının atıf ve lisans bilgileri.
          </p>

          <section className="src-section" aria-labelledby="credits-h" style={{ marginTop: 0 }}>
            <SectionHeading id="credits-h">
              <IconHeart /> Geliştiriciler
            </SectionHeading>
            <div className="credit-groups">
              {data.credits.map((group) => (
                <div className="credit-group lead" key={group.role}>
                  <div className="credit-role">{group.role}</div>
                  <ul className="credit-people">
                    {group.people.map((person, index) =>
                      person.url ? (
                        <li key={`${group.role}-${index}`}>
                          <a
                            className="credit-person"
                            href={person.url}
                            target="_blank"
                            rel="noreferrer"
                            title={`${person.name} — Ünisis profili`}
                          >
                            <span className="credit-avatar" aria-hidden="true">
                              {initials(person.name)}
                            </span>
                            <span>{person.name}</span>
                            <span className="ext" aria-hidden="true">
                              ↗
                            </span>
                          </a>
                        </li>
                      ) : (
                        <li key={`${group.role}-${index}`}>
                          <span className="credit-person placeholder">
                            <span className="credit-avatar" aria-hidden="true">
                              {initials(person.name)}
                            </span>
                            <span>{person.name}</span>
                          </span>
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="src-section" aria-labelledby="inst-h">
            <SectionHeading id="inst-h">
              <IconDoc /> Kurum
            </SectionHeading>
            <div className="inst-card">
              <img src="brand/ege-tip-logo.png" alt="Ege Üniversitesi Tıp Fakültesi amblemi" />
              <div>
                <h3>
                  {data.module.product}
                  <sup className="tm">™</sup> — {data.module.subtitle}
                </h3>
                <p>
                  {data.module.developedBy} tarafından, tıp fakültesi öğrencilerinin kardiyopulmoner oskültasyon
                  becerilerini geliştirmek amacıyla hazırlanmıştır. {data.module.copyright}.
                  {data.module.validation && <> {data.module.validation.full}</>}
                </p>
                {data.module.evidence && (
                  <p className="inst-evidence">
                    {data.module.evidence.statement}
                    <sup>
                      <a
                        href={data.module.evidence.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Kaynak: McKinney ve ark., 2013"
                      >
                        [1]
                      </a>
                    </sup>
                    <br />
                    <span className="inst-cite">
                      [1] {data.module.evidence.citation}{" "}
                      <a href={data.module.evidence.url} target="_blank" rel="noreferrer">
                        doi:{data.module.evidence.doi}
                      </a>
                    </span>
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="src-section" aria-labelledby="ds-h">
            <SectionHeading id="ds-h">
              <IconBook /> Ses Veri Setleri
            </SectionHeading>
            <p className="src-sub">
              Yalnız lisansı doğrulanmış ve etiketleri oskültasyon taksonomisine birebir eşlenen açık veri setleri
              kullanılır; uymayan etiketler uydurulmaz.
            </p>
            <div className="ds-grid">
              {data.datasets.map((dataset) => {
                const inventory = inventoryById.get(dataset.id);
                return (
                  <article className="ds-card" key={dataset.id}>
                    <h3>{dataset.title}</h3>
                    <div className="auth">{dataset.authors.join(", ")}</div>
                    <div className="ds-chips">
                      <span className="ds-chip lic">{licenseShort(dataset.license)}</span>
                      {inventory && (
                        <span className="ds-chip">
                          {inventory.status === "bundled" ? "pakete dahil" : "örnek kayıtlar"} ·{" "}
                          {inventory.recordings.toLocaleString("tr-TR")} kayıt
                        </span>
                      )}
                      {inventory?.population && (
                        <span className={`ds-chip ${/pediatrik|gerçek/i.test(inventory.population) ? "real" : ""}`}>
                          {inventory.population}
                        </span>
                      )}
                    </div>
                    <div className="src-kv">
                      <span className="k">Veri seti</span>
                      <span className="v">
                        <a href={doiHref(dataset.datasetDoi)} target="_blank" rel="noreferrer">
                          {dataset.datasetDoi}
                        </a>
                      </span>
                      {dataset.articleDoi && (
                        <>
                          <span className="k">Makale</span>
                          <span className="v">
                            <a href={doiHref(dataset.articleDoi)} target="_blank" rel="noreferrer">
                              {dataset.articleDoi}
                            </a>
                          </span>
                        </>
                      )}
                      <span className="k">Lisans</span>
                      <span className="v">
                        {dataset.licenseUrl ? (
                          <a href={dataset.licenseUrl} target="_blank" rel="noreferrer">
                            {dataset.license}
                          </a>
                        ) : (
                          dataset.license
                        )}
                      </span>
                      {dataset.usage && (
                        <>
                          <span className="k">Kullanım</span>
                          <span className="v">{dataset.usage}</span>
                        </>
                      )}
                    </div>
                    <p className="ds-cite">{dataset.attributionText}</p>
                  </article>
                );
              })}
            </div>
          </section>

          {data.assets && data.assets.length > 0 && (
            <section className="src-section" aria-labelledby="assets-h">
              <SectionHeading id="assets-h">
                <IconDoc /> Görsel Varlıklar
              </SectionHeading>
              <div className="ds-grid">
                {data.assets.map((asset) => (
                  <article className="ds-card" key={asset.id}>
                    <h3>{asset.title}</h3>
                    <div className="auth">
                      {asset.authors.join(", ")} — {asset.source}
                    </div>
                    <div className="ds-chips">
                      <span className="ds-chip lic">{licenseShort(asset.license)}</span>
                    </div>
                    <div className="src-kv">
                      <span className="k">Lisans</span>
                      <span className="v">
                        {asset.licenseUrl ? (
                          <a href={asset.licenseUrl} target="_blank" rel="noreferrer">
                            {asset.license}
                          </a>
                        ) : (
                          asset.license
                        )}
                      </span>
                      <span className="k">Kullanım</span>
                      <span className="v">{asset.usage}</span>
                    </div>
                    <p className="ds-cite">{asset.attributionText}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="src-section" aria-labelledby="disclaimer-h">
            <SectionHeading id="disclaimer-h">
              <IconInfo /> Validasyon, sınırlılıklar ve sorumluluk
            </SectionHeading>
            <div className="src-disclaimer">
              <IconInfo />
              <div>
                <p style={{ margin: 0 }}>
                  {data.module.validation && <>{data.module.validation.full} </>}
                  {data.disclaimer}
                </p>
                <p className="small" style={{ margin: "6px 0 0" }}>
                  Atıf ve katkı verileri makine okunur biçimde <code>src/data/sources.json</code> dosyasında saklanır.
                </p>
              </div>
            </div>
          </section>
    </>
  );
}

/** Kabuk `#/hakkinda` sayfası için: gömülü başlık düzeyi (h2/h3) ve sim stil kapsamı. */
export function AuscultaAbout(): JSX.Element {
  return (
    <EmbeddedProvider embedded={true}>
      <div className="eg-sim-ausculta eg-sim-about">
        <div className="src-wrap">
          <AuscultaAboutContent />
        </div>
      </div>
    </EmbeddedProvider>
  );
}

export function SourcesScreen({ embedded = false }: SourcesScreenProps): JSX.Element {
  const { dispatch } = useStore();

  return (
    <>
      <EcgDeco embedded={embedded} />
      <div className="screen" style={{ position: "relative", zIndex: 1 }}>
        <div className="src-wrap screen-body">
          <AuscultaAboutContent />

          <div className="results-actions" style={{ justifyContent: "flex-start" }}>
            <button
              type="button"
              className="btn outline"
              style={HIT}
              onClick={() => dispatch({ type: "goto", screen: "start" })}
            >
              ← Geri
            </button>
          </div>
        </div>
      </div>
      <Footer embedded={embedded} />
    </>
  );
}
