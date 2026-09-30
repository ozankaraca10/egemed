import type { JSX, ReactNode } from "react";
import { audienceCanUseMode, VISITOR_LOCK_TEXT } from "@egemed/sim-host";
import { useLearnGate, useStartMode } from "../core/LearnGate";
import { useStore } from "../core/StoreProvider";
import { SESSION_SIZE } from "../core/session";
import type { Mode } from "../core/types";
import { CASE_INVENTORY } from "../data/inventory";
import { LIBRARY_ITEM_COUNT } from "../data/library";
import { EcgDeco, Footer, touchTarget } from "../ui/chrome";
import { ScreenHeading, useAudience, useRequestSignIn, useSessions, useSetChrome } from "../ui/ScreenHeading";
import { IconArrowRight, IconChart, IconCheck, IconGraduation, IconHeadphones, IconLock, IconStethoscope } from "../ui/icons";
import { modeLearnLocked, modePickTarget, sessionSeed } from "./entry";

const practiceCases = { length: CASE_INVENTORY.practicePoolSize };
const assessmentCases = { length: CASE_INVENTORY.assessmentPoolSize };
const libraryCount = LIBRARY_ITEM_COUNT;
const HIT = touchTarget();

export interface ModeSelectScreenProps {
  readonly embedded?: boolean;
}

/** Mod seçimi: Öğrenme / Uygulama / Değerlendirme. T209: öğrenme tamamlanmadan
 *  uygulama ve değerlendirme KİLİTLİDİR (öneri değil); ziyaretçi kilidi önceliklidir. */
