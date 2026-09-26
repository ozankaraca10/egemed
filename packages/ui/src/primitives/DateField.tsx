import { useEffect, useId, useRef, useState, type ChangeEvent, type JSX, type KeyboardEvent } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { AlertCircle, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { t, type TrKey } from "../../i18n/tr";
import { IconButton } from "./Button";
import { cx, definedProps } from "./props";

export interface DateFieldProps {
  /** ISO "YYYY-MM-DD" veya boş dizge. */
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly id?: string;
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: true;
  readonly required?: true;
  /** ISO "YYYY-MM-DD"; belirtilirse bu tarihten önceki günler seçilemez. */
  readonly min?: string;
  /** ISO "YYYY-MM-DD"; belirtilirse bu tarihten sonraki günler seçilemez. */
  readonly max?: string;
  readonly disabled?: boolean;
  /** "Bugün" vurgusu için ISO tarih; verilmezse vurgu yapılmaz (Date.now() KULLANILMAZ). */
  readonly today?: string;
  readonly className?: string;
}

export interface DateFieldDayCell {
  readonly iso: string;
  readonly day: number;
  readonly inMonth: boolean;
}

const TR_DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const FALLBACK_YEAR = 2000;
const FALLBACK_MONTH = 1;

const MONTH_KEYS: readonly TrKey[] = [
  "datefield.month.01",
  "datefield.month.02",
  "datefield.month.03",
  "datefield.month.04",
  "datefield.month.05",
  "datefield.month.06",
  "datefield.month.07",
  "datefield.month.08",
  "datefield.month.09",
  "datefield.month.10",
  "datefield.month.11",
  "datefield.month.12",
];

const WEEKDAY_KEYS: ReadonlyArray<{ readonly short: TrKey; readonly full: TrKey }> = [
  { short: "datefield.weekday.mon.short", full: "datefield.weekday.mon.full" },
  { short: "datefield.weekday.tue.short", full: "datefield.weekday.tue.full" },
  { short: "datefield.weekday.wed.short", full: "datefield.weekday.wed.full" },
  { short: "datefield.weekday.thu.short", full: "datefield.weekday.thu.full" },
  { short: "datefield.weekday.fri.short", full: "datefield.weekday.fri.full" },
  { short: "datefield.weekday.sat.short", full: "datefield.weekday.sat.full" },
  { short: "datefield.weekday.sun.short", full: "datefield.weekday.sun.full" },
];

/** Artık yıl kuralı (Gregoryen); saf, `Date` bağımlılığı yok. */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Ayın gün sayısı (1-12); şubat artık yılda 29. */
function daysInMonth(year: number, month: number): number {
  const table = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && isLeapYear(year)) return 29;
  return table[month - 1] ?? 30;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isoOf(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

/** ISO tarihten yıl/ay çözer; biçim bozuksa `null`. */
function monthOf(iso: string): { year: number; month: number } | null {
  const match = ISO_RE.exec(iso);
  if (match === null) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

/**
 * "gg.aa.yyyy" metnini ISO "yyyy-aa-gg"ye çözer. Takvimde var olmayan tarih
 * (ör. 31 Şubat) veya biçim uyumsuzluğunda `null` döner; hiçbir zaman `Date.now()` kullanmaz.
 */
export function parseTrDate(text: string): string | null {
  const match = TR_DATE_RE.exec(text.trim());
  if (match === null) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return isoOf(year, month, day);
}

/** ISO "yyyy-aa-gg"yi "gg.aa.yyyy"ye çevirir; geçersiz/boş girişte boş dizge döner. */
export function formatTrDate(iso: string): string {
  const match = ISO_RE.exec(iso);
  if (match === null) return "";
  return `${match[3]}.${match[2]}.${match[1]}`;
}

/**
 * Pazartesi ilk gün olacak biçimde tam haftalar halinde ay matrisi üretir; önceki/sonraki
 * ayın taşan günleri `inMonth: false` ile işaretlenir. Saf fonksiyon, `Date.now()` kullanmaz
 * (yalnız sabit y/a/g bileşenlerinden haftanın günü hesaplamak için `Date` kurucusu kullanılır).
 */
export function monthMatrix(year: number, month: number): readonly (readonly DateFieldDayCell[])[] {
  const first = new Date(year, month - 1, 1);
  const startOffset = (first.getDay() + 6) % 7; // Pazar(0) → 6, Pazartesi(1) → 0 ...
  const totalDays = daysInMonth(year, month);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const totalPrevDays = daysInMonth(prevYear, prevMonth);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  const cells: DateFieldDayCell[] = [];
  for (let index = 0; index < startOffset; index += 1) {
    const day = totalPrevDays - startOffset + 1 + index;
    cells.push({ iso: isoOf(prevYear, prevMonth, day), day, inMonth: false });
  }
  for (let day = 1; day <= totalDays; day += 1) {
    cells.push({ iso: isoOf(year, month, day), day, inMonth: true });
  }
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ iso: isoOf(nextYear, nextMonth, nextDay), day: nextDay, inMonth: false });
    nextDay += 1;
  }

  const weeks: DateFieldDayCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

/** Gün ekler/çıkarır (negatif delta); ay/yıl sınırlarını taşar, saf hesap. */
function addDays(iso: string, delta: number): string {
  const match = ISO_RE.exec(iso);
  if (match === null) return iso;
  let year = Number(match[1]);
  let month = Number(match[2]);
  let day = Number(match[3]) + delta;
  while (day < 1) {
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    day += daysInMonth(year, month);
  }
  while (day > daysInMonth(year, month)) {
    day -= daysInMonth(year, month);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return isoOf(year, month, day);
}

/** Ay ekler/çıkarır (negatif delta); yıl sınırını taşar, saf hesap. */
function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = ((total % 12) + 12) % 12 + 1;
  return { year: nextYear, month: nextMonth };
}

/** `value` veya `today` üzerinden ilk görünecek ay ve odaklanacak günü çözer. */
function computeInitialFocus(value: string, today: string | undefined): { year: number; month: number; focusIso: string } {
  const fromValue = value !== "" ? monthOf(value) : null;
  if (fromValue !== null) return { ...fromValue, focusIso: value };
  const fromToday = today !== undefined ? monthOf(today) : null;
  if (fromToday !== null && today !== undefined) return { ...fromToday, focusIso: today };
  return { year: FALLBACK_YEAR, month: FALLBACK_MONTH, focusIso: isoOf(FALLBACK_YEAR, FALLBACK_MONTH, 1) };
}

/** "gg" "aa" "yyyy" basamaklarını sırayla toplayıp otomatik nokta ekler. */
function maskTrDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  return [day, month, year].filter((part) => part.length > 0).join(".");
}

