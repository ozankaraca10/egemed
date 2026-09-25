/** Oyunlaştırma ikon seti. Çizimler Opaca `icons.tsx` ile aynıdır; simler `defaultGamiIcons` kullanır. */
import type { ReactElement, SVGProps } from "react";
import type { GamiIcons } from "./types";

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({
  xmlns: "http://www.w3.org/2000/svg",
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
  ...p,
});

const IconStethoscope = (p: P) => (
  <svg {...base(p)}><path d="M4.8 2.3A6 6 0 0 0 10 8v3a4 4 0 0 0 8 0v-1" /><path d="M18 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /><path d="M14 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" /><path d="M14 19h2a4 4 0 0 0 4-4" /></svg>
);
const IconHeart = (p: P) => <svg {...base(p)}><path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l6.5 6.5z" /><path d="M3.2 12h5l1.8-3 2 5 2-4 1.5 2h5" /></svg>;
const IconLungs = (p: P) => (
  <svg {...base(p)}><path d="M12 3v7c0 2-1 3-3 3" /><path d="M12 10c0-2-1-3-3-3" /><path d="M12 3v7c0 2 1 3 3 3" /><path d="M12 10c0-2-1-3-3-3" /><path d="M8 11c-2 0-4 2-4 5 0 2 1 4 3 4 2 0 4-1 4-3v-6z" /><path d="M16 11c2 0 4 2 4 5 0 2-1 4-3 4-2 0-4-1-4-3v-6z" /></svg>
);
const IconActivity = (p: P) => <svg {...base(p)}><path d="M3 12h4l2-6 3 12 3-8 2 2h4" /></svg>;
const IconChart = (p: P) => <svg {...base(p)}><rect x="4" y="12" width="3.6" height="8" rx="1" /><rect x="10.2" y="7" width="3.6" height="17" rx="1" transform="translate(0 -2)" /><rect x="16.4" y="10" width="3.6" height="14" rx="1" /></svg>;
const IconCheckCircle = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 5-6" /></svg>;
const IconCheck = (p: P) => <svg {...base(p)}><path d="m5 12 5 5 9-10" /></svg>;
const IconInfo = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><circle cx="12" cy="7.5" r="0.5" fill="currentColor" /></svg>;
const IconBook = (p: P) => <svg {...base(p)}><path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19a2 2 0 0 0 2 2h13" /></svg>;
const IconClock = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>;
const IconTarget = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>;
const IconLightbulb = (p: P) => <svg {...base(p)}><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 1 3.7 10.7c-.7.6-1 1.4-1 2.3h-4c0-.9-.3-1.7-1-2.3A6 6 0 0 1 12 3z" /></svg>;
const IconDoc = (p: P) => <svg {...base(p)}><path d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" /><path d="M14 2v4h4" /><path d="M8 12h8M8 16h8" /></svg>;
const IconChevronRight = (p: P) => <svg {...base(p)}><path d="m9 5 7 7-7 7" /></svg>;
const IconArrowRight = (p: P) => <svg {...base(p)}><path d="M4 12h15" /><path d="m13 6 6 6-6 6" /></svg>;
const IconTrophy = (p: P) => (
  <svg {...base(p)}><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 5H5a3 3 0 0 0 3 5M16 5h3a3 3 0 0 1-3 5" /><path d="M12 13v4M8 21h8M10 17h4l1 4H9z" /></svg>
);
const IconWave = (p: P) => <svg {...base(p)}><path d="M2 12h3l2-6 3 12 3-9 2.5 5.5L18 9l2 3h2" /></svg>;
const IconBrain = (p: P) => <svg {...base(p)}><path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 5.5A3 3 0 0 0 5 12a3 3 0 0 0 1.5 5.2A2.8 2.8 0 0 0 9 21c1.2 0 2-.8 2-2V5a2 2 0 0 0-2-2z" /><path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 3 5.5 3 3 0 0 1-2 5.5 2.8 2.8 0 0 1-2.5 4c-1.2 0-2-.8-2-2V5a2 2 0 0 1 .5-2z" /></svg>;
const IconUser = (p: P) => <svg {...base(p)}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
const IconGraduation = (p: P) => <svg {...base(p)}><path d="m2 9 10-5 10 5-10 5z" /><path d="M6 11.5V17c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5" /></svg>;
const IconClose = (p: P) => <svg {...base(p)}><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>;
const IconFilm = (p: P) => (
  <svg {...base(p)}><rect x="3" y="3" width="18" height="18" rx="2.5" /><path d="M12 6v9" /><path d="M12 8c-2.5 0-4.5 1.5-5 5-.3 2 .3 3.5 2 3.5 2 0 3-1.5 3-3.5" /><path d="M12 8c2.5 0 4.5 1.5 5 5 .3 2-.3 3.5-2 3.5-2 0-3-1.5-3-3.5" /></svg>
);
const IconScan = (p: P) => (
  <svg {...base(p)}><path d="M4 8V5a1 1 0 0 1 1-1h3" /><path d="M16 4h3a1 1 0 0 1 1 1v3" /><path d="M20 16v3a1 1 0 0 1-1 1h-3" /><path d="M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M3 12h18" /></svg>
);
const IconBone = (p: P) => (
  <svg {...base(p)}><path d="M17 10c.7.7 2 .7 2.8-.2a2 2 0 0 0-1.4-3.3 2 2 0 0 0-3.3-1.4c-.9.8-.9 2.1-.2 2.8L8.1 14.9c-.7-.7-2-.7-2.8.2a2 2 0 0 0 1.4 3.3 2 2 0 0 0 3.3 1.4c.9-.8.9-2.1.2-2.8z" /></svg>
);
const IconDiaphragm = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="9" r="5" /><circle cx="12" cy="9" r="2" /><path d="M12 14v3" /><path d="M8 20h8" /><path d="M12 17a3 3 0 0 0-3 3" /></svg>
);
const IconFlame = (p: P) => <svg {...base(p)}><path d="M12 3c.5 3 3.5 4.5 3.5 8.5a3.5 3.5 0 0 1-7 0c0-1.5.6-2.6 1.5-3.5.2 1.5 1 2.3 2 2.5-.8-2.5-.5-5 0-7.5z" /><path d="M8.2 13.5A6 6 0 1 0 18 10" /></svg>;
const IconLock = (p: P) => <svg {...base(p)}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
const IconMedal = (p: P) => <svg {...base(p)}><circle cx="12" cy="15" r="6" /><path d="M8.5 10 6 3h4l2 5 2-5h4l-2.5 7" /><path d="M12 12.5v5" /></svg>;
const IconAward = (p: P) => <svg {...base(p)}><circle cx="12" cy="9" r="6" /><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7" /></svg>;
const IconStar = (p: P) => <svg {...base(p)}><path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z" /></svg>;
const IconGift = (p: P) => <svg {...base(p)}><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8" /><path d="M12 8v13" /><path d="M12 8c-1.5-3-5-3.5-5-1.2C7 8 9 8 12 8zM12 8c1.5-3 5-3.5 5-1.2C17 8 15 8 12 8z" /></svg>;
const IconArrowUp = (p: P) => <svg {...base(p)}><path d="M12 19V5" /><path d="m6 11 6-6 6 6" /></svg>;

