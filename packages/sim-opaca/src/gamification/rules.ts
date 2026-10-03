/** EGEMED Opaca — oyunlaştırma sayısal kuralları (sim'e özgü rozet eşikleri + çekirdek kurallar).
 *  Çekirdek XP/seviye/hafta/sıralama kuralları DEFAULT_RULES'tan türetilir; rozet eşikleri burada kalır. */

import { DEFAULT_RULES, type GamiRules } from "@egemed/gamification-core";

interface OpacaBadgeRules {
  sharpEye: readonly [number, number, number];
  filmQuality: number;
  interpreter: number;
  pleura: number;
  cardiac: number;
  nodule: number;
  tb: number;
  parenchyma: number;
  diaphragm: number;
  bone: number;
  vascular: number;
  streak: readonly [number, number, number];
  marathon: number;
  explorerTopics: number;
  practiceGrit: number;
  thresholdScore: number;
  noHintsCaseMin: number;
}

interface OpacaGamiRules extends GamiRules {
  badges: OpacaBadgeRules;
  storage: {
    key: string;
    maxAttempts: number;
  };
}

export const OPACA_RULES: OpacaGamiRules = {
  ...DEFAULT_RULES,
  badges: {
    sharpEye: [10, 25, 50],
    filmQuality: 10,
    interpreter: 10,
    pleura: 5,
    cardiac: 5,
    nodule: 10,
    tb: 10,
    parenchyma: 10,
    diaphragm: 5,
    bone: 5,
    vascular: 3,
    streak: [3, 7, 30],
    marathon: 50,
    explorerTopics: 10,
    practiceGrit: 20,
    thresholdScore: 80,
    noHintsCaseMin: 10,
  },
  storage: {
    key: "opaca.gami.v1",
    maxAttempts: 500,
  },
};
