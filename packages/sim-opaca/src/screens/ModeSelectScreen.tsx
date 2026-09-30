import type { JSX } from 'react'
import type { SimAudience } from '@egemed/sim-host'
import { audienceCanUseMode, VISITOR_LOCK_TEXT } from '@egemed/sim-host'
import { useLearnGate, useStartMode } from '../core/LearnGate'
import { modeLearnLocked, modePickTarget } from '../core/flow'
import { useStore } from '../core/StoreProvider'
import { useGamiContext } from '../gamification/GamiContext'
import type { Mode } from '../core/types'
import { CASE_INVENTORY } from '../data/inventory'
import { LIBRARY_ITEMS } from '../data/terminology'
import { Footer, EcgDeco } from '../ui/chrome'
import { useOpenChallenges, useSessions, useSetChrome } from '../EmbeddedContext'
import { IconGift, IconLock } from '../ui/icons'
import { GamiModeJourney, type GamiModeCard } from '@egemed/gami-ui'
import { opacaGamiIcons } from '../ui/opacaGami'

/** Sunucu oturumu vaka sayısı (banka `SESSION_CASE_COUNT` ile aynı). */
const SESSION_SIZE = 10

/** Ay sonuna kalan tam gün (TR; kaynak `gamification/leaderboardView.ts:daysLeft`). */
function daysLeftInMonth(nowMs: number): number {
  const TR_OFFSET_MS = 3 * 60 * 60 * 1000
  const now = new Date(nowMs)
  const w = new Date(now.getTime() + TR_OFFSET_MS)
  const nextMonthFirst = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth() + 1, 1, 0, 0, 0, 0) - TR_OFFSET_MS)
  const endOfMonth = new Date(nextMonthFirst.getTime() - 1)
  return Math.ceil((endOfMonth.getTime() + 1 - now.getTime()) / 86_400_000)
}

export interface ModeSelectScreenProps {
  /** Platform kabuğu modu: dekorasyon ve footer çizilmez (§7.3). */
  readonly embedded?: boolean
  /** Oyunlaştırma bayrağı (§7.7, G4); varsayılan kapalı. */
  readonly gamiEnabled?: boolean
  /** Kitle (T175); yoksa `student` (geriye uyum). */
  readonly audience?: SimAudience
  /** Ziyaretçi kilidindeki "Öğrenci girişi" eylemi. */
  readonly requestSignIn?: () => void
}

