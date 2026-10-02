import { describe, expect, it } from 'vitest'
import { fmtSec, planPrimaryAction } from '../../../packages/sim-opaca/src/index'
import type { Question } from '../../../packages/sim-opaca/src/index'

function question(over: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    type: 'single_choice',
    domain: 'recognition',
    prompt: 'Ana bulgu?',
    options: [{ id: 'a', label: 'Nodül' }, { id: 'b', label: 'Normal' }],
    correct: ['a'],
    feedbackCorrect: 'Doğru',
    feedbackIncorrect: 'Yanlış',
    ...over,
  }
}

describe('simulation-core (S15 saf çekirdek)', () => {

  it('fmtSec dakika:saniye biçiminde ve sınır değerlerde doğru', () => {
    expect(fmtSec(0)).toBe('00:00')
    expect(fmtSec(59)).toBe('00:59')
    expect(fmtSec(60)).toBe('01:00')
    expect(fmtSec(125)).toBe('02:05')
    expect(fmtSec(3599)).toBe('59:59')
  })

  it('planPrimaryAction uygulama modunda revealed sonrası ilerler', () => {
    const qs = [question({ id: 'q1' }), question({ id: 'q2' })]
    expect(
      planPrimaryAction({
        mode: 'practice',
        question: qs[0],
        questions: qs,
        revealed: true,
        canSubmit: true,
      }),
    ).toEqual({ submitQid: null, advance: true, finish: false })
    expect(
      planPrimaryAction({
        mode: 'practice',
        question: qs[1],
        questions: qs,
        revealed: true,
        canSubmit: true,
      }),
    ).toEqual({ submitQid: null, advance: false, finish: true })
  })

  it('planPrimaryAction değerlendirmede submit-then-advance/finish planlar', () => {
    const qs = [question({ id: 'q1' }), question({ id: 'q2' })]
    const mid = planPrimaryAction({
      mode: 'assessment',
      question: qs[0],
      questions: qs,
      revealed: false,
      canSubmit: true,
    })
    // ADR-009: doğruluk sunucudan gelir; plan yalnız gönderilecek soruyu ve sonraki adımı söyler.
    expect(mid).toEqual({ submitQid: 'q1', advance: true, finish: false })

    const last = planPrimaryAction({
      mode: 'assessment',
      question: qs[1],
      questions: qs,
      revealed: false,
      canSubmit: true,
    })
    expect(last).toEqual({ submitQid: 'q2', advance: false, finish: true })
  })
})
