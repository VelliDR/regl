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

    it("Ölçümler arasında çok haftalık takvim boşluğu varsa yapay sıcaklık sıçraması onaylanmamalıdır", () => {
      const entries: DayEntry[] = [
        makeDay("2026-05-01", 36.4),
        makeDay("2026-05-02", 36.42),
        makeDay("2026-05-03", 36.45),
        makeDay("2026-05-04", 36.43),
        makeDay("2026-05-05", 36.41),
        makeDay("2026-05-06", 36.45),
        // 19 günlük ölçüm boşluğu
        makeDay("2026-05-25", 36.65),
        makeDay("2026-05-26", 36.7),
        makeDay("2026-05-27", 36.8),
      ];

      const res = evaluateTemperatureShift(entries);
      expect(res.isConfirmed).toBe(false);
      expect(res.appliedRule).toBe("NONE");
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

    it("[M2] Erken geçici zirve ve sonrasında daha yüksek kaliteli ovülasyon zirvesi varsa en yüksek/son zirve seçilmelidir", () => {
      // Gün 2: S (rank 2) -> Gün 3: f, Gün 4: t, Gün 5: t (erken geçici dalga)
      // Gün 12: S+ (rank 3, gerçek ovülatuar zirve) -> Gün 13: f, Gün 14: t, Gün 15: t
      const entries: DayEntry[] = [
        makeDay("2026-05-01", undefined, false, "moist", "creamy"),
        makeDay("2026-05-02", undefined, false, "wet", "clear"), // Erken 'S'
        makeDay("2026-05-03", undefined, false, "moist", "thick"),
        makeDay("2026-05-04", undefined, false, "dry", "none"),
        makeDay("2026-05-05", undefined, false, "dry", "none"),
        makeDay("2026-05-12", undefined, false, "wet", "stretchy"), // Gerçek 'S+' zirvesi
        makeDay("2026-05-13", undefined, false, "moist", "creamy"),
        makeDay("2026-05-14", undefined, false, "dry", "none"),
        makeDay("2026-05-15", undefined, false, "dry", "none"),
      ];

      const res = evaluateMucusPeak(entries);
      expect(res.isConfirmed).toBe(true);
      expect(res.peakDayDate).toBe("2026-05-12"); // S+ olan gün seçildi
      expect(res.evaluationCompleteDate).toBe("2026-05-15");
    });

    it("[M2] Zirve sonrası günlerde takvim boşluğu (eksik kayıt) varsa kuruma onaylanmamalıdır", () => {
      const entries: DayEntry[] = [
        makeDay("2026-05-01", undefined, false, "moist", "creamy"),
        makeDay("2026-05-02", undefined, false, "wet", "stretchy"), // S+
        // 3 ve 4 Mayıs kayıt yok!
        makeDay("2026-05-05", undefined, false, "dry", "none"),
        makeDay("2026-05-06", undefined, false, "dry", "none"),
        makeDay("2026-05-07", undefined, false, "dry", "none"),
      ];

      const res = evaluateMucusPeak(entries);
      expect(res.isConfirmed).toBe(false);
    });

    it("[M2] İlk zirve kapandıktan sonra tekrar S/S+ mukus görülürse önceki onay düşmeli ve yeni dalganın 3 gün kuruması beklenmelidir", () => {
      const entriesOngoing: DayEntry[] = [
        makeDay("2026-05-02", undefined, false, "wet", "stretchy"), // İlk S+
        makeDay("2026-05-03", undefined, false, "moist", "thick"),
        makeDay("2026-05-04", undefined, false, "dry", "none"),
        makeDay("2026-05-05", undefined, false, "dry", "none"),
        // 9 Mayıs'ta yeni doğurgan mukus dalgası
        makeDay("2026-05-09", undefined, false, "wet", "clear"), // S
      ];

      const resPending = evaluateMucusPeak(entriesOngoing);
      expect(resPending.isConfirmed).toBe(false);

      const entriesCompleted: DayEntry[] = [
        ...entriesOngoing,
        makeDay("2026-05-10", undefined, false, "moist", "creamy"),
        makeDay("2026-05-11", undefined, false, "dry", "none"),
        makeDay("2026-05-12", undefined, false, "dry", "none"),
      ];

      const resConfirmed = evaluateMucusPeak(entriesCompleted);
      expect(resConfirmed.isConfirmed).toBe(true);
      expect(resConfirmed.peakDayDate).toBe("2026-05-09");
      expect(resConfirmed.evaluationCompleteDate).toBe("2026-05-12");
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

    it("[E4] Erken günde (3. gün) mukus görüldükten sonra sonraki gün (4. gün) kuru olsa dahi pre-ovülatuar kısır dönem kapalı kalmalıdır", () => {
      const cycleEntriesUpToDay4: DayEntry[] = [
        makeDay("2026-05-01", undefined, false, undefined, undefined, "heavy"),
        makeDay("2026-05-02", undefined, false, undefined, undefined, "medium"),
        makeDay("2026-05-03", undefined, false, "moist", "creamy"), // 3. gün mukus başladı
        makeDay("2026-05-04", undefined, false, "dry", "none"), // 4. gün kuru
      ];
      // 4. gün değerlendiriliyor (gün <= 5 olmasına rağmen 3. günde mukus başladığı için kısır DEĞİLDİR)
      const res = evaluatePreOvulatoryPhase(4, cycleEntriesUpToDay4, {
        completedCycles: [],
        previousCycleWasOvulatory: true,
      });
      expect(res.isPreOvulatoryInfertile).toBe(false);
      expect(res.appliedRule).toBe("E4_MUCUS_OVERRIDE");
    });

    it("[E2] 12+ döngüde Eksi-8 kuralı en erken 1HM - 8 hesaplamalıdır; önceki döngü anovülatuar ise engellenmelidir", () => {
      const firstHighDays = [15, 14, 16, 15, 13, 14, 15, 16, 14, 15, 13, 14]; // min = 13 -> 13 - 8 = 5
      const resValid = evaluatePreOvulatoryPhase(5, undefined, {
        completedCycles: [],
        pastFirstHighDays: firstHighDays,
        previousCycleWasOvulatory: true,
      });
      expect(resValid.isPreOvulatoryInfertile).toBe(true);
      expect(resValid.lastInfertileCycleDay).toBe(5);
      expect(resValid.appliedRule).toBe("E2_MINUS_8");

      const resAnovulatory = evaluatePreOvulatoryPhase(3, undefined, {
        completedCycles: [],
        pastFirstHighDays: firstHighDays,
        previousCycleWasOvulatory: false,
      });
      expect(resAnovulatory.isPreOvulatoryInfertile).toBe(false);
      expect(resAnovulatory.appliedRule).toBe("NONE");
    });

    it("[E3] 12+ döngüde Eksi-20 kuralı uygulanmalı ve en kısa <= 20 ise 0 kısır gün vermelidir", () => {
      const makeCycles = (len: number) =>
        Array.from({ length: 12 }, (_, idx) => ({
          id: idx + 1,
          startDate: "2025-01-01" as ISODate,
          length: idx === 5 ? len : 28,
          isOutlier: false,
        }));

      const res26 = evaluatePreOvulatoryPhase(6, undefined, {
        completedCycles: makeCycles(26),
        previousCycleWasOvulatory: true,
      });
      expect(res26.appliedRule).toBe("E3_MINUS_20");
      expect(res26.lastInfertileCycleDay).toBe(6);
      expect(res26.isPreOvulatoryInfertile).toBe(true);

      const res20 = evaluatePreOvulatoryPhase(1, undefined, {
        completedCycles: makeCycles(20),
        previousCycleWasOvulatory: true,
      });
      expect(res20.lastInfertileCycleDay).toBe(0);
      expect(res20.isPreOvulatoryInfertile).toBe(false);
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

    it("Tamamlanmış geçmiş döngü seçildiğinde hedef döngünün Sensiplan değerlendirmesi hatasız yapılmalıdır", () => {
      // 1. Döngü (1-28 Mayıs) -> BBT doğrulamalı
      // 2. Döngü (29 Mayıs...) -> Yeni başlayan aktif döngü
      const entries: DayEntry[] = [
        makeDay("2026-05-01", 36.4, false, undefined, undefined, "heavy"),
        makeDay("2026-05-02", 36.45),
        makeDay("2026-05-03", 36.5),
        makeDay("2026-05-04", 36.45),
        makeDay("2026-05-05", 36.5),
        makeDay("2026-05-06", 36.55),
        makeDay("2026-05-07", 36.65, false, "wet", "stretchy"),
        makeDay("2026-05-08", 36.7, false, "moist", "thick"),
        makeDay("2026-05-09", 36.8, false, "dry", "none"),
        makeDay("2026-05-10", 36.8, false, "dry", "none"),
        // 2. Döngü başlangıcı
        makeDay("2026-05-29", 36.4, false, undefined, undefined, "heavy"),
      ];

      // 1. Döngünün başlangıç tarihini sorgula (ChartScreen / PhaseDurationChart mantığı)
      const pastEval = evaluateCycleState(entries, parseISODate("2026-05-01"), {
        trackingMode: "symptothermal",
      });

      expect(pastEval.targetCycle).toBeDefined();
      expect(pastEval.targetCycle?.id).toBe(1);
      expect(pastEval.currentCycleDay).toBe(1);
      expect(pastEval.sensiplan?.temperature.isConfirmed).toBe(true);
      expect(pastEval.sensiplan?.temperature.firstHighDayDate).toBe("2026-05-07");
    });

    it("Yalnızca kanama içeren (ovülasyonu doğrulanmamış) önceki döngü yeni döngüde E1 5 gün kısır dönemi açmamalıdır", () => {
      const entries: DayEntry[] = [
        makeDay("2026-05-01", undefined, false, undefined, undefined, "heavy"),
        makeDay("2026-05-02", undefined, false, undefined, undefined, "medium"),
        makeDay("2026-05-29", undefined, false, undefined, undefined, "heavy"),
      ];

      // 2. döngünün 2. günü (30 Mayıs) -> önceki döngüde BBT/mukus doğrulaması YOK!
      const evalDay2 = evaluateCycleState(entries, parseISODate("2026-05-30"), {
        trackingMode: "symptothermal",
      });

      expect(evalDay2.sensiplan?.preOvulatory.isPreOvulatoryInfertile).toBe(
        false,
      );
      expect(evalDay2.sensiplan?.overallFertilityState).toBe("fertile");
    });
  });
});
