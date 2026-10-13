import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { partitionCycles, calculateMedian } from "../../src/core/cycles";
import { addDays, parseISODate } from "../../src/core/date";
import { DayEntry } from "../../src/core/types";

function createEntry(
  dateStr: string,
  bleeding?: DayEntry["bleeding"],
  override?: boolean,
): DayEntry {
  return {
    date: parseISODate(dateStr),
    ...(bleeding ? { bleeding } : {}),
    ...(override ? { cycleStartOverride: true } : {}),
    updatedAt: Date.now(),
  };
}

describe("Döngü Bölümleme (cycles.ts)", () => {
  describe("Medyan Hesaplaması", () => {
    it("Boş, tek ve çift elemanlı dizilerin medyanını doğru hesaplamalıdır", () => {
      expect(calculateMedian([])).toBe(0);
      expect(calculateMedian([28])).toBe(28);
      expect(calculateMedian([26, 28, 30])).toBe(28);
      expect(calculateMedian([26, 28, 30, 32])).toBe(29);
    });
  });

  describe("Kanama vs Leke (Spotting) Ayrımı", () => {
    it("Sadece lekelenme (spotting) olan günler yeni döngü başlatmamalıdır", () => {
      const entries: DayEntry[] = [
        createEntry("2026-01-01", "spotting"),
        createEntry("2026-01-02", "spotting"),
      ];

      const result = partitionCycles(entries);
      expect(result.allCycles.length).toBe(0);
      expect(result.activeCycle).toBeUndefined();
    });

    it("İlk belirgin kanama (light/medium/heavy) 1. Döngüyü başlatmalıdır", () => {
      const entries: DayEntry[] = [
        createEntry("2026-01-01", "spotting"),
        createEntry("2026-01-02", "heavy"),
        createEntry("2026-01-03", "medium"),
        createEntry("2026-01-04", "light"),
      ];

      const result = partitionCycles(entries);
      expect(result.allCycles.length).toBe(1);
      expect(result.activeCycle?.startDate).toBe("2026-01-02");
      expect(result.activeCycle?.periodLength).toBe(3); // 2, 3, 4 Ocak
      expect(result.completedCycles.length).toBe(0);
    });
  });

  describe("Döngü Aralığı ve Tamamlanma", () => {
    it("28 gün arayla gelen iki kanama periyodu 1 tamamlanmış ve 1 aktif döngü oluşturmalıdır", () => {
      const entries: DayEntry[] = [
        // 1. Döngü
        createEntry("2026-01-01", "heavy"),
        createEntry("2026-01-02", "medium"),
        createEntry("2026-01-03", "light"),
        // 2. Döngü (28 gün sonra)
        createEntry("2026-01-29", "heavy"),
        createEntry("2026-01-30", "medium"),
      ];

      const result = partitionCycles(entries);
      expect(result.completedCycles.length).toBe(1);
      expect(result.activeCycle).toBeDefined();

      const c1 = result.completedCycles[0]!;
      expect(c1.id).toBe(1);
      expect(c1.startDate).toBe("2026-01-01");
      expect(c1.endDate).toBe("2026-01-28");
      expect(c1.length).toBe(28);
      expect(c1.periodLength).toBe(3);
      expect(c1.isOutlier).toBe(false);

      expect(result.activeCycle?.id).toBe(2);
      expect(result.activeCycle?.startDate).toBe("2026-01-29");
    });

    it("cycleStartOverride bayrağı 14 günden önce bile yeni döngü başlatmalıdır", () => {
      const entries: DayEntry[] = [
        createEntry("2026-01-01", "heavy"),
        createEntry("2026-01-10", "medium", true), // 9 gün sonra zorla yeni döngü
      ];

      const result = partitionCycles(entries);
      expect(result.completedCycles.length).toBe(1);
      expect(result.completedCycles[0]?.length).toBe(9);
      expect(result.activeCycle?.startDate).toBe("2026-01-10");
    });
  });

  describe("Aykırı Değer (Outlier) Tespiti [P4]", () => {
    it("18 günden kısa döngüleri aykırı değer olarak etiketlemelidir", () => {
      const entries: DayEntry[] = [
        createEntry("2026-01-01", "heavy"),
        createEntry("2026-01-15", "heavy", true), // 14 gün uzunluk (< 18)
        createEntry("2026-02-12", "heavy"),
      ];

      const result = partitionCycles(entries);
      expect(result.completedCycles[0]?.isOutlier).toBe(true);
      expect(result.completedCycles[1]?.isOutlier).toBe(false);
    });

    it("Medyanın 2 katından uzun anormal döngüleri aykırı değer olarak etiketlemelidir", () => {
      const entries: DayEntry[] = [
        createEntry("2026-01-01", "heavy"),
        createEntry("2026-01-29", "heavy"), // 28 gün
        createEntry("2026-02-26", "heavy"), // 28 gün
        createEntry("2026-05-15", "heavy"), // 78 gün (anormal uzun, medyan 28)
        createEntry("2026-06-12", "heavy"),
      ];

      const result = partitionCycles(entries);
      expect(result.completedCycles[0]?.isOutlier).toBe(false);
      expect(result.completedCycles[1]?.isOutlier).toBe(false);
      expect(result.completedCycles[2]?.isOutlier).toBe(true); // 78 gün -> aykırı
    });
  });

  describe("Property Tests", () => {
    it("Tamamlanan döngü sayısı asla toplam kanama günü sayısını aşamaz", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              offset: fc.integer({ min: 0, max: 200 }),
              bleeding: fc.constantFrom<
                "spotting" | "light" | "medium" | "heavy"
              >("spotting", "light", "medium", "heavy"),
            }),
            { minLength: 1, maxLength: 50 },
          ),
          (records) => {
            const base = parseISODate("2026-01-01");
            const entries: DayEntry[] = records.map((r) => ({
              date: addDays(base, r.offset),
              bleeding: r.bleeding,
              updatedAt: Date.now(),
            }));

            const result = partitionCycles(entries);
            return result.completedCycles.length <= entries.length;
          },
        ),
      );
    });
  });
});
