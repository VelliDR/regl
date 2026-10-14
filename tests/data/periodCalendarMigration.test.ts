import { describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import * as fs from "fs";
import {
  extractCloudDbFromBackup,
  extractZipFile,
  findZipSlice,
  isSqliteDatabase,
  parseZipCentralDirectory,
  unblockJavaStream,
} from "../../src/data/periodCalendarMigration";

const TEST_BACKUP_PATH = [
  "yedek.pc",
  "backup.pc",
  "Takvimim-2026-10-14-2.pc",
].find((f) => fs.existsSync(f));

describe("Period Calendar Migration Motoru - 1. Aşama: Akış ve Arşiv Çözücü", () => {
  it("Geçersiz dosya başlığı verildiğinde unblockJavaStream hata fırlatmalıdır", () => {
    const invalidBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    expect(() => unblockJavaStream(invalidBytes)).toThrow(
      /Geçersiz dosya formatı/,
    );
  });

  it("isSqliteDatabase SQLite 3 sihirli baytlarını doğru tanımalıdır", () => {
    const validSqliteHeader = new TextEncoder().encode(
      "SQLite format 3\x00extra-data",
    );
    expect(isSqliteDatabase(validSqliteHeader)).toBe(true);

    const invalidSqlite = new TextEncoder().encode("Not SQLite db");
    expect(isSqliteDatabase(invalidSqlite)).toBe(false);
  });

  it("Takvimim .pc dosyasını açıp cloud.db SQLite veritabanını başarıyla çıkartmalıdır", async () => {
    if (!TEST_BACKUP_PATH) {
      return;
    }

    const fileBuffer = fs.readFileSync(TEST_BACKUP_PATH);
    const rawBytes = new Uint8Array(fileBuffer);

    // 1. Unblock Java ObjectOutputStream
    const unblocked = unblockJavaStream(rawBytes);
    expect(unblocked.length).toBeGreaterThan(0);

    // 2. Find ZIP signature
    const zip = findZipSlice(unblocked);
    expect(zip[0]).toBe(0x50); // 'P'
    expect(zip[1]).toBe(0x4b); // 'K'
    expect(zip[2]).toBe(0x03);
    expect(zip[3]).toBe(0x04);

    // 3. Central Directory Check
    const entries = parseZipCentralDirectory(zip);
    expect(entries.has("cloud.db")).toBe(true);
    expect(entries.has("1.period")).toBe(true);
    expect(entries.has("1.note")).toBe(true);
    expect(entries.has("1.user")).toBe(true);

    // 4. Extract cloud.db
    const cloudDb = await extractZipFile(zip, "cloud.db");
    expect(cloudDb.length).toBe(32768);
    expect(isSqliteDatabase(cloudDb)).toBe(true);

    // 5. extractCloudDbFromBackup uçtan uca fonksiyon testi
    const directDb = await extractCloudDbFromBackup(rawBytes);
    expect(directDb.length).toBe(32768);
    expect(isSqliteDatabase(directDb)).toBe(true);
  });
});

describe("Period Calendar Migration Motoru - 2. Aşama: SQLite B-Tree Ayrıştırıcısı", () => {
  it("readVarint tek ve çok baytlı tamsayıları doğru ayrıştırmalıdır", async () => {
    const { readVarint } = await import(
      "../../src/data/periodCalendarMigration"
    );

    // 1 bayt (<= 127)
    const [val1, bytes1] = readVarint(new Uint8Array([0x25]), 0);
    expect(val1).toBe(37);
    expect(bytes1).toBe(1);

    // 2 bayt (0x81 0x00 -> 128)
    const [val2, bytes2] = readVarint(new Uint8Array([0x81, 0x00]), 0);
    expect(val2).toBe(128);
    expect(bytes2).toBe(2);
  });

  it("cloud.db içindeki sqlite_master tablosunu ve tüm tabloları başarıyla okumalıdır", async () => {
    if (!TEST_BACKUP_PATH) {
      return;
    }

    const { extractCloudDbFromBackup, readSqliteMaster, readTableRows } =
      await import("../../src/data/periodCalendarMigration");

    const fileBuffer = fs.readFileSync(TEST_BACKUP_PATH);
    const dbBytes = await extractCloudDbFromBackup(new Uint8Array(fileBuffer));

    // 1. sqlite_master tablosunu oku
    const tables = readSqliteMaster(dbBytes);
    expect(tables.has("Period")).toBe(true);
    expect(tables.has("Note")).toBe(true);
    expect(tables.has("User")).toBe(true);

    const periodMeta = tables.get("Period")!;
    expect(periodMeta.rootpage).toBeGreaterThan(1);

    // 2. Period tablosunu oku
    const periodRows = readTableRows(dbBytes, periodMeta.rootpage);
    expect(periodRows.length).toBe(38); // 38 döngü kaydı

    // İlk döngü kaydını doğrula
    const firstPeriod = periodRows[0]!;
    expect(firstPeriod.record.length).toBeGreaterThanOrEqual(7);
    expect(typeof firstPeriod.record[4]).toBe("number"); // date int örn. 20260930
    expect(typeof firstPeriod.record[5]).toBe("number"); // period duration

    // 3. Note tablosunu oku
    const noteMeta = tables.get("Note")!;
    const noteRows = readTableRows(dbBytes, noteMeta.rootpage);
    expect(noteRows.length).toBe(6); // 6 not/semptom kaydı

    // 4. User tablosunu oku
    const userMeta = tables.get("User")!;
    const userRows = readTableRows(dbBytes, userMeta.rootpage);
    expect(userRows.length).toBe(1);
    const userSetting = userRows[0]!.record[4];
    expect(typeof userSetting).toBe("string");
    expect(userSetting as string).toContain("period_length");
  });
});

describe("Period Calendar Migration Motoru - 3. Aşama: Klinik Veri Dönüştürme ve Valibot Doğrulama", () => {
  it("Takvimim .pc dosyasını tam regl-backup-v1 formatına dönüştürmeli ve Python çıktısıyla 1:1 eşleşmelidir", async () => {
    if (!TEST_BACKUP_PATH) {
      return;
    }

    const { convertPeriodCalendarToRegl } = await import(
      "../../src/data/periodCalendarMigration"
    );

    const fileBuffer = fs.readFileSync(TEST_BACKUP_PATH);
    const payload = await convertPeriodCalendarToRegl(new Uint8Array(fileBuffer));

    expect(payload.format).toBe("regl-backup-v1");
    expect(payload.days.length).toBe(158);
    expect(payload.settings?.defaultCycleLength).toBe(28);

    // Eğer python çıktısı mevcutsa 1:1 kıyaslama yap
    if (fs.existsSync("regl-yedek-period-calendar.json")) {
      const pythonOutput = JSON.parse(
        fs.readFileSync("regl-yedek-period-calendar.json", "utf-8"),
      );

      expect(payload.days.length).toBe(pythonOutput.days.length);

      for (let i = 0; i < payload.days.length; i++) {
        const tsDay = payload.days[i]!;
        const pyDay = pythonOutput.days[i]!;

        expect(tsDay.date).toBe(pyDay.date);
        expect(tsDay.bleeding).toBe(pyDay.bleeding);
        expect(tsDay.symptoms).toEqual(pyDay.symptoms);
        expect(tsDay.mood).toEqual(pyDay.mood);
        expect(tsDay.note).toBe(pyDay.note);
        expect(tsDay.sex).toBe(pyDay.sex);
      }
    }
  });
});

describe("Period Calendar Migration Motoru - 6. Aşama: Uçtan Uca Entegrasyon ve Sınır Durumları", () => {
  it("Dönüştürülen veriler IndexedDB'ye aktarılabilmeli ve döngü analiz motoru çalışabilmelidir", async () => {
    if (!TEST_BACKUP_PATH) {
      return;
    }

    const { convertPeriodCalendarToRegl } = await import(
      "../../src/data/periodCalendarMigration"
    );
    const { importBackup } = await import("../../src/data/backup");
    const { dayRepository } = await import("../../src/data/repo");
    const { partitionCycles } = await import("../../src/core/cycles");

    const fileBuffer = fs.readFileSync(TEST_BACKUP_PATH);
    const payload = await convertPeriodCalendarToRegl(new Uint8Array(fileBuffer));

    // 1. IndexedDB'ye aktar
    const summary = await importBackup(payload, "replace");
    expect(summary.importedCount).toBe(158);

    // 2. Depodaki kayıtları doğrula
    const allDays = await dayRepository.getAllDays();
    expect(allDays.length).toBe(158);

    // 3. Döngü motorunu çalıştır
    const partition = partitionCycles(allDays);
    expect(partition.completedCycles.length).toBeGreaterThan(0);

    // Döngü sürelerinin klinik aralıkta olduğunu doğrula
    for (const c of partition.completedCycles) {
      expect(c.length).toBeGreaterThan(0);
      expect(c.periodLength).toBeGreaterThan(0);
    }

    // 4. Ayarların kaydedildiğini doğrula
    const settings = await dayRepository.getSettings();
    expect(settings?.defaultCycleLength).toBe(28);
  });

  it("Doğrudan ham SQLite (.bak / .db) baytları verildiğinde de hatasız çalışmalıdır", async () => {
    if (!TEST_BACKUP_PATH) {
      return;
    }

    const { extractCloudDbFromBackup, convertPeriodCalendarToRegl } =
      await import("../../src/data/periodCalendarMigration");

    const fileBuffer = fs.readFileSync(TEST_BACKUP_PATH);
    // cloud.db baytlarını doğrudan alıp ham .bak olarak simüle et
    const rawSqliteBytes = await extractCloudDbFromBackup(
      new Uint8Array(fileBuffer),
    );

    const payload = await convertPeriodCalendarToRegl(rawSqliteBytes);
    expect(payload.format).toBe("regl-backup-v1");
    expect(payload.days.length).toBe(158);
  });
});



