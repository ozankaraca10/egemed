import { describe, expect, it } from "vitest";
import { opaqueActor, parseOpaqueActorId } from "../../packages/xapi-profile/src/actor";
import type { ActivityPath } from "../../packages/xapi-profile/src/iri";
import { EXTENSIONS, SIMULATORS, type VerbKey } from "../../packages/xapi-profile/src/profile";
import {
  buildAnswered,
  buildScored,
  buildStatement,
  type StatementInput,
} from "../../packages/xapi-profile/src/statement";

const NOW_ISO = "2026-09-23T11:05:00Z";
const BASE = "https://egemed.ege.edu.tr/xapi/";
const VERB_KEYS: readonly VerbKey[] = [
  "initialized",
  "experienced",
  "answered",
  "progressed",
  "completed",
  "passed",
  "failed",
  "terminated",
];
const FORBIDDEN_KEYS = ["mbox", "mbox_sha1sum", "openid", "email", "familyName", "givenName"];

const ACTOR = opaqueActor("https://moodle.egemed.example", parseOpaqueActorId("kurum-ogrenci-0001"));

function fixedNow(): Date {
  return new Date(NOW_ISO);
}

function input(overrides: { path?: ActivityPath; now?: () => Date } = {}): StatementInput {
  return {
    actor: ACTOR,
    base: BASE,
    path: overrides.path ?? { simulator: "pulse", screen: "ekg" },
    activityType: "module",
    now: overrides.now ?? fixedNow,
  };
}

/** İfade ağacındaki tüm anahtar yollarını (ör. `actor.account.name`) toplar. */
function collectKeyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectKeyPaths(item, `${prefix}[${index}]`));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    return [path, ...collectKeyPaths(child, path)];
  });
}

function keySegments(path: string): string[] {
  return path.split(".");
}

describe("xAPI ifadesi", () => {
  it("now enjekte edilir ve damga Europe/Istanbul ofseti taşır", () => {
    let calls = 0;
    const now = (): Date => {
      calls += 1;
      return new Date(NOW_ISO);
    };
    const statement = buildStatement("initialized", input({ now }));
    expect(calls).toBe(1);
    expect(statement.timestamp).toBe("2026-09-23T14:05:00.000+03:00");
  });

  it("aynı enjekte edilen an için aynı damgayı üretir", () => {
    expect(buildStatement("completed", input()).timestamp).toBe(
      buildStatement("completed", input()).timestamp,
    );
  });

  it("activity IRI'sini ve definition tipini taşır", () => {
    const statement = buildStatement("completed", input());
    expect(statement.object.objectType).toBe("Activity");
    expect(statement.object.id).toBe(`${BASE}pulse/ekg`);
    expect(statement.object.definition.type).toBe("http://adlnet.gov/expapi/activities/module");
  });

  it("her fiil için yasak alan taşımaz; name yalnız actor.account.name yolundadır", () => {
    for (const verb of VERB_KEYS) {
      const statement = buildStatement(verb, input());
      const paths = collectKeyPaths(statement);
      for (const forbidden of FORBIDDEN_KEYS) {
        const hits = paths.filter((path) => keySegments(path).includes(forbidden));
        expect(hits, `${verb} → ${forbidden}`).toEqual([]);
      }
      expect(
        paths.filter((path) => keySegments(path).includes("name")),
        verb,
      ).toEqual(["actor.account.name"]);
    }
  });

  it("serileştirilmiş ifade yasak alan adlarını metin olarak da içermez", () => {
    for (const verb of VERB_KEYS) {
      const json = JSON.stringify(buildStatement(verb, input()));
      for (const forbidden of FORBIDDEN_KEYS) {
        expect(json.includes(forbidden), `${verb} → ${forbidden}`).toBe(false);
      }
    }
  });

  it("aktör yalnız objectType ve account taşır (ADR-005)", () => {
    const statement = buildStatement("experienced", input());
    expect(Object.keys(statement.actor).sort()).toEqual(["account", "objectType"]);
    expect(Object.keys(statement.actor.account).sort()).toEqual(["homePage", "name"]);
  });

  it("context tek simülatör taşır", () => {
    for (const simulator of SIMULATORS) {
      const statement = buildStatement("experienced", input({ path: { simulator } }));
      expect(Object.keys(statement.context.extensions), simulator).toEqual([
        EXTENSIONS.simulatorId,
      ]);
      expect(statement.context.extensions[EXTENSIONS.simulatorId], simulator).toBe(simulator);
    }
  });

  it("e-posta biçimli ve sınıra uymayan kimlikleri reddeder", () => {
    expect(() => parseOpaqueActorId("ogrenci@ornek.example")).toThrow(RangeError);
    expect(() => parseOpaqueActorId("kisa")).toThrow(RangeError);
    expect(() => parseOpaqueActorId("a".repeat(129))).toThrow(RangeError);
    expect(() => parseOpaqueActorId("bosluk lu")).toThrow(RangeError);
  });

  it("https olmayan homePage reddedilir", () => {
    const id = parseOpaqueActorId("kurum-ogrenci-0001");
    expect(() => opaqueActor("http://moodle.egemed.example", id)).toThrow(RangeError);
  });

  it("answered yanıtı ve isteğe bağlı başarıyı taşır", () => {
    const answered = buildAnswered(input(), "A seçeneği");
    expect(answered.verb.id).toBe("http://adlnet.gov/expapi/verbs/answered");
    expect(answered.result).toEqual({ response: "A seçeneği" });
    expect(buildAnswered(input(), "A seçeneği", false).result).toEqual({
      response: "A seçeneği",
      success: false,
    });
  });

  it("buildScored skor sınırını uygular", () => {
    expect(buildScored("passed", input(), 0.8).result).toEqual({ score: { scaled: 0.8 } });
    expect(buildScored("failed", input(), -1).result).toEqual({ score: { scaled: -1 } });
    expect(() => buildScored("failed", input(), 1.5)).toThrow(RangeError);
    expect(() => buildScored("passed", input(), -1.5)).toThrow(RangeError);
    expect(() => buildScored("passed", input(), Number.NaN)).toThrow(RangeError);
  });

  it("buildStatement skor sınırını toResult yolunda da uygular (B1)", () => {
    expect(buildStatement("passed", input(), { scoreScaled: 0.5 }).result).toEqual({
      score: { scaled: 0.5 },
    });
    expect(() => buildStatement("passed", input(), { scoreScaled: 1.5 })).toThrow(RangeError);
    expect(() => buildStatement("failed", input(), { scoreScaled: -1.5 })).toThrow(RangeError);
    expect(() => buildStatement("passed", input(), { scoreScaled: Number.NaN })).toThrow(RangeError);
    expect(() =>
      buildStatement("passed", input(), { scoreScaled: Number.POSITIVE_INFINITY }),
    ).toThrow(RangeError);
  });

  it("üretilen ifade saf veridir (JSON round-trip)", () => {
    for (const verb of VERB_KEYS) {
      const statement = buildStatement(verb, input());
      expect(JSON.parse(JSON.stringify(statement)), verb).toEqual(statement);
    }
    const withResult = buildAnswered(input(), "B", true);
    expect(JSON.parse(JSON.stringify(withResult))).toEqual(withResult);
  });
});
