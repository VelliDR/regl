import { DayEntry, ISODate, MucusAppearance, MucusSensation } from "../types";

export type SensiplanMucusCategory = "t" | "f" | "S" | "S_plus";

export interface MucusEvaluationResult {
  readonly isConfirmed: boolean;
  readonly peakDayDate?: ISODate; // Last day of best quality mucus
  readonly evaluationCompleteDate?: ISODate; // Evening of 3rd post-peak day
  readonly postPeakDates: readonly ISODate[];
  readonly explanation: string;
}

/**
 * Derives Sensiplan mucus category from the two dual axes (sensation + appearance) [M1].
 * Ranked numerically:
 * 0: 't' (dry / nothing)
 * 1: 'f' (thick / creamy / moist)
 * 2: 'S' (wet / clear)
 * 3: 'S_plus' (stretchy egg-white / intense lubricative)
 */
export function deriveMucusCategory(
  sensation?: MucusSensation,
  appearance?: MucusAppearance,
): SensiplanMucusCategory {
  if (appearance === "stretchy") {
    return "S_plus";
  }
  if (sensation === "wet" || appearance === "clear") {
    return "S";
  }
  if (
    sensation === "moist" ||
    appearance === "thick" ||
    appearance === "creamy"
  ) {
    return "f";
  }
  return "t";
}

function getMucusRank(cat: SensiplanMucusCategory): number {
  switch (cat) {
    case "S_plus":
      return 3;
    case "S":
      return 2;
    case "f":
      return 1;
    case "t":
      return 0;
  }
}

/**
 * Evaluates Sensiplan mucus peak day and the 3-day post-peak dry-up rule [M2].
 */
export function evaluateMucusPeak(
  cycleEntries: readonly DayEntry[],
): MucusEvaluationResult {
  const entriesWithMucus = cycleEntries.filter((e) => e.mucus !== undefined);

  if (entriesWithMucus.length < 4) {
    return {
      isConfirmed: false,
      postPeakDates: [],
      explanation:
        "Yetersiz mukus gözlemi (zirve tespiti için en az 1 zirve ve 3 düşüş günü gerekir).",
    };
  }

  // Find candidate peak days: days with high fertility mucus ('S' or 'S_plus')
  // that are followed by 3 consecutive days of strictly lower quality mucus.
  for (let i = 0; i < entriesWithMucus.length - 3; i++) {
    const candidate = entriesWithMucus[i]!;
    const candidateCategory = deriveMucusCategory(
      candidate.mucus?.sensation,
      candidate.mucus?.appearance,
    );

    const candidateRank = getMucusRank(candidateCategory);
    // Peak day must be high quality ('S' or 'S_plus')
    if (candidateRank < 2) {
      continue;
    }

    const dayPlus1 = entriesWithMucus[i + 1]!;
    const dayPlus2 = entriesWithMucus[i + 2]!;
    const dayPlus3 = entriesWithMucus[i + 3]!;

    const r1 = getMucusRank(
      deriveMucusCategory(
        dayPlus1.mucus?.sensation,
        dayPlus1.mucus?.appearance,
      ),
    );
    const r2 = getMucusRank(
      deriveMucusCategory(
        dayPlus2.mucus?.sensation,
        dayPlus2.mucus?.appearance,
      ),
    );
    const r3 = getMucusRank(
      deriveMucusCategory(
        dayPlus3.mucus?.sensation,
        dayPlus3.mucus?.appearance,
      ),
    );

    // Must be 3 consecutive days of lower quality mucus
    if (r1 < candidateRank && r2 < candidateRank && r3 < candidateRank) {
      return {
        isConfirmed: true,
        peakDayDate: candidate.date,
        evaluationCompleteDate: dayPlus3.date,
        postPeakDates: [dayPlus1.date, dayPlus2.date, dayPlus3.date],
        explanation: `Mukus kuralı (M2) sağlandı: ${candidate.date} mukus zirve günü olarak saptandı ve ardından 3 gün boyunca kuruma/düşüş doğrulandı.`,
      };
    }
  }

  return {
    isConfirmed: false,
    postPeakDates: [],
    explanation:
      "Mukus zirvesi ve ardından gelen 3 günlük kuruma henüz doğrulanmadı.",
  };
}
