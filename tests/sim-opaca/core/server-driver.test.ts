import { describe, expect, it } from "vitest";
import {
  checkServerQuestion,
  finishServerSession,
  initialState,
  loadServerCase,
  reducer,
  requestServerHint,
  serverErrorMessage,
  startServerSession,
  submitServerCase,
  type Action,
  type AppState,
} from "../../../packages/sim-opaca/src/index";
import type { Telemetry } from "../../../packages/sim-opaca/src/index";
import { fakeSessions } from "../session-fixture";

/** A2.3 (ADR-009): sunucu oturumu sürücüsü — sahte `SimSessionSource` ile adımlar
 *  reducer eylemlerine dönüşür; hata metinleri Türkçedir. */

const emptyTelemetry = (): Telemetry => ({ visits: {}, order: [], toolUse: { zoom: 0, window: 0, invert: 0, overlay: 0, measure: 0 } });

function collector(): { dispatch: (action: Action) => void; actions: Action[] } {
  const actions: Action[] = [];
  return { actions, dispatch: (action) => void actions.push(action) };
}

describe("sunucu sürücüsü", () => {
  it("startServerSession oturumu açar ve ilk vakayı yükler", async () => {
    const sessions = fakeSessions({ mode: "practice" });
    const { dispatch, actions } = collector();
    await startServerSession(sessions, dispatch, "practice", "normal", null);
    expect(sessions.calls[0]).toBe("start:practice");
    expect(sessions.calls[1]).toBe("getCase:1");
    expect(actions[0]).toMatchObject({ type: "serverStarted", mode: "practice", caseCount: 2, perCaseLimitMs: null });
    const loaded = actions[1];
    expect(loaded?.type).toBe("serverCaseLoaded");
    if (loaded?.type === "serverCaseLoaded") {
      expect(loaded.index).toBe(1);
      expect(loaded.clientCase.id).toBe("srv-1");
      expect(loaded.clientCase.serverImage.runtimeUrl).toContain("img-token-1");
    }
  });

  it("düelloda oturum düello ucundan açılır", async () => {
    const sessions = fakeSessions({ mode: "assessment" });
    const { dispatch, actions } = collector();
    await startServerSession(sessions, dispatch, "assessment", null, "challenge-1");
    expect(sessions.calls[0]).toBe("startChallenge:challenge-1");
    expect(actions[0]).toMatchObject({ type: "serverStarted", mode: "challenge" });
  });

  it("checkServerQuestion geri bildirimi dispatch eder ve doğru/yanlışı döner", async () => {
    const sessions = fakeSessions();
    const { dispatch, actions } = collector();
    const correct = await checkServerQuestion(sessions, dispatch, "11111111-1111-4111-8111-111111111111", 1, "q1", ["opt-a-1000"]);
    expect(correct).toBe(true);
    expect(actions[0]).toMatchObject({ type: "serverChecked", qid: "q1" });
  });

  it("requestServerHint ipucu metnini dispatch eder", async () => {
    const sessions = fakeSessions();
    const { dispatch, actions } = collector();
    await requestServerHint(sessions, dispatch, "11111111-1111-4111-8111-111111111111", 1, "q1");
    expect(actions[0]).toEqual({ type: "serverHint", qid: "q1", hint: "İpucu q1" });
  });

  it("uygulamada gönderim sonucu ve meta iki ayrı eylemle gelir", async () => {
    const sessions = fakeSessions({ mode: "practice" });
    const { dispatch, actions } = collector();
    await submitServerCase(sessions, dispatch, "11111111-1111-4111-8111-111111111111", 1, { q1: ["opt-a-1000"] }, emptyTelemetry());
    expect(actions[0]).toEqual({ type: "serverSubmitting" });
    const result = actions[1];
    expect(result?.type).toBe("serverCaseResult");
    if (result?.type === "serverCaseResult") {
      expect(result.meta?.title).toBe("Gerçek Vaka Başlığı 1");
      expect(result.result.total).toBe(80);
    }
  });

  it("değerlendirmede gönderim yer tutucu sonuç üretir (geri bildirim sonda)", async () => {
    const sessions = fakeSessions({ mode: "assessment" });
    const { dispatch, actions } = collector();
    await submitServerCase(sessions, dispatch, "11111111-1111-4111-8111-111111111111", 2, {}, emptyTelemetry());
    const result = actions[1];
    expect(result?.type).toBe("serverCaseResult");
    if (result?.type === "serverCaseResult") {
      expect(result.meta).toBeNull();
      expect(result.result.total).toBe(0);
      expect(result.result.caseId).toBe("srv-2");
    }
  });

  it("finishServerSession sonuçları ve meta haritasını dispatch eder", async () => {
    const sessions = fakeSessions({ mode: "assessment" });
    sessions.results = [];
    const { dispatch, actions } = collector();
    await finishServerSession(sessions, dispatch, "11111111-1111-4111-8111-111111111111");
    const finished = actions[1];
    expect(finished?.type).toBe("serverFinished");
    if (finished?.type === "serverFinished") {
      expect(finished.results[0]?.caseId).toBe("srv-1");
      expect(finished.metas["srv-1"]?.summary).toContain("pnömotoraks");
    }
  });

  it("hata kodları Türkçe iletiye çevrilir", () => {
    expect(serverErrorMessage(new Error("validation_failed case_time_exceeded"))).toContain("süresi doldu");
    expect(serverErrorMessage(new Error("conflict session_expired"))).toContain("Oturum sona erdi");
    expect(serverErrorMessage(new Error("forbidden"))).toContain("yetkiniz yok");
    expect(serverErrorMessage(new Error("ağ hatası"))).toContain("Sunucuya ulaşılamadı");
  });

  it("API hatasında server durumu error olur", async () => {
    const sessions = fakeSessions();
    sessions.getCase = async () => {
      throw new Error("not_found");
    };
    let state: AppState = reducer(initialState, { type: "startMode", mode: "practice" });
    state = reducer(state, { type: "serverStarted", sessionId: "s", mode: "practice", caseCount: 2, perCaseLimitMs: null });
    await loadServerCase(sessions, (action) => {
      state = reducer(state, action);
    }, "s", 1, "practice");
    expect(state.server?.status).toBe("error");
    expect(state.server?.error).toContain("Sunucuya ulaşılamadı");
  });
});
