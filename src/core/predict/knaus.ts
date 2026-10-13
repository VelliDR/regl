import { addDays } from "../date";
import { Cycle } from "../cycles";
import { ISODate } from "../types";

export interface KnausOginoResult {
  readonly eligible: boolean; // Requires at least 6 completed cycles
  readonly sampleCount: number;
  readonly shortestCycle: number;
  readonly longestCycle: number;
  readonly fertileWindowStartDay?: number; // Cycle day (1-indexed)
  readonly fertileWindowEndDay?: number; // Cycle day (1-indexed)
  readonly fertileWindowStartDate?: ISODate;
  readonly fertileWindowEndDate?: ISODate;
  readonly isSafeForContraception: false; // Rule P7: Explicit safety invariant
  readonly disclaimer: string;
}

/**
 * Calculates the historical Knaus-Ogino calendar rhythm method [P7].
 * This is provided strictly as an informational baseline and NEVER as a safe
 * contraceptive recommendation due to follicular phase variability.
 */
export function calculateKnausOgino(
  activeCycleStartDate: ISODate,
  completedCycles: readonly Cycle[],
): KnausOginoResult {
  const disclaimer =
    "Takvim yöntemi (Knaus-Ogino) yüksek başarısızlık oranına sahiptir. Yalnızca bilgilendirme amaçlıdır, gebelik önleme amacıyla kullanılamaz.";

  const validLengths = completedCycles
    .filter((c) => c.length !== undefined && !c.isOutlier)
    .map((c) => c.length!);

  if (validLengths.length < 6) {
    return {
      eligible: false,
      sampleCount: validLengths.length,
      shortestCycle: validLengths.length > 0 ? Math.min(...validLengths) : 0,
      longestCycle: validLengths.length > 0 ? Math.max(...validLengths) : 0,
      isSafeForContraception: false,
      disclaimer,
    };
  }

  const shortest = Math.min(...validLengths);
  const longest = Math.max(...validLengths);

  // Knaus-Ogino formula:
  // Fertile window start = shortest cycle - 18
  // Fertile window end = longest cycle - 11
  const startDay = Math.max(1, shortest - 18);
  const endDay = Math.max(startDay, longest - 11);

  const startDate = addDays(activeCycleStartDate, startDay - 1);
  const endDate = addDays(activeCycleStartDate, endDay - 1);

  return {
    eligible: true,
    sampleCount: validLengths.length,
    shortestCycle: shortest,
    longestCycle: longest,
    fertileWindowStartDay: startDay,
    fertileWindowEndDay: endDay,
    fertileWindowStartDate: startDate,
    fertileWindowEndDate: endDate,
    isSafeForContraception: false,
    disclaimer,
  };
}