/** Mod seçim ekranı (T289): ortak dört modlu yolculuk — Öğrenme / Uygulama / Değerlendirme / Meydan Okuma. */
export function ModeSelectScreen({
  embedded = false,
  gamiEnabled = false,
  audience = 'student',
  requestSignIn,
}: ModeSelectScreenProps): JSX.Element {
  const { state, dispatch, now } = useStore()
  const unified = useSetChrome() !== undefined
  const practiceCount = CASE_INVENTORY.practicePoolSize
  const assessmentCount = CASE_INVENTORY.assessmentPoolSize
  const isVisitor = audience === 'visitor'
  const isFaculty = audience === 'faculty'
  const gate = useLearnGate()
  const startMode = useStartMode()
  // T253a: "ayın ödülü" satırı yalnız kabuk kanalında geçerli ödül varsa çizilir.
  const { rewardsSnapshot } = useGamiContext()
  const monthlyReward = rewardsSnapshot?.current ?? null
  // Ziyaretçi kilidi gönderim kilidi değildir: kart pasifleşmez, düğme girişe yönlendirir.
  const canPractice = audienceCanUseMode(audience, 'practice')
  const canAssessment = audienceCanUseMode(audience, 'assessment')
  // A2.3: uygulama/değerlendirme vakaları yalnız sunucu oturumundan gelir; kanal yoksa kapalı.
  const serverReady = useSessions() !== undefined
  // T218: öğrenme tamamlanmadan uygulama/değerlendirme KİLİTLİDİR (öneri değil);
  // kart pasifleşir ve istek öğrenme ekranına düşer (tek koruma: `canStartMode`).
  const practiceLocked = modeLearnLocked(gate.complete, practiceCount > 0)
  const assessmentLocked = modeLearnLocked(gate.complete, assessmentCount > 0)
  const signIn = () => requestSignIn?.()
  const pick = (mode: Mode) => {
    const poolReady = mode === 'practice' ? practiceCount > 0 : mode === 'assessment' ? assessmentCount > 0 : true
    const target = modePickTarget(mode, gate.complete, poolReady)
    startMode(target)
    if (target === 'learn') dispatch({ type: 'goto', screen: 'learn' })
  }
  const openChallenges = useOpenChallenges()
  const winners = monthlyReward?.winnersCount
  const cards: GamiModeCard[] = [
    {
      key: 'learn',
      title: 'Öğrenme Modu',
      description: `${LIBRARY_ITEMS.length} konuyu örnek filmler, okuma bölgeleri ve uzman işaretlemeleriyle inceleyin.`,
      bullets: ['ABCDE okuma rehberi', 'Uzman işaretlemesi açılıp kapanır', 'Süre ve puan yok'],
      progress: gate.total > 0 ? gate.openedCount / gate.total : 0,
      cta: gate.openedCount > 0 ? 'Öğrenmeye devam et' : 'Öğrenmeye başla',
      onSelect: () => pick('learn'),
    },
    {
      key: 'practice',
      title: 'Uygulama Modu',
      description: practiceCount ? `${practiceCount} vakalık havuzdan her oturumda rastgele ${Math.min(SESSION_SIZE, practiceCount)} vaka; ipucu ve geri bildirimle.` : 'Uygulama havuzu boş: önce veri setini içe aktarın.',
      bullets: ['Görüntü üzerinde işaretleme', 'İpucu desteği', 'Yanıttan sonra uzman işaretlemesi'],
      status: state.bestScore.practice > 0 ? `En iyi puan: ${state.bestScore.practice}` : 'Henüz denenmedi',
      audienceLocked: !canPractice,
      learnLocked: canPractice && practiceLocked,
      lockText: !canPractice ? VISITOR_LOCK_TEXT.modeLocked : gate.lockText,
      cta: !canPractice ? VISITOR_LOCK_TEXT.cta : practiceLocked ? 'Önce öğrenme modunu tamamlayın' : 'Vakaları çöz',
      disabled: canPractice && (practiceLocked || !practiceCount || !serverReady),
      onSelect: !canPractice ? signIn : () => pick('practice'),
    },
    {
      key: 'assessment',
      title: 'Değerlendirme Modu',
      description: assessmentCount ? `${assessmentCount} radyolog etiketli vakalık havuzdan rastgele ${Math.min(SESSION_SIZE, assessmentCount)} vaka; puan sıralamaya girer.` : 'Değerlendirme havuzu boş: radyolog etiketli veri seti içe aktarılmalı.',
      bullets: ['İpucu yok · geri bildirim sonda', 'Vaka başına süre sınırı', 'Puan kaydedilir, liderliğe girer'],
      status: state.bestScore.assessment > 0 ? `En iyi puan: ${state.bestScore.assessment}` : 'Henüz denenmedi',
      audienceLocked: !canAssessment,
      learnLocked: canAssessment && assessmentLocked,
      lockText: !canAssessment ? VISITOR_LOCK_TEXT.modeLocked : gate.lockText,
      cta: !canAssessment ? VISITOR_LOCK_TEXT.cta : assessmentLocked ? 'Önce öğrenme modunu tamamlayın' : 'Değerlendirmeye gir',
      disabled: canAssessment && (assessmentLocked || !assessmentCount || !serverReady),
      onSelect: !canAssessment ? signIn : () => pick('assessment'),
      ribbon: gamiEnabled && monthlyReward ? `Bu ayın ödülü · ilk ${winners} kişiye · ${daysLeftInMonth(now())} gün` : null,
      ...(gamiEnabled && monthlyReward ? {
        extra: (
          <button type="button" className="eg-gami-link" style={{ minHeight: 44 }} onClick={() => dispatch({ type: 'goto', screen: 'leaderboard' })}>
            <IconGift width={14} height={14} /> Aylık sıralamayı gör
          </button>
        ),
      } : {}),
    },
    {
      key: 'challenge',
      title: 'Meydan Okuma',
      description: 'Bir arkadaşınla aynı vakalarda yarış. Önce doğru sayısı, eşitlikte süre kazanır.',
      bullets: ['6 haneli davet kodu', 'Vaka başı süre sınırı', 'Kazanana ½ değerlendirme XP'],
      ...(isFaculty ? { status: 'Karşılaşmalar yalnız öğrenciler içindir' } : {}),
      audienceLocked: isVisitor,
      learnLocked: !isVisitor && !gate.complete,
      lockText: isVisitor ? VISITOR_LOCK_TEXT.modeLocked : gate.lockText,
      cta: isVisitor ? VISITOR_LOCK_TEXT.cta : !gate.complete ? 'Önce öğrenme modunu tamamlayın' : 'Meydana gir',
      disabled: isVisitor ? false : !gate.complete || isFaculty || openChallenges === undefined,
      onSelect: isVisitor ? signIn : () => openChallenges?.(),
    },
  ]
  return (
    <>
      <EcgDeco embedded={embedded} />
      <div className="screen" style={{ position: 'relative', zIndex: 1 }}>
        {unified ? null : <Stepper active={1} labels={['Mod seçimi', 'Çalışma', 'Tamamla']} />}
        <GamiModeJourney
          simLabel="Opaca · Radyolojik Görüntüleme Simülatörü"
          learnDone={gate.openedCount}
          learnTotal={gate.total}
          learnUnit="konu incelendi"
          note="Önce öğrenme modunda okuma sırasını oturtmanız önerilir."
          banner={
            <>
              {isVisitor && (
                <p className="visitor-banner" role="status">
                  <IconLock width={16} height={16} aria-hidden="true" />
                  <span><strong>{VISITOR_LOCK_TEXT.badge}</strong> — {VISITOR_LOCK_TEXT.locked}</span>
                  {requestSignIn ? (
                    <button type="button" className="btn outline small" onClick={signIn}>
                      {VISITOR_LOCK_TEXT.cta}
                    </button>
                  ) : null}
                </p>
              )}
              {isFaculty && <p className="mode-sub">Öğretim üyesi görünümü — rozet ve sıralama yalnız öğrenciler içindir.</p>}
            </>
          }
          cards={cards}
          showFairPlay={gamiEnabled && !isVisitor && !isFaculty}
          icons={opacaGamiIcons}
        />
      </div>
      <Footer embedded={embedded} />
    </>
  )
}

export function Stepper({ active, labels }: { active: number; labels: string[] }): JSX.Element {
  return (
    <div className="stepper" aria-label="İlerleme">
      {labels.map((l, i) => (
        <div key={l} className={`step ${i + 1 === active ? 'active' : i + 1 < active ? 'done' : ''}`}>
          {i > 0 && <span className="line" />}
          <span className="dot">{i + 1 < active ? '✓' : i + 1}</span>
          <span className="lbl">{l}</span>
        </div>
      ))}
    </div>
  )
}
