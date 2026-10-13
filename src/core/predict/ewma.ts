import { addDays } from '../date';
import { Cycle } from '../cycles';
import { ISODate } from '../types';

export interface EwmaPredictionConfig {
  readonly alpha?: number; // Smoothing factor, default 0.3
  readonly fallbackLength?: number; // Onboarding default, default 28
  readonly personalLutealPhaseLength?: number; // In days, e.g. 14
}

export type CycleRegularity = 'regular' | 'irregular' | 'unknown';

export interface PeriodPrediction {
  readonly estimatedCycleLength: number; // e.g. 28.4 days
  readonly standardDeviation: number; // e.g. 1.2 days
  readonly uncertaintyBandDays: number; // e.g. 2 days (means +/- 2 days)
  readonly nextPeriodStartDate: ISODate; // Central predicted start date
  readonly windowStartDate: ISODate; // nextPeriod - uncertaintyBand
  readonly windowEndDate: ISODate; // nextPeriod + uncertaintyBand
  readonly estimatedOvulationDate?: ISODate; // Based on personal luteal phase if known
  readonly regularity: CycleRegularity; // [P5]
  readonly lowConfidence: boolean; // [P1]
  readonly sampleCount: number; // Non-outlier completed cycles used
  readonly outlierCount: number; // Outlier cycles filtered out [P4]
  readonly ruleId: 'P1' | 'P2' | 'P3';
}

/**
 * Predicts the next menstrual cycle start date and uncertainty window
 * based on EWMA (Exponentially Weighted Moving Average) and biological priors.
 */
export function predictNextPeriod(
  activeCycleStartDate: ISODate,
  completedCycles: readonly Cycle[],
  config: EwmaPredictionConfig = {}
): PeriodPrediction {
  const alpha = config.alpha ?? 0.3;
  const fallbackLength = config.fallbackLength ?? 28;
  const personalLp = config.personalLutealPhaseLength;

  // Filter out outlier cycles [P4]
  const validCycles = completedCycles.filter((c) => c.length !== undefined && !c.isOutlier);
  const outlierCount = completedCycles.length - validCycles.length;
  const sampleCount = validCycles.length;

  // [P1] Zero completed cycles: fallback to onboarding prior
  if (sampleCount === 0) {
    const estLength = fallbackLength;
    const uncertainty = 4;
    const nextStart = addDays(activeCycleStartDate, estLength);

    return {
      estimatedCycleLength: estLength,
      standardDeviation: 3.0,
      uncertaintyBandDays: uncertainty,
      nextPeriodStartDate: nextStart,
      windowStartDate: addDays(nextStart, -uncertainty),
      windowEndDate: addDays(nextStart, uncertainty),
      ...(personalLp ? { estimatedOvulationDate: addDays(nextStart, -personalLp) } : {}),
      regularity: 'unknown',
      lowConfidence: true,
      sampleCount: 0,
      outlierCount,
      ruleId: 'P1',
    };
  }

  // [P2] 1 or 2 completed cycles: simple arithmetic mean
  if (sampleCount < 3) {
    const lengths = validCycles.map((c) => c.length!);
    const sum = lengths.reduce((acc, val) => acc + val, 0);
    const mean = sum / lengths.length;
    const estLength = Math.round(mean * 10) / 10;
    const uncertainty = 3;
    const nextStart = addDays(activeCycleStartDate, Math.round(estLength));

    return {
      estimatedCycleLength: estLength,
      standardDeviation: 2.0,
      uncertaintyBandDays: uncertainty,
      nextPeriodStartDate: nextStart,
      windowStartDate: addDays(nextStart, -uncertainty),
      windowEndDate: addDays(nextStart, uncertainty),
      ...(personalLp ? { estimatedOvulationDate: addDays(nextStart, -personalLp) } : {}),
      regularity: 'unknown',
      lowConfidence: false,
      sampleCount,
      outlierCount,
      ruleId: 'P2',
    };
  }

  // [P3] >= 3 completed cycles: Exponentially Weighted Moving Average & Variance
  const lengths = validCycles.map((c) => c.length!);
  let ewmaMean = lengths[0]!;
  let ewmaVar = 1.0; // initial variance prior

  for (let i = 1; i < lengths.length; i++) {
    const l = lengths[i]!;
    const prevMean = ewmaMean;
    ewmaMean = alpha * l + (1 - alpha) * prevMean;
    const diff = l - prevMean;
    ewmaVar = alpha * (diff * diff) + (1 - alpha) * ewmaVar;
  }

  const stdDev = Math.sqrt(Math.max(0.1, ewmaVar));
  const roundedLength = Math.round(ewmaMean * 10) / 10;
  const roundedStdDev = Math.round(stdDev * 10) / 10;

  // Uncertainty band = round(1.5 * stdDev), minimum 1 day
  const uncertainty = Math.max(1, Math.round(1.5 * stdDev));
  const nextStart = addDays(activeCycleStartDate, Math.round(roundedLength));

  // [P5] Regularity classification
  const regularity: CycleRegularity = stdDev < 1.5 ? 'regular' : 'irregular';

  // [P6] Individual luteal phase prediction if available
  let estimatedOvulationDate: ISODate | undefined;
  if (personalLp !== undefined && personalLp > 0) {
    estimatedOvulationDate = addDays(nextStart, -personalLp);
  }

  return {
    estimatedCycleLength: roundedLength,
    standardDeviation: roundedStdDev,
    uncertaintyBandDays: uncertainty,
    nextPeriodStartDate: nextStart,
    windowStartDate: addDays(nextStart, -uncertainty),
    windowEndDate: addDays(nextStart, uncertainty),
    ...(estimatedOvulationDate ? { estimatedOvulationDate } : {}),
    regularity,
    lowConfidence: false,
    sampleCount,
    outlierCount,
    ruleId: 'P3',
  };
}
