import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  parseISODate,
  isoToDayIndex,
  dayIndexToISO,
  addDays,
  daysBetween,
  compareISODate,
  isLeapYear,
} from '../../src/core/date';
import { DayIndex, ISODate } from '../../src/core/types';

describe('Tarih Aritmetiği (date.ts)', () => {
  describe('Artık Yıl Hesaplaması', () => {
    it('Standart artık yılları ve yüzyıl istisnalarını doğru tespit etmelidir', () => {
      expect(isLeapYear(2024)).toBe(true);
      expect(isLeapYear(2000)).toBe(true); // 400 ile bölünür -> artık yıl
      expect(isLeapYear(1900)).toBe(false); // 100 ile bölünür, 400 değil -> artık yıl DEĞİL
      expect(isLeapYear(2100)).toBe(false);
      expect(isLeapYear(2023)).toBe(false);
    });
  });

  describe('parseISODate Doğrulaması', () => {
    it('Geçerli formatları kabul etmelidir', () => {
      expect(parseISODate('2026-10-13')).toBe('2026-10-13');
      expect(parseISODate('2024-02-29')).toBe('2024-02-29');
    });

    it('Hatalı format ve geçersiz günleri reddetmelidir', () => {
      expect(() => parseISODate('2026-13-01')).toThrow();
      expect(() => parseISODate('2023-02-29')).toThrow(); // 2023 artık yıl değil
      expect(() => parseISODate('2026-04-31')).toThrow(); // Nisan 30 çeker
      expect(() => parseISODate('invalid-date')).toThrow();
    });
  });

  describe('isoToDayIndex ve dayIndexToISO Çift Yönlü Doğruluğu', () => {
    it('1970-01-01 indeksi 0 olmalıdır', () => {
      const epoch = parseISODate('1970-01-01');
      expect(isoToDayIndex(epoch)).toBe(0);
      expect(dayIndexToISO(0 as DayIndex)).toBe('1970-01-01');
    });

    it('Önemli dönüm noktası tarihlerinde tutarlı olmalıdır', () => {
      const dates = [
        '1970-01-01',
        '1999-12-31',
        '2000-01-01',
        '2000-02-29',
        '2024-02-29',
        '2026-10-13',
        '2099-12-31',
      ];

      for (const d of dates) {
        const iso = parseISODate(d);
        const idx = isoToDayIndex(iso);
        expect(dayIndexToISO(idx)).toBe(iso);
      }
    });

    it('Property test: 1970-2099 arasındaki tüm rastgele tarihler çift yönlü dönüştürülebilmelidir', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1970, max: 2099 }),
          fc.integer({ min: 1, max: 12 }),
          fc.integer({ min: 1, max: 31 }),
          (year, month, day) => {
            const mStr = String(month).padStart(2, '0');
            const dStr = String(day).padStart(2, '0');
            const str = `${year}-${mStr}-${dStr}`;

            let iso: ISODate;
            try {
              iso = parseISODate(str);
            } catch {
              // Geçersiz takvim günü (ör. 31 Şubat), test kapsamında atla
              return true;
            }

            const idx = isoToDayIndex(iso);
            const reconstructed = dayIndexToISO(idx);
            return reconstructed === iso;
          }
        )
      );
    });
  });

  describe('addDays ve daysBetween Aritmetiği', () => {
    it('Gün ekleme ve fark hesaplama tutarlı olmalıdır', () => {
      const start = parseISODate('2026-10-13');
      const nextDay = addDays(start, 1);
      expect(nextDay).toBe('2026-10-14');
      expect(daysBetween(start, nextDay)).toBe(1);

      const pastDay = addDays(start, -10);
      expect(pastDay).toBe('2026-10-03');
      expect(daysBetween(start, pastDay)).toBe(-10);
    });

    it('Ay ve yıl sınırlarında gün ekleme hatasız çalışmalıdır', () => {
      const endOfFebLeap = parseISODate('2024-02-28');
      expect(addDays(endOfFebLeap, 1)).toBe('2024-02-29');
      expect(addDays(endOfFebLeap, 2)).toBe('2024-03-01');

      const endOfYear = parseISODate('2025-12-31');
      expect(addDays(endOfYear, 1)).toBe('2026-01-01');
    });

    it('compareISODate tarihleri doğru sıralamalıdır', () => {
      const d1 = parseISODate('2026-01-01');
      const d2 = parseISODate('2026-05-15');
      const d3 = parseISODate('2026-05-15');

      expect(compareISODate(d1, d2)).toBeLessThan(0);
      expect(compareISODate(d2, d1)).toBeGreaterThan(0);
      expect(compareISODate(d2, d3)).toBe(0);
    });
  });
});
