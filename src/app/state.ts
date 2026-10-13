import { signal, computed } from "@preact/signals";
import { evaluateCycleState, CycleEvaluation } from "../core/evaluate";
import { DayEntry, ISODate } from "../core/types";
import { dayRepository, DEFAULT_USER_SETTINGS } from "../data/repo";
import { ValidatedUserSettings } from "../data/schemas";
import { compareISODate, parseISODate } from "../core/date";

/**
 * Gets today's date formatted as ISODate using local time.
 */
export function getLocalTodayISO(): ISODate {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return parseISODate(`${year}-${month}-${day}`);
}

// Global Signals
export const isInitializedSignal = signal<boolean>(false);
export const isLockedSignal = signal<boolean>(true);
export const entriesSignal = signal<DayEntry[]>([]);
export const settingsSignal = signal<ValidatedUserSettings>(
  DEFAULT_USER_SETTINGS,
);
export const selectedDateSignal = signal<ISODate>(getLocalTodayISO());
export const dbErrorSignal = signal<string | null>(null);

export function lockApp(): void {
  isLockedSignal.value = true;
}

export function unlockApp(): void {
  isLockedSignal.value = false;
}

// Reactive Computed Evaluation
export const evaluationSignal = computed<CycleEvaluation>(() => {
  const entries = entriesSignal.value;
  const today = selectedDateSignal.value;
  const settings = settingsSignal.value;

  return evaluateCycleState(entries, today, {
    fallbackLength: settings.defaultCycleLength,
  });
});

// Map of entries for fast day-by-day calendar queries
export const entriesMapSignal = computed<Map<ISODate, DayEntry>>(() => {
  const map = new Map<ISODate, DayEntry>();
  for (const entry of entriesSignal.value) {
    map.set(entry.date, entry);
  }
  return map;
});

/**
 * Loads all days and settings from IndexedDB into memory signals.
 */
export async function initializeAppState(): Promise<void> {
  if (isInitializedSignal.value) return;

  try {
    const [days, settings] = await Promise.all([
      dayRepository.getAllDays(),
      dayRepository.getSettings(),
    ]);

    days.sort((a, b) => compareISODate(a.date, b.date));
    entriesSignal.value = days;
    settingsSignal.value = settings;
    isInitializedSignal.value = true;
    dbErrorSignal.value = null;
  } catch (err) {
    dbErrorSignal.value = `Veritabanı başlatılamadı: ${(err as Error).message}`;
    isInitializedSignal.value = true;
  }
}

/**
 * Saves a day entry and updates in-memory signals reactively.
 * Ensures the in-memory array remains strictly sorted chronologically.
 */
export async function persistDayEntry(entry: DayEntry): Promise<void> {
  try {
    await dayRepository.saveDay(entry);
    dbErrorSignal.value = null;

    const current = [...entriesSignal.value];
    const idx = current.findIndex((d) => d.date === entry.date);
    if (idx >= 0) {
      current[idx] = entry;
    } else {
      current.push(entry);
    }

    current.sort((a, b) => compareISODate(a.date, b.date));
    entriesSignal.value = current;
  } catch (err) {
    dbErrorSignal.value = `Kayıt diske yazılamadı: ${(err as Error).message}`;
  }
}

/**
 * Deletes a day entry and updates in-memory signals reactively.
 */
export async function removeDayEntry(date: ISODate): Promise<void> {
  try {
    await dayRepository.deleteDay(date);
    dbErrorSignal.value = null;
    entriesSignal.value = entriesSignal.value.filter((d) => d.date !== date);
  } catch (err) {
    dbErrorSignal.value = `Kayıt silinemedi: ${(err as Error).message}`;
  }
}

/**
 * Updates settings both in IndexedDB and in-memory.
 */
export async function persistSettings(
  settings: ValidatedUserSettings,
): Promise<void> {
  await dayRepository.saveSettings(settings);
  settingsSignal.value = settings;
}
