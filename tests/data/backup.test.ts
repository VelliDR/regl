import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { closeDb, getDb, isEncryptedDayRecord } from "../../src/data/db";
import { generateDek } from "../../src/data/crypto";
import { DEFAULT_USER_SETTINGS, dayRepository } from "../../src/data/repo";
import { parseISODate } from "../../src/core/date";
import { CentiCelsius, DayEntry } from "../../src/core/types";
import {
  decryptVaultBackup,
  exportToCsv,
  exportToEncryptedVault,
  exportToJson,
  importBackup,
  isEncryptedVaultString,
  validateBackupString,
} from "../../src/data/backup";

describe("Yedekleme ve Geri Yükleme Motoru (backup.ts)", () => {
  beforeEach(async () => {
    dayRepository.clearActiveDek();
    closeDb();
    await dayRepository.clearAllData();
  });

  afterEach(() => {
    dayRepository.clearActiveDek();
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

  it("Period Calendar (.pc) dönüştürülmüş yedek dosyası Valibot tarafından doğrulanmalı ve içe aktarılmalıdır", async () => {
    const fs = await import("fs");
    if (fs.existsSync("regl-yedek-period-calendar.json")) {
      const content = fs.readFileSync("regl-yedek-period-calendar.json", "utf-8");
      const validated = validateBackupString(content);

      expect(validated.format).toBe("regl-backup-v1");
      expect(validated.days.length).toBeGreaterThanOrEqual(150);

      const summary = await importBackup(validated, "replace");
      expect(summary.importedCount).toBe(validated.days.length);

      const allDays = await dayRepository.getAllDays();
      expect(allDays.length).toBe(validated.days.length);
    }
  });

  it("Şifreli .reglvault dışa/içe aktarma gidiş-dönüşü çalışmalı ve yanlış parolayı reddetmelidir", async () => {
    const vaultStr = await exportToEncryptedVault(
      sampleDays,
      {
        ...DEFAULT_USER_SETTINGS,
        lockEnabled: true,
        lockEnvelopeJson: '{"secret":"must-strip"}',
      },
      "VaultPass123!",
    );

    expect(isEncryptedVaultString(vaultStr)).toBe(true);
    expect(vaultStr).not.toContain("Döngü başlangıcı");
    expect(vaultStr).not.toContain("3665");

    await expect(
      decryptVaultBackup(vaultStr, "YanlisParola"),
    ).rejects.toThrow();

    const decrypted = await decryptVaultBackup(vaultStr, "VaultPass123!");
    expect(decrypted.days.length).toBe(2);
    expect(decrypted.settings?.lockEnabled).toBeUndefined();
    expect(decrypted.settings?.lockEnvelopeJson).toBeUndefined();
  });

  it("CSV dışa aktarma UTF-8 BOM içermeli ve formül enjeksiyonuna karşı korumalı olmalıdır", () => {
    const maliciousDays: DayEntry[] = [
      {
        date: parseISODate("2026-05-03"),
        note: "=CMD|'/C calc'!A0",
        updatedAt: 2000,
      },
    ];
    const csv = exportToCsv(maliciousDays);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain(`"'=CMD|'/C calc'!A0"`);
  });

  it("Geçersiz takvim tarihi içeren yedekler Valibot şeması tarafından reddedilmelidir", () => {
    expect(() =>
      validateBackupString(
        JSON.stringify({
          format: "regl-backup-v1",
          exportedAt: new Date().toISOString(),
          days: [{ date: "2026-02-31", updatedAt: 1000 }],
        }),
      ),
    ).toThrow();
  });

  it("importBackup sırasında yerel uygulama kilidi ayarları korunmalıdır", async () => {
    const dek = await generateDek();
    dayRepository.setActiveDek(dek);

    await dayRepository.saveSettings({
      ...DEFAULT_USER_SETTINGS,
      lockEnabled: true,
      lockEnvelopeJson: '{"salt":"abc"}',
      lockAutoMinutes: 5,
    });

    const payload = validateBackupString(
      exportToJson(sampleDays, DEFAULT_USER_SETTINGS),
    );
    await importBackup(payload, "replace");

    const settingsAfter = await dayRepository.getSettings();
    expect(settingsAfter.lockEnabled).toBe(true);
    expect(settingsAfter.lockEnvelopeJson).toBe('{"salt":"abc"}');
    expect(settingsAfter.lockAutoMinutes).toBe(5);

    // İçe aktarılan günler aktif DEK ile şifreli yazılmış olmalıdır
    const db = await getDb();
    const rawDay = await db.get("days", sampleDays[0]!.date);
    expect(isEncryptedDayRecord(rawDay)).toBe(true);
  });

  it("exportToCsv çıktısı serviks (rahim ağzı) gözlem sütunlarını içermelidir", () => {
    const daysWithCervix = [
      {
        date: parseISODate("2026-10-12"),
        cervix: {
          position: "high" as const,
          firmness: "soft" as const,
          opening: "open" as const,
        },
        updatedAt: 3000,
      },
    ];
    const csv = exportToCsv(daysWithCervix);
    expect(csv).toContain("Serviks Konum,Serviks Sertlik,Serviks Açıklık");
    expect(csv).toContain(",high,soft,open");
  });
});
