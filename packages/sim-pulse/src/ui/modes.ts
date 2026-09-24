import type { ActiveView } from "../engine/state";

export type ModeCardId = "learn" | "practice" | "assessment";

/** Data contract for the three entry cards; T20 owns their visual rendering. */
export interface ModeCard {
  id: ModeCardId;
  title: string;
  description: string;
  view: ActiveView;
  icon: ModeCardId;
  features: readonly string[];
}

export const MODE_CARDS: readonly ModeCard[] = [
  {
    id: "learn", title: "İnceleme Modu",
    description: "EKG sonuçlarını kalp, EKG ve dolaşım birlikte inceleyin.",
    view: "sim", icon: "learn",
    features: ["13 EKG sonucu", "12 derivasyon", "Kaliper ve rehberli tur"],
  },
  {
    id: "practice", title: "Uygulama Modu",
    description: "Vaka havuzundan seçilen oturumla klinik karar pratiği yapın.",
    view: "case", icon: "practice",
    features: ["10 vaka", "Gönderim sonrası açıklama", "Simülatörde açma"],
  },
  {
    id: "assessment", title: "Değerlendirme Modu",
    description: "Soru oturumunu tamamlayıp başarı durumunuzu görün.",
    view: "quiz", icon: "assessment",
    features: ["10 soru", "80 puan geçme eşiği", "Sonuç özeti"],
  },
];
