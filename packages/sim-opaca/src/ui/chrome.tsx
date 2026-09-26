import { useEffect, useRef, useState, type ComponentType, type JSX, type ReactNode } from 'react'
import type { SimChrome, SimChromeAction, SimChromeChip } from '@egemed/sim-host'
import { useStore } from '../core/StoreProvider'
import { needsExitConfirm, stepBackTarget } from '../core/flow'
import type { Mode, Screen } from '../core/types'
import { assetUrl } from '../core/images'
import { useSetChrome } from '../EmbeddedContext'
import { IconFullscreen, IconFullscreenExit, IconHelpCircle, IconInfo, IconSwap, IconTrophy } from './icons'

const STEP_LABELS = ['Mod seçimi', 'Çalışma', 'Tamamla'] as const

function stepFor(screen: Screen, previous: number): number {
  if (screen === 'modes') return 0
  if (screen === 'learn' || screen === 'simulation') return 1
  if (screen === 'results') return 2
  return previous
}

function modeTone(mode: Mode): NonNullable<SimChromeChip['tone']> {
  if (mode === 'learn') return 'learn'
  if (mode === 'practice') return 'practice'
  return 'assessment'
}

function chromeKey(chrome: SimChrome): string {
  return JSON.stringify({
    steps: chrome.steps,
    chips: chrome.chips,
    actions: (chrome.actions ?? []).map((action) => ({ id: action.id, label: action.label, pressed: action.pressed ?? false })),
  })
}

/** Aynı içerik tekrar gönderilmez. Kapanış, bekleyen gönderimi düşürür. */
function usePublishChrome(chrome: SimChrome | null): void {
  const setChrome = useSetChrome()
  const token = useRef(0)
  const lastKey = useRef('')
  const key = chrome === null ? '' : chromeKey(chrome)
  if (setChrome && chrome && key !== lastKey.current) {
    lastKey.current = key
    const ticket = ++token.current
    const publish = setChrome
    const snapshot = chrome
    void Promise.resolve().then(() => {
      if (token.current === ticket) publish(snapshot)
    })
  }
  useEffect(() => {
    if (!setChrome) return
    return () => {
      token.current += 1
      setChrome(null)
    }
  }, [setChrome])
}

/** Opaca kabuğu — üst bar, footer, arka plan (kaynak `ui/chrome.tsx` portu; E2 §7.3/§8 S8).
 *
 *  Port notları:
 *  - **Gömülü mod:** platform kabuğu içinde `embedded` iken Opaca'nın kendi üst barı ve footer'ı
 *    ÇİZİLMEZ (çift üst bar/footer oluşmaz, §7.3); sim içi kontroller kompakt `eg-sim-toolbar`
 *    olarak kalır. Bağımsız mod (`embedded=false`) kaynakla aynıdır. Araç çubuğu kaynak
 *    `styles.css`'te yoktur; kapsamlı CSS'i S21–S23 dilimlerine aittir (özet notu).
 *  - Pencere/belge erişimi doğrudan değil `ChromeEnv` ile enjekte edilir (§7.5 S7 deseni);
 *    `Date.now()` kullanılmaz (AGENTS.md).
 *  - Modaller (`HelpModal`/`ConfirmModal`) S9 diliminde taşınır; burada `modals` seam'i ile
 *    bağlanır. Seam verilmezse çizilmez ve değerlendirmede çıkış onayı atlanır (S19 kabuğu gerçek
 *    modalleri bağlar).
 *  - Oyunlaştırma çipi §7.7 gereği bayrak kapalıyken çizilmez; bayrak `gamiEnabled` prop'udur
 *    (G4'te `gamification/flag` portu gelince bağlanır).
 *  - Marka görselleri `assetUrl` ile platform taban yoluna (`assetBase`, S19) çözümlenir. */

