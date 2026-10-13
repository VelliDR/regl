import { signal, computed } from '@preact/signals';
import { evaluateCycleState, CycleEvaluation } from '../core/evaluate';
import { DayEntry, ISODate } from '../core/types';
import { dayRepository, DEFAULT_USER_SETTINGS } from '../data/repo';
import { ValidatedUserSettings } from '../data/schemas';
import { parseISODate } from '../core/date';

/**
 * Gets today's date formatted as ISODate using local time.
 */
export function getLocalTodayISO(): ISODate {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return parseISODate(`${year}-${month}-${day}`);
}

// Global Signals
export const isInitializedSignal = signal<boolean>(false);
export const entriesSignal = signal<DayEntry[]>([]);
export const settingsSignal = signal<ValidatedUserSettings>(DEFAULT_USER_SETTINGS);
export const selectedDateSignal = signal<ISODate>(getLocalTodayISO());

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

  const [days, settings] = await Promise.all([
    dayRepository.getAllDays(),
    dayRepository.getSettings(),
  ]);

  entriesSignal.value = days;
  settingsSignal.value = settings;
  isInitializedSignal.value = true;
}

/**
 * Saves a day entry and updates in-memory signals reactively.
 */
export async function persistDayEntry(entry: DayEntry): Promise<void> {
  await dayRepository.saveDay(entry);

  const current = [...entriesSignal.value];
  const idx = current.findIndex((d) => d.date === entry.date);
  if (idx >= 0) {
    current[idx] = entry;
  } else {
    current.push(entry);
  }

  entriesSignal.value = current;
}

/**
 * Deletes a day entry and updates in-memory signals reactively.
 */
export async function removeDayEntry(date: ISODate): Promise<void> {
  await dayRepository.deleteDay(date);
  entriesSignal.value = entriesSignal.value.filter((d) => d.date !== date);
}

/**
 * Updates settings both in IndexedDB and in-memory.
 */
export async function persistSettings(settings: ValidatedUserSettings): Promise<void> {
  await dayRepository.saveSettings(settings);
  settingsSignal.value = settings;
}
