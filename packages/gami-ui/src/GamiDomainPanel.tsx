import type { GamiDomainItem } from "./types";

export function GamiDomainPanel({ items }: { items: GamiDomainItem[] }) {
  if (items.length === 0) return <p className="eg-gami-note">Bu dönemde değerlendirme oturumu yok.</p>;
  return (
    <div className="domain-rows eg-gami-domains">
      {items.map((r) => (
        <div className="domain-row" key={r.key}>
          <span className="dr-ic">{r.icon}</span>
          <span className="dr-lbl">{r.label}{r.weak && <> <span className="badge orange">zayıf</span></>}</span>
          <span className="domain-bar" aria-hidden="true"><i style={{ width: `${r.pct}%` }} /></span>
          <span className="dr-pct">%{r.pct}</span>
        </div>
      ))}
    </div>
  );
}