/** A1 "F" kısayolunun kullandığı klavye olayı yüzeyi (kaynak: `KeyboardEvent`). */
export interface ChromeKeyEvent {
  readonly key: string
  readonly altKey: boolean
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  /** Kaynak: `e.target as HTMLElement` — form alanı/`contentEditable` kontrolü. */
  readonly target: { readonly tagName: string; readonly isContentEditable: boolean } | null
  preventDefault(): void
}

/** Üst barın pencere/belge sınırı: tam ekran, klavye kısayolu, açık pencere ve teşhis sorgusu.
 *  Üretimde kabuk gerçek `document`/`window` vekilini enjekte eder; testler sahte nesne verir.
 *  Kimlik mount boyunca sabit olmalıdır (dinleyici effect'inin bağımlılığıdır). */
export interface ChromeEnv {
  /** Kaynak: `document.addEventListener` — `fullscreenchange` ve `keydown`. */
  addEventListener(type: 'fullscreenchange', handler: () => void): void
  addEventListener(type: 'keydown', handler: (event: ChromeKeyEvent) => void): void
  removeEventListener(type: 'fullscreenchange', handler: () => void): void
  removeEventListener(type: 'keydown', handler: (event: ChromeKeyEvent) => void): void
  /** Kaynak: `document.fullscreenElement`; null ise tam ekran kapalı. */
  readonly fullscreenElement: unknown
  requestFullscreen(): void
  exitFullscreen(): void
  /** Açık pencere var mı (kaynak: `document.querySelector('.modal-overlay')`). */
  hasOpenModal(): boolean
  /** Geliştirici build işareti (kaynak: `runtime.flags.dev`; port çalışma zamanı SCORM bayrağı taşımaz). */
  readonly devBuild: boolean
  /** `?dev=1` teşhis sorgusu (kaynak: `window.location.search`). */
  readonly devQuery: boolean
}

/** Güvenli varsayılan: dinleyici yok, tam ekran yok, teşhis kapalı (SSR/statik render). */
export function createNoopChromeEnv(): ChromeEnv {
  return {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    fullscreenElement: null,
    requestFullscreen: () => undefined,
    exitFullscreen: () => undefined,
    hasOpenModal: () => false,
    devBuild: false,
    devQuery: false,
  }
}

const NOOP_CHROME_ENV: ChromeEnv = createNoopChromeEnv()

/** S9 `ui/HelpModal.tsx` sözleşmesi. */
export interface HelpModalSeamProps {
  readonly open: boolean
  readonly onClose: () => void
}

