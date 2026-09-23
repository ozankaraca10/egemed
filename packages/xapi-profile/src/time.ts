const WALL_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Istanbul",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const OFFSET = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Istanbul",
  timeZoneName: "longOffset",
});

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const found = parts.find((candidate) => candidate.type === type);
  if (found === undefined) {
    throw new RangeError(`Eksik tarih bileşeni: ${type}`);
  }
  return found.value;
}

/** "GMT+03:00" biçimini "+03:00"a çevirir; ICU verisi belirsizse RangeError. */
function offsetSuffix(instant: Date): string {
  const raw = part(OFFSET.formatToParts(instant), "timeZoneName");
  if (raw === "GMT") {
    return "+00:00";
  }
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(raw);
  if (match === null) {
    throw new RangeError(`Beklenmeyen saat dilimi biçimi: ${raw}`);
  }
  const sign = match[1] ?? "+";
  const hour = (match[2] ?? "0").padStart(2, "0");
  const minute = match[3] ?? "00";
  return `${sign}${hour}:${minute}`;
}

/**
 * Europe/Istanbul saat diliminde ISO 8601 damgası üretir.
 * `now` enjekte edilir; `Date.now` kullanılmaz (AGENTS.md).
 */
export function istanbulTimestamp(now: () => Date): string {
  const instant = now();
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError("Geçersiz Date: now() geçerli bir an döndürmeli.");
  }
  const parts = WALL_CLOCK.formatToParts(instant);
  const wall = [
    part(parts, "year"),
    "-",
    part(parts, "month"),
    "-",
    part(parts, "day"),
    "T",
    part(parts, "hour"),
    ":",
    part(parts, "minute"),
    ":",
    part(parts, "second"),
  ].join("");
  const millis = String(instant.getMilliseconds()).padStart(3, "0");
  return `${wall}.${millis}${offsetSuffix(instant)}`;
}