export function ModeSelectScreen({ embedded = false }: ModeSelectScreenProps): JSX.Element {
  const { state, dispatch, now } = useStore();
  const unified = useSetChrome() !== undefined;
  const audience = useAudience();
  const requestSignIn = useRequestSignIn();
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
  const practiceLocked = modeLearnLocked(gate.complete, practiceCases.length > 0);
  const assessmentLocked = modeLearnLocked(gate.complete, assessmentCases.length > 0);
  const practiceVisitorLocked = !audienceCanUseMode(audience, "practice");
  const assessmentVisitorLocked = !audienceCanUseMode(audience, "assessment");
  return (
    <>
      <EcgDeco embedded={embedded} />
      <div className="screen" style={{ position: "relative", zIndex: 1 }}>
        <div className="container screen-body">
          {unified ? null : <Stepper active={1} labels={["Mod Seçimi", "Çalışma", "Tamamla"]} />}
          {audience === "visitor" ? (
            <div className="note-strip visitor-strip" role="note">
              <IconLock width={17} height={17} aria-hidden="true" />
              <span>
                <b>{VISITOR_LOCK_TEXT.badge}.</b> {VISITOR_LOCK_TEXT.locked}{" "}
                <button type="button" className="hero-link visitor-signin" style={HIT} onClick={() => requestSignIn?.()}>
                  {VISITOR_LOCK_TEXT.cta}
                </button>
              </span>
            </div>
          ) : null}
          <ScreenHeading className="mode-title">Çalışma Modunu Seçin</ScreenHeading>
          <p className="mode-sub">Hangi modda çalışmak istersiniz?</p>
          {audience === "faculty" ? (
            <p className="mode-sub faculty-note">
              Öğretim üyesi görünümü — rozet ve sıralama yalnız öğrenciler içindir.
            </p>
          ) : null}
          <div className="mode-note">
            <div className="headphone-banner thin">
              <IconHeadphones />
              <span className="vsep" />
              <span>
                Tüm modlarda gerçek hasta sesleri kullanılır — <span className="muted">kulaklıkla çalışmanız önerilir.</span>
              </span>
            </div>
          </div>
          <div className="mode-cards">
            <ModeCard
              kind="learn"
              icon={<IconGraduation />}
              title="Öğrenme Modu"
              text={`${libraryCount} ses sınıfını metafor, dalga formu ve klinik bilgiyle sınırsız dinleyerek keşfedin.`}
              items={["Rehberli öğrenme", "Ses metaforları", "Sınırsız dinleme"]}
              cta="Öğrenmeye başla"
              onPick={() => pick("learn")}
            />
            <ModeCard
              kind="practice"
              icon={<IconStethoscope />}
              title="Uygulama Modu"
              text={
                practiceCases.length
                  ? `${practiceCases.length} vakalık havuzdan her oturumda rastgele ${SESSION_SIZE} vaka sunulur; ipucu ve geri bildirimle çalışın.`
                  : "Uygulama havuzu boş."
              }
              items={["Rastgele 10 vaka", "İpucu desteği", "Detaylı geri bildirim"]}
              cta={practiceVisitorLocked ? VISITOR_LOCK_TEXT.cta : practiceLocked ? "Önce öğrenme modunu tamamlayın" : "Vakaları çöz"}
              disabled={!practiceVisitorLocked && (practiceLocked || practiceCases.length === 0 || !serverReady)}
              learnLocked={!practiceVisitorLocked && practiceLocked}
              lockText={gate.lockText}
              visitorLocked={practiceVisitorLocked}
              onPick={() => (practiceVisitorLocked ? requestSignIn?.() : pick("practice"))}
              bestScore={state.bestScore.practice}
            />
            <ModeCard
              kind="assessment"
              icon={<IconChart />}
              title="Değerlendirme Modu"
              text={
                assessmentCases.length
                  ? `${assessmentCases.length} doğrulanmış vakalık havuzdan rastgele ${SESSION_SIZE} vaka ile maksimum zorlukta ölçülün.`
                  : "Değerlendirme havuzu boş."
              }
              items={["Rastgele 10 vaka", "İpuçsuz + tek dinleme", embedded ? "Puan kaydedilir" : "SCORM puanı"]}
              rules={embedded ? "İpucu yok · tek dinleme · puan kaydedilir" : "İpucu yok · tek dinleme · SCORM'a puan yazılır"}
              cta={assessmentVisitorLocked ? VISITOR_LOCK_TEXT.cta : assessmentLocked ? "Önce öğrenme modunu tamamlayın" : "Değerlendirmeye gir"}
              disabled={!assessmentVisitorLocked && (assessmentLocked || assessmentCases.length === 0 || !serverReady)}
              learnLocked={!assessmentVisitorLocked && assessmentLocked}
              lockText={gate.lockText}
              visitorLocked={assessmentVisitorLocked}
              onPick={() => (assessmentVisitorLocked ? requestSignIn?.() : pick("assessment"))}
              bestScore={state.bestScore.assessment}
            />
          </div>
        </div>
      </div>
      <Footer embedded={embedded} />
    </>
  );
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

export function ModeCard({
  kind,
  icon,
  title,
  text,
  items,
  cta,
  onPick,
  rules,
  disabled,
  learnLocked,
  lockText,
  visitorLocked,
  bestScore,
}: {
  kind: Mode;
  icon: ReactNode;
  title: string;
  text: string;
  items: string[];
  cta: string;
  onPick: () => void;
  rules?: string;
  disabled?: boolean;
  /** T209: öğrenme tamamlanmadı — kart kilit ikonu ve ilerleme metniyle işaretlenir,
   *  düğme gönderime kapalıdır (`disabled`). */
  learnLocked?: boolean;
  /** Kilit metni: "Önce öğrenme modunu tamamlayın: X/Y ses dinlendi." */
  lockText?: string;
  /** Ziyaretçi kilidi: renk dışında ikon+metinle işaretlenir, düğme "Öğrenci girişi"ne gider. */
  visitorLocked?: boolean;
  bestScore?: number;
}): JSX.Element {
  return (
    <div
      className={`mode-card ${kind}${learnLocked ? " learn-locked" : ""}${visitorLocked ? " visitor-locked" : ""}`}
      data-learn-locked={learnLocked ? "true" : "false"}
      data-visitor-locked={visitorLocked ? "true" : "false"}
    >
      <div className="ic">{icon}</div>
      {visitorLocked ? (
        <p className="mode-lock-hint" role="status">
          <IconLock width={14} height={14} aria-hidden="true" /> {VISITOR_LOCK_TEXT.modeLocked}
        </p>
      ) : learnLocked ? (
        <p className="mode-lock-hint" role="status">
          <IconLock width={14} height={14} aria-hidden="true" /> {lockText}
        </p>
      ) : null}
      <h3>{title}</h3>
      <p className="desc">{text}</p>
      <ul>
        {items.map((item) => (
          <li key={item}>
            <span className="ck"><IconCheck /></span>
            {item}
          </li>
        ))}
      </ul>
      {rules && <p className="mode-rules">{rules}</p>}
      {typeof bestScore === "number" && (
        <p className="mode-best-score">
          {bestScore > 0 ? <>En iyi puan: <b>{bestScore}</b></> : "Henüz denenmedi"}
        </p>
      )}
      <button
        className={`btn ${kind === "learn" ? "green" : kind === "assessment" ? "purple" : "primary"}`}
        style={HIT}
        onClick={onPick}
        disabled={disabled}
      >
        {cta} <IconArrowRight />
      </button>
    </div>
  );
}
