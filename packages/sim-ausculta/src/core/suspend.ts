import type { CaseResult, SuspendPayload } from "./types";

/** Suspend data serileştirme (§27). Kompakt; 1.2 limitine (≤4096 karakter) uygun. */

/** SCORM suspend_data boyut limitleri: 1.2 → 4096, 2004 → 64000 karakter.
 *  Limit aşılırsa veri kademeli olarak küçültülür (önce örneklik ayrıntısı, sonra
 *  telemetri, en son alan skorları); oturum kimliği/ilerleme her zaman korunur. */
export const SUSPEND_LIMIT_12 = 4000;
export const SUSPEND_LIMIT_2004 = 64000;

export function serializeSuspend(p: SuspendPayload, maxLen = SUSPEND_LIMIT_2004): string {
  const levels = 5;
  for (let level = 0; level < levels; level++) {
    const out = build(p, level);
    if (out.length <= maxLen) return out;
  }
  return build(p, levels - 1);
}

function visitRow(
  id: string,
  dwell: number,
  listen: number,
  visits: number,
  firstOrder: number,
): [string, number, number, number, number] {
  return [id, dwell, listen, visits, firstOrder];
}

function build(p: SuspendPayload, level: number): string {
  // level 0: tam · 1: örneklik saniyeye yuvarlanır · 2: örneklik yok · 3: alan skorları yok · 4: vaka sonuçları yok
  const visits: [string, number, number, number, number][] =
    level >= 2
      ? []
      : Object.entries(p.visits).map(([k, v]) =>
          level >= 1
            ? visitRow(k, Math.round(v.dwellMs / 1000), Math.round(v.listenMs / 1000), v.visits, 0)
            : visitRow(k, v.dwellMs, v.listenMs, v.visits, v.firstOrder),
        );
  const obj = {
    v: p.v,
    u: level === 1 ? 1 : 0,
    m: p.mode.charAt(0), // l | p | a
    c: p.caseIndex,
    s: p.step,
    a: p.answers,
    h: p.hintsUsed,
    t: p.tutorialDone ? 1 : 0,
    at: p.attempts,
    v2: visits,
    o: level >= 2 ? [] : p.order,
    si: p.sessionIds,
    sd: p.sessionSeed,
    r:
      level >= 4
        ? []
        : p.caseResults.map((r) => [
            r.caseId,
            Math.round(r.total),
            r.mastery ? 1 : 0,
            level >= 3
              ? []
              : Object.entries(r.domains).map(([k, d]) => [k, Math.round(d.earned * 100) / 100, d.max]),
          ]),
  };
  return JSON.stringify(obj);
}

export function deserializeSuspend(raw: string | null | undefined): SuspendPayload | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as {
      v: number;
      m: string;
      c: number;
      s: number;
      a: Record<string, string[]>;
      h: number;
      t: number;
      at: number;
      v2: [string, number, number, number, number][];
      u?: number;
      o: string[];
      si?: string[];
      sd?: number;
      r: [string, number, number, [string, number, number][]][];
    };
    const modes: Record<string, SuspendPayload["mode"]> = { l: "learn", p: "practice", a: "assessment" };
    const unit = o.u ? 1000 : 1;
    const visits: SuspendPayload["visits"] = {};
    for (const row of o.v2 ?? []) {
      const [k, dwell, listen, n, first] = row;
      visits[k] = { dwellMs: dwell * unit, listenMs: listen * unit, visits: n, firstOrder: first };
    }
    return {
      v: o.v,
      mode: modes[o.m] ?? "practice",
      caseIndex: o.c ?? 0,
      step: o.s ?? 0,
      answers: o.a ?? {},
      hintsUsed: o.h ?? 0,
      caseResults: (o.r ?? []).map(([caseId, total, m, doms]) => {
        const domains = {} as CaseResult["domains"];
        for (const domain of doms ?? []) {
          const [k, earned, max] = domain;
          domains[k as keyof CaseResult["domains"]] = { earned, max };
        }
        return {
          caseId,
          total,
          max: 100,
          mastery: m === 1,
          domains,
          answers: [],
          hintsUsed: 0,
        };
      }),
      tutorialDone: o.t === 1,
      visits,
      order: o.o ?? [],
      attempts: o.at ?? 0,
      sessionIds: o.si ?? [],
      sessionSeed: o.sd ?? 0,
    };
  } catch {
    return null;
  }
}
