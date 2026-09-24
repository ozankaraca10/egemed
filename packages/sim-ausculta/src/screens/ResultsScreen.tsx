import { Fragment, useState, type JSX, type ReactNode } from "react";
import { firstWeakLibraryKey, libraryKeyForCase, weakDomainKeys } from "../core/flow";
import { ALL_CASES, poolFor } from "../data/pool";
import { sampleSession, SESSION_SIZE } from "../core/session";
import { aggregateResults } from "../core/scoring";
import type { SimRuntime } from "../core/runtime";
import { useStore } from "../core/StoreProvider";
import type { ScoringWeights } from "../core/types";
import libraryData from "../data/library.json";
import { EcgDeco, Footer, touchTarget } from "../ui/chrome";
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
import { sessionSeed } from "./entry";

/** Sonuç ekranı (E2 §9 S16a). Özet şerit, alan yüzdesi, açılır vaka raporu.
 *  `Date.now` ve `window` yok. Tohum enjekte `now`. LMS çıkışı terminate seam'i;
 *  öğrenci adı (`learner_name`) okunmaz ve yazılmaz. */

const HIT = touchTarget();
const cases = ALL_CASES;

const libraryItems = (
  libraryData as {
    groups: { items: { key: string; category: string; acousticFinding: string }[] }[];
  }
).groups.flatMap((group) => group.items);

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
}

export function ResultsScreen({ embedded = false, env = NOOP_RESULTS_ENV }: ResultsScreenProps): JSX.Element {
  const { state, dispatch, runtime, now } = useStore();
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

  const retry = () => {
    const seed = sessionSeed(now());
    const practiceIds = sampleSession(poolFor("practice"), seed, SESSION_SIZE);
    const assessmentIds = sampleSession(poolFor("assessment"), seed + 1, SESSION_SIZE);
    dispatch({ type: "startSession", practiceIds, assessmentIds, seed });
    dispatch({ type: "startMode", mode: state.mode });
  };

  const weakLearnKey = firstWeakLibraryKey(state.caseResults, (caseId) =>
    libraryKeyForCase(
      cases.find((item) => item.id === caseId),
      libraryItems,
    ),
  );

  const studyLearn = () => {
    if (weakLearnKey) dispatch({ type: "setLearnFocus", key: weakLearnKey });
    dispatch({ type: "startMode", mode: "learn" });
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
          <h1 className="results-title-v2 results-title">
            {isAssessment ? "Değerlendirme Tamamlandı" : "Vaka Raporu"}
          </h1>
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
                    const caseDef = cases.find((item) => item.id === result.caseId);
                    const isOpen = expanded === result.caseId;
                    return (
                      <Fragment key={result.caseId}>
                        <tr
                          className="report-row"
                          tabIndex={0}
                          aria-expanded={isOpen}
                          onClick={() => toggle(result.caseId, isOpen)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            toggle(result.caseId, isOpen);
                          }}
                        >
                          <td className="report-chev">
                            <IconChevronRight className={isOpen ? "rot" : ""} width={14} height={14} />
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

          <div className="results-actions">
            <button type="button" className="btn primary" style={HIT} onClick={exit}>
              <IconExit /> Modülden Çık
            </button>
            <button type="button" className="btn outline" style={HIT} onClick={retry}>
              Tekrar dene
            </button>
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
