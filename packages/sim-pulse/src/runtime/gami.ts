/// <reference lib="dom" />
/**
 * Pulse kaynak runtime'ı için platform oyunlaştırma köprüsü.
 *
 * Kaynak uygulamada oyunlaştırma yoktur; platform kararı gereği (üç simde ortak
 * çekirdek, sime özgü rozet/hedef) köprü kaynağın kendi kayıt çağrısını
 * (`CardAIScorm.save`) izler ve tamamlanan oturumları `buildAttemptRecord`
 * ile yazar. Kaynak betiklere dokunulmaz; tek görünür ek, üst çubuğa eklenen
 * "İlerlemem" düğmesi, onun diyaloğu ve sonuç ekranındaki kazanım kartıdır.
 * Yerel liderlik tablosu demo akran verisi içerdiği için gösterilmez; gerçek
 * sıralama API ucundan gelecektir.
 */
import { buildAttemptRecord, rhythmStreakAfter } from "../gamification/attempt";
import type { PulseAttemptRecord } from "../gamification/attempt";
import { pulseLearnTopic } from "../gamification/repo";
import type { PulseGamiRepo, PulseGamiState, PulseGamiWriteResult } from "../gamification/repo";
import { achievementsMarkup, createPulseAchievementsView, createPulseGainsView, gainsMarkup } from "../gamification/ui";
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
const GAMI_DIALOG_ID = "egemedGamiDialog";
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
    if (!detached && gamiState === null) gamiState = state;
  });

  // --- Görünür ekler (kaynak işaretlemesine dokunmadan) -----------------------
  const shadow = handle.shadow;
  const doc = shadow.ownerDocument;
  const button = doc.createElement("button");
  button.id = GAMI_BUTTON_ID;
  button.type = "button";
  button.className = "eg-navbtn";
  button.title = "İlerlemem: rozetler, seri ve haftalık hedefler";
  button.setAttribute("aria-haspopup", "dialog");
  button.innerHTML =
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="5"/><path d="M8.5 13.5 7 21l5-3 5 3-1.5-7.5"/></svg><span class="lbl">İlerlemem</span>';
  button.setAttribute("aria-label", "İlerlemem");
  const helpBtn = shadow.getElementById("helpBtn");
  helpBtn?.parentElement?.insertBefore(button, helpBtn);

  const dialog = doc.createElement("dialog");
  dialog.id = GAMI_DIALOG_ID;
  dialog.setAttribute("aria-labelledby", `${GAMI_DIALOG_ID}-title`);
  shadow.querySelector(".pulse-body")?.append(dialog);

  const renderDialog = (): void => {
    const state = gamiState;
    const body =
      state === null
        ? "<p>İlerleme yükleniyor…</p>"
        : achievementsMarkup(createPulseAchievementsView(state, nowDate()));
    dialog.innerHTML =
      `<h2 id="${GAMI_DIALOG_ID}-title" data-h1>İlerlemem</h2>` +
      `<p>Rozetler, seri ve haftalık hedefler yalnız Pulse içindir; diğer simülatörlerle birleştirilmez.</p>` +
      body +
      '<div class="dialog-actions"><button type="button" class="btn primary" data-egemed-gami-close>Kapat</button></div>';
  };
  const openDialog = (): void => {
    renderDialog();
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLButtonElement>("[data-egemed-gami-close]")?.focus();
  };
  button.addEventListener("click", openDialog);
  dialog.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    if (target?.closest("[data-egemed-gami-close]")) dialog.close();
  });

  const gains = doc.createElement("div");
  gains.id = GAMI_GAINS_ID;
  gains.hidden = true;
  shadow.getElementById("resultsView")?.append(gains);
  gains.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    if (target?.closest('[data-pulse-view="achievements"]')) openDialog();
  });

  // --- Kayıt izleme ------------------------------------------------------------
  const applyWrite = (result: PulseGamiWriteResult, showGains: boolean): void => {
    if (detached) return;
    gamiState = result.state;
    if (showGains) {
      gains.innerHTML = gainsMarkup(createPulseGainsView(result.state, result.earnedIds, nowDate()));
      gains.hidden = false;
    }
    if (dialog.open) renderDialog();
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
          applyWrite(result, true);
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
          applyWrite(result, false);
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
    if (dialog.open) dialog.close();
    dialog.remove();
    gains.remove();
  };
}
