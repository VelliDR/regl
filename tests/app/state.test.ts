import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { closeDb, getDb, isEncryptedDayRecord } from "../../src/data/db";
import {
  changeVaultPassphrase,
  disableVaultLock,
  enableVaultLock,
  entriesSignal,
  initializeAppState,
  isInitializedSignal,
  isLockedSignal,
  loadLockThrottleState,
  lockApp,
  persistDayEntry,
  persistSettings,
  saveLockThrottleState,
  settingsSignal,
  unlockApp,
  unlockVaultWithPassphrase,
} from "../../src/app/state";
import { DEFAULT_USER_SETTINGS, dayRepository } from "../../src/data/repo";
import { parseISODate } from "../../src/core/date";
import { createSnapshotNow, loadSnapshots } from "../../src/data/snapshots";

describe("Uygulama Durum Yönetimi (state.ts)", () => {
  beforeEach(async () => {
    dayRepository.clearActiveDek();
    closeDb();
    await dayRepository.clearAllData();
    await dayRepository.saveSettings(DEFAULT_USER_SETTINGS);
    settingsSignal.value = DEFAULT_USER_SETTINGS;
    entriesSignal.value = [];
    isInitializedSignal.value = false;
    isLockedSignal.value = true;
  });

  afterEach(() => {
    dayRepository.clearActiveDek();
    closeDb();
  });

  it("lockApp ve unlockApp isLockedSignal durumunu güncellemelidir", () => {
    unlockApp();
    expect(isLockedSignal.value).toBe(false);

    lockApp();
    expect(isLockedSignal.value).toBe(true);
  });

  it("Ayarlar güncellendiğinde kilit özellikleri IndexedDB ve sinyale kaydedilmelidir", async () => {
    await initializeAppState();

    const newSettings = {
      ...DEFAULT_USER_SETTINGS,
      lockEnabled: true,
      lockEnvelopeJson: JSON.stringify({ test: "envelope" }),
      onboardingCompleted: true,
    };

    await persistSettings(newSettings);

    expect(settingsSignal.value.lockEnabled).toBe(true);
    expect(settingsSignal.value.lockEnvelopeJson).toBeDefined();
    expect(settingsSignal.value.onboardingCompleted).toBe(true);

    const fromDb = await dayRepository.getSettings();
    expect(fromDb.lockEnabled).toBe(true);
    expect(fromDb.lockEnvelopeJson).toBeDefined();
    expect(fromDb.onboardingCompleted).toBe(true);
  });

  it("Kasa kilidi etkinleştirme, soğuk başlatma kilidi, kilit açma, parola değiştirme ve kaldırma tam akışı çalışmalıdır", async () => {
    await initializeAppState();

    // 1. Başlangıçta düz metin kayıt ve snapshot oluştur
    const entry = {
      date: parseISODate("2026-11-10"),
      bleeding: "heavy" as const,
      note: "Kasa yaşam döngüsü testi",
      updatedAt: 1000,
    };
    await persistDayEntry(entry);
    await createSnapshotNow([entry], settingsSignal.value);

    // 2. Kilidi etkinleştir -> tüm kayıtlar ve snapshot şifrelenmeli
    await enableVaultLock("Sifre123!");
    expect(settingsSignal.value.lockEnabled).toBe(true);

    const db = await getDb();
    const rawDay = await db.get("days", entry.date);
    expect(isEncryptedDayRecord(rawDay)).toBe(true);
    let snaps = await loadSnapshots();
    expect(snaps[0]?.payloadJson).toBeUndefined();
    expect(snaps[0]?.encryptedPayload).toBeDefined();

    // 3. Kilitle -> RAM'deki kayıtlar ve DEK temizlenmelidir
    lockApp();
    expect(isLockedSignal.value).toBe(true);
    expect(entriesSignal.value.length).toBe(0);
    expect(dayRepository.getActiveDek()).toBeNull();

    // 4. Soğuk açılışta kilitli kalmalı ve belleğe veri yüklenmemelidir
    isInitializedSignal.value = false;
    await initializeAppState();
    expect(isLockedSignal.value).toBe(true);
    expect(entriesSignal.value.length).toBe(0);

    // 5. Yanlış parola reddedilmeli, doğru parola kilidi açmalıdır
    await expect(unlockVaultWithPassphrase("Yanlis123")).rejects.toThrow();
    await unlockVaultWithPassphrase("Sifre123!");
    expect(isLockedSignal.value).toBe(false);
    expect(entriesSignal.value.length).toBe(1);
    expect(entriesSignal.value[0]?.note).toBe("Kasa yaşam döngüsü testi");

    // 6. Parola değiştirme ve DEK rotasyonu
    await changeVaultPassphrase("Sifre123!", "YeniSifre456!");
    lockApp();
    await expect(unlockVaultWithPassphrase("Sifre123!")).rejects.toThrow();
    await unlockVaultWithPassphrase("YeniSifre456!");
    expect(entriesSignal.value[0]?.note).toBe("Kasa yaşam döngüsü testi");

    // 7. Kilidi kaldırma -> tüm veriler ve snapshot tekrar düz metne dönmelidir
    await disableVaultLock("YeniSifre456!");
    expect(settingsSignal.value.lockEnabled).toBe(false);
    const rawAfterDisable = await db.get("days", entry.date);
    expect(isEncryptedDayRecord(rawAfterDisable)).toBe(false);
    snaps = await loadSnapshots();
    expect(snaps[0]?.payloadJson).toBeDefined();
    expect(snaps[0]?.encryptedPayload).toBeUndefined();
  }, 15000);

  it("Kilit açılırken eski düz metin kayıtlar ve snapshot'lar otomatik olarak şifreli formata göç ettirilmelidir", async () => {
    await initializeAppState();
    await enableVaultLock("Migrasyon123!");
    lockApp();

    // Eski sürümden kalmış düz metin bir gün ve snapshot simüle et
    const db = await getDb();
    const legacyEntry = {
      date: parseISODate("2026-11-12"),
      bleeding: "medium" as const,
      note: "Eski düz metin kayıt",
      updatedAt: 2000,
    };
    await db.put("days", legacyEntry);
    await createSnapshotNow([legacyEntry], DEFAULT_USER_SETTINGS);

    // Kilit açıldığında otomatik göç çalışmalıdır
    await unlockVaultWithPassphrase("Migrasyon123!");

    const rawAfterUnlock = await db.get("days", legacyEntry.date);
    expect(isEncryptedDayRecord(rawAfterUnlock)).toBe(true);
    const snaps = await loadSnapshots();
    expect(snaps.every((s) => s.encryptedPayload && !s.payloadJson)).toBe(true);
    expect(entriesSignal.value.some((e) => e.note === "Eski düz metin kayıt")).toBe(
      true,
    );
  });

  it("Kaba kuvvet bekleme durumu IndexedDB meta deposunda kalıcı olmalıdır", async () => {
    const lockUntil = Date.now() + 30_000;
    await saveLockThrottleState({ failedAttempts: 5, lockUntil });
    const loaded = await loadLockThrottleState();
    expect(loaded.failedAttempts).toBe(5);
    expect(loaded.lockUntil).toBe(lockUntil);
  });
});
