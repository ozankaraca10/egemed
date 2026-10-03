import type { JSX } from 'react'
import type { ClinicalContext } from '../data/clinicalContext'
import { isExpertSource } from '../core/images'
import type { ImageRecord } from '../core/types'
import { LABEL_SOURCE_TEXT, findingLabel, findingShort } from '../data/terminology'
import type { Vignette, VignetteRef } from '../data/vignettes'

/** T318 — öğrenme modu sağ çerçeve hasta kartı (onaylı maket: "Opaca öğrenme modu — sağ çerçeve
 *  hasta kartı"). Kayıttan gelen bilgi "Gerçek hasta verisi" etiketiyle, kayıt yoksa açık notla
 *  gösterilir. T322: kurgusal başvuru öyküsü ("Kurgusal · eğitim amaçlı") ve ayırıcı tanı ("Eğitim
 *  notu") ayrı etiketle eklenir; yapay zekâ üretimi + Claude denetimi, hekim onayı bekliyor. */

const ICON_PATHS: Record<string, string> = {
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 7v5l3 2',
  pin: 'M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12zm0-9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  layers: 'M12 3 2 8l10 5 10-5-10-5zM2 16l10 5 10-5M2 12l10 5 10-5',
  plus: 'M12 5v14M5 12h14',
  flask: 'M9 3h6M10 3v6L5 19a1.5 1.5 0 0 0 1.3 2h11.4a1.5 1.5 0 0 0 1.3-2L14 9V3',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  check: 'M20 6 9 17l-5-5',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z',
}

/** T324: kaynak kısa adla (kuruluş + yıl); tam başlık title ve erişilebilir adda. */
export function shortRefLabel(title: string): string {
  const year = /\((\d{4})\)/.exec(title)?.[1]
  const words = title.split(/[\s:(—]+/).filter(Boolean)
  const org = words[0]?.endsWith('.') ? words.slice(0, 3).join(' ') : words[0] ?? title
  return year ? `${org} ${year}` : words.slice(0, 2).join(' ')
}

function RefLink({ label, ref }: { label: string; ref: VignetteRef }): JSX.Element {
  return (
    <p className="pcard-ref">
      {label}:{' '}
      <a href={ref.url} target="_blank" rel="noreferrer" title={ref.title}>
        {shortRefLabel(ref.title)} ↗
      </a>
    </p>
  )
}

function RowIcon({ name }: { name: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name] ?? ICON_PATHS['check']} />
    </svg>
  )
}

const SEX_TEXT: Record<string, string> = { F: 'Kadın', M: 'Erkek' }
const VIEW_TEXT: Record<string, string> = { PA: 'PA', AP: 'AP', LAT: 'Lateral', NECK_AP: 'Boyun AP', CT_AXIAL: 'BT aksiyel' }

export interface PatientCardProps {
  readonly image: ImageRecord
  readonly context: ClinicalContext | null
  /** Konu başlığı (kartın üst satırı). */
  readonly topic: string
  readonly exampleNo: number
  /** Konunun bulgusu; kart başlığı bu bulguyu gösterir (görüntüdeki ilk etiketi değil). */
  readonly finding?: string | null
  /** Kurgusal başvuru öyküsü ve ayırıcı tanı (T322); yoksa bu bölümler çizilmez. */
  readonly vignette?: Vignette | null
}

