/** SimulationScreen saf çekirdek — vaka metinleri ve birincil aksiyon planı.
 *  A2.3 (ADR-009): oturum/örneklem çözümleme sunucuya taşındı; burada yalnız
 *  ekranların kullandığı DOM'suz yardımcılar kalır. */

import { nextActionForSubmit } from '../core/flow'
import type { CaseDef, Mode, Question } from '../core/types'

/** Birincil düğmenin planı (ADR-009): doğruluk ve vaka sonucu sunucudan gelir; plan
 *  yalnız ne yapılacağını söyler — hangi soru gönderilecek, ilerlenecek mi, vaka bitecek mi. */
export interface PrimaryActionPlan {
  /** Sunucuya gönderilecek soru (yoksa null). */
  submitQid: string | null
  advance: boolean
  finish: boolean
}

const NO_ACTION: PrimaryActionPlan = { submitQid: null, advance: false, finish: false }

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

/** Kaynak: CaseView `primaryAction` (satır 158–168). */
export function planPrimaryAction(params: {
  mode: Mode
  question: Question | undefined
  questions: readonly Question[]
  revealed: boolean
  canSubmit: boolean
}): PrimaryActionPlan {
  const { question: q, questions, mode, revealed, canSubmit } = params
  if (!q) return NO_ACTION
  const isLast = questions[questions.length - 1]?.id === q.id
  const action = nextActionForSubmit(mode, revealed, isLast)
  if (action === 'advance') return { ...NO_ACTION, advance: true }
  if (action === 'finish') return { ...NO_ACTION, finish: true }
  if (!canSubmit) return NO_ACTION
  return { submitQid: q.id, advance: action === 'submit-then-advance', finish: action === 'submit-then-finish' }
}