/** S9 `ui/ConfirmModal.tsx` sözleşmesi (isteğe bağlı `children` seam'e girmez). */
export interface ConfirmModalSeamProps {
  readonly open: boolean
  readonly title: string
  readonly message: string
  readonly confirmLabel: string
  readonly cancelLabel: string
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

/** S9'da taşınacak modaller; verilmezse çizilmez. S19 kabuğu gerçek bileşenleri bağlar. */
export interface ChromeModals {
  readonly help?: ComponentType<HelpModalSeamProps>
  readonly confirm?: ComponentType<ConfirmModalSeamProps>
}

export interface HeaderProps {
  /** Platform kabuğu modu: Opaca üst barı yerine kompakt sim araç çubuğu çizilir (§7.3). */
  readonly embedded?: boolean
  /** Pencere/belge sınırı; verilmezse güvenli no-op kullanılır. */
  readonly env?: ChromeEnv
  /** S9 modalleri; verilmezse modaller çizilmez. */
  readonly modals?: ChromeModals
  /** Oyunlaştırma bayrağı (§7.7, G4); varsayılan kapalı. */
  readonly gamiEnabled?: boolean
}

export function BrandMark({ size = 30 }: { size?: number }) {
  return <img src={assetUrl('brand/logo-icon-white-web.png')} alt="" width={size} height={size} className="brand-mark" />
}

export function Header({ embedded = false, env = NOOP_CHROME_ENV, modals, gamiEnabled = false }: HeaderProps): JSX.Element {
  const { state, dispatch } = useStore()
  const [fs, setFs] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  // O6: değerlendirme sırasında marka/"Mod Değiştir" doğrudan çıkmaz — önce onay istenir.
  const [exitTarget, setExitTarget] = useState<'start' | 'modes' | null>(null)
  const modeShort = state.mode === 'learn' ? 'Öğrenme' : state.mode === 'practice' ? 'Uygulama' : 'Değerlendirme'
  const modeLabel = `${modeShort} Modu`
  const inAssessment = state.mode === 'assessment' && state.screen === 'simulation'
  const inWorkScreen = state.screen === 'simulation' || state.screen === 'learn'
  // T183: uygulama VE değerlendirme sırasında (öğrenmede değil) mod seçimine dönüş onay ister.
  const activeSession = needsExitConfirm(state.screen)

  useEffect(() => {
    const onFs = () => setFs(env.fullscreenElement !== null)
    env.addEventListener('fullscreenchange', onFs)
    return () => env.removeEventListener('fullscreenchange', onFs)
  }, [env])

  const toggleFs = () => {
    if (env.fullscreenElement === null) env.requestFullscreen()
    else env.exitFullscreen()
  }

  // A1: "F" kısayolu tam ekranı açar/kapatır — form alanı, sözleşilebilir içerik ya da
  // açık bir pencere (dialog) varken devre dışı; odak düğmelerden herhangi birindeyken de çalışır.
  useEffect(() => {
    const onKey = (e: ChromeKeyEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.key.toLowerCase() !== 'f') return
      const t = e.target
      if (t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable)) return
      if (env.hasOpenModal()) return
      e.preventDefault()
      toggleFs()
    }
    env.addEventListener('keydown', onKey)
    return () => env.removeEventListener('keydown', onKey)
  }, [env])

  const goStart = () => (inAssessment && modals?.confirm ? setExitTarget('start') : dispatch({ type: 'goto', screen: 'start' }))
  const goModes = () => (activeSession && modals?.confirm ? setExitTarget('modes') : dispatch({ type: 'goto', screen: 'modes' }))
  const confirmExit = () => {
    if (exitTarget) dispatch({ type: 'goto', screen: exitTarget })
    setExitTarget(null)
  }
  // T183: header adım göstergesi — kabuk yalnız tamamlanan adımlar (index < current) için
  // çağırır; anlamlı tek geri hedef adım 0'dır (mod seçimi), diğerleri yok sayılır (belgeli).
  const onStepSelect = (index: number) => {
    if (stepBackTarget(index) === 'modes') goModes()
  }

  const setChrome = useSetChrome()
  const unified = embedded && setChrome !== undefined
  const stepRef = useRef(0)
  const step = stepFor(state.screen, stepRef.current)
  stepRef.current = step
  const chips: SimChromeChip[] = []
  if (unified && inWorkScreen) chips.push({ id: 'mode', label: modeLabel, tone: modeTone(state.mode) })
  if (unified && inAssessment) chips.push({ id: 'timer', label: fmtTimer(state.assessmentTimer), tone: 'neutral' })
  const actions: SimChromeAction[] = []
  if (unified && inWorkScreen) actions.push({ id: 'modes', icon: 'swap', label: 'Mod değiştir', onSelect: goModes })
  if (unified && gamiEnabled) {
    actions.push({
      id: 'progress',
      icon: 'progress',
      label: 'İlerlemem',
      onSelect: () => dispatch({ type: 'goto', screen: 'achievements' }),
    })
  }
  if (unified) {
    actions.push({
      id: 'fullscreen',
      icon: 'fullscreen',
      label: fs ? 'Tam ekrandan çık' : 'Tam ekran',
      pressed: fs,
      onSelect: toggleFs,
    })
    actions.push({ id: 'help', icon: 'help', label: 'Yardım', onSelect: () => setHelpOpen(true) })
  }
  usePublishChrome(
    unified ? { actions, chips, steps: { current: step, labels: STEP_LABELS, onSelect: onStepSelect } } : null
  )

  const HelpModal = modals?.help
  const ConfirmModal = modals?.confirm
  const helpModal = HelpModal ? <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} /> : null
  // T183: değerlendirmede süre kaybı uyarısı; uygulamada ilerlemenin kaydedilmediği uyarısı.
  const confirmTitle = state.mode === 'assessment' ? 'Değerlendirmeden çıkılsın mı?' : 'Çalışmadan çıkılsın mı?'
  const confirmMessage =
    state.mode === 'assessment'
      ? 'İlerlemeniz kaydedilir, oturum devam ettirilebilir. Süre işlemeye devam eder; kaybedilen süre geri gelmez.'
      : 'İlerleme kaydedilmez.'
  const confirmModal = ConfirmModal ? (
    <ConfirmModal
      open={exitTarget !== null}
      title={confirmTitle}
      message={confirmMessage}
      confirmLabel="Çık"
      cancelLabel="Vazgeç"
      onConfirm={confirmExit}
      onCancel={() => setExitTarget(null)}
    />
  ) : null

  // Birleşik bar: araç çubuğu çizilmez; Yardım ve çıkış onayı sim içinde kalır.
  if (unified) return <>{helpModal}{confirmModal}</>

  // Gömülü mod (setChrome yok): kabuğun üst barı tek kalır; sim içi kontroller kompakt çubukta sürer.
  if (embedded) {
    return (
      <nav className="eg-sim-toolbar" aria-label="Simülatör araç çubuğu">
        {inWorkScreen && (
          <span className={`eg-mode-chip ${state.mode}`} aria-label={modeLabel}>
            <span className="lbl-full">{modeLabel}</span>
            <span className="lbl-short" aria-hidden="true">{modeShort}</span>
          </span>
        )}
        {inAssessment && (
          <span className="eg-timer" aria-live="off">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
            {fmtTimer(state.assessmentTimer)}
          </span>
        )}
        <span className="eg-sim-toolbar__spacer" />
        {inWorkScreen && (
          <button
            className="eg-header-chip clickable"
            onClick={goModes}
            aria-label="Mod değiştir"
            title="Mod seçim ekranına dön"
          >
            <IconSwap /> <span className="chip-text">Mod Değiştir</span>
          </button>
        )}
        <button className="eg-header-chip clickable" onClick={() => setHelpOpen(true)} aria-label="Yardım" title="Yardım">
          <IconHelpCircle /> <span className="chip-text">Yardım</span>
        </button>
        {helpModal}
        {confirmModal}
      </nav>
    )
  }

  return (
    <header className="eg-header">
      <button className="eg-brand" onClick={goStart} aria-label="Ana ekran">
        <BrandMark size={32} />
        <span className="brand-block">
          <span className="brand-top">EGEMED</span>
          <span className="brand-name">Opaca<sup className="tm">™</sup></span>
        </span>
      </button>
      <span className="divider-v app-subtitle-sep" aria-hidden="true" />
      <span className="app-subtitle">Radyolojik Görüntüleme Simülatörü</span>
      <div className="spacer" />
      {/* madde 3: header'ın ortasında tek bir "bağlam grubu" — mod çipi + (değerlendirmede) zamanlayıcı */}
      {inWorkScreen && (
        <div className="eg-header-context">
          {state.screen === 'simulation' && (
            <span className={`eg-mode-chip ${state.mode}`} aria-label={modeLabel}>
              <span className="lbl-full">{modeLabel}</span>
              <span className="lbl-short" aria-hidden="true">{modeShort}</span>
            </span>
          )}
          {state.mode === 'assessment' && state.screen === 'simulation' && (
            <span className="eg-timer" aria-live="off">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
              {fmtTimer(state.assessmentTimer)}
            </span>
          )}
        </div>
      )}
      <div className="spacer" />
      {inWorkScreen && (
        <button
          className="eg-header-chip clickable hide-mobile"
          onClick={goModes}
          aria-label="Mod değiştir"
          title="Mod seçim ekranına dön"
        >
          <IconSwap /> <span className="chip-text">Mod Değiştir</span>
        </button>
      )}
      {/* Oyunlaştırma: yalnız bayrak açıkken; simülasyon (uygulama/değerlendirme) sırasında hiç render edilmez */}
      {gamiEnabled && state.screen !== 'simulation' && (
        <>
          <button
            className="eg-header-chip clickable gami-chip"
            onClick={() => dispatch({ type: 'goto', screen: 'achievements' })}
            aria-label="Başarılarım"
            aria-current={state.screen === 'achievements' || state.screen === 'leaderboard' ? 'page' : undefined}
            title="Başarılarım"
          >
            <IconTrophy /> <span className="chip-text">Başarılarım</span>
          </button>
          <span className="divider-v" />
        </>
      )}
      <button
        className="eg-header-chip clickable hide-mobile"
        onClick={toggleFs}
        aria-label={fs ? 'Tam ekrandan çık' : 'Tam ekran'}
        title={fs ? 'Tam ekrandan çık' : 'Tam ekran (F)'}
      >
        {fs ? <IconFullscreenExit /> : <IconFullscreen />} <span className="chip-text">{fs ? 'Tam ekrandan çık' : 'Tam ekran'}</span>
      </button>
      <span className="divider-v" />
      <button className="eg-header-chip clickable" onClick={() => setHelpOpen(true)} aria-label="Yardım" title="Yardım">
        <IconHelpCircle /> <span className="chip-text">Yardım</span>
      </button>
      <button
        className="eg-header-chip clickable"
        onClick={() => dispatch({ type: 'goto', screen: 'sources' })}
        aria-label="Hakkında"
        title="EGEMED Opaca Hakkında"
      >
        <IconInfo /> <span className="chip-text">Hakkında</span>
      </button>
      {/* wave 2 madde 0: DEV rozeti header'ın en sağında, Hakkında'dan sonra — footer'a hiç binmez */}
      {env.devBuild && !env.devQuery && (
        <span className="eg-dev-badge" title="Geliştirici build — teşhis paneli için ?dev=1 ekleyin">DEV</span>
      )}
      {helpModal}
      {confirmModal}
    </header>
  )
}

