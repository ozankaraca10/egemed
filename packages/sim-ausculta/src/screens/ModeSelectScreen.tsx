import type { JSX } from "react";
import { audienceCanUseMode, VISITOR_LOCK_TEXT } from "@egemed/sim-host";
import { defaultGamiIcons, GamiModeJourney, type GamiModeCard } from "@egemed/gami-ui";
import { useLearnGate, useStartMode } from "../core/LearnGate";
import { useStore } from "../core/StoreProvider";
import { SESSION_SIZE } from "../core/session";
import type { Mode } from "../core/types";
import { CASE_INVENTORY } from "../data/inventory";
import { LIBRARY_ITEM_COUNT } from "../data/library";
import { EcgDeco, Footer, touchTarget } from "../ui/chrome";
import { useAudience, useOpenChallenges, useRequestSignIn, useSessions, useSetChrome } from "../ui/ScreenHeading";
import { IconLock } from "../ui/icons";
import type { SimRewardsSnapshot } from "@egemed/sim-host";
import { modeLearnLocked, modePickTarget, sessionSeed } from "./entry";

const practiceCases = { length: CASE_INVENTORY.practicePoolSize };
const assessmentCases = { length: CASE_INVENTORY.assessmentPoolSize };
const libraryCount = LIBRARY_ITEM_COUNT;
const HIT = touchTarget();

export interface ModeSelectScreenProps {
  readonly embedded?: boolean;
}

/** Mod seçimi (T289): ortak dört modlu yolculuk — Öğrenme / Uygulama / Değerlendirme / Meydan Okuma.
 *  T209: öğrenme tamamlanmadan diğer modlar KİLİTLİDİR (öneri değil); ziyaretçi kilidi önceliklidir. */
