import { describe, expect, it } from 'vitest'
import { fmtSec, planPrimaryAction } from '../../../packages/sim-opaca/src/index'
import type { ImageRecord, Question } from '../../../packages/sim-opaca/src/index'

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

const syntheticImage: ImageRecord = {
  id: 'img_fixture',
  sourceDataset: 'nih-cxr14',
  sourceFile: 'fixture.png',
  viewPosition: 'PA',
  ageYears: 45,
  sex: 'F',
  population: 'yetiskin',
  width: 512,
  height: 512,
  originalWidth: 512,
  originalHeight: 512,
  findings: { nodule: 'expert_bbox' },
  negatives: {},
  annotations: [],
  quality: null,
  runtimeUrl: 'assets/fixture.webp',
  bytes: 1,
  validationStatus: 'validated',
  clinicalReview: 'onayli',
  issues: [],
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
        given: ['a'],
        image: syntheticImage,
      }).dispatches,
    ).toEqual([{ type: 'advance' }])
    expect(
      planPrimaryAction({
        mode: 'practice',
        question: qs[1],
        questions: qs,
        revealed: true,
        canSubmit: true,
        given: ['a'],
        image: syntheticImage,
      }),
    ).toEqual({ dispatches: [{ type: 'finishCase' }], saveInteractions: false })
  })

  it('planPrimaryAction değerlendirmede submit-then-advance/finish planlar', () => {
    const qs = [question({ id: 'q1' }), question({ id: 'q2' })]
    const mid = planPrimaryAction({
      mode: 'assessment',
      question: qs[0],
      questions: qs,
      revealed: false,
      canSubmit: true,
      given: ['a'],
      image: syntheticImage,
    })
    expect(mid.dispatches).toEqual([
      { type: 'submitAnswer', qid: 'q1', correct: true },
      { type: 'advance' },
    ])
    expect(mid.saveInteractions).toBe(false)

    const last = planPrimaryAction({
      mode: 'assessment',
      question: qs[1],
      questions: qs,
      revealed: false,
      canSubmit: true,
      given: ['a'],
      image: syntheticImage,
    })
    expect(last.dispatches).toEqual([
      { type: 'submitAnswer', qid: 'q2', correct: true },
      { type: 'finishCase' },
    ])
    expect(last.saveInteractions).toBe(true)
  })
})
