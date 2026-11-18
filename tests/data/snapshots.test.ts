import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { closeDb, getDb } from "../../src/data/db";
import { generateDek } from "../../src/data/crypto";
import { dayRepository, DEFAULT_USER_SETTINGS } from "../../src/data/repo";
import { parseISODate } from "../../src/core/date";
import { DayEntry } from "../../src/core/types";
import {
  createSnapshotNow,
  decryptAllEncryptedSnapshots,
  deleteSnapshot,
  encryptAllPlaintextSnapshots,
  loadSnapshots,
  maybeCreateWeeklySnapshot,
  restoreSnapshot,
} from "../../src/data/snapshots";

describe("Yerel Güvenlik Snapshots (snapshots.ts)", () => {
  beforeEach(async () => {
    dayRepository.clearActiveDek();
    closeDb();
    const db = await getDb();
    await db.delete("meta", "local_snapshots");
    await dayRepository.clearAllData();
  });

  afterEach(() => {
    dayRepository.clearActiveDek();
    closeDb();
  });

  it("createSnapshotNow başarılı şekilde snapshot oluşturmalı ve IndexedDB'ye yazmalıdır", async () => {
    const days: DayEntry[] = [
      { date: parseISODate("2026-10-01"), bleeding: "heavy", updatedAt: 100 },
      { date: parseISODate("2026-10-02"), bleeding: "medium", updatedAt: 200 },
    ];

    const snap = await createSnapshotNow(days, DEFAULT_USER_SETTINGS);
    expect(snap.id).toMatch(/^snapshot-\d+/);
    expect(snap.entryCount).toBe(2);

    const loaded = await loadSnapshots();
    expect(loaded.length).toBe(1);
    expect(loaded[0]?.id).toBe(snap.id);
    expect(loaded[0]?.entryCount).toBe(2);
  });

  it("maybeCreateWeeklySnapshot boş veri varken snapshot almamalıdır", async () => {
    const result = await maybeCreateWeeklySnapshot([], DEFAULT_USER_SETTINGS);
    expect(result).toBeNull();

    const loaded = await loadSnapshots();
    expect(loaded.length).toBe(0);
  });

  it("maybeCreateWeeklySnapshot 7 günden önce yeni snapshot almamalıdır", async () => {
    const days: DayEntry[] = [
      { date: parseISODate("2026-10-01"), bleeding: "heavy", updatedAt: 100 },
    ];

    const firstSnap = await maybeCreateWeeklySnapshot(days, DEFAULT_USER_SETTINGS);
    expect(firstSnap).not.toBeNull();

    // 2 gün sonra tekrar çağrılsın
    const secondCall = await maybeCreateWeeklySnapshot(days, DEFAULT_USER_SETTINGS);
    expect(secondCall).toBeNull();

    const loaded = await loadSnapshots();
    expect(loaded.length).toBe(1);
  });

  it("Maksimum 4 snapshot saklanmalı ve en eskiler silinmelidir (rolling window)", async () => {
    const days: DayEntry[] = [
      { date: parseISODate("2026-10-01"), bleeding: "heavy", updatedAt: 100 },
    ];

    for (let i = 0; i < 6; i++) {
      await createSnapshotNow(days, DEFAULT_USER_SETTINGS);
    }

    const loaded = await loadSnapshots();
    expect(loaded.length).toBe(4);
  });

  it("restoreSnapshot verileri başarıyla kurtarmalıdır", async () => {
    const originalDays: DayEntry[] = [
      { date: parseISODate("2026-10-01"), bleeding: "heavy", updatedAt: 100 },
      { date: parseISODate("2026-10-02"), bleeding: "medium", updatedAt: 200 },
    ];

    const snap = await createSnapshotNow(originalDays, DEFAULT_USER_SETTINGS);

    // Mevcut veritabanını temizle
    await dayRepository.clearAllDays();
    let currentDays = await dayRepository.getAllDays();
    expect(currentDays.length).toBe(0);

    // Snapshot'tan geri yükle
    const summary = await restoreSnapshot(snap.id, "replace");
    expect(summary.importedCount).toBe(2);

    currentDays = await dayRepository.getAllDays();
    expect(currentDays.length).toBe(2);
  });

  it("deleteSnapshot tek bir snapshot'ı kaldırabilmelidir", async () => {
    const days: DayEntry[] = [
      { date: parseISODate("2026-10-01"), bleeding: "heavy", updatedAt: 100 },
    ];

    const snap1 = await createSnapshotNow(days, DEFAULT_USER_SETTINGS);
    const snap2 = await createSnapshotNow(days, DEFAULT_USER_SETTINGS);

    let loaded = await loadSnapshots();
    expect(loaded.length).toBe(2);

    await deleteSnapshot(snap1.id);
    loaded = await loadSnapshots();
    expect(loaded.length).toBe(1);
    expect(loaded[0]?.id).toBe(snap2.id);
  });

  it("DEK aktifken snapshot şifrelenmeli, düz metin payloadJson saklanmamalı ve geri yüklenebilmelidir", async () => {
    const dek = await generateDek();
    dayRepository.setActiveDek(dek);

    const days: DayEntry[] = [
      {
        date: parseISODate("2026-10-05"),
        bleeding: "heavy",
        note: "Şifreli snapshot testi",
        updatedAt: 500,
      },
    ];

    const snap = await createSnapshotNow(days, DEFAULT_USER_SETTINGS);
    expect(snap.payloadJson).toBeUndefined();
    expect(snap.encryptedPayload).toBeDefined();

    // DEK yokken şifreli snapshot çözülememelidir
    dayRepository.clearActiveDek();
    await expect(restoreSnapshot(snap.id, "replace")).rejects.toThrow(
      /Kasa kilitli/,
    );

    // DEK geri yüklendiğinde snapshot geri yüklenebilmelidir
    dayRepository.setActiveDek(dek);
    await dayRepository.clearAllDays();
    const summary = await restoreSnapshot(snap.id, "replace");
    expect(summary.importedCount).toBe(1);

    const restored = await dayRepository.getAllDays();
    expect(restored[0]?.note).toBe("Şifreli snapshot testi");
  });

  it("encryptAllPlaintextSnapshots ve decryptAllEncryptedSnapshots mevcut snapshot'ları dönüştürmelidir", async () => {
    const days: DayEntry[] = [
      { date: parseISODate("2026-10-08"), bleeding: "light", updatedAt: 100 },
    ];
    await createSnapshotNow(days, DEFAULT_USER_SETTINGS);

    const dek = await generateDek();
    const encCount = await encryptAllPlaintextSnapshots(dek);
    expect(encCount).toBe(1);

    let loaded = await loadSnapshots();
    expect(loaded[0]?.payloadJson).toBeUndefined();
    expect(loaded[0]?.encryptedPayload).toBeDefined();

    const decCount = await decryptAllEncryptedSnapshots(dek);
    expect(decCount).toBe(1);

    loaded = await loadSnapshots();
    expect(loaded[0]?.payloadJson).toBeDefined();
    expect(loaded[0]?.encryptedPayload).toBeUndefined();
  });
});
