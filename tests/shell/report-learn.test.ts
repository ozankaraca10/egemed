import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SimId } from "../../packages/contracts/src/index";
import { reportLearn } from "../../apps/shell/src/reportLearn";

/**
 * A4 (ADR-009) — istemci puanlı deneme göndermez; kabuk yalnız puansız öğrenme
 * kaydını `POST /me/gamification/:simId/attempts` ucuna iletir. Gövde tek alan
 * (`topic`) taşır; skor/doğru sayısı/zaman istemciden gitmez.
 */

interface WrittenLearn {
  readonly simId: SimId;
  readonly topic: string;
}

function fakeClient(): { readonly written: WrittenLearn[]; readonly client: { readonly gamification: { writeLearn(simId: SimId, input: { readonly topic: string }): Promise<unknown> } } } {
  const written: WrittenLearn[] = [];
  return {
    written,
    client: {
      gamification: {
        async writeLearn(simId, input) {
          written.push({ simId, topic: input.topic });
          return { data: { simId, topic: input.topic, recordedAt: "2026-09-28T12:00:00.000+03:00", xpGained: 2 } };
        },
      },
    },
  };
}

describe("puansız öğrenme raporu (A4)", () => {
  it("yalnız gövde olarak { topic } gönderir; skor alanı hiç yoktur", async () => {
    const fake = fakeClient();
    await reportLearn(fake.client, "opaca", { topic: "opaca:topic:finding.pleura" });
    expect(fake.written).toEqual([{ simId: "opaca", topic: "opaca:topic:finding.pleura" }]);
  });

  it("hata fırlatırsa çağırana aittir; kuyruk veya yeniden deneme yoktur", async () => {
    let calls = 0;
    const failing = {
      gamification: {
        async writeLearn() {
          calls += 1;
          throw new Error("ağ");
        },
      },
    };
    await expect(reportLearn(failing, "pulse", { topic: "pulse:mode:af" })).rejects.toThrow("ağ");
    expect(calls).toBe(1);
  });
});

/** Kabuk ve sim kaynaklarında eski puanlı deneme yolunun kalıntısı aranmaz. */
const SCANNED_ROOTS: readonly string[] = [
  "apps/shell/src",
  "packages/sim-host/src",
  "packages/sim-opaca/src",
  "packages/sim-pulse/src",
  "packages/sim-ausculta/src",
];

const FORBIDDEN_IDENTIFIERS: readonly string[] = [
  /** Eski sim→kabuk puanlı deneme rapor kanalı. */
  "reportAttempt",
  /** İstemci deneme yazımı (puanlı yol, A4'te kapandı). */
  "writeAttempt",
  "codedAttemptSummary",
  "simSummaryCodes",
  "withServerCounters",
];

function sourceFiles(root: string): readonly string[] {
  return readdirSync(root, { recursive: true })
    .filter((entry) => entry.endsWith(".ts") || entry.endsWith(".tsx"))
    .map((entry) => `${root}/${entry}`);
}

describe("istemci puanlı deneme göndermez (A4 kaynak denetimi)", () => {
  it("shell ve sim paketlerinde eski puanlı deneme çağrısı kalmaz", () => {
    for (const root of SCANNED_ROOTS) {
      for (const file of sourceFiles(root)) {
        const source = readFileSync(file, "utf8");
        for (const needle of FORBIDDEN_IDENTIFIERS) {
          expect(source.includes(needle), `${file} içinde ${needle}`).toBe(false);
        }
      }
    }
  });
});
