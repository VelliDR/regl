import { CentiCelsius, DayEntry, ISODate } from "../types";

export interface TemperatureEvaluationResult {
  readonly isConfirmed: boolean;
  readonly coverline?: CentiCelsius; // e.g. 36.65 °C = 3665
  readonly firstHighDayDate?: ISODate; // 1st high measurement (1HM)
  readonly evaluationCompleteDate?: ISODate; // Date when 3rd/4th measurement satisfied
  readonly appliedRule:
    "T2_STANDARD" | "T3_EXCEPTION_1" | "T4_EXCEPTION_2" | "NONE";
  readonly sixLowDates: readonly ISODate[];
  readonly highDates: readonly ISODate[];
  readonly explanation: string;
}

/**
 * Validates Sensiplan temperature shift rules (T1, T2, T3, T4, T5, T6).
 * Temperature measurements are in CentiCelsius (e.g. 36.65 °C = 3665).
 * 0.2 °C = 20 centi-degrees.
 */
export function evaluateTemperatureShift(
  cycleEntries: readonly DayEntry[],
): TemperatureEvaluationResult {
  // Filter valid, non-excluded temperature readings in chronological order
  const validTempEntries = cycleEntries.filter(
    (e) => e.bbt !== undefined && !e.bbt.excluded,
  );

  if (validTempEntries.length < 9) {
    // Need at least 6 low + 3 high measurements
    return {
      isConfirmed: false,
      appliedRule: "NONE",
      sixLowDates: [],
      highDates: [],
      explanation:
        "Yetersiz geçerli sıcaklık ölçümü (en az 6 düşük + 3 yüksek ölçüm gerekir).",
    };
  }

  // Iterate over potential 1HM (1st High Measurement) positions
  // 1HM must have at least 6 preceding valid measurements
  for (
    let candidateIdx = 6;
    candidateIdx < validTempEntries.length;
    candidateIdx++
  ) {
    // 6 preceding measurements for coverline
    const sixLows = validTempEntries.slice(candidateIdx - 6, candidateIdx);
    const lowTemps = sixLows.map((e) => e.bbt!.value);
    const coverline = Math.max(...lowTemps) as CentiCelsius;

    const firstHigh = validTempEntries[candidateIdx]!;
    if (firstHigh.bbt!.value <= coverline) {
      // Must be strictly above coverline to be a candidate 1HM
      continue;
    }

    const remainingEntries = validTempEntries.slice(candidateIdx);
    if (remainingEntries.length < 3) {
      continue;
    }

    // Try Standard Rule [T2]: 3 consecutive above coverline, 3rd >= coverline + 20
    const m1 = remainingEntries[0]!;
    const m2 = remainingEntries[1]!;
    const m3 = remainingEntries[2]!;

    const m1Val = m1.bbt!.value;
    const m2Val = m2.bbt!.value;
    const m3Val = m3.bbt!.value;

    const sixLowDates = sixLows.map((e) => e.date);

    // Rule T2 (Standard)
    if (m1Val > coverline && m2Val > coverline && m3Val >= coverline + 20) {
      return {
        isConfirmed: true,
        coverline,
        firstHighDayDate: m1.date,
        evaluationCompleteDate: m3.date,
        appliedRule: "T2_STANDARD",
        sixLowDates,
        highDates: [m1.date, m2.date, m3.date],
        explanation: `Temel kural (T2) sağlandı: Kaplama çizgisi ${(coverline / 100).toFixed(2)} °C üzerinde ardışık 3 yüksek ölçüm. 3. ölçüm +0.2 °C şartını karşıladı.`,
      };
    }

    // Rule T3 (Exception 1):
    // 3rd measurement is above coverline but does not reach +0.20 °C.
    // Wait for 4th measurement; 4th measurement above coverline completes evaluation.
    if (
      remainingEntries.length >= 4 &&
      m1Val > coverline &&
      m2Val > coverline &&
      m3Val > coverline &&
      m3Val < coverline + 20
    ) {
      const m4 = remainingEntries[3]!;
      if (m4.bbt!.value > coverline) {
        return {
          isConfirmed: true,
          coverline,
          firstHighDayDate: m1.date,
          evaluationCompleteDate: m4.date,
          appliedRule: "T3_EXCEPTION_1",
          sixLowDates,
          highDates: [m1.date, m2.date, m3.date, m4.date],
          explanation: `İstisna Kuralı 1 (T3) sağlandı: 3. ölçüm kaplama çizgisi üstünde kalıp +0.2 °C sağlayamadığı için 4. ölçüm beklendi ve kaplama çizgisi üzerinde doğrulandı.`,
        };
      }
    }

    // Rule T4 (Exception 2):
    // 2nd or 3rd measurement drops to or below coverline.
    // That drop day is skipped, and an extra day with >= coverline + 20 is required.
    // Note [T5]: Cannot combine with Exception 1!
    if (remainingEntries.length >= 4) {
      // Case A: 2nd measurement dropped to/below coverline
      if (m1Val > coverline && m2Val <= coverline) {
        // Need m3 > coverline and m4 >= coverline + 20
        const m4 = remainingEntries[3]!;
        if (m3Val > coverline && m4.bbt!.value >= coverline + 20) {
          return {
            isConfirmed: true,
            coverline,
            firstHighDayDate: m1.date,
            evaluationCompleteDate: m4.date,
            appliedRule: "T4_EXCEPTION_2",
            sixLowDates,
            highDates: [m1.date, m3.date, m4.date],
            explanation: `İstisna Kuralı 2 (T4) sağlandı: 2. gün yaşanan sıcaklık düşüşü atlandı ve kaplama çizgisi üzerinde +0.2 °C ek ölçüm ile doğrulandı.`,
          };
        }
      }

      // Case B: 3rd measurement dropped to/below coverline
      if (m1Val > coverline && m2Val > coverline && m3Val <= coverline) {
        const m4 = remainingEntries[3]!;
        if (m4.bbt!.value >= coverline + 20) {
          return {
            isConfirmed: true,
            coverline,
            firstHighDayDate: m1.date,
            evaluationCompleteDate: m4.date,
            appliedRule: "T4_EXCEPTION_2",
            sixLowDates,
            highDates: [m1.date, m2.date, m4.date],
            explanation: `İstisna Kuralı 2 (T4) sağlandı: 3. gün yaşanan sıcaklık düşüşü atlandı ve kaplama çizgisi üzerinde +0.2 °C ek ölçüm ile doğrulandı.`,
          };
        }
      }
    }
  }

  return {
    isConfirmed: false,
    appliedRule: "NONE",
    sixLowDates: [],
    highDates: [],
    explanation:
      "Sıcaklık sıçraması henüz kurallara uygun olarak tamamlanmadı.",
  };
}
