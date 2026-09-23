import { describe, expect, it } from "vitest";
import { activityIri, type ActivityPath } from "../../packages/xapi-profile/src/iri";

const BASE = "https://xapi.egemed.example/clix/";

describe("activityIri", () => {
  it("aynı girdi için aynı IRI üretir (determinizm)", () => {
    const paths: ActivityPath[] = [
      { simulator: "pulse" },
      { simulator: "ausculta", screen: "ekg" },
      { simulator: "opaca", screen: "vaka-01", object: "nesne-01" },
    ];
    for (const path of paths) {
      expect(activityIri(BASE, path), JSON.stringify(path)).toBe(activityIri(BASE, path));
    }
  });

  it("segmentleri simulator/screen/object sırasıyla birleştirir", () => {
    expect(activityIri(BASE, { simulator: "pulse" })).toBe(`${BASE}pulse`);
    expect(activityIri(BASE, { simulator: "pulse", screen: "ekg" })).toBe(`${BASE}pulse/ekg`);
    expect(activityIri(BASE, { simulator: "opaca", screen: "vaka-01", object: "nesne-01" })).toBe(
      `${BASE}opaca/vaka-01/nesne-01`,
    );
  });

  it("https olmayan base'i reddeder", () => {
    expect(() => activityIri("http://xapi.egemed.example/clix/", { simulator: "pulse" })).toThrow(
      RangeError,
    );
  });

  it("sonda '/' olmayan base'i reddeder", () => {
    expect(() => activityIri("https://xapi.egemed.example/clix", { simulator: "pulse" })).toThrow(
      RangeError,
    );
  });

  it("sorgu veya fragment taşıyan base'i reddeder", () => {
    // Sondaki "/" korunur; reddin nedeni yalnız sorgu/fragment olur.
    expect(() => activityIri("https://xapi.egemed.example/clix?x=1/", { simulator: "pulse" })).toThrow(
      RangeError,
    );
    expect(() => activityIri("https://xapi.egemed.example/clix#f/", { simulator: "pulse" })).toThrow(
      RangeError,
    );
  });

  it("boş yetki veya boşluk içeren base'i reddeder", () => {
    expect(() => activityIri("https:///clix/", { simulator: "pulse" })).toThrow(RangeError);
    expect(() => activityIri("https://", { simulator: "pulse" })).toThrow(RangeError);
    expect(() => activityIri("https://x.example/clix /", { simulator: "pulse" })).toThrow(RangeError);
    expect(() => activityIri("xapi", { simulator: "pulse" })).toThrow(RangeError);
  });

  it("segment kuralına uymayan screen/object'i reddeder", () => {
    const invalid = ["Ekg", "ekg 1", "..", "ekg/2", "-ekg", "", "a".repeat(64)];
    for (const screen of invalid) {
      expect(
        () => activityIri(BASE, { simulator: "pulse", screen }),
        JSON.stringify(screen),
      ).toThrow(RangeError);
    }
    expect(() =>
      activityIri(BASE, { simulator: "pulse", screen: "ekg", object: "Nesne" }),
    ).toThrow(RangeError);
  });

  it("screen olmadan object kabul etmez", () => {
    expect(() => activityIri(BASE, { simulator: "pulse", object: "nesne-01" })).toThrow(RangeError);
  });
});
