import { describe, it, expect } from "vitest";
import { parseISODate } from "../../src/core/date";
import {
  BleedingIntensity,
  CentiCelsius,
  DayEntry,
  ISODate,
  MucusAppearance,
  MucusSensation,
} from "../../src/core/types";
import { evaluateTemperatureShift } from "../../src/core/sensiplan/temperature";
import {
  deriveMucusCategory,
  evaluateMucusPeak,
} from "../../src/core/sensiplan/mucus";
import { evaluateDoubleCheck } from "../../src/core/sensiplan/doubleCheck";
import { evaluatePreOvulatoryPhase } from "../../src/core/sensiplan/preOvulatory";
import { evaluateCycleState } from "../../src/core/evaluate";

function makeDay(
  dateStr: string,
  tempC?: number,
  excluded = false,
  mucusSens?: MucusSensation,
  mucusApp?: MucusAppearance,
  bleeding?: BleedingIntensity,
): DayEntry {
  return {
    date: parseISODate(dateStr),
    ...(tempC
      ? {
          bbt: {
            value: Math.round(tempC * 100) as CentiCelsius,
            ...(excluded ? { excluded: true } : {}),
          },
        }
      : {}),
    ...(mucusSens || mucusApp
      ? {
          mucus: {
            sensation: mucusSens ?? "nothing",
            appearance: mucusApp ?? "none",
          },
        }
      : {}),
    ...(bleeding ? { bleeding } : {}),
    updatedAt: Date.now(),
  };
}

