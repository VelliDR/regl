import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { closeDb, getDb, isEncryptedDayRecord } from "../../src/data/db";
import { generateDek } from "../../src/data/crypto";
import { DEFAULT_USER_SETTINGS, dayRepository } from "../../src/data/repo";
import { parseISODate } from "../../src/core/date";
import { CentiCelsius, DayEntry } from "../../src/core/types";

describe("Veri Katmanı: IndexedDB Repository (db & repo)", () => {
  beforeEach(async () => {
    dayRepository.clearActiveDek();
    closeDb();
    await dayRepository.clearAllData();
  });

  afterEach(() => {
    dayRepository.clearActiveDek();
    closeDb();
  });

  it("Günlük kayıt ekleme, okuma ve güncelleme başarılı olmalıdır", async () => {
    const entry: DayEntry = {
      date: parseISODate("2026-10-13"),
      bleeding: "heavy",
      bbt: { value: 3665 as CentiCelsius, time: "07:15" },
      updatedAt: 1000,
    };

    await dayRepository.saveDay(entry);
    const retrieved = await dayRepository.getDay(entry.date);

    expect(retrieved).toBeDefined();
    expect(retrieved?.date).toBe("2026-10-13");
    expect(retrieved?.bleeding).toBe("heavy");
    expect(retrieved?.bbt?.value).toBe(3665);

    // Güncelleme
    const updated: DayEntry = {
      ...entry,
      bleeding: "medium",
      updatedAt: 2000,
    };
    await dayRepository.saveDay(updated);
    const afterUpdate = await dayRepository.getDay(entry.date);
    expect(afterUpdate?.bleeding).toBe("medium");
    expect(afterUpdate?.updatedAt).toBe(2000);
  });

  it("Günlük kayıt silme ve toplu ekleme çalışmalıdır", async () => {
    const entries: DayEntry[] = [
      { date: parseISODate("2026-01-01"), bleeding: "heavy", updatedAt: 1 },
      { date: parseISODate("2026-01-02"), bleeding: "medium", updatedAt: 1 },
      { date: parseISODate("2026-01-03"), bleeding: "light", updatedAt: 1 },
    ];

    await dayRepository.bulkSaveDays(entries);
    let all = await dayRepository.getAllDays();
    expect(all.length).toBe(3);

    await dayRepository.deleteDay(parseISODate("2026-01-02"));
    all = await dayRepository.getAllDays();
    expect(all.length).toBe(2);
    expect(all.find((d) => d.date === "2026-01-02")).toBeUndefined();
  });

  it("Kullanıcı ayarlarını kaydedip okuyabilmelidir", async () => {
    const defaultSettings = await dayRepository.getSettings();
    expect(defaultSettings.defaultCycleLength).toBe(28);

    await dayRepository.saveSettings({
      ...defaultSettings,
      defaultCycleLength: 32,
      theme: "dark",
    });

    const updated = await dayRepository.getSettings();
    expect(updated.defaultCycleLength).toBe(32);
    expect(updated.theme).toBe("dark");
  });

  it("Aktif DEK varken kayıtlar IndexedDB'ye AES-GCM şifreli yazılmalı ve ham düz metin içermemelidir", async () => {
    const dek = await generateDek();
    dayRepository.setActiveDek(dek);

    const sensitiveEntry: DayEntry = {
      date: parseISODate("2026-10-15"),
      bleeding: "heavy",
      bbt: { value: 3672 as CentiCelsius, time: "07:05" },
      sex: "unprotected",
      note: "Çok gizli sağlık notu",
      updatedAt: 5000,
    };

    await dayRepository.saveDay(sensitiveEntry);

    // Ham IndexedDB verisini doğrudan kontrol et
    const db = await getDb();
    const rawStored = await db.get("days", sensitiveEntry.date);
    expect(rawStored).toBeDefined();
    expect(isEncryptedDayRecord(rawStored)).toBe(true);
    expect(JSON.stringify(rawStored)).not.toContain("heavy");
    expect(JSON.stringify(rawStored)).not.toContain("3672");
    expect(JSON.stringify(rawStored)).not.toContain("Çok gizli sağlık notu");

    // Repository üzerinden çözülmüş veri okunabilmelidir
    const decrypted = await dayRepository.getDay(sensitiveEntry.date);
    expect(decrypted).toEqual(sensitiveEntry);

    // Kilit ayarlıyken DEK olmadan okuma ve yazma reddedilmelidir
    await dayRepository.saveSettings({
      ...DEFAULT_USER_SETTINGS,
      lockEnabled: true,
      lockEnvelopeJson: "{}",
    });
    dayRepository.clearActiveDek();

    await expect(dayRepository.getAllDays()).rejects.toThrow(/Kasa kilitli/);
    await expect(dayRepository.saveDay(sensitiveEntry)).rejects.toThrow(
      /Kasa kilitli/,
    );
  });

  it("encryptAllPlaintextDays ve decryptAllEncryptedDays mevcut verileri hatasız göç ettirmelidir", async () => {
    const entry: DayEntry = {
      date: parseISODate("2026-11-01"),
      bleeding: "medium",
      note: "Düz metin başlangıç kaydı",
      updatedAt: 1000,
    };
    await dayRepository.saveDay(entry);

    const dek = await generateDek();
    const encryptedCount = await dayRepository.encryptAllPlaintextDays(dek);
    expect(encryptedCount).toBe(1);

    const db = await getDb();
    const rawAfterEncrypt = await db.get("days", entry.date);
    expect(isEncryptedDayRecord(rawAfterEncrypt)).toBe(true);

    const decryptedCount = await dayRepository.decryptAllEncryptedDays(dek);
    expect(decryptedCount).toBe(1);

    const rawAfterDecrypt = await db.get("days", entry.date);
    expect(isEncryptedDayRecord(rawAfterDecrypt)).toBe(false);
    expect((rawAfterDecrypt as DayEntry).note).toBe("Düz metin başlangıç kaydı");
  });
});
