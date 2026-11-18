import * as v from "valibot";
import { signal, computed } from "@preact/signals";
import { evaluateCycleState, CycleEvaluation } from "../core/evaluate";
import { DayEntry, ISODate } from "../core/types";
import {
  createKeyEnvelope,
  generateDek,
  unwrapDekFromEnvelope,
  WrappedKeyEnvelope,
} from "../data/crypto";
import { getDb } from "../data/db";
import { dayRepository, DEFAULT_USER_SETTINGS } from "../data/repo";
import {
  ValidatedUserSettings,
  WrappedKeyEnvelopeSchema,
} from "../data/schemas";
import { compareISODate, parseISODate } from "../core/date";
import {
  decryptAllEncryptedSnapshots,
  encryptAllPlaintextSnapshots,
  maybeCreateWeeklySnapshot,
  reEncryptAllSnapshots,
} from "../data/snapshots";

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

// Temporary guard so OS file pickers / share sheets don't trigger background auto-lock
let externalDialogDeadline = 0;

export function suspendAutoLockForExternalPicker(durationMs = 120_000): void {
  externalDialogDeadline = Date.now() + durationMs;
}

export function resumeAutoLockAfterExternalPicker(delayMs = 1500): void {
  if (typeof window === "undefined") {
    externalDialogDeadline = 0;
    return;
  }
  window.setTimeout(() => {
    externalDialogDeadline = 0;
  }, delayMs);
}

export function isAutoLockSuspended(): boolean {
  return Date.now() < externalDialogDeadline;
}

export function lockApp(): void {
  dayRepository.clearActiveDek();
  isLockedSignal.value = true;
  if (
    settingsSignal.value.lockEnabled &&
    settingsSignal.value.lockEnvelopeJson
  ) {
    entriesSignal.value = [];
  }
}

export function unlockApp(): void {
  isLockedSignal.value = false;
}

// Persistent Brute-Force Lock Throttle
const LOCK_THROTTLE_META_KEY = "lock_throttle";

export interface LockThrottleState {
  readonly failedAttempts: number;
  readonly lockUntil: number; // Epoch ms
}

export async function loadLockThrottleState(): Promise<LockThrottleState> {
  try {
    const db = await getDb();
    const raw = await db.get("meta", LOCK_THROTTLE_META_KEY);
    if (
      raw &&
      typeof raw === "object" &&
      typeof (raw as LockThrottleState).failedAttempts === "number" &&
      typeof (raw as LockThrottleState).lockUntil === "number"
    ) {
      return raw as LockThrottleState;
    }
  } catch {
    // Ignore read error
  }
  return { failedAttempts: 0, lockUntil: 0 };
}

export async function saveLockThrottleState(
  state: LockThrottleState,
): Promise<void> {
  try {
    const db = await getDb();
    await db.put("meta", state, LOCK_THROTTLE_META_KEY);
  } catch {
    // Ignore write error
  }
}

export async function resetLockThrottleState(): Promise<void> {
  await saveLockThrottleState({ failedAttempts: 0, lockUntil: 0 });
}

function parseEnvelopeJson(envelopeJson: string): WrappedKeyEnvelope {
  const parsed = JSON.parse(envelopeJson) as unknown;
  return v.parse(WrappedKeyEnvelopeSchema, parsed);
}

