import { describe, expect, it } from "vitest";
import { pulsePublicCaseSchema, simSessionStartResponseSchema, type PulsePublicCase } from "../../packages/contracts/src/index";
import { pulse } from "../../packages/assessment-bank/src/index";
import { ALI, ALI_ID, FIXED_NOW, createAdminHarness, login, type AdminHarness, type Login } from "./admin-harness";

// T283a — sunucu davranış sinyalleri ve işaretleme, uçtan uca (Pulse seçildi:
// tek soru, ses/lokalizasyon yok — `no_interaction_correct`'in Ausculta'ya özgü
// "hiç dinlenmemiş nokta" koşulu burada karışmaz, yalnız `integrity.interactions`
// sinyali test edilir). too_fast ile işaretleme + tabloya yazım, eski istemci
// (integrity alanı yok) işaretlenmez, tutarlılık sinyali (`listRecentFinished`
// bağlantısı), admin ucu yetki ve KVKK (yanıt yalnız sayı/sinyal adı taşır).
// Sinyallerin kendisi `integrity-signals.test.ts`'de birim test edilir; burada
// yalnız API/DB kablolaması doğrulanır.

const TELEMETRY = { visits: {}, order: [], headChanges: 0, headUse: { bell: 0, diaphragm: 0 }, replayCount: 0 };
const PULSE_THRESHOLD_MS = 4_000;
const NO_INTEGRITY_SIGNALS = { hiddenCount: 0, hiddenMs: 0, blurCount: 0, pasteCount: 0, interactions: 5 };

function harness(): AdminHarness {
  const h = createAdminHarness();
  // Öğrenme kilidi (T290): bu dosya davranış sinyallerini test eder, kilidi değil; Pulse tamamlama kaydı baştan eklenir.
  h.learn.records.set(`${ALI_ID}:pulse`, { userId: ALI_ID, simId: "pulse", completedAt: FIXED_NOW, contentVersion: "test.1" });
  return h;
}

