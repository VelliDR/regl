import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { addDays, parseISODate } from '../../src/core/date';
import { Cycle } from '../../src/core/cycles';
import { predictNextPeriod } from '../../src/core/predict/ewma';
import { calculateKnausOgino } from '../../src/core/predict/knaus';
import { evaluateCycleState } from '../../src/core/evaluate';
import { DayEntry } from '../../src/core/types';

function createMockCycle(id: number, start: string, length?: number, isOutlier = false): Cycle {
  const startDate = parseISODate(start);
  return {
    id,
    startDate,
    ...(length ? { length, endDate: addDays(startDate, length - 1) } : {}),
    isOutlier,
  };
}

describe('Tahmin ve Değerlendirme Algoritmaları (predict & evaluate)', () => {
  const activeStart = parseISODate('2026-05-01');

  describe('Kural [P1]: 0 Döngü Verisi', () => {
    it('Varsayılan 28 gün ve +/- 4 gün belirsizlik bandı üretmelidir', () => {
      const pred = predictNextPeriod(activeStart, []);
      expect(pred.ruleId).toBe('P1');
      expect(pred.lowConfidence).toBe(true);
      expect(pred.estimatedCycleLength).toBe(28);
      expect(pred.uncertaintyBandDays).toBe(4);
      expect(pred.nextPeriodStartDate).toBe('2026-05-29');
      expect(pred.windowStartDate).toBe('2026-05-25');
      expect(pred.windowEndDate).toBe('2026-06-02');
      expect(pred.regularity).toBe('unknown');
    });

    it('Kullanıcı onboarding değeri verildiğinde onu kullanmalıdır', () => {
      const pred = predictNextPeriod(activeStart, [], { fallbackLength: 31 });
      expect(pred.estimatedCycleLength).toBe(31);
      expect(pred.nextPeriodStartDate).toBe('2026-06-01');
    });
  });

  describe('Kural [P2]: 1-2 Döngü Verisi', () => {
    it('1 döngüde doğrudan o döngünün boyunu ortalama olarak almalıdır', () => {
      const cycles = [createMockCycle(1, '2026-04-03', 27)];
      const pred = predictNextPeriod(activeStart, cycles);

      expect(pred.ruleId).toBe('P2');
      expect(pred.lowConfidence).toBe(false);
      expect(pred.estimatedCycleLength).toBe(27);
      expect(pred.uncertaintyBandDays).toBe(3);
      expect(pred.nextPeriodStartDate).toBe('2026-05-28');
    });

    it('2 döngüde basit aritmetik ortalamayı hesaplamalıdır', () => {
      const cycles = [
        createMockCycle(1, '2026-03-05', 28),
        createMockCycle(2, '2026-04-02', 30),
      ];
      const pred = predictNextPeriod(activeStart, cycles);

      expect(pred.ruleId).toBe('P2');
      expect(pred.estimatedCycleLength).toBe(29);
      expect(pred.nextPeriodStartDate).toBe('2026-05-30');
    });
  });

  describe('Kural [P3] & [P5]: EWMA Modeli ve Düzenlilik', () => {
    it('3 ve üzeri döngüde EWMA ve varyans hesaplamalıdır', () => {
      const cycles = [
        createMockCycle(1, '2026-01-01', 28),
        createMockCycle(2, '2026-01-29', 28),
        createMockCycle(3, '2026-02-26', 28),
        createMockCycle(4, '2026-03-26', 28),
      ];
      const pred = predictNextPeriod(activeStart, cycles);

      expect(pred.ruleId).toBe('P3');
      expect(pred.estimatedCycleLength).toBe(28);
      expect(pred.regularity).toBe('regular');
      expect(pred.uncertaintyBandDays).toBeLessThanOrEqual(2);
    });

    it('Yüksek dalgalanmalı döngülerde irregular olarak etiketlemelidir', () => {
      const cycles = [
        createMockCycle(1, '2026-01-01', 23),
        createMockCycle(2, '2026-01-24', 35),
        createMockCycle(3, '2026-02-28', 24),
        createMockCycle(4, '2026-03-24', 36),
      ];
      const pred = predictNextPeriod(activeStart, cycles);

      expect(pred.ruleId).toBe('P3');
      expect(pred.regularity).toBe('irregular');
      expect(pred.standardDeviation).toBeGreaterThanOrEqual(1.5);
    });
  });

  describe('Kural [P4]: Aykırı Değerlerin Filtrelenmesi', () => {
    it('Aykırı döngüleri EWMA hesabına katmamalıdır', () => {
      const cycles = [
        createMockCycle(1, '2026-01-01', 28),
        createMockCycle(2, '2026-01-29', 28),
        createMockCycle(3, '2026-02-26', 75, true), // Aykırı döngü
        createMockCycle(4, '2026-05-12', 28),
      ];
      const pred = predictNextPeriod(activeStart, cycles);

      expect(pred.sampleCount).toBe(3);
      expect(pred.outlierCount).toBe(1);
      expect(pred.estimatedCycleLength).toBe(28);
    });
  });

  describe('Kural [P6]: Luteal Faz ile Tahmini Ovülasyon', () => {
    it('Luteal faz biliniyorsa tahmini ovülasyonu geriye doğru hesaplamalıdır', () => {
      const cycles = [createMockCycle(1, '2026-04-03', 28)];
      const pred = predictNextPeriod(activeStart, cycles, { personalLutealPhaseLength: 14 });

      expect(pred.nextPeriodStartDate).toBe('2026-05-29');
      // 2026-05-29 - 14 gün = 2026-05-15
      expect(pred.estimatedOvulationDate).toBe('2026-05-15');
    });
  });

  describe('Kural [P7]: Knaus-Ogino Takvim Modeli', () => {
    it('6 döngüden az veri varsa eligible: false dönmelidir', () => {
      const cycles = [
        createMockCycle(1, '2026-01-01', 28),
        createMockCycle(2, '2026-01-29', 29),
      ];
      const result = calculateKnausOgino(activeStart, cycles);

      expect(result.eligible).toBe(false);
      expect(result.isSafeForContraception).toBe(false);
    });

    it('6 veya daha fazla döngüde doğru takvim aralığı üretmelidir', () => {
      const cycles = [
        createMockCycle(1, '2026-01-01', 26),
        createMockCycle(2, '2026-01-27', 28),
        createMockCycle(3, '2026-02-24', 30),
        createMockCycle(4, '2026-03-26', 27),
        createMockCycle(5, '2026-04-22', 29),
        createMockCycle(6, '2026-05-21', 31),
      ];
      // min = 26, max = 31
      // start = 26 - 18 = 8. gün
      // end = 31 - 11 = 20. gün
      const result = calculateKnausOgino(activeStart, cycles);

      expect(result.eligible).toBe(true);
      expect(result.shortestCycle).toBe(26);
      expect(result.longestCycle).toBe(31);
      expect(result.fertileWindowStartDay).toBe(8);
      expect(result.fertileWindowEndDay).toBe(20);
      expect(result.fertileWindowStartDate).toBe('2026-05-08');
      expect(result.fertileWindowEndDate).toBe('2026-05-20');
      expect(result.isSafeForContraception).toBe(false);
    });
  });

  describe('evaluateCycleState Birleşik Değerlendirmesi', () => {
    it('Ham gün girişlerinden tam döngü durumu üretmelidir', () => {
      const entries: DayEntry[] = [
        { date: parseISODate('2026-01-01'), bleeding: 'heavy', updatedAt: 1 },
        { date: parseISODate('2026-01-02'), bleeding: 'medium', updatedAt: 1 },
        { date: parseISODate('2026-01-29'), bleeding: 'heavy', updatedAt: 1 }, // Döngü 1: 28 gün
        { date: parseISODate('2026-01-30'), bleeding: 'medium', updatedAt: 1 },
      ];

      // Hedef tarih: Döngü 2'nin 14. günü (2026-02-11)
      const today = parseISODate('2026-02-11');
      const evalState = evaluateCycleState(entries, today);

      expect(evalState.hasData).toBe(true);
      expect(evalState.activeCycle?.startDate).toBe('2026-01-29');
      expect(evalState.currentCycleDay).toBe(14); // 29 Ocak'tan 11 Şubat'a 13 gün + 1 = 14
      expect(evalState.completedCycles.length).toBe(1);
      expect(evalState.prediction.estimatedCycleLength).toBe(28);
    });
  });

  describe('Property Tests', () => {
    it('EWMA tahmin tarihi daima aktif döngü başlangıcından sonra olmalıdır', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 20, max: 40 }),
          fc.array(fc.integer({ min: 22, max: 36 }), { minLength: 1, maxLength: 20 }),
          (fallback, lengths) => {
            const start = parseISODate('2026-01-01');
            let currentDate = start;
            const cycles: Cycle[] = lengths.map((l, idx) => {
              const c = createMockCycle(idx + 1, currentDate, l);
              currentDate = addDays(currentDate, l);
              return c;
            });

            const pred = predictNextPeriod(currentDate, cycles, { fallbackLength: fallback });
            return pred.nextPeriodStartDate > currentDate;
          }
        )
      );
    });
  });
});
