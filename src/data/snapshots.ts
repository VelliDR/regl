import { DayEntry } from "../core/types";
import { exportToJson, importBackup, ImportSummary, validateBackupString } from "./backup";
import { getDb } from "./db";
import { ValidatedUserSettings } from "./schemas";

export interface LocalSnapshot {
  readonly id: string;
  readonly createdAt: number;
  readonly formattedDate: string;
  readonly entryCount: number;
  readonly payloadJson: string;
}

const SNAPSHOTS_META_KEY = "local_snapshots";
const MAX_SNAPSHOTS = 4; // Retain 4 rolling weekly snapshots
const WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Loads all saved local snapshots from IndexedDB meta store.
 */
export async function loadSnapshots(): Promise<LocalSnapshot[]> {
  try {
    const db = await getDb();
    const raw = await db.get("meta", SNAPSHOTS_META_KEY);
    if (!raw || !Array.isArray(raw)) {
      return [];
    }
    return raw as LocalSnapshot[];
  } catch {
    return [];
  }
}

/**
 * Persists an array of snapshots to the IndexedDB meta store.
 */
export async function saveSnapshots(
  snapshots: readonly LocalSnapshot[],
): Promise<void> {
  const db = await getDb();
  await db.put("meta", snapshots.slice(0, MAX_SNAPSHOTS), SNAPSHOTS_META_KEY);
}

let snapshotCounter = 0;

/**
 * Creates an immediate local snapshot of existing records and settings.
 */
export async function createSnapshotNow(
  days: readonly DayEntry[],
  settings: ValidatedUserSettings,
): Promise<LocalSnapshot> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const formattedDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const snapshot: LocalSnapshot = {
    id: `snapshot-${now.getTime()}-${++snapshotCounter}`,
    createdAt: now.getTime(),
    formattedDate,
    entryCount: days.length,
    payloadJson: exportToJson(days, settings),
  };

  const existing = await loadSnapshots();
  const updated = [snapshot, ...existing].slice(0, MAX_SNAPSHOTS);
  await saveSnapshots(updated);

  return snapshot;
}

/**
 * Automatically takes a weekly rolling snapshot if >= 7 days have passed
 * since the last recorded snapshot and entries exist.
 */
export async function maybeCreateWeeklySnapshot(
  days: readonly DayEntry[],
  settings: ValidatedUserSettings,
): Promise<LocalSnapshot | null> {
  if (days.length === 0) {
    return null;
  }

  const existing = await loadSnapshots();
  const newest = existing[0];

  if (newest && Date.now() - newest.createdAt < WEEK_MS) {
    return null; // A snapshot was taken less than 7 days ago
  }

  return createSnapshotNow(days, settings);
}

/**
 * Restores data from a stored local snapshot.
 */
export async function restoreSnapshot(
  snapshotId: string,
  mode: "merge" | "replace",
): Promise<ImportSummary> {
  const snapshots = await loadSnapshots();
  const target = snapshots.find((s) => s.id === snapshotId);
  if (!target) {
    throw new Error(`Yedek snapshot bulunamadı: ${snapshotId}`);
  }

  const payload = validateBackupString(target.payloadJson);
  return importBackup(payload, mode);
}

/**
 * Deletes a single snapshot by ID.
 */
export async function deleteSnapshot(snapshotId: string): Promise<void> {
  const existing = await loadSnapshots();
  const updated = existing.filter((s) => s.id !== snapshotId);
  await saveSnapshots(updated);
}
