/**
 * ISO anını Europe/Istanbul duvar saatine biçimler (AGENTS.md: Tarih/saat Europe/Istanbul).
 * Sabit UTC+3 kullanılır (2016'dan beri DST yok — `gamification-core/src/time.ts` ile aynı
 * varsayım); bu dosya `apps/shell`'e yeni bağımlılık eklememek için yerel tutulur.
 * Yalnız VERİLEN bir ISO anını biçimler; `Date.now()`/`new Date()` (parametresiz) çağırmaz.
 */

const TR_OFFSET_MS = 3 * 60 * 60 * 1000;
const TR_MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"] as const;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** ISO anı → "23 Eyl 2026 14:05" (TR duvar saati). */
export function formatTrDateTime(iso: string): string {
  const wall = new Date(Date.parse(iso) + TR_OFFSET_MS);
  const day = wall.getUTCDate();
  const month = TR_MONTHS_SHORT[wall.getUTCMonth()] ?? "";
  const year = wall.getUTCFullYear();
  const hh = pad2(wall.getUTCHours());
  const mm = pad2(wall.getUTCMinutes());
  return `${day} ${month} ${year} ${hh}:${mm}`;
}

/** ISO anı → "20 Eyl 2026" (TR duvar saati, tarih yalnız — rozet kazanılma günü). */
export function formatTrDate(iso: string): string {
  const wall = new Date(Date.parse(iso) + TR_OFFSET_MS);
  const day = wall.getUTCDate();
  const month = TR_MONTHS_SHORT[wall.getUTCMonth()] ?? "";
  return `${day} ${month} ${wall.getUTCFullYear()}`;
}
