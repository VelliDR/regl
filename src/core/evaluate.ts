import { daysBetween } from "./date";
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
  const { completedCycles, activeCycle } = partitionCycles(entries);

  // If there's an active cycle, calculate cycle day relative to `today`
  let currentCycleDay: number | undefined;
  if (activeCycle) {
    const diff = daysBetween(activeCycle.startDate, today);
    currentCycleDay = diff >= 0 ? diff + 1 : undefined;
  }

  const baseDate = activeCycle ? activeCycle.startDate : today;
  const prediction = predictNextPeriod(baseDate, completedCycles, options);
  const knausOgino = calculateKnausOgino(baseDate, completedCycles);

  let sensiplan: SensiplanFullEvaluation | undefined;

  if (options.trackingMode === "symptothermal" && activeCycle) {
    // Filter entries belonging to the active cycle
    const activeCycleEntries = entries.filter((e) => {
      const diff = daysBetween(activeCycle.startDate, e.date);
      return diff >= 0;
    });

    const targetEntry = entries.find((e) => e.date === today);

    const tempResult = evaluateTemperatureShift(activeCycleEntries);
    const mucusResult = evaluateMucusPeak(activeCycleEntries);
    const doubleCheck = evaluateDoubleCheck(tempResult, mucusResult, today);

    const history: HistoricalCycleData = options.history ?? {
      completedCycles,
      previousCycleWasOvulatory: completedCycles.length > 0,
    };

    const preOvulatory = evaluatePreOvulatoryPhase(
      currentCycleDay ?? 1,
      targetEntry,
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
    ...(currentCycleDay !== undefined ? { currentCycleDay } : {}),
    completedCycles,
    prediction,
    knausOgino,
    ...(sensiplan ? { sensiplan } : {}),
    hasData: entries.length > 0,
  };
}
