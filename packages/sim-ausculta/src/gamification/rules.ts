/** EGEMED Ausculta — sim'e özgü rozet eşikleri ve haftalık hedefler.
 *  XP ve sıralama çekirdek varsayılanıdır. Haftalık ortalama, ustalık eşiği 80 ile aynıdır. */

import { DEFAULT_RULES, type GamiRules } from "@egemed/gamification-core";

export interface AuscultaBadgeRules {
  listenDiscipline: readonly [number, number, number];
  systematic: readonly [number, number, number];
  cardiacFoci: number;
  posteriorLung: number;
  heartNormal: number;
  extraHeartSounds: number;
  murmurTiming: number;
  rhythmFindings: number;
  vesicular: number;
  continuousAdventitious: number;
  crackles: number;
  pleuralRub: number;
  pediatric: number;
  mixed: number;
  headChoice: number;
}

export interface AuscultaGamiRules extends GamiRules {
  badges: AuscultaBadgeRules;
}

export const AUSCULTA_RULES: AuscultaGamiRules = {
  ...DEFAULT_RULES,
  week: {
    assessmentSessionsGoal: 4,
    avgScoreGoal: 80,
    newBadgesGoal: 2,
  },
  badges: {
    listenDiscipline: [3, 8, 20],
    systematic: [1, 5, 15],
    cardiacFoci: 5,
    posteriorLung: 5,
    heartNormal: 3,
    extraHeartSounds: 3,
    murmurTiming: 5,
    rhythmFindings: 3,
    vesicular: 3,
    continuousAdventitious: 5,
    crackles: 5,
    pleuralRub: 3,
    pediatric: 5,
    mixed: 3,
    headChoice: 5,
  },
};
