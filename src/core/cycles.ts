import { addDays, compareISODate, daysBetween } from './date';
import { BleedingIntensity, DayEntry, ISODate } from './types';

export interface Cycle {
  readonly id: number; // 1-indexed sequential cycle number
  readonly startDate: ISODate; // Cycle Day 1
  readonly endDate?: ISODate | undefined; // Last day before next cycle (inclusive, if completed)
  readonly length?: number | undefined; // Total calendar days (if completed)
  readonly periodLength?: number | undefined; // Days of bleeding in the initial period
  readonly isOutlier?: boolean | undefined; // Rule P4: Outlier cycle flag
}

export interface CyclePartitionResult {
  readonly completedCycles: readonly Cycle[];
  readonly activeCycle?: Cycle;
  readonly allCycles: readonly Cycle[];
}

function isSignificantBleeding(b?: BleedingIntensity): boolean {
  return b === 'light' || b === 'medium' || b === 'heavy';
}

/**
 * Calculates the median of an array of numbers.
 */
export function calculateMedian(numbers: readonly number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid] ?? 0;
  }
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Segments raw daily entries into chronological cycles.
 * 
 * Rules applied:
 * 1. Cycle Day 1 is triggered by significant bleeding ('light' | 'medium' | 'heavy')
 *    or an explicit `cycleStartOverride: true`.
 * 2. Spotting ('spotting') alone does NOT initiate a new cycle.
 * 3. Bleeding within 14 days of an active cycle start is treated as part of the same cycle
 *    or mid-cycle bleeding, unless explicitly overridden.
 * 4. Completed cycle length = nextCycle.startDate - currentCycle.startDate.
 * 5. Outlier detection [P4]: cycles < 18 days or > 2 * median length are flagged as outliers.
 */
export function partitionCycles(entries: readonly DayEntry[]): CyclePartitionResult {
  if (entries.length === 0) {
    return { completedCycles: [], allCycles: [] };
  }

  // Sort entries chronologically
  const sorted = [...entries].sort((a, b) => compareISODate(a.date, b.date));
  const entryMap = new Map<ISODate, DayEntry>();
  for (const e of sorted) {
    entryMap.set(e.date, e);
  }

  const cycleStartDates: ISODate[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i]!;
    
    // Explicit user override always starts a new cycle
    if (current.cycleStartOverride) {
      cycleStartDates.push(current.date);
      continue;
    }

    // Spotting does not trigger a cycle
    if (!isSignificantBleeding(current.bleeding)) {
      continue;
    }

    // First cycle start
    if (cycleStartDates.length === 0) {
      cycleStartDates.push(current.date);
      continue;
    }

    const lastStartDate = cycleStartDates[cycleStartDates.length - 1]!;
    const daysSinceLastStart = daysBetween(lastStartDate, current.date);

    // Physiological constraint: a new menstrual cycle cannot naturally start < 14 days
    // after the previous one unless explicitly overridden.
    if (daysSinceLastStart >= 14) {
      // Check if there was a gap of at least 2 non-bleeding days before this day
      const dayMinus1 = entryMap.get(addDays(current.date, -1));
      const dayMinus2 = entryMap.get(addDays(current.date, -2));

      const hasBleedingMinus1 = isSignificantBleeding(dayMinus1?.bleeding);
      const hasBleedingMinus2 = isSignificantBleeding(dayMinus2?.bleeding);

      // If preceding days were not significant bleeding, this marks the start of a new period
      if (!hasBleedingMinus1 || !hasBleedingMinus2) {
        cycleStartDates.push(current.date);
      }
    }
  }

  if (cycleStartDates.length === 0) {
    return { completedCycles: [], allCycles: [] };
  }

  // Build Cycle objects
  const rawCycles: { id: number; startDate: ISODate; endDate?: ISODate; length?: number }[] = [];

  for (let i = 0; i < cycleStartDates.length; i++) {
    const startDate = cycleStartDates[i]!;
    const nextStart = cycleStartDates[i + 1];

    if (nextStart) {
      const length = daysBetween(startDate, nextStart);
      const endDate = addDays(nextStart, -1);
      rawCycles.push({ id: i + 1, startDate, endDate, length });
    } else {
      rawCycles.push({ id: i + 1, startDate });
    }
  }

  // Calculate outlier thresholds based on median of completed cycles
  const completedLengths = rawCycles.filter((c) => c.length !== undefined).map((c) => c.length!);
  const medianLength = calculateMedian(completedLengths);

  const completedCycles: Cycle[] = [];
  let activeCycle: Cycle | undefined;

  for (const c of rawCycles) {
    // Calculate periodLength (bleeding days in first 10 days of cycle)
    let periodLength = 0;
    for (let d = 0; d < 10; d++) {
      const targetDate = addDays(c.startDate, d);
      // Stop checking if we reached the next cycle
      if (c.endDate && compareISODate(targetDate, c.endDate) > 0) break;
      const entry = entryMap.get(targetDate);
      if (isSignificantBleeding(entry?.bleeding)) {
        periodLength++;
      } else if (d > 2 && periodLength > 0) {
        // If bleeding stopped for 2 consecutive days after day 3, period ended
        const nextDay = entryMap.get(addDays(targetDate, 1));
        if (!isSignificantBleeding(nextDay?.bleeding)) {
          break;
        }
      }
    }

    let isOutlier = false;
    if (c.length !== undefined) {
      if (c.length < 18) {
        isOutlier = true;
      } else if (medianLength > 0 && c.length > Math.max(55, 2 * medianLength)) {
        isOutlier = true;
      }
    }

    const cycleObj: Cycle = {
      id: c.id,
      startDate: c.startDate,
      ...(c.endDate ? { endDate: c.endDate } : {}),
      ...(c.length !== undefined ? { length: c.length } : {}),
      periodLength: periodLength > 0 ? periodLength : undefined,
      isOutlier,
    };

    if (c.length !== undefined) {
      completedCycles.push(cycleObj);
    } else {
      activeCycle = cycleObj;
    }
  }

  const allCycles = activeCycle ? [...completedCycles, activeCycle] : [...completedCycles];

  return {
    completedCycles,
    ...(activeCycle ? { activeCycle } : {}),
    allCycles,
  };
}
