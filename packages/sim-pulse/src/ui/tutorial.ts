export interface TutorialStep {
  readonly title: string;
  readonly description: string;
}

export const PULSE_TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    title: "Bir EKG sonucu kartı seç",
    description: "Yatay şeritten bir ritim seçin; kalp, EKG ve açıklama birlikte güncellenir.",
  },
  {
    title: "EKG’yi oynat ve bir derivasyona tıkla",
    description: "Oynat’a basın ve izlerden birine tıklayarak o derivasyonu ölçüme seçin.",
  },
  {
    title: "Kaliperi aç ve ölçüm yap",
    description: "Kaliper’i açıp iki çizgiyi sürükleyin; süre ve voltaj farkı okunur.",
  },
];

export interface PulseTutorialRunState {
  readonly tutorialDone: boolean;
  readonly tutorialSeen: boolean;
  readonly viewed: Readonly<Record<string, number>>;
  readonly caseSubmitted: readonly boolean[];
  readonly quizSubmitted: readonly boolean[];
}

export type TutorialStepStatus = "done" | "current" | "upcoming";

export interface TutorialStepView extends TutorialStep {
  readonly index: number;
  readonly status: TutorialStepStatus;
}

export function shouldRunPulseTutorial(state: PulseTutorialRunState): boolean {
  const viewedAnyMode = Object.values(state.viewed).some((seconds) => seconds > 0);
  const anyCaseSubmission = state.caseSubmitted.some(Boolean);
  const anyQuizSubmission = state.quizSubmitted.some(Boolean);
  return !state.tutorialDone && !state.tutorialSeen && !viewedAnyMode && !anyCaseSubmission && !anyQuizSubmission;
}

export function createTutorialStepViews(step: number): readonly TutorialStepView[] {
  const normalized = Math.max(0, Math.trunc(step));
  return PULSE_TUTORIAL_STEPS.map((item, index) => ({
    ...item,
    index,
    status: index < normalized ? "done" : index === normalized ? "current" : "upcoming",
  }));
}
