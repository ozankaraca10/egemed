/** SimulationScreen saf çekirdek — oturum çözümleme, K3 yeniden örneklem, vaka metinleri,
 *  etkileşim gecikmesi ve birincil aksiyon planı.
 *  Kaynak: egemed-opaca `screens/SimulationScreen.tsx` (S15 çıkarımı; React/DOM bağımlılığı yok). */

import { isAnswerCorrect } from '../core/answers'
import { nextActionForSubmit } from '../core/flow'
import { getImage } from '../core/images'
import { SESSION_SIZE, sampleSession } from '../core/session'
import type { CaseDef, ImageRecord, Mode, Question } from '../core/types'
import { LABEL_SOURCE_TEXT } from '../data/terminology'

export const DEFAULT_CASE_TIME_SEC = 180

export interface ResolvedSimulationSession {
  sessionCases: CaseDef[]
  caseList: CaseDef[]
  currentCase: CaseDef | undefined
}

export interface SessionRegenPlan {
  practiceIds: string[]
  assessmentIds: string[]
  seed: number
}

export type SimulationDispatch =
  | { type: 'advance' }
  | { type: 'finishCase' }
  | { type: 'submitAnswer'; qid: string; correct: boolean }

export interface PrimaryActionPlan {
  dispatches: SimulationDispatch[]
  saveInteractions: boolean
}

/** Kaynak: `Date.now() % 2147483647` (K3 ve yeni örneklem tohumları). */
export function sessionSeedFromNow(now: number): number {
  return (now % 2147483647) | 0
}

/** Kaynak: SimulationScreen oturum listesi çözümleme (satır 27–31). */
export function resolveSimulationSession(params: {
  mode: Mode
  practiceIds: string[]
  assessmentIds: string[]
  caseIndex: number
  allCases: readonly CaseDef[]
  pool: CaseDef[]
}): ResolvedSimulationSession {
  const sessionIds = params.mode === 'assessment' ? params.assessmentIds : params.practiceIds
  const byId = new Map(params.allCases.map((c) => [c.id, c]))
  const sessionCases = sessionIds.map((id) => byId.get(id)).filter((c): c is CaseDef => !!c)
  const caseList = sessionCases.length ? sessionCases : params.pool.slice(0, SESSION_SIZE)
  const currentCase = caseList[params.caseIndex] ?? caseList[0]
  return { sessionCases, caseList, currentCase }
}

/** Kaynak: SimulationScreen K3 etkisi (satır 33–44) — boş oturum listesinde aynı tohumla yeniden örneklem. */
export function planK3SessionRegeneration(params: {
  mode: Mode
  sessionCasesCount: number
  seed: number
  practiceIds: string[]
  assessmentIds: string[]
  pool: CaseDef[]
  now: () => number
}): SessionRegenPlan | null {
  if (params.sessionCasesCount > 0 || params.mode === 'learn') return null
  const seed = params.seed || sessionSeedFromNow(params.now())
  const ids = sampleSession(params.pool, seed, SESSION_SIZE)
  if (!ids.length) return null
  return {
    practiceIds: params.mode === 'practice' ? ids : params.practiceIds,
    assessmentIds: params.mode === 'assessment' ? ids : params.assessmentIds,
    seed,
  }
}

/** Kaynak: CaseView `doNewSample` (satır 94–97). */
export function planNewPracticeSample(params: {
  assessmentIds: string[]
  pool: CaseDef[]
  now: () => number
}): SessionRegenPlan {
  const seed = sessionSeedFromNow(params.now())
  const practiceIds = sampleSession(params.pool, seed, SESSION_SIZE)
  return { practiceIds, assessmentIds: params.assessmentIds, seed }
}

/** Kaynak: CaseView `hasProgress` (satır 93). */
export function hasSimulationProgress(
  answers: Record<string, string[]>,
  hintsUsed: number,
  caseResultsCount: number,
): boolean {
  return Object.keys(answers).length > 0 || hintsUsed > 0 || caseResultsCount > 0
}

/** Kaynak: CaseView süre sınırı (satır 122). */
export function caseTimeLimitSec(caseDef: CaseDef, isAssessment: boolean): number | undefined {
  return isAssessment ? caseDef.timeLimitSec ?? DEFAULT_CASE_TIME_SEC : undefined
}

/** Kaynak: `sourceNote` (satır 431–438). */
export function sourceNote(c: CaseDef, src: string | undefined, image?: ImageRecord): string {
  const img = image ?? getImage(c.imageId)
  const parts = [
    img ? `Kaynak: ${img.sourceDataset} (${img.sourceFile}).` : 'Görüntü kaydı bulunamadı.',
    `Ana bulgu etiketi: ${src ? LABEL_SOURCE_TEXT[src] ?? src : 'yok'}.`,
  ]
  if (c.mappingNote) parts.push(c.mappingNote)
  return parts.join(' ')
}

/** Kaynak: `patientLine` (satır 441–444). */
export function patientLine(c: CaseDef): string {
  const age = c.patient.age != null ? `${c.patient.age} yaşında` : 'Yaşı bilinmeyen'
  const sex = c.patient.sex ? `${c.patient.sex} hasta.` : 'hasta.'
  return `${age} ${sex}`
}

/** Kaynak: `fmtSec` (satır 447–448). */
export function fmtSec(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Kaynak: CaseView `saveInteractions` gecikme hesabı (satır 141–145). */
export function computeQuestionLatency(
  questions: readonly Question[],
  shownAt: Readonly<Record<string, number>>,
  now: number,
): Record<string, number> {
  const latency: Record<string, number> = {}
  for (const qq of questions) {
    const at = shownAt[qq.id]
    if (at != null) latency[qq.id] = now - at
  }
  return latency
}

/** Kaynak: CaseView `primaryAction` (satır 158–168). */
export function planPrimaryAction(params: {
  mode: Mode
  question: Question | undefined
  questions: readonly Question[]
  revealed: boolean
  canSubmit: boolean
  given: readonly string[]
  image: ImageRecord | undefined
}): PrimaryActionPlan {
  const { question: q, questions, mode, revealed, canSubmit, given, image } = params
  if (!q) return { dispatches: [], saveInteractions: false }
  const isLast = questions[questions.length - 1]?.id === q.id
  const action = nextActionForSubmit(mode, revealed, isLast)
  if (action === 'advance') return { dispatches: [{ type: 'advance' }], saveInteractions: false }
  if (action === 'finish') return { dispatches: [{ type: 'finishCase' }], saveInteractions: false }
  if (!canSubmit) return { dispatches: [], saveInteractions: false }
  const dispatches: SimulationDispatch[] = [
    { type: 'submitAnswer', qid: q.id, correct: isAnswerCorrect(q, [...given], image) },
  ]
  const saveInteractions = isLast
  if (action === 'submit-then-finish') dispatches.push({ type: 'finishCase' })
  else if (action === 'submit-then-advance') dispatches.push({ type: 'advance' })
  return { dispatches, saveInteractions }
}
