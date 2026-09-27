import { useChallenge } from "../ui/ScreenHeading";
import { endOfMonthTr } from "@egemed/gamification-core";
import { defaultGamiIcons, GamiGainsView } from "@egemed/gami-ui";
import { Fragment, useMemo, useState, type JSX, type ReactNode } from "react";
import { firstWeakLibraryKey, weakDomainKeys } from "../core/flow";
import { useStartMode } from "../core/LearnGate";
import { aggregateResults } from "../core/scoring";
import type { SimRuntime } from "../core/runtime";
import { useStore } from "../core/StoreProvider";
import type { ScoringWeights } from "../core/types";
import { EcgDeco, Footer, touchTarget } from "../ui/chrome";
import { ScreenHeading, useAudience } from "../ui/ScreenHeading";
import {
  IconCheckCircle,
  IconChevronRight,
  IconClock,
  IconDoc,
  IconExit,
  IconLungs,
  IconStethoscope,
  IconWave,
} from "../ui/icons";
import { auscultaSessionGains } from "../gamification/gains";
import { localLeaderboardRows } from "../gamification/leaderboard";
import type { LocalGamiRepository } from "../gamification/repo";
import { AUSCULTA_RULES } from "../gamification/rules";

/** Sonuç ekranı (E2 §9 S16a). Özet şerit, alan yüzdesi, açılır vaka raporu.
 *  `Date.now` ve `window` yok. Tohum enjekte `now`. LMS çıkışı terminate seam'i;
 *  öğrenci adı (`learner_name`) okunmaz ve yazılmaz. */

const HIT = touchTarget();

/** Sonuç satırı için soru görünümü (sunucu anlık görüntüsü + sonuç meta verisi). */
interface ReviewQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly options: readonly { readonly id: string; readonly label: string }[];
  readonly correct: readonly string[];
  readonly feedbackIncorrect: string;
}


/** LMS çıkış seam'i (kaynak: `runtime.flags.scormAvailable` + `window.close`). */
export interface ResultsScreenEnv {
  /** LMS bağlıysa çıkışta oturumu sonlandır ve pencere kapatmayı dene. */
  readonly lmsAttached: boolean;
  requestClose(): void;
}

export function createNoopResultsScreenEnv(): ResultsScreenEnv {
  return { lmsAttached: false, requestClose: () => undefined };
}

const NOOP_RESULTS_ENV: ResultsScreenEnv = createNoopResultsScreenEnv();

export interface ResultsExitPorts {
  readonly env: ResultsScreenEnv;
  readonly runtime: Pick<SimRuntime, "terminated" | "terminate">;
  dispatch(action: { type: "goto"; screen: "start" }): void;
}

/** Bağımsız modda yalnız başlangıca döner. LMS bağlıysa bir kez terminate eder ve kapatmayı ister. */
export function exitResults(ports: ResultsExitPorts): void {
  if (ports.env.lmsAttached && !ports.runtime.terminated) ports.runtime.terminate();
  if (ports.env.lmsAttached) ports.env.requestClose();
  ports.dispatch({ type: "goto", screen: "start" });
}

export interface ResultsScreenProps {
  readonly embedded?: boolean;
  readonly env?: ResultsScreenEnv;
  readonly repository?: LocalGamiRepository;
  readonly onAchievements?: () => void;
  readonly onLeaderboard?: () => void;
  /** API oturumunda veri sunucudan: kazanım kartında “Demo verisi” etiketi yok. */
  readonly serverData?: boolean;
}

