import { describe, expect, it } from "vitest";
import {
  ACTIVITY_TYPES,
  EXTENSIONS,
  PROFILE_IRI,
  VERBS,
} from "../../packages/xapi-profile/src/profile";

const VERB_PREFIX = "http://adlnet.gov/expapi/verbs/";
const TYPE_PREFIX = "http://adlnet.gov/expapi/activities/";

/** Mutlak http(s) IRI biçimi; kök TS lib seti `URL` içermediğinden regex. */
const ABSOLUTE_IRI = /^https?:\/\/[^\s?#]+$/;

describe("fiil kataloğu", () => {
  it("sekiz ADL fiilini sırayla tanımlar", () => {
    expect(Object.keys(VERBS)).toEqual([
      "initialized",
      "experienced",
      "answered",
      "progressed",
      "completed",
      "passed",
      "failed",
      "terminated",
    ]);
  });

  it("her fiil IRI'si ADL tabanı + anahtarıdır", () => {
    for (const [key, verb] of Object.entries(VERBS)) {
      expect(verb.id, key).toBe(`${VERB_PREFIX}${key}`);
    }
  });

  it("her fiil IRI'si geçerli mutlak IRI'dir", () => {
    for (const [key, verb] of Object.entries(VERBS)) {
      expect(ABSOLUTE_IRI.test(verb.id), key).toBe(true);
    }
  });

  it("her fiil tr-TR ve en-US görünen ad taşır", () => {
    for (const [key, verb] of Object.entries(VERBS)) {
      expect(Object.keys(verb.display).sort(), key).toEqual(["en-US", "tr-TR"]);
      expect(verb.display["tr-TR"].length, key).toBeGreaterThan(0);
      expect(verb.display["en-US"].length, key).toBeGreaterThan(0);
    }
  });

  it("etkinlik tipleri ADL tabanındadır", () => {
    expect(Object.keys(ACTIVITY_TYPES).sort()).toEqual([
      "assessment",
      "interaction",
      "module",
      "simulation",
    ]);
    for (const [key, iri] of Object.entries(ACTIVITY_TYPES)) {
      expect(iri, key).toBe(`${TYPE_PREFIX}${key}`);
    }
  });

  it("EXTENSIONS mutlak IRI ve PROFILE_IRI altındadır", () => {
    expect(ABSOLUTE_IRI.test(EXTENSIONS.simulatorId)).toBe(true);
    expect(EXTENSIONS.simulatorId.startsWith(`${PROFILE_IRI}/`)).toBe(true);
  });
});
