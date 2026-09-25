import { documentLike, windowLike, locationSearch } from '../platform-dom'
import type { ModalEnv, ModalFocusable } from '../ui/modal-env'
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../core/StoreProvider'
import { poolFor } from '../data/pool'
import { sampleSession, SESSION_SIZE } from '../core/session'
import { sessionSeedFromNow } from './simulation-core'
import { Footer } from '../ui/chrome'
import { ScreenHeading } from '../ui/ScreenHeading'
import { GamiLeaderboardView, GamiProgressPage, type GamiModalEnv } from '@egemed/gami-ui'
import { useGami, useLeaderboard } from '../gamification/useGami'
import { useGamiContext } from '../gamification/GamiContext'
import { gamiDemoFrom } from '../gamification/flag'
import { countdownText, meRewardStatus, periodLabel, previousPeriodNow, tableItems } from '../gamification/leaderboardView'
import { rewardStandings } from '@egemed/gamification-core'
import { monthKeyTr } from '@egemed/gamification-core'
import type { CohortFilter, MonthlyReward, Period, RewardWinner } from '@egemed/gamification-core'
import { opacaAvatarOf, opacaGamiIcons } from '../ui/opacaGami'

const PERIODS: { id: Period; label: string }[] = [
  { id: 'today', label: 'Bugün' }, { id: 'week', label: 'Bu hafta' }, { id: 'month', label: 'Bu ay' }, { id: 'academic_year', label: 'Akademik yıl' },
]
const COHORTS: { id: CohortFilter; label: string }[] = [
  { id: 'all', label: 'Tüm dönemler' },
  ...([1, 2, 3, 4, 5, 6] as const).map((c) => ({ id: c, label: `Dönem ${c}` })),
]

/** Liderlik Tahtası + Ayın Ödülü (tasarım promptu §5, §5.1). Yalnız oyunlaştırma bayrağı açıkken erişilir. */
export function LeaderboardScreen({ embedded = false, devBuild = false, modalEnv }: { embedded?: boolean; devBuild?: boolean; modalEnv?: ModalEnv }) {
  const { dispatch, now } = useStore()
  const { reportSyncError } = useGamiContext()
  const [version, setVersion] = useState(0)
  const demo = gamiDemoFrom(locationSearch(), devBuild)
  const view = useGami(version, demo)
  const [period, setPeriod] = useState<Period>('week')
  const [cohort, setCohort] = useState<CohortFilter>('all')
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

  const standings = useMemo(() => {
    if (!reward || !monthAll) return null
    return rewardStandings([...monthAll.rows].map((r) => ({
      id: r.id, cohort: r.cohort, public: r.isPublic, periodScore: r.periodScore, attemptsCount: r.attemptsCount, reachedAt: r.reachedAt,
    })), reward)
  }, [reward, monthAll])
  const candidates = period === 'month' && cohort === 'all' && standings ? new Set(standings.rows.filter((r) => r.candidate).map((r) => r.id)) : null
  const status = reward && standings ? meRewardStatus(standings, reward) : null

  const rows = board?.rows ?? []
  const ranked = rows.filter((r) => r.rank !== null)
  const withPodium = ranked.length >= 3
  const items = tableItems([...rows], withPodium)
  const me = rows.find((r) => r.isMe)
  const prevMe = prevBoard?.rows.find((r) => r.isMe)
  const meDelta = me?.rank && prevMe?.rank ? prevMe.rank - me.rank : null
  const profile = view.state.profile

  const startAssessment = () => {
    const seed = sessionSeedFromNow(now())
    dispatch({ type: 'startSession', practiceIds: sampleSession(poolFor('practice'), seed, SESSION_SIZE), assessmentIds: sampleSession(poolFor('assessment'), seed + 1, SESSION_SIZE), seed })
    dispatch({ type: 'startMode', mode: 'assessment' })
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
        <GamiProgressPage active="leaderboard" onTab={(id) => dispatch({ type: 'goto', screen: id })} icons={opacaGamiIcons}>
          <GamiLeaderboardView
            title={<ScreenHeading className="results-title-v2">Liderlik Tahtası</ScreenHeading>}
            subtitle="Değerlendirme modundaki en iyi 3 denemenin ortalamasıyla sıralanır (en az 2 deneme)."
            reward={reward}
            period={period}
            periods={PERIODS}
            onPeriod={setPeriod}
            cohort={cohort}
            cohorts={COHORTS}
            onCohort={setCohort}
            periodLabel={periodLabel(period, view.now)}
            countdown={countdownText(clock)}
            status={status}
            onTerms={(el) => setTerms(el)}
            onStatusAction={statusAction}
            rankedEmpty={Boolean(board) && ranked.length === 0}
            rows={rows}
            candidates={candidates}
            items={items}
            meDelta={meDelta}
            qualify={me && me.rank === null ? { left: Math.max(1, 2 - me.attemptsCount) } : null}
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