export function ResultsScreen({ embedded = false, env = NOOP_RESULTS_ENV, repository, onAchievements, onLeaderboard, serverData = false }: ResultsScreenProps): JSX.Element {
  const { state, dispatch, runtime, now } = useStore();
  const audience = useAudience();
  const startMode = useStartMode();
  const isAssessment = state.mode === "assessment";
  const agg = aggregateResults(state.caseResults);
  const last = state.caseResults[state.caseResults.length - 1];
  const total = isAssessment ? agg.total : (last?.total ?? 0);
  const passed = isAssessment ? agg.mastery : (last?.mastery ?? false);
  const domains = isAssessment ? agg.domains : (last?.domains ?? null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const domainRows: { key: keyof ScoringWeights; label: string; icon: ReactNode }[] = [
    { key: "technique", label: "Oskültasyon tekniği", icon: <IconStethoscope /> },
    { key: "localization", label: "Anatomik lokalizasyon", icon: <IconLungs /> },
    { key: "recognition", label: "Ses tanımlama", icon: <IconWave /> },
    { key: "interpretation", label: "Klinik yorum", icon: <IconDoc /> },
    { key: "diagnosis", label: "Tanı (varsa)", icon: <IconCheckCircle /> },
    { key: "systematic", label: "Sistematik muayene", icon: <IconStethoscope /> },
  ];

  const exit = () => {
    exitResults({ env, runtime, dispatch });
  };

  const challenge = useChallenge();
  const server = state.server;
  const reviewFor = (caseId: string): { readonly title: string; readonly questions: readonly ReviewQuestion[] } | null => {
    if (server === null) return null;
    const snapshot = server.snapshots[caseId];
    const meta = server.metas[caseId];
    if (snapshot === undefined) return meta === undefined ? null : { title: meta.title, questions: [] };
    return {
      title: meta?.title ?? snapshot.title,
      questions: snapshot.questions.map((question) => ({
        ...question,
        correct: meta?.questions?.[question.id]?.correctOptionIds ?? [],
        feedbackIncorrect: meta?.questions?.[question.id]?.feedback ?? "",
      })),
    };
  };

  const retry = () => {
    // Yeni oturumu sunucu sürücüsü başlatır (istemcide örneklem yok).
    // T209: öğrenme kilidi burada da geçerli (koruma tek noktada).
    startMode(state.mode);
  };

  // Sunucu sonucu bulgu/kütüphane anahtarı taşımaz; zayıf konu odağı şimdilik yok.
  const weakLearnKey = firstWeakLibraryKey(state.caseResults, () => null);

  const studyLearn = () => {
    if (weakLearnKey) dispatch({ type: "setLearnFocus", key: weakLearnKey });
    startMode("learn");
    dispatch({ type: "goto", screen: "learn" });
  };

  const weakLabels: Record<string, string> = {
    technique: "Oskültasyon tekniği",
    localization: "Lokalizasyon",
    recognition: "Ses tanımlama",
    interpretation: "Klinik yorum",
    diagnosis: "Tanı",
    systematic: "Sistematik muayene",
  };
  const weakKeys = weakDomainKeys(domains, 60);
  const at = new Date(now());
  const gains = useMemo(() => {
    // Oyunlaştırma yalnız öğrenci kitlesi içindir (26 Eyl 2026 sözleşmesi):
    // öğretim üyesi/ziyaretçi için XP/rozet kazanımı ve rozet bildirimi gösterilmez.
    if (audience !== "student" || !repository || state.mode === "learn" || state.caseResults.length === 0) return null;
    const daysLeft = Math.ceil((endOfMonthTr(at).getTime() + 1 - at.getTime()) / 86_400_000);
    const period = daysLeft < 7 ? "month" : "week";
    const ranked = state.mode === "assessment"
      ? localLeaderboardRows(repository.snapshot().attempts, AUSCULTA_RULES, at, period, "all", { public: false, displayName: null, cohort: null })
      : null;
    const me = ranked?.find((row) => row.isMe);
    return auscultaSessionGains({
      state: repository.snapshot(),
      now: at,
      mode: state.mode === "assessment" ? "assessment" : "practice",
      score: total,
      mastery: passed,
      caseCount: state.caseResults.length,
      hintsUsed: state.caseResults.reduce((sum, item) => sum + item.hintsUsed, 0),
      durationMs: state.assessmentTimer,
      rank: ranked ? { period, rank: me?.rank ?? null, of: ranked.filter((row) => row.rank !== null).length } : null,
    });
  }, [at, audience, passed, repository, state.assessmentTimer, state.caseResults, state.mode, total]);

  const fmtTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  };

  const toggle = (caseId: string, open: boolean) => {
    setExpanded(open ? null : caseId);
  };

  return (
    <>
      <EcgDeco embedded={embedded} />
      <div className="screen" style={{ position: "relative", zIndex: 1 }}>
        <div className="results-wrap-v2 screen-body">
          <ScreenHeading className="results-title-v2 results-title">
            {isAssessment ? "Değerlendirme Tamamlandı" : "Vaka Raporu"}
          </ScreenHeading>
          <p className="results-sub-v2">
            {passed
              ? "Tebrikler — performansınız hedefin üzerinde. Bu düzeyi korumak için öğrenme modunda farklı ses sınıflarıyla pratik yapmaya devam edebilirsiniz."
              : "Hedef puanın altında kaldınız. Öğrenme modunda ilgili ses sınıflarını tekrar dinleyip uygulama modunda yeniden denemeniz önerilir."}
          </p>

          {weakKeys.length > 0 && (
            <div className="weak-chip-row" aria-label="Zayıf alanlar">
              <span className="weak-chip-lbl">Zayıf alanlar:</span>
              {weakKeys.map((key) => (
                <span className="badge orange weak-chip" key={key}>
                  {weakLabels[key] ?? key}
                </span>
              ))}
            </div>
          )}

          <div className="results-summary-strip">
            <div className="rs-box">
              <div className={`rs-ring-sm score-ring ${passed ? "pass" : "fail"}`}>
                <svg viewBox="0 0 80 80" aria-hidden="true">
                  <circle className="track" cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="8" />
                  <circle
                    className="prog"
                    cx="40"
                    cy="40"
                    r="34"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${(total / 100) * 2 * Math.PI * 34} 999`}
                    transform="rotate(-90 40 40)"
                  />
                </svg>
                <b>{total}</b>
              </div>
              <span className="rs-lbl">Toplam puan</span>
            </div>
            <div className="rs-box">
              <div className={`rs-status ${passed ? "pass" : "fail"}`}>
                <IconCheckCircle width={16} height={16} /> {passed ? "Başarılı" : "Hedefin altında"}
              </div>
              <span className="rs-lbl">Durum (eşik 80)</span>
            </div>
            {isAssessment && (
              <div className="rs-box">
                <div className="rs-num">
                  <IconClock width={16} height={16} /> {fmtTime(state.assessmentTimer)}
                </div>
                <span className="rs-lbl">Toplam öğrenme süresi</span>
              </div>
            )}
            <div className="rs-box">
              <div className="rs-num">{state.caseResults.length}</div>
              <span className="rs-lbl">Vaka sayısı</span>
            </div>
            <div className="rs-box">
              <div className="rs-num">{state.bestScore[isAssessment ? "assessment" : "practice"]}</div>
              <span className="rs-lbl">En iyi puan (bu mod)</span>
            </div>
          </div>

          <div className="card mt-16">
            <h3 style={{ marginTop: 0 }}>Alan bazlı performans</h3>
            <div className="domain-rows mt-12">
              {domains &&
                domainRows.map((row) => {
                  const value = domains[row.key];
                  if (!value || value.max === 0) return null;
                  const pct = Math.round((value.earned / value.max) * 100);
                  return (
                    <div className="domain-row" key={row.key}>
                      <span className="dr-ic">{row.icon}</span>
                      <span className="dr-lbl">{row.label}</span>
                      <span className="domain-bar">
                        <i style={{ width: `${pct}%` }} />
                      </span>
                      <span className="dr-pct">%{pct}</span>
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="card mt-16">
            <h3 style={{ marginTop: 0 }}>Vaka raporu</h3>
            <div className="table-scroll">
              <table className="report-table report-table-v2">
                <thead>
                  <tr>
                    <th />
                    <th>Vaka</th>
                    <th>Puan</th>
                    <th>Sonuç</th>
                    <th>İpucu</th>
                  </tr>
                </thead>
                <tbody>
                  {state.caseResults.map((result) => {
                    const caseDef = reviewFor(result.caseId);
                    const isOpen = expanded === result.caseId;
                    return (
                      <Fragment key={result.caseId}>
                        {/* T131: aria-expanded satırda (tr) geçersiz — açılır düğme ilk hücrede; satır tıklaması fare kolaylığı olarak kalır. */}
                        <tr className="report-row" onClick={() => toggle(result.caseId, isOpen)}>
                          <td className="report-chev">
                            <button
                              type="button"
                              className="report-toggle"
                              aria-expanded={isOpen}
                              aria-label={`${caseDef?.title ?? result.caseId} ayrıntıları`}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggle(result.caseId, isOpen);
                              }}
                            >
                              <IconChevronRight className={isOpen ? "rot" : ""} width={14} height={14} />
                            </button>
                          </td>
                          <td>{caseDef?.title ?? result.caseId}</td>
                          <td>
                            {Math.round(result.total)}/100
                          </td>
                          <td className={result.mastery ? "ok" : "no"}>{result.mastery ? "Başarılı" : "Başarısız"}</td>
                          <td>{result.hintsUsed}</td>
                        </tr>
                        {isOpen && (
                          <tr className="report-detail-row">
                            <td colSpan={5}>
                              <ul className="report-detail-list">
                                {result.answers.map((answer) => {
                                  const question = caseDef?.questions.find((item) => item.id === answer.qid);
                                  if (!question) return null;
                                  const givenLabels =
                                    answer.given
                                      .map((id) => question.options.find((option) => option.id === id)?.label)
                                      .filter(Boolean)
                                      .join(", ") || "—";
                                  const correctLabels = question.correct
                                    .map((id) => question.options.find((option) => option.id === id)?.label)
                                    .filter(Boolean)
                                    .join(", ");
                                  return (
                                    <li key={answer.qid} className={answer.correct ? "ok" : "no"}>
                                      <span className="rd-q">{question.prompt}</span>
                                      <span className="rd-mark">{answer.correct ? "✓" : "✗"}</span>
                                      <span className="rd-given">Verilen yanıt: {givenLabels}</span>
                                      <span className="rd-correct">Doğru yanıt: {correctLabels}</span>
                                      {!answer.correct && question.feedbackIncorrect && (
                                        <span className="rd-feedback">{question.feedbackIncorrect}</span>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {gains ? (
            <GamiGainsView
              gains={gains}
              icons={defaultGamiIcons}
              onAchievements={onAchievements ?? (() => dispatch({ type: "goto", screen: "progress" }))}
              onLeaderboard={onLeaderboard ?? (() => dispatch({ type: "goto", screen: "progress" }))}
              {...(serverData ? { demoLabel: "" } : {})}
            />
          ) : null}

          <div className="results-actions">
            {state.serverChallengeId !== null && challenge.onChallengeFinished !== undefined ? (
              <button
                type="button"
                className="btn primary"
                style={HIT}
                onClick={() => {
                  if (state.serverChallengeId !== null) challenge.onChallengeFinished?.(state.serverChallengeId);
                }}
              >
                Düello sonucunu gör
              </button>
            ) : null}
            <button type="button" className={state.serverChallengeId !== null ? "btn outline" : "btn primary"} style={HIT} onClick={exit}>
              <IconExit /> Modülden Çık
            </button>
            {state.serverChallengeId === null ? (
              <button type="button" className="btn outline" style={HIT} onClick={retry}>
                Tekrar dene
              </button>
            ) : null}
            <button type="button" className="btn outline" style={HIT} onClick={studyLearn}>
              Öğrenme modunda çalış
            </button>
          </div>
        </div>
      </div>
      <Footer embedded={embedded} />
    </>
  );
}