async function call(h: AdminHarness, who: Login | undefined, method: string, path: string, body?: unknown) {
  return h.app.request(path, {
    method,
    headers: { ...(who?.headers ?? {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function sessionPath(sessionId: string): string {
  return `/me/sims/pulse/sessions/${sessionId}`;
}

async function start(h: AdminHarness, who: Login) {
  const response = await call(h, who, "POST", "/me/sims/pulse/sessions", { mode: "assessment" });
  expect(response.status).toBe(201);
  return simSessionStartResponseSchema.parse(await response.json()).data;
}

/** Yalnız ilk iki maddeyle çalışır — testleri hızlandırmak için oturum doğrudan bellek deposunda kısaltılır. */
function truncateToTwoCases(h: AdminHarness, sessionId: string): void {
  const row = h.simSessions.rows.get(sessionId);
  if (row === undefined) throw new Error("oturum yok");
  row.state.cases.splice(2, row.state.cases.length - 2);
}

async function openCase(h: AdminHarness, who: Login, sessionId: string, index: number): Promise<PulsePublicCase> {
  const response = await call(h, who, "GET", `${sessionPath(sessionId)}/cases/${index}`);
  expect(response.status).toBe(200);
  const body = (await response.json()) as { readonly data: unknown };
  return pulsePublicCaseSchema.parse(body.data);
}

function correctToken(h: AdminHarness, sessionId: string, index: number): string {
  const item = h.simSessions.rows.get(sessionId)?.state.cases[index - 1];
  const caseDef = item === undefined ? undefined : pulse.caseById(item.caseId);
  const keys = item?.keys;
  if (item === undefined || caseDef === undefined || keys === null || keys === undefined || "audio" in keys || "images" in keys) {
    throw new Error("açılmış Pulse maddesi yok");
  }
  return Object.keys(keys.options).find((token) => keys.options[token] === caseDef.correct) ?? "";
}

/** İki maddeyi de açar, doğru yanıtlar (isteğe bağlı `integrity` alanıyla), oturumu bitirir. */
async function runTwoCaseSession(
  h: AdminHarness,
  who: Login,
  options: { readonly advanceMsBeforeAnswer: number; readonly integrity?: Record<string, number> },
): Promise<{ readonly sessionId: string; readonly total: number }> {
  const session = await start(h, who);
  truncateToTwoCases(h, session.sessionId);
  for (const index of [1, 2]) {
    await openCase(h, who, session.sessionId, index);
    h.advance(options.advanceMsBeforeAnswer);
    const answer = await call(h, who, "POST", `${sessionPath(session.sessionId)}/cases/${index}/answer`, {
      answers: { [pulse.QUESTION_ID]: [correctToken(h, session.sessionId, index)] },
      telemetry: TELEMETRY,
      ...(options.integrity === undefined ? {} : { integrity: options.integrity }),
    });
    expect(answer.status).toBe(200);
  }
  const finish = await call(h, who, "POST", `${sessionPath(session.sessionId)}/finish`);
  expect(finish.status).toBe(200);
  const done = (await finish.json()) as { data: { total: number } };
  return { sessionId: session.sessionId, total: done.data.total };
}

describe("T283a — too_fast ile işaretleme ve tabloya yazım", () => {
  it("iki madde de anında + doğru yanıtlanırsa oturum unverified işaretlenir ve integrity_flags satırı yazılır", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const { sessionId, total } = await runTwoCaseSession(h, ali, { advanceMsBeforeAnswer: 0, integrity: NO_INTEGRITY_SIGNALS });
    expect(total).toBe(100);
    const row = h.simSessions.rows.get(sessionId);
    expect(row?.integrityStatus).toBe("unverified");
    const flagged = h.integrity.rows.filter((r) => r.sessionId === sessionId);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.score).toBeGreaterThanOrEqual(5);
    expect(flagged[0]?.signals.counts.too_fast).toBe(2);
    expect(flagged[0]?.signals.counts.no_interaction_correct).toBe(0);
    // Puan/XP/rozet bu görevde etkilenmez: oturum normal şekilde denemeyi yazar.
    const summary = await call(h, ali, "GET", "/me/gamification/pulse");
    expect(((await summary.json()) as { data: { xp: number } }).data.xp).toBeGreaterThan(0);
  });

  it("yanlış yanıtta too_fast hiç üretilmez; oturum işaretlenmez", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const session = await start(h, ali);
    truncateToTwoCases(h, session.sessionId);
    const first = await openCase(h, ali, session.sessionId, 1);
    const correct = correctToken(h, session.sessionId, 1);
    const wrong = first.options.map((option) => option.id).find((id) => id !== correct) ?? "";
    const answer = await call(h, ali, "POST", `${sessionPath(session.sessionId)}/cases/1/answer`, {
      answers: { [pulse.QUESTION_ID]: [wrong] },
      telemetry: TELEMETRY,
      integrity: NO_INTEGRITY_SIGNALS,
    });
    expect(answer.status).toBe(200);
    const row = h.simSessions.rows.get(session.sessionId);
    expect(row?.state.cases[0]?.integritySignals).not.toContain("too_fast");
  });

  it("`integrity.interactions === 0` ve doğru yanıtta no_interaction_correct üretir", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const { sessionId } = await runTwoCaseSession(h, ali, {
      advanceMsBeforeAnswer: PULSE_THRESHOLD_MS + 500,
      integrity: { ...NO_INTEGRITY_SIGNALS, interactions: 0 },
    });
    const row = h.simSessions.rows.get(sessionId);
    expect(row?.state.cases.every((c) => c.integritySignals.includes("no_interaction_correct"))).toBe(true);
    expect(row?.integrityStatus).toBe("unverified");
  });

  it("eski istemci (integrity alanı yok) anında + doğru yanıtlasa da eşiği geçmezse işaretlenmez", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    // Gecikmeyi eşiğin üstünde tutarak (integrity alanı yok) hiçbir sinyal doğmaz.
    const { sessionId } = await runTwoCaseSession(h, ali, { advanceMsBeforeAnswer: PULSE_THRESHOLD_MS + 500 });
    const row = h.simSessions.rows.get(sessionId);
    expect(row?.integrityStatus).toBeNull();
    expect(row?.state.cases.every((c) => c.integritySignals.length === 0)).toBe(true);
    expect(h.integrity.rows.some((r) => r.sessionId === sessionId)).toBe(false);
  });
});

describe("T283a — tutarlılık sinyali (consistent_fast)", () => {
  it("son 3 değerlendirme oturumu da yüksek doğruluk + düşük gecikme taşıyorsa üçüncü oturum consistent_fast ile işaretlenir", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    // too_fast'ı tetiklemeyecek ama tutarlılık sınırının (1.5x) altında kalacak gecikme.
    const advanceMs = PULSE_THRESHOLD_MS + 500;
    const results: { readonly sessionId: string; readonly total: number }[] = [];
    for (let i = 0; i < 3; i += 1) {
      results.push(await runTwoCaseSession(h, ali, { advanceMsBeforeAnswer: advanceMs }));
    }
    for (const result of results) expect(result.total).toBe(100);
    const [first, second, third] = results;
    expect(h.simSessions.rows.get(first!.sessionId)?.integrityStatus).toBeNull();
    expect(h.simSessions.rows.get(second!.sessionId)?.integrityStatus).toBeNull();
    expect(h.simSessions.rows.get(third!.sessionId)?.integrityStatus).toBe("unverified");
    const flagged = h.integrity.rows.find((r) => r.sessionId === third!.sessionId);
    expect(flagged?.signals.counts.consistent_fast).toBe(1);
    expect(flagged?.signals.counts.too_fast).toBe(0);
  });

  it("yalnız 2 oturum varsa (üçüncüsü yok) tutarlılık sinyali doğmaz", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const advanceMs = PULSE_THRESHOLD_MS + 500;
    const first = await runTwoCaseSession(h, ali, { advanceMsBeforeAnswer: advanceMs });
    const second = await runTwoCaseSession(h, ali, { advanceMsBeforeAnswer: advanceMs });
    expect(h.simSessions.rows.get(first.sessionId)?.integrityStatus).toBeNull();
    expect(h.simSessions.rows.get(second.sessionId)?.integrityStatus).toBeNull();
  });
});

