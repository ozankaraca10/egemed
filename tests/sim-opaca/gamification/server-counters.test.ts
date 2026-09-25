import { describe, expect, it } from "vitest";
import { OPACA_TOPICS, opacaStatsFromSummaries } from "../../../packages/gami-catalogs/src/index";
import { simSummaryCodes } from "../../../apps/shell/src/reportAttempt";
import { CT_STACKS_ITEM_KEY, type OpacaAttemptRecord } from "../../../packages/sim-opaca/src/gamification/attempt";
import { attemptTopicCorrect, computeStats, withServerCounters } from "../../../packages/sim-opaca/src/gamification/stats";
import { LIBRARY_ITEMS } from "../../../packages/sim-opaca/src/data/terminology";
import { attempt } from "./helpers";

const NOW = new Date("2026-09-25T12:00:00.000Z");

describe("ADR-008 S4 — raporlanan denemede konu ve öğrenme sayaçları (T140)", () => {
  it("konu sayımı yalnız değerlendirmede ve yalnız doğru bulgularda", () => {
    const findings = [
      { finding: "pneumothorax", correct: true },
      { finding: "pleural_effusion", correct: true },
      { finding: "nodule_mass", correct: false },
    ];
    expect(attemptTopicCorrect(attempt({ findings }))).toEqual({ pleura: 2 });
    expect(attemptTopicCorrect(attempt({ mode: "practice", findings }))).toEqual({});
  });

  it("öğrenme etkinliği bilinmiyorsa öğrenme sayaçları eklenmez; yerel deneme değişmez", () => {
    const local = attempt({ findings: [{ finding: "pneumothorax", correct: true }] });
    const stats = computeStats([local], { topics: ["abcde"], items: {} }, [], NOW);
    const reported = withServerCounters(local, stats, false);
    expect(reported.extra.learn).toBeUndefined();
    expect(reported.extra.topicCorrect).toEqual({ pleura: 1 });
    expect(local.extra.topicCorrect).toBeUndefined();
    expect(withServerCounters(local, stats, true).extra.learn?.topicsCount).toBe(1);
  });

  it("sunucu istatistiği (kabuk kodları → katalog) yerel istatistikle konu/öğrenme rozetlerinde eşit", () => {
    const learnTopic = LIBRARY_ITEMS.find((item) => !item.finding)?.key ?? "abcde";
    const history: OpacaAttemptRecord[] = [];
    const summaries: Record<string, number>[] = [];
    const learn = { topics: [] as string[], items: {} as Record<string, string[]> };
    const steps: { record: OpacaAttemptRecord; learnTopics: string[]; stacks: string[] }[] = [
      {
        record: attempt({ finishedAt: "2026-09-22T09:00:00.000Z", findings: [
          { finding: "pneumothorax", correct: true },
          { finding: "nodule_mass", correct: true },
        ] }),
        learnTopics: [learnTopic],
        stacks: [],
      },
      {
        record: attempt({ mode: "practice", finishedAt: "2026-09-23T09:00:00.000Z", findings: [{ finding: "pneumothorax", correct: true }] }),
        learnTopics: [learnTopic, "extra-topic"],
        stacks: ["stack-1"],
      },
      {
        record: attempt({ finishedAt: "2026-09-24T09:00:00.000Z", findings: [
          { finding: "pleural_effusion", correct: true },
          { finding: "nodule_mass", correct: false },
        ] }),
        learnTopics: [learnTopic, "extra-topic"],
        stacks: ["stack-1", "stack-2"],
      },
    ];
    for (const step of steps) {
      learn.topics = [...step.learnTopics];
      learn.items = { [CT_STACKS_ITEM_KEY]: [...step.stacks] };
      history.push(step.record);
      const stats = computeStats(history, learn, [], NOW);
      const reported = withServerCounters(step.record, stats, true);
      summaries.push(simSummaryCodes("opaca", reported));
    }
    const local = computeStats(history, learn, [], NOW);
    const server = opacaStatsFromSummaries(summaries);
    for (const topic of OPACA_TOPICS) {
      expect(server.topicCorrect[topic] ?? 0, topic).toBe(local.topicCorrect[topic] ?? 0);
    }
    expect(server.learnTopicsCount).toBe(local.learnTopicsCount);
    expect(server.ctStacksCompletedCount).toBe(local.ctStacksCompletedCount);
    expect(server.allTopicsCoveredCount).toBe(local.allTopicsCoveredCount);
    expect(server.allTopicsTotal).toBe(local.allTopicsTotal);
    expect(local.topicCorrect["pleura"]).toBe(2);
    expect(local.ctStacksCompletedCount).toBe(2);
  });
});
