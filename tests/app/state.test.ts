import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { closeDb } from "../../src/data/db";
import {
  isLockedSignal,
  lockApp,
  unlockApp,
  settingsSignal,
  persistSettings,
  initializeAppState,
} from "../../src/app/state";
import { DEFAULT_USER_SETTINGS, dayRepository } from "../../src/data/repo";

describe("Uygulama Durum Yönetimi (state.ts)", () => {
  beforeEach(async () => {
    closeDb();
    await dayRepository.clearAllDays();
    await dayRepository.saveSettings(DEFAULT_USER_SETTINGS);
    settingsSignal.value = DEFAULT_USER_SETTINGS;
  });

  afterEach(() => {
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
});