describe("Sensiplan Semptotermal Kurallar Motoru (sensiplan)", () => {
  describe("Sıcaklık Kuralları [T1, T2, T3, T4, T5, T6]", () => {
    it("[T2] Temel Kural: 6 düşük, 3 yüksek ölçüm (3. >= kaplama + 0.2 °C)", () => {
      // 6 düşük ölçüm: 36.40, 36.45, 36.50, 36.45, 36.50, 36.55 (Kaplama = 36.55)
      // 3 yüksek ölçüm: 36.65, 36.70, 36.80 (+0.25 °C >= +0.20 °C)
      const entries: DayEntry[] = [
        makeDay("2026-05-01", 36.4),
        makeDay("2026-05-02", 36.45),
        makeDay("2026-05-03", 36.5),
        makeDay("2026-05-04", 36.45),
        makeDay("2026-05-05", 36.5),
        makeDay("2026-05-06", 36.55), // 6. düşük -> Kaplama: 36.55
        makeDay("2026-05-07", 36.65), // 1. yüksek
        makeDay("2026-05-08", 36.7), // 2. yüksek
        makeDay("2026-05-09", 36.8), // 3. yüksek (36.80 - 36.55 = 0.25 >= 0.20)
      ];

      const res = evaluateTemperatureShift(entries);
      expect(res.isConfirmed).toBe(true);
      expect(res.appliedRule).toBe("T2_STANDARD");
      expect(res.coverline).toBe(3655);
      expect(res.firstHighDayDate).toBe("2026-05-07");
      expect(res.evaluationCompleteDate).toBe("2026-05-09");
    });

    it("[T3] İstisna 1: 3. ölçüm +0.2 °C sağlamazsa 4. ölçüm ile doğrulanmalıdır", () => {
      // Kaplama: 36.55
      // 1. yüksek: 36.65
      // 2. yüksek: 36.65
      // 3. yüksek: 36.70 (Yalnızca +0.15 °C fark, +0.20 sağlanmadı)
      // 4. yüksek: 36.65 (Kaplama üstünde -> İstisna 1 tamamlandı)
      const entries: DayEntry[] = [
        makeDay("2026-05-01", 36.4),
        makeDay("2026-05-02", 36.45),
        makeDay("2026-05-03", 36.5),
        makeDay("2026-05-04", 36.45),
        makeDay("2026-05-05", 36.5),
        makeDay("2026-05-06", 36.55),
        makeDay("2026-05-07", 36.65),
        makeDay("2026-05-08", 36.65),
        makeDay("2026-05-09", 36.7), // 3. gün yetersiz
        makeDay("2026-05-10", 36.65), // 4. gün doğrular
      ];

      const res = evaluateTemperatureShift(entries);
      expect(res.isConfirmed).toBe(true);
      expect(res.appliedRule).toBe("T3_EXCEPTION_1");
      expect(res.evaluationCompleteDate).toBe("2026-05-10");
    });

    it("[T4] İstisna 2: 2. gün kaplamaya düşerse atlanmalı ve ek +0.2 °C ölçüm beklenmelidir", () => {
      // Kaplama: 36.55
      // 1. yüksek: 36.65
      // 2. gün: 36.50 (Düşüş)
      // 3. gün: 36.65 (> kaplama)
      // 4. gün: 36.80 (>= kaplama + 0.20)
      const entries: DayEntry[] = [
        makeDay("2026-05-01", 36.4),
        makeDay("2026-05-02", 36.45),
        makeDay("2026-05-03", 36.5),
        makeDay("2026-05-04", 36.45),
        makeDay("2026-05-05", 36.5),
        makeDay("2026-05-06", 36.55),
        makeDay("2026-05-07", 36.65), // 1HM
        makeDay("2026-05-08", 36.5), // Düşüş
        makeDay("2026-05-09", 36.65),
        makeDay("2026-05-10", 36.8), // +0.25 °C
      ];

      const res = evaluateTemperatureShift(entries);
      expect(res.isConfirmed).toBe(true);
      expect(res.appliedRule).toBe("T4_EXCEPTION_2");
      expect(res.evaluationCompleteDate).toBe("2026-05-10");
    });

    it("[T6] excluded (parantezli) ölçümler hesaba katılmamalıdır", () => {
      // Ateş/alkol nedeniyle 37.50 °C olan bir gün excluded=true ise kaplama çizgisi bozulmaz
      const entries: DayEntry[] = [
        makeDay("2026-05-01", 36.4),
        makeDay("2026-05-02", 36.45),
        makeDay("2026-05-03", 37.5, true), // EXCLUDED
        makeDay("2026-05-04", 36.5),
        makeDay("2026-05-05", 36.45),
        makeDay("2026-05-06", 36.5),
        makeDay("2026-05-07", 36.55), // 6. geçerli düşük -> Kaplama: 36.55
        makeDay("2026-05-08", 36.65),
        makeDay("2026-05-09", 36.7),
        makeDay("2026-05-10", 36.8),
      ];

      const res = evaluateTemperatureShift(entries);
      expect(res.isConfirmed).toBe(true);
      expect(res.coverline).toBe(3655); // 37.50 dışlandı!
    });
  });

  describe("Mukus Kuralları [M1, M2]", () => {
    it("[M1] His ve görünümden Sensiplan kategorisi doğru türetilmelidir", () => {
      expect(deriveMucusCategory("dry", "none")).toBe("t");
      expect(deriveMucusCategory("moist", "creamy")).toBe("f");
      expect(deriveMucusCategory("wet", "clear")).toBe("S");
      expect(deriveMucusCategory("wet", "stretchy")).toBe("S_plus");
    });

    it("[M2] Zirve günü ve 3 gün kuruma başarıyla doğrulanmalıdır", () => {
      // Gün 1: f
      // Gün 2: S+ (Zirve)
      // Gün 3: f
      // Gün 4: t
      // Gün 5: t (3. kuruma günü)
      const entries: DayEntry[] = [
        makeDay("2026-05-01", undefined, false, "moist", "creamy"),
        makeDay("2026-05-02", undefined, false, "wet", "stretchy"), // Zirve
        makeDay("2026-05-03", undefined, false, "moist", "thick"),
        makeDay("2026-05-04", undefined, false, "dry", "none"),
        makeDay("2026-05-05", undefined, false, "dry", "none"),
      ];

      const res = evaluateMucusPeak(entries);
      expect(res.isConfirmed).toBe(true);
      expect(res.peakDayDate).toBe("2026-05-02");
      expect(res.evaluationCompleteDate).toBe("2026-05-05");
    });
  });

  describe("Çift Kontrol Kuralı [D1]", () => {
    it("Sıcaklık ve mukus kriterlerinden hangisi daha geç biterse o gün kısır dönem açılmalıdır", () => {
      const tempResult = {
        isConfirmed: true,
        evaluationCompleteDate: "2026-05-09" as ISODate,
        appliedRule: "T2_STANDARD" as const,
        sixLowDates: [],
        highDates: [],
        explanation: "",
      };

      const mucusResult = {
        isConfirmed: true,
        evaluationCompleteDate: "2026-05-11" as ISODate, // 2 gün daha geç
        postPeakDates: [],
        explanation: "",
      };

      // 10 Mayıs'ta henüz mukus kuralı tamamlanmamıştır -> Kısır DEĞİL
      const eval10 = evaluateDoubleCheck(
        tempResult,
        mucusResult,
        "2026-05-10" as ISODate,
      );
      expect(eval10.isPostOvulatoryInfertile).toBe(false);

      // 11 Mayıs akşamından itibaren -> Kısır
      const eval11 = evaluateDoubleCheck(
        tempResult,
        mucusResult,
        "2026-05-11" as ISODate,
      );
      expect(eval11.isPostOvulatoryInfertile).toBe(true);
      expect(eval11.infertilePhaseStartDate).toBe("2026-05-11");
    });
  });

  describe("Pre-ovülatuar Kurallar [E1, E2, E3, E4]", () => {
    it("[E1] Önceki döngü ovülatuar ise ilk 5 gün kısır kabul edilmelidir", () => {
      const res = evaluatePreOvulatoryPhase(3, undefined, {
        completedCycles: [],
        previousCycleWasOvulatory: true,
      });
      expect(res.isPreOvulatoryInfertile).toBe(true);
      expect(res.appliedRule).toBe("E1_FIRST_5_DAYS");
    });

    it("[E4] Acil kural: 3. günde bile mukus başlarsa kısır dönem derhal sonlanmalıdır", () => {
      const entryWithMucus = makeDay(
        "2026-05-03",
        undefined,
        false,
        "moist",
        "creamy",
      );
      const res = evaluatePreOvulatoryPhase(3, entryWithMucus, {
        completedCycles: [],
        previousCycleWasOvulatory: true,
      });
      expect(res.isPreOvulatoryInfertile).toBe(false);
      expect(res.appliedRule).toBe("E4_MUCUS_OVERRIDE");
    });
  });

  describe("evaluateCycleState Birleşik Entegrasyonu", () => {
    it("Semptotermal modda tam döngü değerlendirmesi doğru çalışmalıdır", () => {
      const entries: DayEntry[] = [
        makeDay("2026-05-01", 36.4, false, undefined, undefined, "heavy"), // Döngü başlangıcı
        makeDay("2026-05-02", 36.45),
        makeDay("2026-05-03", 36.5),
        makeDay("2026-05-04", 36.45),
        makeDay("2026-05-05", 36.5),
        makeDay("2026-05-06", 36.55),
        makeDay("2026-05-07", 36.65, false, "wet", "stretchy"), // Zirve + 1HM
        makeDay("2026-05-08", 36.7, false, "moist", "thick"),
        makeDay("2026-05-09", 36.8, false, "dry", "none"),
        makeDay("2026-05-10", 36.8, false, "dry", "none"), // 3. kuruma günü
      ];

      const res = evaluateCycleState(entries, parseISODate("2026-05-10"), {
        trackingMode: "symptothermal",
      });

      expect(res.sensiplan).toBeDefined();
      expect(res.sensiplan?.temperature.isConfirmed).toBe(true);
      expect(res.sensiplan?.mucus.isConfirmed).toBe(true);
      expect(res.sensiplan?.doubleCheck.isPostOvulatoryInfertile).toBe(true);
      expect(res.sensiplan?.overallFertilityState).toBe("infertile");
    });
  });
});
