/** SimulationScreen saf çekirdek — vaka metinleri ve birincil aksiyon planı.
 *  A2.3 (ADR-009): oturum/örneklem çözümleme sunucuya taşındı; burada yalnız
 *  ekranların kullandığı DOM'suz yardımcılar kalır. */

import { isAnswerCorrect } from '../core/answers'
import { nextActionForSubmit } from '../core/flow'
import type { CaseDef, ImageRecord, Mode, Question } from '../core/types'

export type SimulationDispatch =
  | { type: 'advance' }
  | { type: 'finishCase' }
  | { type: 'submitAnswer'; qid: string; correct: boolean }

export interface PrimaryActionPlan {
  dispatches: SimulationDispatch[]
  saveInteractions: boolean
}

/** Kaynak: CaseView `hasProgress` (satır 93). */
export function hasSimulationProgress(
  answers: Record<string, string[]>,
  hintsUsed: number,
  caseResultsCount: number,
): boolean {
  return Object.keys(answers).length > 0 || hintsUsed > 0 || caseResultsCount > 0
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

/** Kaynak: CaseView `primaryAction` (satır 158–168). Sunucu modunda `correct` alanı
 *  sunucu kontrolüyle değiştirilir; plan pure kalır. */
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
