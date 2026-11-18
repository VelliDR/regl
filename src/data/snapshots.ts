import { DayEntry } from "../core/types";
import {
  exportToJson,
  importBackup,
  ImportSummary,
  validateBackupString,
} from "./backup";
import { decryptWithDek, encryptWithDek, EncryptedPayload } from "./crypto";
import { getDb } from "./db";
import { dayRepository } from "./repo";
import { ValidatedUserSettings } from "./schemas";

export interface LocalSnapshot {
  readonly id: string;
  readonly createdAt: number;
  readonly formattedDate: string;
  readonly entryCount: number;
  readonly payloadJson?: string | undefined;
  readonly encryptedPayload?: EncryptedPayload | undefined;
}

const SNAPSHOTS_META_KEY = "local_snapshots";
const MAX_SNAPSHOTS = 4; // Retain 4 rolling weekly snapshots
const WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let snapshotQueue: Promise<unknown> = Promise.resolve();

function withSnapshotLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = snapshotQueue.then(fn, fn);
  snapshotQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

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
 * Encrypts the snapshot payload when the vault DEK is active.
 */
export async function createSnapshotNow(
  days: readonly DayEntry[],
  settings: ValidatedUserSettings,
): Promise<LocalSnapshot> {
  return withSnapshotLock(async () => {
    const dek = dayRepository.getActiveDek();
    const isLockedConfig = Boolean(
      settings.lockEnabled && settings.lockEnvelopeJson,
    );
    if (isLockedConfig && !dek) {
      throw new Error("Kasa kilitli iken yerel snapshot oluşturulamaz.");
    }

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const formattedDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const payloadJson = exportToJson(days, settings);

    const snapshot: LocalSnapshot = dek
      ? {
          id: `snapshot-${now.getTime()}-${++snapshotCounter}`,
          createdAt: now.getTime(),
          formattedDate,
          entryCount: days.length,
          encryptedPayload: await encryptWithDek(payloadJson, dek),
        }
      : {
          id: `snapshot-${now.getTime()}-${++snapshotCounter}`,
          createdAt: now.getTime(),
          formattedDate,
          entryCount: days.length,
          payloadJson,
        };

    const existing = await loadSnapshots();
    const updated = [snapshot, ...existing].slice(0, MAX_SNAPSHOTS);
    await saveSnapshots(updated);

    return snapshot;
  });
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

  if (
    settings.lockEnabled &&
    settings.lockEnvelopeJson &&
    !dayRepository.getActiveDek()
  ) {
    return null;
  }

  const existing = await loadSnapshots();
  if (existing.length > 0) {
    const newestCreatedAt = Math.max(...existing.map((s) => s.createdAt));
    if (Date.now() - newestCreatedAt < WEEK_MS) {
      return null; // A snapshot was taken less than 7 days ago
    }
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

  let jsonStr: string;
  if (target.encryptedPayload) {
    const dek = dayRepository.getActiveDek();
    if (!dek) {
      throw new Error("Kasa kilitli: Şifreli snapshot çözülemedi.");
    }
    jsonStr = await decryptWithDek(target.encryptedPayload, dek);
  } else if (target.payloadJson) {
    jsonStr = target.payloadJson;
  } else {
    throw new Error("Snapshot içeriği eksik veya bozuk.");
  }

  const payload = validateBackupString(jsonStr);
  return importBackup(payload, mode);
}

/**
 * Deletes a single snapshot by ID.
 */
export async function deleteSnapshot(snapshotId: string): Promise<void> {
  return withSnapshotLock(async () => {
    const existing = await loadSnapshots();
    const updated = existing.filter((s) => s.id !== snapshotId);
    await saveSnapshots(updated);
  });
}

/**
 * Encrypts all plaintext snapshots using the active DEK.
 */
export async function encryptAllPlaintextSnapshots(
  dek: CryptoKey,
): Promise<number> {
  return withSnapshotLock(async () => {
    const existing = await loadSnapshots();
    let changed = 0;

    const updated = await Promise.all(
      existing.map(async (snap): Promise<LocalSnapshot> => {
        if (snap.encryptedPayload || !snap.payloadJson) {
          return snap;
        }
        changed++;
        const encryptedPayload = await encryptWithDek(snap.payloadJson, dek);
        return {
          id: snap.id,
          createdAt: snap.createdAt,
          formattedDate: snap.formattedDate,
          entryCount: snap.entryCount,
          encryptedPayload,
        };
      }),
    );

    if (changed > 0) {
      await saveSnapshots(updated);
    }
    return changed;
  });
}

/**
 * Decrypts all encrypted snapshots back to plaintext (when lock is disabled).
 */
export async function decryptAllEncryptedSnapshots(
  dek: CryptoKey,
): Promise<number> {
  return withSnapshotLock(async () => {
    const existing = await loadSnapshots();
    let changed = 0;

    const updated = await Promise.all(
      existing.map(async (snap): Promise<LocalSnapshot> => {
        if (!snap.encryptedPayload) {
          return snap;
        }
        changed++;
        const payloadJson = await decryptWithDek(snap.encryptedPayload, dek);
        return {
          id: snap.id,
          createdAt: snap.createdAt,
          formattedDate: snap.formattedDate,
          entryCount: snap.entryCount,
          payloadJson,
        };
      }),
    );

    if (changed > 0) {
      await saveSnapshots(updated);
    }
    return changed;
  });
}

/**
 * Re-encrypts all snapshots with a new DEK (during passphrase rotation).
 */
export async function reEncryptAllSnapshots(
  oldDek: CryptoKey,
  newDek: CryptoKey,
): Promise<number> {
  return withSnapshotLock(async () => {
    const existing = await loadSnapshots();
    if (existing.length === 0) return 0;

    let count = 0;
    const updated = await Promise.all(
      existing.map(async (snap): Promise<LocalSnapshot> => {
        const plain = snap.encryptedPayload
          ? await decryptWithDek(snap.encryptedPayload, oldDek)
          : snap.payloadJson;
        if (!plain) return snap;
        count++;
        const encryptedPayload = await encryptWithDek(plain, newDek);
        return {
          id: snap.id,
          createdAt: snap.createdAt,
          formattedDate: snap.formattedDate,
          entryCount: snap.entryCount,
          encryptedPayload,
        };
      }),
    );

    if (count > 0) {
      await saveSnapshots(updated);
    }
    return count;
  });
}
