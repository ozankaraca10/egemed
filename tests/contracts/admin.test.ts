import { describe, expect, it } from "vitest";
import {
  adminAuditRowSchema,
  adminGamiSummaryResponseSchema,
  adminHealthResponseSchema,
  adminOverviewResponseSchema,
} from "../../packages/contracts/src/index";

const simOverview = {
  accessUsers: 2,
  activeUsers30d: 1,
  attemptsThisMonth: { practice: 3, assessment: 2 },
  learnCompleted: 1,
  openChallenges: 0,
  currentReward: { month: "2026-09", title: "Ayın ödülü" },
};

const overview = {
  data: {
    users: {
      total: 2,
      byStatus: { invited: 0, active: 2, suspended: 0 },
      byRole: { admin: 1, kullanici: 1, ogretim_uyesi: 0, uzmanlik_ogrencisi: 0 },
    },
    loginsLast7Days: 1,
    pendingImports: 0,
    sims: { pulse: simOverview, ausculta: { ...simOverview, currentReward: null }, opaca: { ...simOverview, currentReward: null } },
  },
};

describe("admin response contracts", () => {
  it("overview requires separate nonnegative counters for each sim", () => {
    expect(adminOverviewResponseSchema.safeParse(overview).success).toBe(true);
    expect(adminOverviewResponseSchema.safeParse({ ...overview, data: { ...overview.data, sims: { ...overview.data.sims, pulse: { ...simOverview, accessUsers: -1 } } } }).success).toBe(false);
  });

  it("health accepts all LRS states and rejects an unknown state", () => {
    for (const lrs of ["ok", "down", "not_configured"] as const) {
      expect(adminHealthResponseSchema.safeParse({ status: lrs === "down" ? "degraded" : "ok", db: "ok", lrs, version: "0.0.0" }).success).toBe(true);
    }
    expect(adminHealthResponseSchema.safeParse({ status: "ok", db: "ok", lrs: "https://lrs.example.invalid", version: "0.0.0" }).success).toBe(false);
  });

  it("user gamification schema validates its per-sim summary", () => {
    const valid = { data: { sims: [{ simId: "pulse", xp: 0, level: 1, streak: { current: 0, best: 0, lastDate: null } }] } };
    expect(adminGamiSummaryResponseSchema.safeParse(valid).success).toBe(true);
    expect(adminGamiSummaryResponseSchema.safeParse({ data: { sims: [{ ...valid.data.sims[0], xp: -1 }] } }).success).toBe(false);
  });

  it("audit row allows older records without name fields and validates new names", () => {
    const old = { id: "1", occurredAt: "2026-09-30T10:00:00.000+03:00", actorUserId: null, actorRole: null, action: "system.run", targetType: null, targetId: null, summaryBefore: null, summaryAfter: {}, requestId: null };
    expect(adminAuditRowSchema.safeParse(old).success).toBe(true);
    expect(adminAuditRowSchema.safeParse({ ...old, actorName: null, targetName: "Pulse · 2026-09" }).success).toBe(true);
  });
});
