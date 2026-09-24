/** EGEMED Pulse — çekirdekten türetilmiş, Pulse'a özgü haftalık hedefler. */

import { DEFAULT_RULES } from "@egemed/gamification-core";
import type { GamiRules } from "@egemed/gamification-core";

export const PULSE_RULES: GamiRules = {
  ...DEFAULT_RULES,
  week: {
    assessmentSessionsGoal: 3,
    avgScoreGoal: 75,
    newBadgesGoal: 2,
  },
};