const BADGE_ICONS: Record<string, (p: P) => ReactElement> = {
  Activity: IconActivity,
  ArrowRight: IconArrowRight,
  ArrowUp: IconArrowUp,
  Award: IconAward,
  Bone: IconBone,
  Book: IconBook,
  Brain: IconBrain,
  Chart: IconChart,
  Check: IconCheck,
  CheckCircle: IconCheckCircle,
  Clock: IconClock,
  Diaphragm: IconDiaphragm,
  Doc: IconDoc,
  Film: IconFilm,
  Flame: IconFlame,
  Gift: IconGift,
  Graduation: IconGraduation,
  Heart: IconHeart,
  Info: IconInfo,
  Lightbulb: IconLightbulb,
  Lock: IconLock,
  Lungs: IconLungs,
  Medal: IconMedal,
  Scan: IconScan,
  Star: IconStar,
  Stethoscope: IconStethoscope,
  Target: IconTarget,
  Trophy: IconTrophy,
  User: IconUser,
  Wave: IconWave,
};

const icon = (C: (p: P) => ReactElement) => (p: { width?: number; height?: number }) => <C {...p} />;

export const defaultGamiIcons: GamiIcons = {
  award: icon(IconAward),
  chart: (p) => <IconChart {...p} />,
  check: icon(IconCheck),
  checkCircle: icon(IconCheckCircle),
  chevronRight: icon(IconChevronRight),
  flame: icon(IconFlame),
  arrowRight: icon(IconArrowRight),
  star: icon(IconStar),
  target: icon(IconTarget),
  info: icon(IconInfo),
  close: icon(IconClose),
  lock: icon(IconLock),
  gift: icon(IconGift),
  clock: icon(IconClock),
  arrowUp: icon(IconArrowUp),
  book: icon(IconBook),
  badge: (name, size) => {
    const C = BADGE_ICONS[name];
    return C ? <C width={size} height={size} /> : null;
  },
};
