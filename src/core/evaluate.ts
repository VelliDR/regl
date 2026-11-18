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

export function getCycleEntries(
  sortedEntries: readonly DayEntry[],
  cycle: Cycle,
): DayEntry[] {
  return sortedEntries.filter((e) => {
    const afterStart = compareISODate(e.date, cycle.startDate) >= 0;
    const beforeEnd = cycle.endDate
      ? compareISODate(e.date, cycle.endDate) <= 0
      : true;
    return afterStart && beforeEnd;
  });
}

export function evaluateCycleSensiplan(
  cycle: Cycle,
  sortedEntries: readonly DayEntry[],
  evaluationDate: ISODate,
  history: HistoricalCycleData,
): SensiplanFullEvaluation {
  const cycleEntries = getCycleEntries(sortedEntries, cycle);
  const entriesUpToDate = cycleEntries.filter(
    (e) => compareISODate(e.date, evaluationDate) <= 0,
  );
  const cycleDay = Math.max(1, daysBetween(cycle.startDate, evaluationDate) + 1);

  const tempResult = evaluateTemperatureShift(cycleEntries);
  const mucusResult = evaluateMucusPeak(cycleEntries);
  const doubleCheck = evaluateDoubleCheck(
    tempResult,
    mucusResult,
    evaluationDate,
  );

  const preOvulatory = evaluatePreOvulatoryPhase(
    cycleDay,
    entriesUpToDate,
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
    } else if (
      preOvulatory.appliedRule === "NONE" &&
      cycleDay <= 5 &&
      completedHasWarning(history)
    ) {
      activeRuleExplanation = preOvulatory.explanation;
    }
  }

  return {
    temperature: tempResult,
    mucus: mucusResult,
    doubleCheck,
    preOvulatory,
    overallFertilityState: overallState,
    activeRuleExplanation,
  };
}

function completedHasWarning(history: HistoricalCycleData): boolean {
  return (
    history.completedCycles.length > 0 &&
    history.previousCycleWasOvulatory === false
  );
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

  // Evaluate historical completed cycles once for ovulatory confirmation, 1HM days, and [P6] luteal average
  const hasAnyBbt = sortedEntries.some((e) => e.bbt !== undefined);
  const completedMeta = new Map<
    number,
    { isOvulatory: boolean; firstHighDay?: number; lutealLength?: number }
  >();
  const lutealLengths: number[] = [];

  if (hasAnyBbt || options.trackingMode === "symptothermal") {
    for (const c of completedCycles) {
      const cEntries = getCycleEntries(sortedEntries, c);
      const tRes = evaluateTemperatureShift(cEntries);
      const mRes = evaluateMucusPeak(cEntries);
      const firstHighDay =
        tRes.isConfirmed && tRes.firstHighDayDate
          ? daysBetween(c.startDate, tRes.firstHighDayDate) + 1
          : undefined;
      const isOvulatory = tRes.isConfirmed && mRes.isConfirmed;
      const lutealLength =
        c.length !== undefined && !c.isOutlier && firstHighDay !== undefined
          ? c.length - (firstHighDay - 1)
          : undefined;

      completedMeta.set(c.id, {
        isOvulatory,
        ...(firstHighDay !== undefined ? { firstHighDay } : {}),
        ...(lutealLength !== undefined ? { lutealLength } : {}),
      });

      if (lutealLength !== undefined && lutealLength >= 8 && lutealLength <= 20) {
        lutealLengths.push(lutealLength);
      }
    }
  }

  // [P6] Auto-compute personal luteal phase average if >= 3 confirmed cycles exist
  const autoPersonalLp =
    options.personalLutealPhaseLength !== undefined
      ? options.personalLutealPhaseLength
      : lutealLengths.length >= 3
        ? Math.round(
            lutealLengths.reduce((acc, v) => acc + v, 0) / lutealLengths.length,
          )
        : undefined;

  const baseDate = activeCycle ? activeCycle.startDate : today;
  const prediction = predictNextPeriod(baseDate, completedCycles, {
    ...options,
    ...(autoPersonalLp !== undefined
      ? { personalLutealPhaseLength: autoPersonalLp }
      : {}),
  });
  const knausOgino = calculateKnausOgino(baseDate, completedCycles);

  let sensiplan: SensiplanFullEvaluation | undefined;

  const cycleToEvaluate = targetCycle ?? activeCycle;

  if (options.trackingMode === "symptothermal" && cycleToEvaluate) {
    const priorCompleted = completedCycles.filter(
      (c) => compareISODate(c.startDate, cycleToEvaluate.startDate) < 0,
    );
    const lastPrior = priorCompleted[priorCompleted.length - 1];
    const previousCycleWasOvulatory = lastPrior
      ? Boolean(completedMeta.get(lastPrior.id)?.isOvulatory)
      : false;
    const pastFirstHighDays = priorCompleted
      .map((c) => completedMeta.get(c.id)?.firstHighDay)
      .filter((d): d is number => d !== undefined);

    const history: HistoricalCycleData = options.history ?? {
      completedCycles: priorCompleted,
      pastFirstHighDays,
      previousCycleWasOvulatory,
    };

    sensiplan = evaluateCycleSensiplan(
      cycleToEvaluate,
      sortedEntries,
      today,
      history,
    );
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