export function ModeSelectScreen({ embedded = false, rewards = null, onLeaderboard }: ModeSelectScreenProps & { rewards?: SimRewardsSnapshot | null; onLeaderboard?: () => void }): JSX.Element {
  const { state, dispatch, now } = useStore();
  const unified = useSetChrome() !== undefined;
  const audience = useAudience();
  const requestSignIn = useRequestSignIn();
  const openChallenges = useOpenChallenges();
  const gate = useLearnGate();
  const startMode = useStartMode();
  // T196: uygulama/değerlendirme vakaları yalnız sunucu oturumundan gelir; kanal yoksa kapalı.
  const serverReady = useSessions() !== undefined;
  const pick = (mode: Mode) => {
    const target = modePickTarget(mode, gate.complete, poolReady(mode));
    if (target !== "learn") dispatch({ type: "startSession", practiceIds: [], assessmentIds: [], seed: sessionSeed(now()) });
    startMode(target);
    if (target === "learn") dispatch({ type: "goto", screen: "learn" });
  };
  const signIn = () => requestSignIn?.();
  const practiceLocked = modeLearnLocked(gate.complete, practiceCases.length > 0);
  const assessmentLocked = modeLearnLocked(gate.complete, assessmentCases.length > 0);
  const canPractice = audienceCanUseMode(audience, "practice");
  const canAssessment = audienceCanUseMode(audience, "assessment");
  const isVisitor = audience === "visitor";
  const isFaculty = audience === "faculty";
  const monthlyReward = rewards?.current ?? null;
  const cards: GamiModeCard[] = [
    {
      key: "learn",
      title: "Öğrenme Modu",
      description: `${libraryCount} ses sınıfını metafor, dalga formu ve klinik bilgiyle sınırsız dinleyerek keşfedin.`,
      bullets: ["Rehberli öğrenme", "Ses metaforları", "Sınırsız dinleme"],
      progress: gate.total > 0 ? gate.listenedCount / gate.total : 0,
      cta: gate.listenedCount > 0 ? "Öğrenmeye devam et" : "Öğrenmeye başla",
      onSelect: () => pick("learn"),
    },
    {
      key: "practice",
      title: "Uygulama Modu",
      description: practiceCases.length
        ? `${practiceCases.length} vakalık havuzdan her oturumda rastgele ${SESSION_SIZE} vaka; ipucu ve geri bildirimle çalışın.`
        : "Uygulama havuzu boş.",
      bullets: [`Rastgele ${SESSION_SIZE} vaka`, "İpucu desteği", "Detaylı geri bildirim"],
      status: state.bestScore.practice > 0 ? `En iyi puan: ${state.bestScore.practice}` : "Henüz denenmedi",
      audienceLocked: !canPractice,
      learnLocked: canPractice && practiceLocked,
      lockText: canPractice ? gate.lockText : VISITOR_LOCK_TEXT.modeLocked,
      cta: !canPractice ? VISITOR_LOCK_TEXT.cta : practiceLocked ? "Önce öğrenme modunu tamamlayın" : "Vakaları çöz",
      disabled: canPractice && (practiceLocked || practiceCases.length === 0 || !serverReady),
      onSelect: canPractice ? () => pick("practice") : signIn,
    },
    {
      key: "assessment",
      title: "Değerlendirme Modu",
      description: assessmentCases.length
        ? `${assessmentCases.length} doğrulanmış vakalık havuzdan rastgele ${SESSION_SIZE} vaka ile maksimum zorlukta ölçülün.`
        : "Değerlendirme havuzu boş.",
      bullets: ["İpucu yok · tek dinleme", "Geri bildirim sonda", "Puan kaydedilir, liderliğe girer"],
      status: state.bestScore.assessment > 0 ? `En iyi puan: ${state.bestScore.assessment}` : "Henüz denenmedi",
      audienceLocked: !canAssessment,
      learnLocked: canAssessment && assessmentLocked,
      lockText: canAssessment ? gate.lockText : VISITOR_LOCK_TEXT.modeLocked,
      cta: !canAssessment ? VISITOR_LOCK_TEXT.cta : assessmentLocked ? "Önce öğrenme modunu tamamlayın" : "Değerlendirmeye gir",
      disabled: canAssessment && (assessmentLocked || assessmentCases.length === 0 || !serverReady),
      onSelect: canAssessment ? () => pick("assessment") : signIn,
      ribbon: monthlyReward && onLeaderboard ? `Bu ayın ödülü · ilk ${monthlyReward.winnersCount} kişiye · ${daysLeftInMonth(now())} gün` : null,
      ...(monthlyReward && onLeaderboard ? {
        extra: (
          <button type="button" className="eg-gami-link" style={HIT} onClick={onLeaderboard}>
            {defaultGamiIcons.gift({ width: 14, height: 14 })} Aylık sıralamayı gör
          </button>
        ),
      } : {}),
    },
    {
      key: "challenge",
      title: "Meydan Okuma",
      description: "Bir arkadaşınla aynı vakalarda yarış. Önce doğru sayısı, eşitlikte süre kazanır.",
      bullets: ["6 haneli davet kodu", "Vaka başı süre sınırı", "Kazanana ½ değerlendirme XP"],
      ...(isFaculty ? { status: "Karşılaşmalar yalnız öğrenciler içindir" } : {}),
      audienceLocked: isVisitor,
      learnLocked: !isVisitor && !gate.complete,
      lockText: isVisitor ? VISITOR_LOCK_TEXT.modeLocked : gate.lockText,
      cta: isVisitor ? VISITOR_LOCK_TEXT.cta : !gate.complete ? "Önce öğrenme modunu tamamlayın" : "Meydana gir",
      disabled: isVisitor ? false : !gate.complete || isFaculty || openChallenges === undefined,
      onSelect: isVisitor ? signIn : () => openChallenges?.(),
    },
  ];
  return (
    <>
      <EcgDeco embedded={embedded} />
      <div className="screen" style={{ position: "relative", zIndex: 1 }}>
        {unified ? null : <Stepper active={1} labels={["Mod Seçimi", "Çalışma", "Tamamla"]} />}
        <div className="screen-body">
        <GamiModeJourney
          simLabel="Ausculta · Oskültasyon Simülatörü"
          learnDone={gate.listenedCount}
          learnTotal={gate.total}
          learnUnit="ses dinlendi"
          note="Tüm modlarda gerçek hasta sesleri kullanılır — kulaklıkla çalışmanız önerilir."
          banner={
            <>
              {isVisitor ? (
                <div className="note-strip visitor-strip" role="note">
                  <IconLock width={17} height={17} aria-hidden="true" />
                  <span>
                    <b>{VISITOR_LOCK_TEXT.badge}.</b> {VISITOR_LOCK_TEXT.locked}{" "}
                    <button type="button" className="hero-link visitor-signin" style={HIT} onClick={signIn}>
                      {VISITOR_LOCK_TEXT.cta}
                    </button>
                  </span>
                </div>
              ) : null}
              {isFaculty ? <p className="mode-sub faculty-note">Öğretim üyesi görünümü — rozet ve sıralama yalnız öğrenciler içindir.</p> : null}
            </>
          }
          cards={cards}
          showFairPlay={!isVisitor && !isFaculty}
          icons={defaultGamiIcons}
        />
        </div>
      </div>
      <Footer embedded={embedded} />
    </>
  );
}

function daysLeftInMonth(nowMs: number): number {
  const local = new Date(nowMs + 3 * 60 * 60 * 1000);
  const nextMonth = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - 3 * 60 * 60 * 1000;
  return Math.ceil((nextMonth - nowMs) / 86_400_000);
}

function poolReady(mode: Mode): boolean {
  if (mode === "practice") return practiceCases.length > 0;
  if (mode === "assessment") return assessmentCases.length > 0;
  return true;
}

export function Stepper({ active, labels }: { active: number; labels: string[] }): JSX.Element {
  return (
    <div className="stepper" aria-label="İlerleme">
      {labels.map((label, i) => (
        <div key={label} className={`step ${i + 1 === active ? "active" : i + 1 < active ? "done" : ""}`}>
          {i > 0 && <span className="line" />}
          <span className="dot">{i + 1 < active ? "✓" : i + 1}</span>
          <span className="lbl">{label}</span>
        </div>
      ))}
    </div>
  );
}
