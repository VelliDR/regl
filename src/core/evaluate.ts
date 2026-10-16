import { compareISODate, daysBetween } from "./date";
import { Cycle, partitionCycles } from "./cycles";
import {
  EwmaPredictionConfig,
  PeriodPrediction,
  predictNextPeriod,
} from "./predict/ewma";
import { calculateKnausOgino, KnausOginoResult } from "./predict/knaus";
import {
  evaluateTemperatureShift,
  TemperatureEvaluationResult,
} from "./sensiplan/temperature";
import { evaluateMucusPeak, MucusEvaluationResult } from "./sensiplan/mucus";
import {
  DoubleCheckEvaluationResult,
  evaluateDoubleCheck,
} from "./sensiplan/doubleCheck";
import {
  evaluatePreOvulatoryPhase,
  HistoricalCycleData,
  PreOvulatoryResult,
} from "./sensiplan/preOvulatory";
import { DayEntry, ISODate } from "./types";

export type ClinicalFertilityState = "fertile" | "infertile" | "unknown";

export interface SensiplanFullEvaluation {
  readonly temperature: TemperatureEvaluationResult;
  readonly mucus: MucusEvaluationResult;
  readonly doubleCheck: DoubleCheckEvaluationResult;
  readonly preOvulatory: PreOvulatoryResult;
  readonly overallFertilityState: ClinicalFertilityState;
  readonly activeRuleExplanation: string;
}

export interface CycleEvaluation {
  readonly targetDate: ISODate;
  readonly activeCycle?: Cycle;
  readonly targetCycle?: Cycle;
  readonly currentCycleDay?: number; // 1-indexed (e.g. Day 14)
  readonly completedCycles: readonly Cycle[];
  readonly prediction: PeriodPrediction;
  readonly knausOgino: KnausOginoResult;
  readonly sensiplan?: SensiplanFullEvaluation;
  readonly hasData: boolean;
}

export interface EvaluationOptions extends EwmaPredictionConfig {
  readonly trackingMode?: "basic" | "symptothermal";
  readonly history?: HistoricalCycleData;
}

/**
 * Unified evaluation coordinator for basic statistical and advanced Sensiplan models.
 */
export function evaluateCycleState(
  entries: readonly DayEntry[],
  today: ISODate,
  options: EvaluationOptions = {},
): CycleEvaluation {
  // Ensure entries are strictly sorted chronologically
  const sortedEntries = [...entries].sort((a, b) => compareISODate(a.date, b.date));
  const { completedCycles, activeCycle, allCycles } = partitionCycles(sortedEntries);

  // Find which cycle `today` belongs to
  const targetCycle =
    allCycles.find(
      (c) =>
        compareISODate(today, c.startDate) >= 0 &&
        (!c.endDate || compareISODate(today, c.endDate) <= 0),
    ) ?? (activeCycle && compareISODate(today, activeCycle.startDate) >= 0 ? activeCycle : undefined);

  // Calculate cycle day relative to targetCycle, or fallback to activeCycle
  let currentCycleDay: number | undefined;
  if (targetCycle) {
    const diff = daysBetween(targetCycle.startDate, today);
    currentCycleDay = diff >= 0 ? diff + 1 : undefined;
  } else if (activeCycle) {
    const diff = daysBetween(activeCycle.startDate, today);
    currentCycleDay = diff >= 0 ? diff + 1 : undefined;
  }

  const baseDate = activeCycle ? activeCycle.startDate : today;
  const prediction = predictNextPeriod(baseDate, completedCycles, options);
  const knausOgino = calculateKnausOgino(baseDate, completedCycles);

  let sensiplan: SensiplanFullEvaluation | undefined;

  const cycleToEvaluate = targetCycle ?? activeCycle;

  if (options.trackingMode === "symptothermal" && cycleToEvaluate) {
    // Filter entries belonging to this specific cycle
    const cycleEntries = sortedEntries.filter((e) => {
      const afterStart = compareISODate(e.date, cycleToEvaluate.startDate) >= 0;
      const beforeEnd = cycleToEvaluate.endDate
        ? compareISODate(e.date, cycleToEvaluate.endDate) <= 0
        : true;
      return afterStart && beforeEnd;
    });

    const entriesUpToToday = cycleEntries.filter(
      (e) => compareISODate(e.date, today) <= 0,
    );

    const tempResult = evaluateTemperatureShift(cycleEntries);
    const mucusResult = evaluateMucusPeak(cycleEntries);
    const doubleCheck = evaluateDoubleCheck(tempResult, mucusResult, today);

    const history: HistoricalCycleData = options.history ?? {
      completedCycles,
      previousCycleWasOvulatory: completedCycles.length > 0,
    };

    const preOvulatory = evaluatePreOvulatoryPhase(
      currentCycleDay ?? 1,
      entriesUpToToday,
      history,
    );

    // Determine overall clinical fertility state:
    // 1. Post-ovulatory infertile phase takes precedence
    // 2. Pre-ovulatory infertile phase applies if before window opening
    // 3. Otherwise fertile (safe default [X1])
    let overallState: ClinicalFertilityState = "fertile";
    let activeRuleExplanation =
      "Doğurganlık penceresi açık (gebelik ihtimali mevcut).";

    if (doubleCheck.isPostOvulatoryInfertile) {
      overallState = "infertile";
      activeRuleExplanation = doubleCheck.explanation;
    } else if (preOvulatory.isPreOvulatoryInfertile) {
      overallState = "infertile";
      activeRuleExplanation = preOvulatory.explanation;
    } else {
      overallState = "fertile";
      if (preOvulatory.appliedRule === "E4_MUCUS_OVERRIDE") {
        activeRuleExplanation = preOvulatory.explanation;
      }
    }

    sensiplan = {
      temperature: tempResult,
      mucus: mucusResult,
      doubleCheck,
      preOvulatory,
      overallFertilityState: overallState,
      activeRuleExplanation,
    };
  }

  return {
    targetDate: today,
    ...(activeCycle ? { activeCycle } : {}),
    ...(targetCycle ? { targetCycle } : {}),
    ...(currentCycleDay !== undefined ? { currentCycleDay } : {}),
    completedCycles,
    prediction,
    knausOgino,
    ...(sensiplan ? { sensiplan } : {}),
    hasData: entries.length > 0,
  };
}