/**
 * Türkçe maskeli tarih alanı (T157): "gg.aa.yyyy" metin girişi + Radix Popover içinde ay
 * takvimi. Yazarken nokta otomatik eklenir; doğrulama blur'da yapılır — geçersiz tarihte
 * `onValueChange("")` ÇAĞRILMAZ, alan yalnız görsel + metinsel geçersizlik işareti taşır.
 * Takvimde ok tuşlarıyla gün, PageUp/PageDown ile ay değişir; Enter/Space (yerleşik düğme
 * davranışı) seçer, Esc (Radix varsayılanı) kapatıp odağı tetikleyiciye döndürür.
 */
export function DateField({
  value,
  onValueChange,
  id,
  min,
  max,
  disabled = false,
  required,
  today,
  className,
  ...aria
}: DateFieldProps): JSX.Element {
  const autoId = useId();
  const controlId = id ?? `df${autoId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const invalidHintId = `${controlId}-invalid`;
  const gridRef = useRef<HTMLDivElement | null>(null);

  const [text, setText] = useState(() => formatTrDate(value));
  const [invalid, setInvalid] = useState(false);
  const [open, setOpen] = useState(false);
  const initial = computeInitialFocus(value, today);
  const [view, setView] = useState({ year: initial.year, month: initial.month });
  const [focusedIso, setFocusedIso] = useState(initial.focusIso);

  useEffect(() => {
    setText(formatTrDate(value));
    setInvalid(false);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const node = gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focusedIso}"]`);
    node?.focus();
  }, [open, view, focusedIso]);

  function outOfRange(iso: string): boolean {
    if (min !== undefined && iso < min) return true;
    if (max !== undefined && iso > max) return true;
    return false;
  }

  function moveFocus(iso: string): void {
    const info = monthOf(iso);
    if (info !== null) setView(info);
    setFocusedIso(iso);
  }

  function onOpenChange(nextOpen: boolean): void {
    setOpen(nextOpen);
    if (nextOpen) {
      const next = computeInitialFocus(value, today);
      setView({ year: next.year, month: next.month });
      setFocusedIso(next.focusIso);
    }
  }

  function selectDay(iso: string): void {
    if (outOfRange(iso)) return;
    setInvalid(false);
    onValueChange(iso);
    setOpen(false);
  }

  function onPageMonth(delta: number): void {
    const next = addMonths(view.year, view.month, delta);
    const currentDay = Number(ISO_RE.exec(focusedIso)?.[3] ?? "1");
    const clampedDay = Math.min(currentDay, daysInMonth(next.year, next.month));
    moveFocus(isoOf(next.year, next.month, clampedDay));
  }

  function onGridKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const { key } = event;
    if (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown") {
      event.preventDefault();
      const delta = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : key === "ArrowUp" ? -7 : 7;
      moveFocus(addDays(focusedIso, delta));
    } else if (key === "PageUp" || key === "PageDown") {
      event.preventDefault();
      onPageMonth(key === "PageUp" ? -1 : 1);
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>): void {
    setText(maskTrDateInput(event.target.value));
    if (invalid) setInvalid(false);
  }

  function onInputBlur(): void {
    if (text.trim() === "") {
      setInvalid(false);
      onValueChange("");
      return;
    }
    const iso = parseTrDate(text);
    if (iso === null || outOfRange(iso)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onValueChange(iso);
  }

  const describedBy = cx(aria["aria-describedby"], invalid ? invalidHintId : undefined);
  const ariaInvalid = aria["aria-invalid"] === true || invalid ? (true as const) : undefined;
  const weeks = monthMatrix(view.year, view.month);
  const titleId = `${controlId}-panel-title`;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <div className={cx("eg-datefield", invalid && "eg-datefield--invalid", className)}>
        <PopoverPrimitive.Anchor asChild>
          <div className="eg-datefield__row">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="gg.aa.yyyy"
              className="eg-input eg-datefield__input"
              value={text}
              onChange={onInputChange}
              onBlur={onInputBlur}
              disabled={disabled}
              {...definedProps({
                id: controlId,
                "aria-describedby": describedBy.length > 0 ? describedBy : undefined,
                "aria-invalid": ariaInvalid,
                required,
              })}
            />
            <PopoverPrimitive.Trigger asChild>
              <IconButton label={t("datefield.openCalendar")} icon={<CalendarIcon size={18} aria-hidden="true" />} disabled={disabled} />
            </PopoverPrimitive.Trigger>
          </div>
        </PopoverPrimitive.Anchor>
        {invalid ? (
          <p className="eg-datefield__error" id={invalidHintId}>
            <AlertCircle size={16} aria-hidden="true" />
            <span>{t("datefield.invalid")}</span>
          </p>
        ) : null}
      </div>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className="eg-datefield__panel"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focusedIso}"]`)?.focus();
          }}
        >
          <div className="eg-datefield__panel-head">
            <IconButton label={t("datefield.prevMonth")} icon={<ChevronLeft size={18} aria-hidden="true" />} onClick={() => onPageMonth(-1)} />
            <span className="eg-datefield__panel-title" id={titleId}>
              {t(MONTH_KEYS[view.month - 1] ?? "datefield.month.01")} {view.year}
            </span>
            <IconButton label={t("datefield.nextMonth")} icon={<ChevronRight size={18} aria-hidden="true" />} onClick={() => onPageMonth(1)} />
          </div>
          <div className="eg-datefield__grid" role="grid" aria-labelledby={titleId} ref={gridRef} onKeyDown={onGridKeyDown}>
            <div className="eg-datefield__weekdays" role="row">
              {WEEKDAY_KEYS.map((weekday) => (
                <span key={weekday.short} role="columnheader" className="eg-datefield__weekday" aria-label={t(weekday.full)}>
                  {t(weekday.short)}
                </span>
              ))}
            </div>
            {weeks.map((week, weekIndex) => (
              <div className="eg-datefield__week" role="row" key={`week-${weekIndex}`}>
                {week.map((cell) => {
                  const selected = value !== "" && cell.iso === value;
                  const isToday = today !== undefined && cell.iso === today;
                  const disabledCell = outOfRange(cell.iso);
                  return (
                    <button
                      type="button"
                      role="gridcell"
                      key={cell.iso}
                      data-iso={cell.iso}
                      tabIndex={cell.iso === focusedIso ? 0 : -1}
                      aria-selected={selected}
                      {...(isToday ? { "aria-current": "date" as const } : {})}
                      {...(disabledCell ? { "aria-disabled": true as const } : {})}
                      className={cx(
                        "eg-datefield__day",
                        !cell.inMonth && "eg-datefield__day--outside",
                        isToday && "eg-datefield__day--today",
                        selected && "eg-datefield__day--selected",
                      )}
                      onClick={() => selectDay(cell.iso)}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
