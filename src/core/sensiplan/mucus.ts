import { addDays, compareISODate } from "../date";
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
  const entriesWithMucus = [...cycleEntries]
    .filter((e) => e.mucus !== undefined)
    .sort((a, b) => compareISODate(a.date, b.date));

  if (entriesWithMucus.length < 4) {
    return {
      isConfirmed: false,
      postPeakDates: [],
      explanation:
        "Yetersiz mukus gözlemi (zirve tespiti için en az 1 zirve ve 3 düşüş günü gerekir).",
    };
  }

  // Map consecutive calendar dates to their derived mucus rank
  const mucusRankByDate = new Map<ISODate, number>();
  let latestFertileDate: ISODate | undefined;

  for (const e of entriesWithMucus) {
    const rank = getMucusRank(
      deriveMucusCategory(e.mucus?.sensation, e.mucus?.appearance),
    );
    mucusRankByDate.set(e.date, rank);
    if (rank >= 2) {
      latestFertileDate = e.date;
    }
  }

  // Find candidate peak days: days with high fertility mucus ('S' or 'S_plus')
  // followed by 3 consecutive CALENDAR days of observed strictly lower quality mucus.
  const candidates: {
    peakDayDate: ISODate;
    rank: number;
    evaluationCompleteDate: ISODate;
    postPeakDates: readonly ISODate[];
  }[] = [];

  for (const candidate of entriesWithMucus) {
    const candidateRank = mucusRankByDate.get(candidate.date) ?? 0;
    // Peak day must be high quality ('S' or 'S_plus')
    if (candidateRank < 2) {
      continue;
    }

    const d1 = addDays(candidate.date, 1);
    const d2 = addDays(candidate.date, 2);
    const d3 = addDays(candidate.date, 3);

    const r1 = mucusRankByDate.get(d1);
    const r2 = mucusRankByDate.get(d2);
    const r3 = mucusRankByDate.get(d3);

    // Must have actual mucus observations on all 3 consecutive calendar days
    if (r1 === undefined || r2 === undefined || r3 === undefined) {
      continue;
    }

    // Must be 3 consecutive calendar days of strictly lower quality mucus
    if (r1 < candidateRank && r2 < candidateRank && r3 < candidateRank) {
      candidates.push({
        peakDayDate: candidate.date,
        rank: candidateRank,
        evaluationCompleteDate: d3,
        postPeakDates: [d1, d2, d3],
      });
    }
  }

  // Any subsequent high-quality mucus ('S' or 'S_plus') occurring after a candidate's
  // completion date supersedes that earlier wave until a new 3-day dry-up finishes.
  const validCandidates = latestFertileDate
    ? candidates.filter(
        (c) => compareISODate(c.evaluationCompleteDate, latestFertileDate) >= 0,
      )
    : candidates;

  if (validCandidates.length > 0) {
    // Sensiplan: Peak day is the LAST day of the highest quality mucus observed
    validCandidates.sort((a, b) => {
      if (b.rank !== a.rank) return b.rank - a.rank;
      return compareISODate(b.peakDayDate, a.peakDayDate);
    });

    const best = validCandidates[0]!;
    return {
      isConfirmed: true,
      peakDayDate: best.peakDayDate,
      evaluationCompleteDate: best.evaluationCompleteDate,
      postPeakDates: best.postPeakDates,
      explanation: `Mukus kuralı (M2) sağlandı: ${best.peakDayDate} mukus zirve günü olarak saptandı ve ardından kesintisiz 3 takvim günü kuruma/düşüş doğrulandı.`,
    };
  }

  return {
    isConfirmed: false,
    postPeakDates: [],
    explanation:
      "Mukus zirvesi ve ardından gelen ardışık 3 günlük kuruma henüz doğrulanmadı.",
  };
}
