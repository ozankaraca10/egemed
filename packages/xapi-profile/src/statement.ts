import type { XapiActor } from "./actor";
import { activityIri, type ActivityPath } from "./iri";
import {
  ACTIVITY_TYPES,
  EXTENSIONS,
  VERBS,
  type ActivityIri,
  type ActivityTypeKey,
  type SimulatorId,
  type VerbIri,
  type VerbKey,
} from "./profile";
import { istanbulTimestamp } from "./time";

/** İfade üretimi bağlamı; `now` enjekte edilir (AGENTS.md). */
export interface StatementInput {
  readonly actor: XapiActor;
  readonly base: string;
  readonly path: ActivityPath;
  readonly activityType: ActivityTypeKey;
  readonly now: () => Date;
}

/** Ham sonuç girdisi; yalnız dolu alanlar ifadeye taşınır. */
export interface ResultInput {
  readonly success?: boolean;
  readonly completion?: boolean;
  readonly scoreScaled?: number;
  readonly response?: string;
}

/** xAPI sonuç nesnesi; `score.scaled` [-1,1] aralığındadır. */
export interface XapiResult {
  readonly success?: boolean;
  readonly completion?: boolean;
  readonly score?: { readonly scaled: number };
  readonly response?: string;
}

/** xAPI ifadesi; saf veri, ağ/gönderim yok (ADR-004). */
export interface XapiStatement {
  readonly actor: XapiActor;
  readonly verb: { readonly id: VerbIri; readonly display: Readonly<Record<string, string>> };
  readonly object: {
    readonly objectType: "Activity";
    readonly id: ActivityIri;
    readonly definition: { readonly type: string };
  };
  readonly result?: XapiResult;
  readonly context: { readonly extensions: { readonly [EXTENSIONS.simulatorId]: SimulatorId } };
  readonly timestamp: string;
}

/**
 * `score.scaled` değişmezi: sonlu ve [-1,1] aralığında olmalı (xAPI 1.0.3
 * §4.1.5.1). Tüm üretici yolları `toResult` üzerinden buradan geçer. İç
 * yardımcıdır; paket API'sine (`index.ts`) dışa aktarılmaz (B1).
 */
function assertScaled(scoreScaled: number): number {
  if (!Number.isFinite(scoreScaled) || scoreScaled < -1 || scoreScaled > 1) {
    throw new RangeError(`scoreScaled [-1,1] aralığında olmalı: ${scoreScaled}`);
  }
  return scoreScaled;
}

/** Dolu alanları koşullu yayarak saf `XapiResult` üretir. */
function toResult(result: ResultInput): XapiResult {
  return {
    ...(result.success === undefined ? {} : { success: result.success }),
    ...(result.completion === undefined ? {} : { completion: result.completion }),
    ...(result.scoreScaled === undefined
      ? {}
      : { score: { scaled: assertScaled(result.scoreScaled) } }),
    ...(result.response === undefined ? {} : { response: result.response }),
  };
}

/**
 * Tek bir fiil için ifade üretir. `result` verilmezse `result` alanı hiç
 * eklenmez (exactOptionalPropertyTypes).
 */
export function buildStatement(
  verb: VerbKey,
  input: StatementInput,
  result?: ResultInput,
): XapiStatement {
  const statement: XapiStatement = {
    actor: input.actor,
    verb: { id: VERBS[verb].id, display: VERBS[verb].display },
    object: {
      objectType: "Activity",
      id: activityIri(input.base, input.path),
      definition: { type: ACTIVITY_TYPES[input.activityType] },
    },
    context: { extensions: { [EXTENSIONS.simulatorId]: input.path.simulator } },
    timestamp: istanbulTimestamp(input.now),
  };
  return result === undefined ? statement : { ...statement, result: toResult(result) };
}

/** `answered` fiili; yanıt ve isteğe bağlı başarı durumu taşır. */
export function buildAnswered(
  input: StatementInput,
  response: string,
  success?: boolean,
): XapiStatement {
  return buildStatement(
    "answered",
    input,
    success === undefined ? { response } : { response, success },
  );
}

/** `passed`/`failed` fiili; skor [-1,1] dışındaysa RangeError (`assertScaled`). */
export function buildScored(
  verb: "passed" | "failed",
  input: StatementInput,
  scoreScaled: number,
): XapiStatement {
  return buildStatement(verb, input, { scoreScaled });
}
