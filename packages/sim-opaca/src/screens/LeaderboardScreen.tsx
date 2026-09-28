import { documentLike, windowLike, locationSearch } from '../platform-dom'
import type { ModalEnv, ModalFocusable } from '../ui/modal-env'
import { useEffect, useMemo, useState } from 'react'
import { useStartMode } from '../core/LearnGate'
import { useStore } from '../core/StoreProvider'
import { Footer } from '../ui/chrome'
import { ScreenHeading } from '../ui/ScreenHeading'
import { buildLeaderboardModel, GamiLeaderboardView, GamiProgressPage, GamiServerFrame, gamiLoadingStatus, type GamiModalEnv, type ServerGamiData } from '@egemed/gami-ui'
import { useGami, useLeaderboard } from '../gamification/useGami'
import { useGamiContext } from '../gamification/GamiContext'
import { gamiDemoFrom } from '../gamification/flag'
import { previousPeriodNow } from '../gamification/leaderboardView'
import { monthKeyTr } from '@egemed/gamification-core'
import type { CohortFilter, MonthlyReward, Period, RewardWinner } from '@egemed/gamification-core'
import { opacaAvatarOf, opacaGamiIcons } from '../ui/opacaGami'

/** Liderlik Tahtası + Ayın Ödülü (tasarım promptu §5, §5.1). Yalnız oyunlaştırma bayrağı açıkken erişilir. */
function LeaderboardBody({
  embedded = false,
  devBuild = false,
  modalEnv,
  server,
  period,
  setPeriod,
  cohort,
  setCohort,
}: {
  embedded?: boolean
  devBuild?: boolean
  modalEnv?: ModalEnv
  server: ServerGamiData | null
  period: Period
  setPeriod: (period: Period) => void
  cohort: CohortFilter
  setCohort: (cohort: CohortFilter) => void
}) {
  const { dispatch, now } = useStore()
  const startMode = useStartMode()
  const { reportSyncError } = useGamiContext()
  const [version, setVersion] = useState(0)
  const demo = gamiDemoFrom(locationSearch(), devBuild)
  const view = useGami(version, demo)
  const [clock, setClock] = useState(view.now)
  const [terms, setTerms] = useState<ModalFocusable | null | false>(false)
  const [reward, setReward] = useState<MonthlyReward | null>(null)
  const [winners, setWinners] = useState<RewardWinner[]>([])

  useEffect(() => {
    setClock(view.now)
    const w = windowLike()
    const t = w ? w.setInterval(() => setClock(new Date(now())), 60_000) : 0
    return () => { if (w && t) w.clearInterval(t) }
  }, [now, view.now])
  useEffect(() => {
    void view.repo.getMonthlyReward(monthKeyTr(view.now)).then(setReward).catch((error: unknown) => reportSyncError(error, 'read'))
    void view.repo.getRewardWinners(3, view.now).then(setWinners).catch((error: unknown) => reportSyncError(error, 'read'))
  }, [view.repo, view.now, reportSyncError])

  const board = useLeaderboard(period, cohort, view.now, view.repo, version)
  const prevNow = useMemo(() => previousPeriodNow(period, view.now), [period, view.now])
  const prevBoard = useLeaderboard(period, cohort, prevNow, view.repo, version)
  const monthAll = useLeaderboard('month', 'all', view.now, view.repo, version)

  const model = useMemo(() => buildLeaderboardModel({
    now: view.now,
    clock,
    period,
    cohort,
    rows: server?.rows ?? board?.rows ?? [],
    prevRows: server ? null : prevBoard?.rows ?? null,
    monthRows: server ? null : monthAll?.rows ?? null,
    reward,
    boardReady: server ? true : Boolean(board),
  }), [board, clock, cohort, monthAll, period, prevBoard, reward, server, view.now])
  const profile = view.state.profile
  const me = model.rows.find((r) => r.isMe)

  // T218: öğrenme tamamlanmadan değerlendirme başlatılamaz; kilitliyse istek öğrenmeye düşer.
  const startAssessment = () => {
    // A2.3: örneklemi sunucu sürücüsü çeker (istemcide havuz yok).
    startMode('assessment')
  }
  const statusAction = (a: 'privacy' | 'assess') => {
    if (a === 'assess') return startAssessment()
    const el = documentLike()?.getElementById('gami-privacy')
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.querySelector<{ focus(options?: { preventScroll?: boolean }): void }>('[role="switch"]')?.focus({ preventScroll: true })
  }

  return (
    <>
      <div className="screen">
        <GamiProgressPage active="leaderboard" demo={server === null} onTab={(id) => dispatch({ type: 'goto', screen: id })} icons={opacaGamiIcons}>
          <GamiLeaderboardView
            title={<ScreenHeading className="results-title-v2">Liderlik Tahtası</ScreenHeading>}
            subtitle="Değerlendirme modundaki en iyi 3 denemenin ortalamasıyla sıralanır (en az 2 deneme)."
            reward={reward}
            period={period}
            periods={model.periods}
            onPeriod={setPeriod}
            cohort={cohort}
            cohorts={model.cohorts}
            onCohort={setCohort}
            periodLabel={model.periodLabel}
            countdown={model.countdown}
            status={model.status}
            onTerms={(el) => setTerms(el)}
            onStatusAction={statusAction}
            rankedEmpty={model.rankedEmpty}
            rows={model.rows}
            candidates={model.candidates}
            items={model.items}
            meDelta={model.meDelta}
            qualify={model.qualify}
            onQualify={startAssessment}
            privacy={{
              name: profile.displayName ?? (me?.isPublic ? me.displayName : null),
              isPublic: profile.public,
              cohort: profile.cohort,
            }}
            onPrivacy={(patch) => {
              void view.repo.updateMe(patch).then(() => setVersion((v) => v + 1)).catch((error: unknown) => reportSyncError(error, 'write'))
            }}
            winners={winners}
            terms={terms}
            onCloseTerms={() => setTerms(false)}
            {...(modalEnv ? { modalEnv: modalEnv as GamiModalEnv } : {})}
            avatarOf={opacaAvatarOf}
            icons={opacaGamiIcons}
          />
        </GamiProgressPage>
      </div>
      <Footer embedded={embedded} />
    </>
  )
}

export function LeaderboardScreen({ embedded = false, devBuild = false, modalEnv }: { embedded?: boolean; devBuild?: boolean; modalEnv?: ModalEnv }) {
  const { gamification } = useGamiContext()
  const [period, setPeriod] = useState<Period>('week')
  const [cohort, setCohort] = useState<CohortFilter>('all')
  const body = (server: ServerGamiData | null) => (
    <LeaderboardBody
      cohort={cohort}
      devBuild={devBuild}
      embedded={embedded}
      period={period}
      server={server}
      setCohort={setCohort}
      setPeriod={setPeriod}
      {...(modalEnv ? { modalEnv } : {})}
    />
  )
  if (gamification === undefined) return body(null)
  return (
    <GamiServerFrame
      cohort={cohort}
      fallback={gamiLoadingStatus()}
      icon={opacaGamiIcons.info({ width: 16, height: 16 })}
      period={period}
      source={gamification}
    >
      {body}
    </GamiServerFrame>
  )
}
