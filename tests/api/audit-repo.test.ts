import { expect, it } from "vitest";
import { createPgAuthRepos, type AuthDb } from "../../apps/api/src/auth/repo";

const INSTITUTION_ID = "00000000-0000-4000-8000-000000000010";

it("audit list resolves import/reward names in its paged row query without N+1", async () => {
  const calls: string[] = [];
  const db: AuthDb = {
    async query(text) {
      calls.push(text);
      if (text.includes("count(*)")) return { rows: [{ total: 2 }] };
      return {
        rows: [
          { id: "1", occurred_at: new Date("2026-09-01T10:00:00Z"), actor_user_id: null, actor_role: null, action: "import.apply", target_type: "import_batch", target_id: "batch-id", summary_before: null, summary_after: {}, request_id: null, actor_name: null, target_name: "roster.csv" },
          { id: "2", occurred_at: new Date("2026-09-01T09:00:00Z"), actor_user_id: null, actor_role: null, action: "reward.upsert", target_type: "monthly_reward", target_id: "pulse:2026-08", summary_before: null, summary_after: {}, request_id: null, actor_name: null, target_name: "Pulse · 2026-08" },
        ],
      };
    },
  };

  const result = await createPgAuthRepos(db).audit.list({ institutionId: INSTITUTION_ID, page: 1, pageSize: 20 });
  expect(result.rows.map((row) => row.targetName)).toEqual(["roster.csv", "Pulse · 2026-08"]);
  expect(result.total).toBe(2);
  expect(calls).toHaveLength(2);
  expect(calls[1]).toContain("left join import_batches");
  expect(calls[1]).toContain("left join monthly_rewards");
});
