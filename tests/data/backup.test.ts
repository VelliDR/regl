import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { closeDb } from "../../src/data/db";
import { dayRepository } from "../../src/data/repo";
import { parseISODate } from "../../src/core/date";
import { CentiCelsius, DayEntry } from "../../src/core/types";
import {
  exportToCsv,
  exportToJson,
  importBackup,
  validateBackupString,
} from "../../src/data/backup";

describe("Yedekleme ve Geri Yükleme Motoru (backup.ts)", () => {
  beforeEach(async () => {
    closeDb();
    await dayRepository.clearAllDays();
  });

  afterEach(() => {
    closeDb();
  });

  const sampleDays: DayEntry[] = [
    {
      date: parseISODate("2026-05-01"),
      bleeding: "heavy",
      bbt: { value: 3665 as CentiCelsius, time: "07:10" },
      mucus: { sensation: "dry", appearance: "none" },
      note: "Döngü başlangıcı, kramp var",
      updatedAt: 1000,
    },
    {
      date: parseISODate("2026-05-02"),
      bleeding: "medium",
      symptoms: ["cramps", "headache"],
      updatedAt: 1050,
    },
  ];

  it("JSON dışa aktarma ve şema doğrulama gidiş-dönüşü eksiksiz çalışmalıdır", () => {
    const jsonStr = exportToJson(sampleDays, {
      trackingMode: "symptothermal",
      defaultCycleLength: 30,
      theme: "dark",
      reminderBbtEnabled: true,
      reminderBbtTime: "07:00",
      reminderPeriodDaysBefore: 2,
    });

    const parsed = validateBackupString(jsonStr);
    expect(parsed.format).toBe("regl-backup-v1");
    expect(parsed.days.length).toBe(2);
    expect(parsed.days[0]?.date).toBe("2026-05-01");
    expect(parsed.settings?.defaultCycleLength).toBe(30);
  });

  it("Hatalı veya eksik alanlı JSON dosyaları reddedilmelidir", () => {
    expect(() => validateBackupString('{ "invalid": true }')).toThrow();
    expect(() => validateBackupString("not a json")).toThrow();
    expect(() =>
      validateBackupString(
        JSON.stringify({
          format: "wrong-format",
          exportedAt: new Date().toISOString(),
          days: [],
        }),
      ),
    ).toThrow();
  });

  it("CSV dışa aktarma doğru formatta tablo üretmelidir", () => {
    const csv = exportToCsv(sampleDays);
    expect(csv).toContain("Tarih,Kanama,BBT (°C)");
    expect(csv).toContain("2026-05-01,heavy,36.65,07:10");
    expect(csv).toContain("Döngü başlangıcı, kramp var");
  });

  it("replace modunda içe aktarma mevcut veriyi temizleyip yenilerini yazmalıdır", async () => {
    await dayRepository.saveDay({
      date: parseISODate("2026-01-01"),
      bleeding: "light",
      updatedAt: 500,
    });

    const backupPayload = validateBackupString(exportToJson(sampleDays));
    const summary = await importBackup(backupPayload, "replace");

    expect(summary.importedCount).toBe(2);
    expect(summary.mode).toBe("replace");

    const all = await dayRepository.getAllDays();
    expect(all.length).toBe(2);
    expect(all.find((d) => d.date === "2026-01-01")).toBeUndefined();
    expect(all.find((d) => d.date === "2026-05-01")).toBeDefined();
  });

  it("merge modunda içe aktarma sadece daha güncel veya yeni kayıtları yazmalıdır", async () => {
    // Mevcut veri: 2026-05-01 günü updatedAt=2000 (daha yeni)
    await dayRepository.saveDay({
      date: parseISODate("2026-05-01"),
      bleeding: "spotting",
      updatedAt: 2000,
    });

    // İçe aktarılacak veride 2026-05-01 günü updatedAt=1000 (daha eski)
    const backupPayload = validateBackupString(exportToJson(sampleDays));
    const summary = await importBackup(backupPayload, "merge");

    expect(summary.importedCount).toBe(1); // Yalnızca 2026-05-02 eklendi
    expect(summary.skippedCount).toBe(1); // 2026-05-01 daha eski olduğu için atlandı

    const day1 = await dayRepository.getDay(parseISODate("2026-05-01"));
    expect(day1?.bleeding).toBe("spotting"); // Eski veri ezilmedi!
  });
});
