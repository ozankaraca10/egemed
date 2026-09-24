import { useEffect, useState, type JSX } from 'react'
import { useStore } from '../core/StoreProvider'
import { loadFsPromptDone, saveFsPromptDone } from '../core/reducer'
import type { WindowLike } from '../core/lifecycle'
import { computeMetrics } from '../data/metrics'
import sourcesData from '../data/sources.json'
import { Footer } from '../ui/chrome'
import { ConfirmModal } from '../ui/ConfirmModal'
import { IconArrowRight, IconInfo } from '../ui/icons'
import type { ChromeEnv } from '../ui/chrome'
import { createNoopChromeEnv } from '../ui/chrome'
import { createNoopModalEnv, type ModalEnv } from '../ui/modal-env'

const M = computeMetrics()
const VAL_SHORT = (sourcesData as { module: { validationShort?: string } }).module.validationShort
  ?? 'Radyoloji Anabilim Dalı öğretim üyelerince valide edilmiştir.'

const FS_PROMPT_DELAY_MS = 500

/** Tam ekran istemi pencere yüzeyi (S7/S8 `ChromeEnv` ile uyumlu; `fullscreenEnabled` ek alan). */
export interface StartScreenEnv extends ChromeEnv {
  readonly fullscreenEnabled: boolean
}

export function createNoopStartScreenEnv(): StartScreenEnv {
  return { ...createNoopChromeEnv(), fullscreenEnabled: false }
}

export interface StartScreenProps {
  /** Platform kabuğu modu: footer çizilmez (§7.3). */
  readonly embedded?: boolean
  /** Tam ekran ve klavye sınırı; verilmezse güvenli no-op. */
  readonly env?: StartScreenEnv
  /** Modal odak/Esc sınırı; verilmezse güvenli no-op. */
  readonly modalEnv?: ModalEnv
  /** Zamanlayıcı yüzeyi (kaynak `window.setTimeout`); verilmezse istem açılmaz. */
  readonly timing?: WindowLike
}

/** A1: açılışta tam ekran önerisi — ConfirmModal kalıbıyla, "Tekrar sorma" onay kutusu ile. */
function FullscreenPrompt({
  env,
  modalEnv,
  timing,
}: {
  readonly env: StartScreenEnv
  readonly modalEnv: ModalEnv
  readonly timing: WindowLike
}) {
  const { storage } = useStore()
  const [open, setOpen] = useState(false)
  const [dontAsk, setDontAsk] = useState(false)

  useEffect(() => {
    if (!env.fullscreenEnabled || env.fullscreenElement !== null) return
    if (loadFsPromptDone(storage)) return
    const handle = timing.setTimeout(() => setOpen(true), FS_PROMPT_DELAY_MS)
    return () => timing.clearTimeout(handle)
  }, [env, storage, timing])

  const ack = () => {
    if (dontAsk) saveFsPromptDone(storage)
  }
  const confirm = () => {
    ack()
    setOpen(false)
    env.requestFullscreen()
  }
  const cancel = () => {
    ack()
    setOpen(false)
  }

  return (
    <ConfirmModal
      open={open}
      title="Tam ekran önerilir"
      message="EGEMED Opaca en iyi deneyimi tam ekranda sunar. İstediğiniz zaman üst çubuktaki tam ekran düğmesi ya da F tuşuyla değiştirebilirsiniz."
      confirmLabel="Tam ekrana geç"
      cancelLabel="Böyle devam et"
      onConfirm={confirm}
      onCancel={cancel}
      env={modalEnv}
    >
      <label className="tut-again">
        <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(Boolean((e.target as { checked?: boolean }).checked))} />
        Tekrar sorma
      </label>
    </ConfirmModal>
  )
}

/** Başlangıç ekranı: marka, değer önerisi, veri odaklı güven kutuları. */
export function StartScreen({
  embedded = false,
  env = createNoopStartScreenEnv(),
  modalEnv = createNoopModalEnv(),
  timing,
}: StartScreenProps): JSX.Element {
  const { dispatch, bus } = useStore()
  const begin = () => {
    bus.emit({ type: 'simulation_started' })
    dispatch({ type: 'goto', screen: 'modes' })
  }
  const whyBoxes = [
    {
      label: `${M.images} radyolojik görüntü`,
      desc: M.datasetsUsed ? `${M.datasetsUsed} açık veri setinden, lisansı ve atfı belgelenmiş.` : 'Veri setleri içe aktarıldığında burada listelenir.',
    },
    { label: `${M.expertImages} radyolog etiketli film`, desc: `${M.annotatedImages} filmde bulgunun yeri uzman tarafından işaretlenmiş. ${VAL_SHORT}` },
    { label: `${M.totalCases} vaka · ${M.zones} okuma bölgesi`, desc: 'Her oturumda rastgele 10 vaka; rapor tabanlı etiketler değerlendirmeye girmez.' },
  ]
  const inertTiming: WindowLike = {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    visibilityState: 'visible',
  }
  return (
    <div className="screen start-hero-screen">
      <div className="hero-glow" aria-hidden="true" />
      <div className="start-hero">
        <div className="start-card">
          <div className="start-card-inner">
            <img className="hero-logo" src="brand/logo-horizontal-web.png" alt="EGEMED Opaca — Radyolojik Görüntüleme Simülatörü" />
            <h1 className="hero-title">Radyolojik görüntüyü sistematik okumayı gerçek verilerle öğrenin.</h1>
            <p className="hero-sub">
              Akciğer grafisi ve toraks BT; {M.libraryItems} konu başlığı, ABCDE okuma rehberi ve görüntü
              üzerinde işaretleme; SCORM uyumlu ölçme ve değerlendirme.
            </p>
            <button className="hero-cta" onClick={begin}>
              Simülatörü başlat <IconArrowRight />
            </button>
            <div className="hero-links">
              <button className="hero-link" onClick={() => dispatch({ type: 'goto', screen: 'tutorial' })}>Nasıl kullanılır?</button>
              <span className="hero-link-sep" aria-hidden="true" />
              <button className="hero-link" onClick={() => dispatch({ type: 'goto', screen: 'sources' })}>
                <IconInfo /> Hakkında ve kaynaklar
              </button>
            </div>
            <div className="why-section" aria-label="Neden güvenilir?">
              <p className="why-title">Neden güvenilir?</p>
              <div className="why-grid">
                {whyBoxes.map((w) => (
                  <div className="why-box" key={w.label}>
                    <b>{w.label}</b>
                    <span>{w.desc}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="hero-display-hint">En iyi görüntü için ekran parlaklığını artırın ve ortam ışığını azaltın.</p>
          </div>
        </div>
      </div>
      <Footer embedded={embedded} />
      <FullscreenPrompt env={env} modalEnv={modalEnv} timing={timing ?? inertTiming} />
    </div>
  )
}