// Reactive Computed Evaluation
export const evaluationSignal = computed<CycleEvaluation>(() => {
  const entries = entriesSignal.value;
  const today = selectedDateSignal.value;
  const settings = settingsSignal.value;

  return evaluateCycleState(entries, today, {
    fallbackLength: settings.defaultCycleLength,
    trackingMode: settings.trackingMode,
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
 * Reloads all days and settings from IndexedDB into memory signals.
 */
export async function reloadAppState(): Promise<void> {
  const [days, settings] = await Promise.all([
    dayRepository.getAllDays(),
    dayRepository.getSettings(),
  ]);

  days.sort((a, b) => compareISODate(a.date, b.date));
  entriesSignal.value = days;
  settingsSignal.value = settings;
}

export async function initializeAppState(): Promise<void> {
  if (isInitializedSignal.value) return;

  try {
    const settings = await dayRepository.getSettings();
    settingsSignal.value = settings;

    const hasLock = Boolean(settings.lockEnabled && settings.lockEnvelopeJson);

    if (hasLock) {
      // Keep health records encrypted on disk and memory empty until passphrase unlock
      dayRepository.clearActiveDek();
      entriesSignal.value = [];
      isLockedSignal.value = true;
      isInitializedSignal.value = true;
      dbErrorSignal.value = null;
      return;
    }

    isLockedSignal.value = false;
    const days = await dayRepository.getAllDays();
    days.sort((a, b) => compareISODate(a.date, b.date));
    entriesSignal.value = days;
    isInitializedSignal.value = true;
    dbErrorSignal.value = null;

    maybeCreateWeeklySnapshot(days, settings).catch(() => {});
  } catch (err) {
    dbErrorSignal.value = `Veritabanı başlatılamadı: ${(err as Error).message}`;
    isInitializedSignal.value = true;
  }
}

/**
 * Unlocks the encrypted vault using the user's passphrase,
 * automatically encrypts any legacy plaintext records/snapshots, and loads data.
 */
export async function unlockVaultWithPassphrase(
  passphrase: string,
): Promise<void> {
  const settings = await dayRepository.getSettings();
  settingsSignal.value = settings;

  if (!settings.lockEnabled || !settings.lockEnvelopeJson) {
    throw new Error("Kasa kilidi yapılandırılmamış veya anahtar zarfı eksik.");
  }

  const envelope = parseEnvelopeJson(settings.lockEnvelopeJson);
  const dek = await unwrapDekFromEnvelope(passphrase, envelope);
  dayRepository.setActiveDek(dek);

  // Auto-migrate any legacy plaintext days and snapshots on unlock
  await dayRepository.encryptAllPlaintextDays(dek);
  await encryptAllPlaintextSnapshots(dek);

  await reloadAppState();
  await resetLockThrottleState();
  isLockedSignal.value = false;
  dbErrorSignal.value = null;

  maybeCreateWeeklySnapshot(entriesSignal.value, settingsSignal.value).catch(
    () => {},
  );
}

/**
 * Enables vault encryption: creates key envelope, encrypts all existing records
 * and snapshots in IndexedDB, and persists lock settings.
 */
export async function enableVaultLock(passphrase: string): Promise<void> {
  if (passphrase.length < 4 || !passphrase.trim()) {
    throw new Error("Parola veya PIN en az 4 karakter olmalıdır.");
  }

  const dek = await generateDek();
  const { envelope, rawDek } = await createKeyEnvelope(passphrase, dek);

  await dayRepository.encryptAllPlaintextDays(rawDek);
  await encryptAllPlaintextSnapshots(rawDek);
  dayRepository.setActiveDek(rawDek);

  await persistSettings({
    ...settingsSignal.value,
    lockEnabled: true,
    lockEnvelopeJson: JSON.stringify(envelope),
    lockAutoMinutes: settingsSignal.value.lockAutoMinutes ?? 3,
  });

  await resetLockThrottleState();
  isLockedSignal.value = false;
}

/**
 * Verifies the passphrase, decrypts all stored days & snapshots back to plaintext,
 * and disables the vault lock.
 */
export async function disableVaultLock(passphrase: string): Promise<void> {
  const settings = await dayRepository.getSettings();
  if (settings.lockEnvelopeJson) {
    const envelope = parseEnvelopeJson(settings.lockEnvelopeJson);
    const dek = await unwrapDekFromEnvelope(passphrase, envelope);
    await dayRepository.decryptAllEncryptedDays(dek);
    await decryptAllEncryptedSnapshots(dek);
  }

  dayRepository.clearActiveDek();

  const { lockEnvelopeJson: _lockEnvelopeJson, ...rest } = settings;
  await persistSettings({
    ...rest,
    lockEnabled: false,
  });

  await resetLockThrottleState();
  isLockedSignal.value = false;
}

/**
 * Changes the vault passphrase and rotates the underlying DEK atomically.
 */
export async function changeVaultPassphrase(
  oldPassphrase: string,
  newPassphrase: string,
): Promise<void> {
  if (newPassphrase.length < 4 || !newPassphrase.trim()) {
    throw new Error("Yeni parola veya PIN en az 4 karakter olmalıdır.");
  }

  const settings = await dayRepository.getSettings();
  if (!settings.lockEnabled || !settings.lockEnvelopeJson) {
    throw new Error("Kasa kilidi aktif değil.");
  }

  const oldEnvelope = parseEnvelopeJson(settings.lockEnvelopeJson);
  const oldDek = await unwrapDekFromEnvelope(oldPassphrase, oldEnvelope);

  const freshDek = await generateDek();
  const { envelope: newEnvelope, rawDek: newDek } = await createKeyEnvelope(
    newPassphrase,
    freshDek,
  );

  await dayRepository.reEncryptAllDays(oldDek, newDek);
  await reEncryptAllSnapshots(oldDek, newDek);
  dayRepository.setActiveDek(newDek);

  await persistSettings({
    ...settings,
    lockEnvelopeJson: JSON.stringify(newEnvelope),
  });
}

/**
 * Permanently wipes all stored days, settings, snapshots, and vault keys.
 */
export async function wipeAllAppData(): Promise<void> {
  await dayRepository.clearAllData();
  entriesSignal.value = [];
  settingsSignal.value = DEFAULT_USER_SETTINGS;
  isLockedSignal.value = false;
  dbErrorSignal.value = null;
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
  try {
    await dayRepository.saveSettings(settings);
    dbErrorSignal.value = null;
    settingsSignal.value = settings;
  } catch (err) {
    dbErrorSignal.value = `Ayarlar diske yazılamadı: ${(err as Error).message}`;
    throw err;
  }
}
