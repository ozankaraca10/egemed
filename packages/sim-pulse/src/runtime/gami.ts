/// <reference lib="dom" />
/**
 * Pulse kaynak runtime'ı için platform oyunlaştırma köprüsü.
 *
 * Kaynak uygulamada oyunlaştırma yoktur; platform kararı gereği (üç simde ortak
 * çekirdek, sime özgü rozet/hedef) köprü kaynağın kendi kayıt çağrısını
 * (`CardAIScorm.save`) izler ve tamamlanan oturumları `buildAttemptRecord`
 * ile yazar. Kaynak betiklere dokunulmaz; görünür ekler üst çubuğa eklenen
 * "İlerlemem" düğmesi, onun diyaloğu ve sonuç ekranındaki kazanım kartıdır —
 * son ikisi Opaca/Ausculta ile ortak `@egemed/gami-ui` tasarımıdır.
 * Yerel liderlik tablosu demo akran verisi içerdiği için gösterilmez; gerçek
 * sıralama API ucundan gelecektir.
 */
import { buildAttemptRecord, rhythmStreakAfter } from "../gamification/attempt";
import type { PulseAttemptRecord } from "../gamification/attempt";
import { emptyPulseGamiState, pulseLearnTopic } from "../gamification/repo";
import type { PulseGamiRepo, PulseGamiState, PulseGamiWriteResult } from "../gamification/repo";
import { pulseSessionGains } from "../gamification/gains";
import { gamiUiStyles } from "@egemed/gami-ui";
import type { GamiServerSource } from "@egemed/gami-ui";
import { mountPulseGains } from "./gains";
import { mountPulseProgress } from "./progress";
import type { Lead, Mode } from "../engine/shapes";
import type { PulseRuntimeHandle } from "./host";

/** Kaynak `state.js` oturum şekli (quizSession / caseSession). */
interface SourceSession {
  readonly id: string;
  readonly ids: readonly string[];
  readonly answers: readonly (number | null)[];
  readonly submitted: readonly boolean[];
  readonly leadSelections?: readonly (readonly string[])[];
}

interface SourceState {
  readonly mode: Mode;
  readonly viewed: Readonly<Record<string, number>>;
  readonly quizSession: SourceSession;
  readonly caseSession: SourceSession;
}

interface SourceCurriculum {
  readonly byId: Readonly<Record<string, { readonly correct: number } | undefined>>;
}

interface SourceScorm {
  save(state: unknown): unknown;
}

/** Kaynakta bir mod "incelendi" sayılmak için gereken gözlem saniyesi (16 s akış kuralı). */
const STUDY_SECONDS = 16;

const GAMI_BUTTON_ID = "egemedGamiBtn";
const GAMI_PROGRESS_ID = "egemedGamiProgress";
const GAMI_GAINS_ID = "egemedGamiGains";

function correctness(session: SourceSession, curriculum: SourceCurriculum): boolean[] {
  return session.ids.map((id, index) => curriculum.byId[id]?.correct === session.answers[index]);
}

function lastRhythmStreak(state: PulseGamiState): number {
  for (let i = state.attempts.length - 1; i >= 0; i -= 1) {
    const attempt: PulseAttemptRecord | undefined = state.attempts[i];
    if (attempt?.mode === "assessment") return attempt.extra.rhythmRecognitionStreak;
  }
  return 0;
}

export interface PulseGamiBridgeOptions {
  readonly repo: PulseGamiRepo;
  readonly now: () => number;
  /** Yerel yazım başarıyla bitince kabuğa iletilir; hata akışı bozmaz. */
  readonly reportAttempt?: (attempt: PulseAttemptRecord) => void;
  readonly gamification?: GamiServerSource;
}