describe("T283a — GET /admin/integrity yetki ve yanıt", () => {
  it("kimliksiz 401, öğrenci 403, admin 200 ve işaretli oturumu listeler", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    await runTwoCaseSession(h, ali, { advanceMsBeforeAnswer: 0, integrity: NO_INTEGRITY_SIGNALS });
    const admin = await login(h, "ornek.yonetici");

    expect((await call(h, undefined, "GET", "/admin/integrity")).status).toBe(401);
    expect((await call(h, ali, "GET", "/admin/integrity")).status).toBe(403);

    const response = await call(h, admin, "GET", "/admin/integrity");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: readonly { readonly displayName: string; readonly score: number; readonly simId: string; readonly signals: { readonly cases: Record<string, readonly string[]>; readonly counts: Record<string, number> } }[];
      meta: { readonly total: number };
    };
    expect(body.meta.total).toBeGreaterThanOrEqual(1);
    expect(body.data[0]?.displayName).toBe(ALI.displayName);
    expect(body.data[0]?.simId).toBe("pulse");
    // KVKK: yanıt yalnız sayı/bilinen sinyal adı taşır — serbest metin yok.
    const KNOWN = new Set(["too_fast", "no_interaction_correct", "tab_hidden", "blur_many", "paste", "consistent_fast"]);
    for (const row of body.data) {
      for (const signals of Object.values(row.signals.cases)) for (const signal of signals) expect(KNOWN.has(signal)).toBe(true);
      for (const name of Object.keys(row.signals.counts)) expect(KNOWN.has(name)).toBe(true);
    }

    const cleared = await call(h, admin, "GET", "/admin/integrity?status=cleared");
    expect(((await cleared.json()) as { data: readonly unknown[] }).data).toEqual([]);
  });
});
