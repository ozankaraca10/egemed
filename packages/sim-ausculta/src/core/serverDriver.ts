import type { SimSessionSource } from "@egemed/sim-host";
import type { Action } from "./reducer";
import type { Telemetry } from "./types";
import { fromServerResult, pendingAssessmentResult, serverCaseId, toClientCase, type ServerCaseMeta } from "./serverSession";

/**
 * A1.4 (ADR-009): sunucu vaka oturumu sürücüsü. Ekranlardan bağımsız eşzamansız
 * adımlar; her adım sonucu reducer eylemi olarak `dispatch` edilir. Hata metinleri
 * kullanıcıya gösterilecek Türkçe iletiye çevrilir (ayrıntı sızdırılmaz).
 */

type Dispatch = (action: Action) => void;

/** API hata kodunu kullanıcı iletisine çevirir. */
export function serverErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/case_time_exceeded/.test(text)) return "Bu vakanın süresi doldu; yanıt boş sayıldı.";
  if (/session_time_exceeded/.test(text)) return "Oturum süresi doldu.";
  if (/session_(expired|finished)/.test(text)) return "Oturum sona erdi. Yeni bir oturum başlatın.";
  if (/rate_limited/.test(text)) return "Çok sık oturum açıldı; biraz sonra yeniden deneyin.";
  if (/challenge_already_played/.test(text)) return "Bu karşılaşmayı zaten oynadınız.";
  if (/challenge_(expired|not_accepted)/.test(text)) return "Bu karşılaşma şu an oynanamıyor (süresi dolmuş ya da rakip henüz katılmamış).";
  if (/forbidden|role_not_permitted|unauthorized/.test(text)) return "Bu işlem için yetkiniz yok.";
  return "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip yeniden deneyin.";
}

export async function startServerSession(
  sessions: SimSessionSource,
  dispatch: Dispatch,
  mode: "practice" | "assessment",
  focusFinding: string | null,
  challengeId: string | null = null,
): Promise<void> {
  try {
    // ADR-010: düelloda oturum düello ucundan açılır (aynı vakalar/sıra, süreli).
    const session =
      challengeId !== null
        ? await sessions.startChallenge(challengeId)
        : await sessions.start(mode, focusFinding === null ? {} : { focusFinding });
    dispatch({ type: "serverStarted", sessionId: session.sessionId, mode: session.mode, caseCount: session.caseCount });
    await loadServerCase(sessions, dispatch, session.sessionId, 1, session.mode);
  } catch (error) {
    dispatch({ type: "serverError", message: serverErrorMessage(error) });
  }
}

export async function loadServerCase(
  sessions: SimSessionSource,
  dispatch: Dispatch,
  sessionId: string,
  index: number,
  mode: "practice" | "assessment" | "challenge",
): Promise<void> {
  try {
    const publicCase = await sessions.getCase(sessionId, index);
    if (publicCase.simId !== "ausculta") throw new Error("not_found");
    dispatch({ type: "serverCaseLoaded", index, clientCase: toClientCase(publicCase, mode) });
  } catch (error) {
    dispatch({ type: "serverError", message: serverErrorMessage(error) });
  }
}

/** Uygulamada tek soru kontrolü; doğru/yanlış sonucu döner (hatada null). */
export async function checkServerQuestion(
  sessions: SimSessionSource,
  dispatch: Dispatch,
  sessionId: string,
  index: number,
  questionId: string,
  answer: readonly string[],
): Promise<boolean | null> {
  try {
    const feedback = await sessions.check(sessionId, index, questionId, answer);
    dispatch({ type: "serverChecked", qid: questionId, feedback: { correct: feedback.correct, correctOptionIds: [...feedback.correctOptionIds], feedback: feedback.feedback } });
    return feedback.correct;
  } catch (error) {
    dispatch({ type: "serverError", message: serverErrorMessage(error) });
    return null;
  }
}

export async function requestServerHint(sessions: SimSessionSource, dispatch: Dispatch, sessionId: string, index: number, questionId: string): Promise<void> {
  try {
    const { hint } = await sessions.hint(sessionId, index, questionId);
    dispatch({ type: "serverHint", qid: questionId, hint });
  } catch (error) {
    dispatch({ type: "serverError", message: serverErrorMessage(error) });
  }
}

/** Vakayı gönderir: uygulamada sonuç gelir; değerlendirme/düelloda yer tutucu (sonuç bitişte). */
export async function submitServerCase(
  sessions: SimSessionSource,
  dispatch: Dispatch,
  sessionId: string,
  index: number,
  answers: Readonly<Record<string, readonly string[]>>,
  telemetry: Telemetry,
): Promise<void> {
  dispatch({ type: "serverSubmitting" });
  try {
    const response = await sessions.answer(sessionId, index, {
      answers: Object.fromEntries(Object.entries(answers).map(([qid, values]) => [qid, [...values]])),
      telemetry: {
        visits: Object.fromEntries(
          Object.entries(telemetry.visits).map(([pointId, visit]) => [
            pointId,
            {
              dwellMs: Math.round(visit.dwellMs),
              listenMs: Math.round(visit.listenMs),
              visits: visit.visits,
              firstOrder: visit.firstOrder,
            },
          ]),
        ),
        order: [...telemetry.order],
        headChanges: telemetry.headChanges,
        headUse: { ...telemetry.headUse },
        replayCount: telemetry.replayCount,
      },
    });
    if (response.mode === "practice") {
      const mapped = fromServerResult(response.result);
      dispatch({ type: "serverCaseResult", result: mapped.result, meta: mapped.meta });
    } else {
      dispatch({ type: "serverCaseResult", result: pendingAssessmentResult(index), meta: null });
    }
  } catch (error) {
    // Süre aşımında sunucu yanıtı boş sayar ve oturum sürer: sonraki vakaya geçilebilsin.
    if (/case_time_exceeded/.test(error instanceof Error ? error.message : String(error))) {
      dispatch({ type: "serverCaseResult", result: pendingAssessmentResult(index), meta: null });
      return;
    }
    dispatch({ type: "serverError", message: serverErrorMessage(error) });
  }
}

export async function finishServerSession(sessions: SimSessionSource, dispatch: Dispatch, sessionId: string): Promise<void> {
  dispatch({ type: "serverSubmitting" });
  try {
    const done = await sessions.finish(sessionId);
    const metas: Record<string, ServerCaseMeta> = {};
    const results = done.cases.map((item) => {
      const mapped = fromServerResult(item);
      metas[serverCaseId(item.index)] = mapped.meta;
      return mapped.result;
    });
    dispatch({ type: "serverFinished", results, metas });
  } catch (error) {
    dispatch({ type: "serverError", message: serverErrorMessage(error) });
  }
}
