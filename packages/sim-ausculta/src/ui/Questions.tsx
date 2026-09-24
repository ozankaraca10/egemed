/** Soru kartı ve geri bildirim. Seçenek sırası vaka+soru tohumuyla sabittir.
 *  Seçili durum `aria-checked` ve biçim imiyle taşınır; odak hedefi yapısal tiptedir. */
import { useRef } from "react";
import type { Question } from "../core/types";
import { shuffledOptions } from "../core/session";
import { IconCheck, IconCheckCircle, IconXCircle } from "./glyphs";

const HIT = { minWidth: 44, minHeight: 44 } as const;

interface FocusTarget {
  focus(): void;
}

interface OptionKeyEvent {
  readonly key: string;
  preventDefault(): void;
}

const OPTION_STEP: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

export function nextOptionIndex(index: number, key: string, length: number): number | null {
  const step = OPTION_STEP[key];
  if (step === undefined || length <= 0) return null;
  return (index + step + length) % length;
}

export function toggleOptionValues(multi: boolean, value: readonly string[], id: string): string[] {
  if (!multi) return [id];
  const next = new Set(value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return [...next];
}

export interface QuestionCardProps {
  readonly q: Question;
  readonly caseId: string;
  readonly value: readonly string[];
  readonly onChange: (values: string[]) => void;
  readonly revealed: boolean;
  readonly disabled?: boolean;
  readonly showEyebrow?: boolean;
  readonly correctIds?: readonly string[];
  readonly index?: number;
  readonly total?: number;
}

const EYEBROW: Record<string, string> = {
  sound_identify: "Ses tanımlama",
  localization: "Lokalizasyon",
  bell_diaphragm: "Stetoskop kafası",
  interpretation: "Klinik yorum",
  diagnosis: "Tanı",
  recognition: "Ses tanımlama",
  sequence: "Sıralama",
  single_choice: "Soru",
  multi_choice: "Çok seçmeli",
};

export function QuestionCard({
  q,
  caseId,
  value,
  onChange,
  revealed,
  disabled,
  showEyebrow = true,
  correctIds,
  index,
  total,
}: QuestionCardProps) {
  const isMulti = q.type === "multi_choice";
  const options = shuffledOptions(caseId, q.id, q.options);
  const btnRefs = useRef<(FocusTarget | null)[]>([]);
  const correct = correctIds ?? q.correct;
  const progress = typeof index === "number" && typeof total === "number" && total > 0 ? { index, total } : null;

  const toggle = (id: string) => {
    if (disabled || revealed) return;
    onChange(toggleOptionValues(isMulti, value, id));
  };

  const onOptKeyDown = (event: OptionKeyEvent, optionIndex: number) => {
    if (isMulti || disabled || revealed) return;
    const nextIndex = nextOptionIndex(optionIndex, event.key, options.length);
    if (nextIndex === null) return;
    event.preventDefault();
    const next = options[nextIndex];
    if (!next) return;
    btnRefs.current[nextIndex]?.focus();
    toggle(next.id);
  };

  return (
    <div className="q-block">
      {showEyebrow && (
        <div className="q-eyebrow-row">
          <span className="q-eyebrow">{EYEBROW[q.type] ?? "Soru"}</span>
          {progress && (
            <span className="q-progress" aria-label={`Soru ${progress.index + 1} / ${progress.total}`}>
              <span>
                Soru {progress.index + 1} / {progress.total}
              </span>
              <span className="q-progress-dots" aria-hidden="true">
                {Array.from({ length: progress.total }, (_, dot) => (
                  <i key={dot} className={dot < progress.index ? "done" : dot === progress.index ? "active" : ""} />
                ))}
              </span>
            </span>
          )}
        </div>
      )}
      <p className="q-text">{q.prompt}</p>
      {q.help && <p className="q-help">{q.help}</p>}
      <div className="opt-list" role={isMulti ? "group" : "radiogroup"} aria-label={q.prompt}>
        {options.map((option, optionIndex) => {
          const selected = value.includes(option.id);
          const isCorrectOpt = revealed && correct.includes(option.id);
          const isWrongSelected = revealed && selected && !correct.includes(option.id);
          const name = isCorrectOpt
            ? `${option.label}, doğru`
            : isWrongSelected
              ? `${option.label}, yanlış`
              : selected
                ? `${option.label}, seçili`
                : option.label;
          return (
            <button
              key={option.id}
              ref={(el) => {
                btnRefs.current[optionIndex] = el as FocusTarget | null;
              }}
              type="button"
              className={`opt ${selected ? "selected" : ""} ${isCorrectOpt ? "is-correct" : ""} ${isWrongSelected ? "is-wrong" : ""}`}
              style={HIT}
              onClick={() => toggle(option.id)}
              onKeyDown={(event) => onOptKeyDown(event, optionIndex)}
              role={isMulti ? "checkbox" : "radio"}
              aria-checked={selected}
              aria-label={name}
              disabled={disabled}
            >
              <span className={isMulti ? "check" : "radio"}>
                {isMulti && selected ? <IconCheck /> : null}
                {!isMulti && selected ? (
                  <span className="radio-dot" aria-hidden="true">
                    ●
                  </span>
                ) : null}
              </span>
              <span>{option.label}</span>
              {isCorrectOpt && (
                <span className="mark" aria-hidden="true">
                  <IconCheckCircle />
                </span>
              )}
              {isWrongSelected && (
                <span className="mark" aria-hidden="true">
                  <IconXCircle />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface FeedbackCardProps {
  readonly correct: boolean;
  readonly q: Question;
  readonly given: readonly string[];
}

export function FeedbackCard({ correct, q, given }: FeedbackCardProps) {
  const correctLabels = q.correct.map((id) => q.options.find((option) => option.id === id)?.label ?? "").filter(Boolean);
  const givenLabels = given.map((id) => q.options.find((option) => option.id === id)?.label).filter(Boolean);
  return (
    <div className="card mt-12">
      <div className={`feedback-head ${correct ? "good" : "bad"}`}>
        <div className={`ic ${correct ? "good" : "bad"}`}>
          {correct ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" fill="none" />
              <path d="m8 12.5 2.6 2.6L16.5 9" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" fill="none" />
              <path d="M9 9l6 6M15 9l-6 6" />
            </svg>
          )}
        </div>
        <h2>{correct ? "Doğru!" : "Yanlış"}</h2>
      </div>
      {!correct && givenLabels.length > 0 && <p className="feedback-verdict">Yanıtınız: {givenLabels.join(", ")}</p>}
      {!correct && (
        <p className="feedback-verdict good-text">Doğru yanıt: {correctLabels.join(", ")}</p>
      )}
      <p className="feedback-text">{correct ? q.feedbackCorrect : q.feedbackIncorrect}</p>
    </div>
  );
}
