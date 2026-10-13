import { daysBetween } from './date';
import { Cycle, partitionCycles } from './cycles';
import { EwmaPredictionConfig, PeriodPrediction, predictNextPeriod } from './predict/ewma';
import { calculateKnausOgino, KnausOginoResult } from './predict/knaus';
import { DayEntry, ISODate } from './types';

export interface CycleEvaluation {
  readonly targetDate: ISODate;
  readonly activeCycle?: Cycle;
  readonly currentCycleDay?: number; // 1-indexed (e.g. Day 14)
  readonly completedCycles: readonly Cycle[];
  readonly prediction: PeriodPrediction;
  readonly knausOgino: KnausOginoResult;
  readonly hasData: boolean;
}

/**
 * Unified evaluation function for Phase 1.
 * Evaluates the active cycle, current cycle day, and statistical predictions.
 */
export function evaluateCycleState(
  entries: readonly DayEntry[],
  today: ISODate,
  config: EwmaPredictionConfig = {}
): CycleEvaluation {
  const { completedCycles, activeCycle } = partitionCycles(entries);

  // If there's an active cycle, calculate cycle day relative to `today`
  let currentCycleDay: number | undefined;
  if (activeCycle) {
    const diff = daysBetween(activeCycle.startDate, today);
    currentCycleDay = diff >= 0 ? diff + 1 : undefined;
  }

  // Active cycle start date to project from (or today if no cycle recorded yet)
  const baseDate = activeCycle ? activeCycle.startDate : today;

  const prediction = predictNextPeriod(baseDate, completedCycles, config);
  const knausOgino = calculateKnausOgino(baseDate, completedCycles);

  return {
    targetDate: today,
    ...(activeCycle ? { activeCycle } : {}),
    ...(currentCycleDay !== undefined ? { currentCycleDay } : {}),
    completedCycles,
    prediction,
    knausOgino,
    hasData: entries.length > 0,
  };
}