function fmtTimer(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export interface FooterProps {
  /** Platform kabuğu modu: footer çizilmez — kabuk kendi footer'ını taşır (§7.3). */
  readonly embedded?: boolean
}

export function Footer({ embedded = false }: FooterProps): ReactNode {
  if (embedded) return null
  return (
    <footer className="eg-footer">
      <div className="footer-left">
        <img src={assetUrl('brand/logo-icon-web.png')} alt="" className="footer-seal" />
        <span className="footer-text">
          <span className="footer-brand">EGEMED Opaca<sup className="tm">™</sup></span>
          <span className="footer-sub"> Radyolojik Görüntüleme Simülatörü</span>
          <span className="footer-inst">, Ege Üniversitesi Tıp Fakültesi Dekanlığı tarafından geliştirilmiştir.</span>
          <span className="footer-copy"> Tüm hakları saklıdır © 2026</span>
        </span>
      </div>
      <div className="footer-right">
        <span className="footer-attr2">Görüntüler: NIH Clinical Center (ChestX-ray14) · RSNA/STR açıklamaları</span>
      </div>
    </footer>
  )
}

export interface EcgDecoProps {
  /** Platform kabuğu modu: arka plan yıkaması çizilmez — zemin kabuğundur (§7.3). */
  readonly embedded?: boolean
}

/** madde 2: EKG dekorasyonu kaldırıldı (footer'ın üstüne biniyordu, her ekranda aynı
 *  yerde içerikle çakışıyordu) — yalnız hafif arka plan yıkaması kalır. */
export function EcgDeco({ embedded = false }: EcgDecoProps): ReactNode {
  if (embedded) return null
  return (
    <div className="app-bg" aria-hidden="true">
      <div className="bg-wash" />
    </div>
  )
}
