import { DayIndex, ISODate } from "./types";

// Regular expression for validating YYYY-MM-DD format
const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/**
 * Checks if a given year is a Gregorian leap year.
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Gets days in a specific month of a specific year.
 */
export function getDaysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }
  return DAYS_IN_MONTH[month - 1] ?? 31;
}

/**
 * Validates and brands a string as an ISODate ('YYYY-MM-DD').
 * Throws an Error if format or calendar day is invalid.
 */
export function parseISODate(str: string): ISODate {
  const match = ISO_DATE_REGEX.exec(str);
  if (!match) {
    throw new Error(`Invalid ISO date format: "${str}". Expected YYYY-MM-DD.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month} in date "${str}".`);
  }

  const maxDays = getDaysInMonth(year, month);
  if (day < 1 || day > maxDays) {
    throw new Error(
      `Invalid day: ${day} for month ${month} in year ${year} in date "${str}".`,
    );
  }

  return str as ISODate;
}

/**
 * Converts YYYY-MM-DD to DayIndex (days since 1970-01-01 epoch)
 * purely mathematically using Rata Die / civil calendar algorithm.
 * ZERO timezone or DST dependencies.
 */
export function isoToDayIndex(iso: ISODate): DayIndex {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));

  // Shift year so year starts in March to make leap day the last day of the year
  const mAdj = m <= 2 ? m + 9 : m - 3;
  const yAdj = m <= 2 ? y - 1 : y;

  const era = Math.floor(yAdj / 400);
  const yoe = yAdj - era * 400; // [0, 399]
  const doy = Math.floor((153 * mAdj + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  const daysSinceEpoch = era * 146097 + doe - 719468;

  return daysSinceEpoch as DayIndex;
}

/**
 * Converts DayIndex (days since 1970-01-01) back to ISODate ('YYYY-MM-DD').
 * Purely mathematical, civil calendar algorithm.
 */
export function dayIndexToISO(idx: DayIndex): ISODate {
  const z = idx + 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097; // [0, 146096]
  const yoe = Math.floor(
    (doe -
      Math.floor(doe / 1460) +
      Math.floor(doe / 36524) -
      Math.floor(doe / 146096)) /
      365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const finalY = m <= 2 ? y + 1 : y;

  const yStr = String(finalY).padStart(4, "0");
  const mStr = String(m).padStart(2, "0");
  const dStr = String(d).padStart(2, "0");

  return `${yStr}-${mStr}-${dStr}` as ISODate;
}

/**
 * Adds an integer number of days to an ISODate.
 */
export function addDays(iso: ISODate, days: number): ISODate {
  const currentIdx = isoToDayIndex(iso);
  const targetIdx = (currentIdx + days) as DayIndex;
  return dayIndexToISO(targetIdx);
}

/**
 * Calculates (to - from) in calendar days.
 */
export function daysBetween(from: ISODate, to: ISODate): number {
  return isoToDayIndex(to) - isoToDayIndex(from);
}

/**
 * Compares two ISODates chronologically.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareISODate(a: ISODate, b: ISODate): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
