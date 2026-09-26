import { describe, expect, it } from "vitest";
import { formatTrDate, monthMatrix, parseTrDate } from "../../packages/ui/src/primitives/DateField";

describe("DateField — saf tarih fonksiyonları (T157)", () => {
  describe("parseTrDate", () => {
    it("geçerli 'gg.aa.yyyy' metnini ISO'ya çözer", () => {
      expect(parseTrDate("26.09.2026")).toBe("2026-09-26");
      expect(parseTrDate("01.01.2000")).toBe("2000-01-01");
    });

    it("biçim uyumsuzluğunda null döner", () => {
      expect(parseTrDate("2026-09-26")).toBeNull();
      expect(parseTrDate("26/09/2026")).toBeNull();
      expect(parseTrDate("abc")).toBeNull();
      expect(parseTrDate("")).toBeNull();
      expect(parseTrDate("6.9.2026")).toBeNull();
    });

    it("geçersiz ay reddedilir", () => {
      expect(parseTrDate("15.13.2026")).toBeNull();
      expect(parseTrDate("15.00.2026")).toBeNull();
    });

    it("takvimde var olmayan 31 Şubat reddedilir", () => {
      expect(parseTrDate("31.02.2026")).toBeNull();
      expect(parseTrDate("31.02.2024")).toBeNull();
    });

    it("artık yıl kuralı: 29 Şubat yalnız artık yılda geçerli", () => {
      expect(parseTrDate("29.02.2024")).toBe("2024-02-29"); // 2024 artık yıl
      expect(parseTrDate("29.02.2023")).toBeNull(); // 2023 artık yıl değil
      expect(parseTrDate("29.02.2000")).toBe("2000-02-29"); // 400'e bölünür → artık yıl
      expect(parseTrDate("29.02.1900")).toBeNull(); // 100'e bölünür, 400'e bölünmez → artık yıl değil
    });

    it("30 günlük ayda 31. gün reddedilir", () => {
      expect(parseTrDate("31.04.2026")).toBeNull();
      expect(parseTrDate("30.04.2026")).toBe("2026-04-30");
    });
  });

  describe("formatTrDate", () => {
    it("ISO'yu 'gg.aa.yyyy'ye çevirir", () => {
      expect(formatTrDate("2026-09-26")).toBe("26.09.2026");
      expect(formatTrDate("2000-01-01")).toBe("01.01.2000");
    });

    it("boş veya geçersiz girişte boş dizge döner", () => {
      expect(formatTrDate("")).toBe("");
      expect(formatTrDate("26.09.2026")).toBe("");
      expect(formatTrDate("not-a-date")).toBe("");
    });

    it("parseTrDate ile formatTrDate birbirinin tersidir", () => {
      const iso = parseTrDate("26.09.2026");
      expect(iso).not.toBeNull();
      expect(formatTrDate(iso ?? "")).toBe("26.09.2026");
    });
  });

  describe("monthMatrix", () => {
    it("Pazartesi ilk gün olacak biçimde tam haftalar üretir (Eylül 2026, 1 Eylül Salı)", () => {
      const weeks = monthMatrix(2026, 9);
      for (const week of weeks) expect(week).toHaveLength(7);
      expect(weeks[0]?.[0]).toEqual({ iso: "2026-08-31", day: 31, inMonth: false });
      expect(weeks[0]?.[1]).toEqual({ iso: "2026-09-01", day: 1, inMonth: true });
      const flat = weeks.flat();
      const lastInMonth = flat.filter((cell) => cell.inMonth).at(-1);
      expect(lastInMonth).toEqual({ iso: "2026-09-30", day: 30, inMonth: true });
    });

    it("artık yıl Şubatı 29 günü ay içi işaretiyle taşır (Şubat 2024, 1 Şubat Perşembe)", () => {
      const weeks = monthMatrix(2024, 2);
      const flat = weeks.flat();
      const inMonthDays = flat.filter((cell) => cell.inMonth);
      expect(inMonthDays).toHaveLength(29);
      expect(inMonthDays.at(-1)).toEqual({ iso: "2024-02-29", day: 29, inMonth: true });
      // 1 Şubat Perşembe → Pazartesi başlangıçlı ızgarada 3 taşan Ocak günü önde durur.
      expect(weeks[0]?.filter((cell) => !cell.inMonth)).toHaveLength(3);
    });

    it("artık olmayan yılda Şubat 28 gün taşır (Şubat 2023)", () => {
      const weeks = monthMatrix(2023, 2);
      const inMonthDays = weeks.flat().filter((cell) => cell.inMonth);
      expect(inMonthDays).toHaveLength(28);
    });

    it("her hücre ISO 'yyyy-aa-gg' biçiminde tekil tarih taşır", () => {
      const weeks = monthMatrix(2026, 9);
      const isoValues = weeks.flat().map((cell) => cell.iso);
      expect(new Set(isoValues).size).toBe(isoValues.length);
      for (const iso of isoValues) expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