/** Köprüyü kurar; dönen işlev izlemeyi bırakır ve eklenen öğeleri kaldırır. */
export function attachPulseGamification(handle: PulseRuntimeHandle, options: PulseGamiBridgeOptions): () => void {
  const scorm = handle.global("CardAIScorm") as SourceScorm | undefined;
  const controller = handle.global("CardAIController") as { readonly state: SourceState } | undefined;
  const curriculum = handle.global("PulseCurriculum") as SourceCurriculum | undefined;
  if (scorm === undefined || controller === undefined || curriculum === undefined) {
    throw new Error("Pulse oyunlaştırma: kaynak runtime API'leri bulunamadı.");
  }
  const { repo } = options;
  const nowDate = (): Date => new Date(options.now());
  let detached = false;
  let gamiState: PulseGamiState | null = null;
  const recorded = new Set<string>();
  const studied = new Set<string>();
  const sessionStart = new Map<string, number>();
  void repo.load().then((state) => {
    if (!detached && gamiState === null) {
      gamiState = state;
      if (!progressHost.hidden) renderProgress();
    }
  });

  // --- Görünür ekler (kaynak işaretlemesine dokunmadan) -----------------------
  const shadow = handle.shadow;
  const doc = shadow.ownerDocument;
  const button = doc.createElement("button");
  button.id = GAMI_BUTTON_ID;
  button.type = "button";
  button.className = "eg-navbtn";
  button.title = "İlerlemem: rozetler, seri ve haftalık hedefler";
  button.innerHTML =
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="5"/><path d="M8.5 13.5 7 21l5-3 5 3-1.5-7.5"/></svg><span class="lbl">İlerlemem</span>';
  button.setAttribute("aria-label", "İlerlemem");
  const helpBtn = shadow.getElementById("helpBtn");
  helpBtn?.parentElement?.insertBefore(button, helpBtn);

  // Ortak tasarım (@egemed/gami-ui): İlerlemem, Pulse alanını kaplayan tam sayfa
  // görünümdür (Opaca/Ausculta ile aynı). Stiller gölge köke bir kez eklenir.
  const style = doc.createElement("style");
  style.textContent = `${gamiUiStyles}
.egemed-pulse-progress-host{position:absolute;inset:0;z-index:60;overflow:auto;background:var(--bg-grad-a,#eef4fb)}
.egemed-pulse-progress-host[hidden]{display:none}
.egemed-pulse-progress{max-width:1200px;margin:0 auto;padding:16px}
.egemed-pulse-progress__bar{display:flex;justify-content:flex-start;margin-bottom:8px}
.egemed-pulse-progress__close{min-height:44px;padding:0 14px;border:1px solid var(--line,#cfdcee);border-radius:10px;background:#fff;color:var(--navy-900,#0a2a5e);font:inherit;font-weight:700;cursor:pointer}`;
  shadow.append(style);
  const progressHost = doc.createElement("section");
  progressHost.id = GAMI_PROGRESS_ID;
  progressHost.className = "egemed-pulse-progress-host";
  progressHost.setAttribute("aria-label", "İlerlemem");
  progressHost.hidden = true;
  shadow.querySelector(".pulse-body")?.append(progressHost);
  const showSourceView = (view: string): void => {
    (handle.global("CardAIController") as { showView?: (view: string) => void } | undefined)?.showView?.(view);
  };
  const closeProgress = (): void => {
    progressHost.hidden = true;
  };
  const progress = mountPulseProgress(progressHost, {
    onAssessment: () => {
      closeProgress();
      showSourceView("quiz");
    },
    onClose: closeProgress,
    onStudy: () => {
      closeProgress();
      showSourceView("sim");
    },
  }, options.gamification);
  const renderProgress = (): void => {
    progress.update(gamiState ?? emptyPulseGamiState(), nowDate());
  };
  const openDialog = (): void => {
    renderProgress();
    progressHost.hidden = false;
    progressHost.scrollTop = 0;
    // React kökü bir sonraki karede çizer; odak “Simülatöre dön” düğmesine taşınır.
    requestAnimationFrame(() => progressHost.querySelector<HTMLButtonElement>(".egemed-pulse-progress__close")?.focus());
  };
  button.addEventListener("click", openDialog);

  const gains = doc.createElement("div");
  gains.id = GAMI_GAINS_ID;
  gains.hidden = true;
  shadow.getElementById("resultsView")?.append(gains);
  // Kazanım kartı da ortak tasarım: React kökü model geldikçe güncellenir.
  const gainsView = mountPulseGains(gains, { onAchievements: openDialog, onLeaderboard: openDialog });

  // --- Kayıt izleme ------------------------------------------------------------
  const applyWrite = (result: PulseGamiWriteResult, record: PulseAttemptRecord, showGains: boolean): void => {
    if (detached) return;
    gamiState = result.state;
    if (showGains) {
      gainsView.update(pulseSessionGains({ attempt: record, earnedIds: result.earnedIds, now: nowDate(), state: result.state }));
      gains.hidden = false;
    }
    if (!progressHost.hidden) renderProgress();
  };

  const durationOf = (sessionId: string): number => {
    const started = sessionStart.get(sessionId);
    return started === undefined ? 0 : Math.max(0, options.now() - started);
  };

  const reportRecord = (record: PulseAttemptRecord): void => {
    const report = options.reportAttempt;
    if (report === undefined) return;
    try {
      const result = report(record) as void | Promise<void>;
      if (result instanceof Promise) void result.catch(() => undefined);
    } catch {
      // Rapor hatası öğrenme akışını bozmaz.
    }
  };

  const observe = (state: SourceState): void => {
    for (const session of [state.quizSession, state.caseSession]) {
      if (!sessionStart.has(session.id)) sessionStart.set(session.id, options.now());
    }
    const quiz = state.quizSession;
    if (quiz.submitted.length > 0 && quiz.submitted.every(Boolean) && !recorded.has(`q:${quiz.id}`)) {
      recorded.add(`q:${quiz.id}`);
      const flags = correctness(quiz, curriculum);
      const correctAnswers = flags.filter(Boolean).length;
      const record = buildAttemptRecord({
        correctAnswers,
        durationMs: durationOf(quiz.id),
        ecgMode: state.mode,
        finishedAt: nowDate(),
        hintsUsed: 0,
        mode: "assessment",
        rhythmRecognitionStreak: rhythmStreakAfter(gamiState === null ? 0 : lastRhythmStreak(gamiState), flags),
        score: Math.round((correctAnswers * 100) / quiz.ids.length),
        sessionId: quiz.id,
        totalQuestions: quiz.ids.length,
      });
      if (record !== null) {
        void repo.recordAttempt(record, nowDate()).then((result) => {
          applyWrite(result, record, true);
          reportRecord(record);
        });
      }
    }
    const kase = state.caseSession;
    if (kase.submitted.length > 0 && kase.submitted.every(Boolean) && !recorded.has(`c:${kase.id}`)) {
      recorded.add(`c:${kase.id}`);
      const flags = correctness(kase, curriculum);
      const correctAnswers = flags.filter(Boolean).length;
      const leads = new Set<Lead>();
      flags.forEach((correct, index) => {
        if (correct) for (const lead of kase.leadSelections?.[index] ?? []) leads.add(lead as Lead);
      });
      const record = buildAttemptRecord({
        correctAnswers,
        correctlyReadLeads: [...leads],
        durationMs: durationOf(kase.id),
        ecgMode: state.mode,
        finishedAt: nowDate(),
        hintsUsed: 0,
        mode: "practice",
        score: Math.round((correctAnswers * 100) / kase.ids.length),
        sessionId: kase.id,
        totalQuestions: kase.ids.length,
      });
      if (record !== null) {
        void repo.recordAttempt(record, nowDate()).then((result) => {
          applyWrite(result, record, false);
          reportRecord(record);
        });
      }
    }
    const viewed = state.viewed[state.mode] ?? 0;
    if (viewed >= STUDY_SECONDS && !studied.has(state.mode)) {
      studied.add(state.mode);
      void repo.recordLearn(pulseLearnTopic(state.mode), nowDate()).then((result) => {
        if (!detached) gamiState = result.state;
      });
    }
  };

  const originalSave = scorm.save;
  const wrappedSave = (state: unknown): unknown => {
    const result = originalSave.call(scorm, state);
    if (!detached) {
      try {
        observe(controller.state);
      } catch {
        // Oyunlaştırma hatası öğrenme akışını ve kaynağın kaydını bozmamalı.
      }
    }
    return result;
  };
  scorm.save = wrappedSave;
  // Açılışta zaten tamamlanmış oturumlar yeniden ödüllendirilmez.
  for (const session of [controller.state.quizSession, controller.state.caseSession]) {
    if (session.submitted.length > 0 && session.submitted.every(Boolean)) {
      recorded.add(`${session === controller.state.quizSession ? "q" : "c"}:${session.id}`);
    }
  }

  return () => {
    detached = true;
    if (scorm.save === wrappedSave) scorm.save = originalSave;
    button.remove();
    progress.dispose();
    progressHost.remove();
    gainsView.dispose();
    gains.remove();
    style.remove();
  };
}
