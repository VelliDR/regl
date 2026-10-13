import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { closeDb } from "../../src/data/db";
import { dayRepository } from "../../src/data/repo";
import { parseISODate } from "../../src/core/date";
import { CentiCelsius, DayEntry } from "../../src/core/types";

describe("Veri Katmanı: IndexedDB Repository (db & repo)", () => {
  beforeEach(async () => {
    closeDb();
    await dayRepository.clearAllDays();
  });

  afterEach(() => {
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
});
