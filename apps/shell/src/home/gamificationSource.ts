/**
 * "İlerlemem" (T74, E3 §e.8) veri sözleşmesi + kaynaklar. Sim başına özet
 * `@egemed/contracts` `gamiSimSummarySchema` ile birebir örtüşür (XP, seviye,
 * seri, haftalık hedef, son rozetler, sim liderlik özeti); simler arası
 * toplam/birleştirme YOKTUR (ADR-006/007 izolasyonu, E3 §e.8).
 *
 * `apps/api` `GET /me/gamification` henüz canlı değildir (T68 sözleşmesi
 * `@egemed/api-client`de hazır, sunucu ayrı görevdir); bu yüzden ekran veriyi
 * `GamificationSource` arayüzüyle enjekte alır (`UsersDataSource` deseni,
 * `apps/shell/src/admin/usersDataSource.ts`). Geliştirmede deterministik
 * sentetik kaynak kullanılır: sahte oturum (`DevSession`) varken dolu, yokken
 * boş durum döner. Gerçek bağlantı hazır olduğunda `createApiGamificationSource`
 * `@egemed/api-client`'ın `gamification.getAll()` uç noktasını sarar (E3 §d
 * `GET /me/gamification`); bu adaptör henüz `ProgressSection` varsayılanına
 * BAĞLANMAZ (canlı `apps/api` yok) — `createApiUsersSource` (packages/api-client)
 * için de aynı erteleme geçerlidir.
 */

import type { ApiClient } from "@egemed/api-client";
import type { GamiSimSummary, SimId } from "@egemed/contracts";

export type { GamiSimSummary };

export interface GamificationSource {
  /** E3 §d `GET /me/gamification`: üç simin ayrı özeti; dizi 0-3 kayıt taşır. */
  getSummaries(): Promise<readonly GamiSimSummary[]>;
}

/** Sim başına tek özeti kimliğe göre bulur; kayıt yoksa `undefined` (E3 §e.8 boş durum). */
export function summaryForSim(
  summaries: readonly GamiSimSummary[],
  simId: SimId,
): GamiSimSummary | undefined {
  return summaries.find((summary) => summary.simId === simId);
}

/**
 * Deterministik sentetik veri: gerçek öğrenci verisi taşımaz (AGENTS.md).
 * Sabit kurgu kullanılır (yalnız üç sabit kayıt; `usersDataSource.ts`'teki
 * `mulberry32` tohumlu üretici burada gerekli değildir — E3 §d örneğiyle
 * birebir uyumlu tek, sabit bir gösterim yeterlidir). Ausculta bilinçli
 * olarak düşük etkileşim gösterir (seri 0, rozet yok) — sim başına bağımsız
 * durumun bir simde dolu, diğerinde az veri olabileceğini örnekler.
 */
const SYNTHETIC_SUMMARIES: readonly GamiSimSummary[] = [
  {
    simId: "pulse",
    xp: 1450,
    level: 4,
    streak: { current: 3, best: 7, lastDate: "2026-09-22" },
    weeklyGoal: { targetXp: 300, currentXp: 120 },
    badges: [{ key: "rhythm-streak-3", awardedAt: "2026-09-20T10:15:00.000+03:00" }],
    leaderboard: { rank: 5, total: 42 },
    attempts: [],
  },
  {
    simId: "ausculta",
    xp: 210,
    level: 1,
    streak: { current: 0, best: 2, lastDate: null },
    weeklyGoal: { targetXp: 150, currentXp: 0 },
    badges: [],
    leaderboard: { rank: 31, total: 58 },
    attempts: [],
  },
  {
    simId: "opaca",
    xp: 320,
    level: 2,
    streak: { current: 1, best: 4, lastDate: "2026-09-21" },
    weeklyGoal: { targetXp: 200, currentXp: 80 },
    badges: [{ key: "first-step", awardedAt: "2026-09-18T09:30:00.000+03:00" }],
    leaderboard: { rank: 18, total: 96 },
    attempts: [],
  },
];

/**
 * Sentetik `GamificationSource`: `hasProgress` (sahte oturum var mı) `false`
 * iken boş dizi döner (E3 §e.8: "oturum yokken boş durum"); `true` iken sabit
 * üç sim özetini döner. `now` gerektirmez — tüm zaman damgaları sabittir.
 */
export function createSyntheticGamificationSource(hasProgress: boolean): GamificationSource {
  return {
    getSummaries(): Promise<readonly GamiSimSummary[]> {
      return Promise.resolve(hasProgress ? SYNTHETIC_SUMMARIES : []);
    },
  };
}

/**
 * `@egemed/api-client` tabanlı kaynak (E3 §d `GET /me/gamification`). Yanıt
 * zaten `gamiAllResponseSchema` ile doğrulanmıştır (bkz. `ApiClient.gamification.getAll`);
 * bu adaptör yalnız `data.sims` dizisini `GamificationSource` sözleşmesine sarar.
 */
export function createApiGamificationSource(client: Pick<ApiClient, "gamification">): GamificationSource {
  return {
    async getSummaries(): Promise<readonly GamiSimSummary[]> {
      const response = await client.gamification.getAll();
      return response.data.sims;
    },
  };
}
