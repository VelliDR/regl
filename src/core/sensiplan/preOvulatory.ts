import { Cycle } from '../cycles';
import { DayEntry } from '../types';
import { deriveMucusCategory } from './mucus';

export interface PreOvulatoryResult {
  readonly isPreOvulatoryInfertile: boolean;
  readonly lastInfertileCycleDay: number; // 1-indexed cycle day
  readonly appliedRule: 'E1_FIRST_5_DAYS' | 'E2_MINUS_8' | 'E3_MINUS_20' | 'E4_MUCUS_OVERRIDE' | 'NONE';
  readonly explanation: string;
}

export interface HistoricalCycleData {
  readonly completedCycles: readonly Cycle[];
  readonly pastFirstHighDays?: readonly number[]; // 1HM cycle days (e.g. Day 15, Day 14...)
  readonly previousCycleWasOvulatory?: boolean;
}

/**
 * Calculates pre-ovulatory infertility rules (E1, E2, E3, E4) for the active cycle.
 */
export function evaluatePreOvulatoryPhase(
  cycleDay: number,
  currentEntry: DayEntry | undefined,
  history: HistoricalCycleData
): PreOvulatoryResult {
  // [E4] Emergency Mucus Cutoff:
  // Regardless of historical calculations, as soon as any mucus or moist/wet sensation is observed,
  // the pre-ovulatory infertile phase terminates immediately!
  if (currentEntry?.mucus) {
    const category = deriveMucusCategory(
      currentEntry.mucus.sensation,
      currentEntry.mucus.appearance
    );
    if (category !== 't') {
      return {
        isPreOvulatoryInfertile: false,
        lastInfertileCycleDay: Math.max(1, cycleDay - 1),
        appliedRule: 'E4_MUCUS_OVERRIDE',
        explanation: 'Acil kural (E4): Mukus veya nemlilik hissi başladığı için pre-ovülatuar kısır dönem derhal sonlanmıştır.',
      };
    }
  }

  // Determine last infertile day baseline from historical rules
  let calculatedLastDay = 0;
  let rule: PreOvulatoryResult['appliedRule'] = 'NONE';
  let explanation = 'Pre-ovülatuar dönem için yeterli geçmiş veri bulunmamaktadır.';

  // [E2] Minus-8 Rule (Requires at least 12 cycles with confirmed 1HM)
  if (history.pastFirstHighDays && history.pastFirstHighDays.length >= 12) {
    const earliest1HM = Math.min(...history.pastFirstHighDays.slice(-12));
    calculatedLastDay = Math.max(1, earliest1HM - 8);
    rule = 'E2_MINUS_8';
    explanation = `Eksi-8 Kuralı (E2): Son 12 döngüdeki en erken 1. yüksek sıcaklık (${earliest1HM}. gün) - 8 = ${calculatedLastDay}. gün son kısır gün.`;
  }
  // [E3] Minus-20 Rule (Requires at least 12 cycles)
  else if (history.completedCycles.length >= 12) {
    const validLengths = history.completedCycles
      .filter((c) => c.length !== undefined && !c.isOutlier)
      .map((c) => c.length!)
      .slice(-12);

    if (validLengths.length >= 12) {
      const shortest = Math.min(...validLengths);
      calculatedLastDay = Math.max(1, shortest - 20);
      rule = 'E3_MINUS_20';
      explanation = `Eksi-20 Kuralı (E3): Son 12 döngünün en kısası (${shortest} gün) - 20 = ${calculatedLastDay}. gün son kısır gün.`;
    }
  }
  // [E1] First 5 Days Rule
  // If previous cycle was confirmed ovulatory, first 5 days are considered infertile
  else if (history.previousCycleWasOvulatory) {
    calculatedLastDay = 5;
    rule = 'E1_FIRST_5_DAYS';
    explanation = '5 Gün Kuralı (E1): Önceki döngüde ovülasyon doğrulandığı için ilk 5 gün kısır kabul edilir.';
  }

  const isInfertile = cycleDay <= calculatedLastDay && calculatedLastDay > 0;

  return {
    isPreOvulatoryInfertile: isInfertile,
    lastInfertileCycleDay: calculatedLastDay,
    appliedRule: rule,
    explanation,
  };
}