export function PatientCard({ image, context, topic, exampleNo, finding, vignette = null }: PatientCardProps): JSX.Element {
  const real = context?.hasReal === true
  const age = context?.age ?? image.ageYears ?? null
  const sex = context?.sex ?? (image.sex ? SEX_TEXT[image.sex] ?? null : null)
  const rawView = context?.view ?? (image.viewPosition && image.viewPosition !== 'unknown' ? image.viewPosition : null)
  const view = rawView ? VIEW_TEXT[rawView] ?? rawView : null
  const source = context?.source ?? image.sourceDataset
  const title = finding ? findingLabel(finding) : context?.labels[0]?.finding ?? topic
  const labels = context?.labels.length
    ? context.labels.map((label) => ({ text: label.finding, source: label.source, expert: /radyolog|uzman/i.test(label.source) }))
    : Object.entries(image.findings).map(([finding, src]) => ({ text: findingShort(finding), source: LABEL_SOURCE_TEXT[src] ?? src, expert: isExpertSource(src) }))
  return (
    <article className="pcard" aria-labelledby="pcard-title">
      {/* T324: başlık ve kimlik tek satır; kayıt etiketi başlıkta (dikey yer kazanımı). */}
      <header className="pcard-h">
        <h3 id="pcard-title">Örnek {exampleNo} · {title}</h3>
        {real ? <span className="ptag real"><i aria-hidden="true" />Gerçek hasta verisi</span> : <span className="ptag none"><i aria-hidden="true" />Kayıt yok</span>}
      </header>
      <p className="pcard-meta">
        {[age !== null ? (typeof age === 'number' ? `${age} yaş` : age) : null, sex, view ?? 'Çekim belirtilmemiş', source].filter(Boolean).join(' · ')}
      </p>
      {/* Klinik kayıt yalnız kayıtta yaş/cinsiyet/çekim dışında bilgi varsa çizilir. */}
      {context && context.items.length > 0 ? (
        <section className="pcard-sec" aria-label="Klinik kayıt">
          <div className="pcard-sec-h">
            <h4>Klinik kayıt</h4>
          </div>
          <ul className="pcard-rows">
            {context.items.map((row, index) => (
              <li key={index}>
                <RowIcon name={row.icon} />
                <span className="k">{row.label}</span>
                <b>{row.value}</b>
              </li>
            ))}
          </ul>
          {context.orig ? (
            <details className="pcard-orig">
              <summary>Orijinal kayıt (İngilizce)</summary>
              <p lang="en">{context.orig}</p>
            </details>
          ) : null}
        </section>
      ) : null}
      {vignette ? (
        <>
          <section className="pcard-sec" aria-label="Başvuru öyküsü">
            <div className="pcard-sec-h">
              <h4>Başvuru öyküsü</h4>
              <span className="ptag fic"><i aria-hidden="true" />Kurgusal · eğitim amaçlı</span>
            </div>
            <ul className="pcard-story">
              {vignette.presentation.map((line, index) => <li key={index}>{line}</li>)}
            </ul>
            <RefLink label="Kaynak" ref={vignette.presentationRef} />
          </section>
          <section className="pcard-sec" aria-label="Ayırıcı tanıda düşün">
            <div className="pcard-sec-h">
              <h4>Ayırıcı tanıda düşün</h4>
              <span className="ptag note"><i aria-hidden="true" />Eğitim notu</span>
            </div>
            <ol className="pcard-dd">
              {vignette.differential.map((entry, index) => (
                <li key={index}>
                  <span className="n" aria-hidden="true">{index + 1}</span>
                  <div><b>{entry.dx}</b><span>{entry.clue}</span></div>
                </li>
              ))}
            </ol>
            <RefLink label="Kaynak" ref={vignette.differentialRef} />
            <div className="pcard-pearl">
              <RowIcon name="bulb" />
              <p>
                {vignette.pearl.text}{' '}
                <span className="pcard-ref-inline">
                  Kaynak:{' '}
                  <a href={vignette.pearl.ref.url} target="_blank" rel="noreferrer" title={vignette.pearl.ref.title}>
                    {shortRefLabel(vignette.pearl.ref.title)} ↗
                  </a>
                </span>
              </p>
            </div>
          </section>
        </>
      ) : null}
      <section className="pcard-sec" aria-label="Görüntü etiketleri">
        <div className="pcard-sec-h"><h4>Görüntü etiketleri</h4></div>
        <ul className="pcard-labels">
          {labels.map((label, index) => (
            <li key={index} className={label.expert ? 'expert' : 'auto'}>
              <b>{label.text}</b>
              <span>{label.source}</span>
            </li>
          ))}
        </ul>
      </section>
      <footer className="pcard-src">
        {vignette ? (
          <span className="pcard-review">
            <i aria-hidden="true" />
            Kurgusal öykü ve eğitim notları yapay zekâ ile üretildi, kayıtla tutarlılık için denetlendi; hekim onayı bekliyor.{' '}
          </span>
        ) : null}
        {real ? 'Klinik kayıt bölümü kayıttan yalnız çeviridir. ' : ''}
        Hekim onayı: {image.clinicalReview === 'onayli' ? 'onaylı' : 'beklemede'}.
        {image.license ? (
          <>
            {' '}
            {image.license.attribution} ·{' '}
            <a href={image.license.sourceUrl} target="_blank" rel="noreferrer">
              kaynak
            </a>
          </>
        ) : null}
      </footer>
    </article>
  )
}
