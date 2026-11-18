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

describe("Sentetik CI Göç Testleri: Java Stream + ZIP + SQLite Overflow + Token Eşleme", () => {
  function encodeVarint(n: number): number[] {
    if (n < 0x80) return [n];
    if (n < 0x4000) return [0x80 | (n >> 7), n & 0x7f];
    return [0x80 | (n >> 14), 0x80 | ((n >> 7) & 0x7f), n & 0x7f];
  }

  function buildRecord(
    fields: Array<null | number | string>,
  ): Uint8Array {
    const encoder = new TextEncoder();
    const serialTypes: number[] = [];
    const bodyChunks: Uint8Array[] = [];

    for (const f of fields) {
      if (f === null) {
        serialTypes.push(0);
      } else if (typeof f === "number") {
        serialTypes.push(4); // int32
        const b = new Uint8Array(4);
        new DataView(b.buffer).setInt32(0, f, false);
        bodyChunks.push(b);
      } else {
        const bytes = encoder.encode(f);
        serialTypes.push(13 + 2 * bytes.length);
        bodyChunks.push(bytes);
      }
    }

    const stBytes: number[] = [];
    for (const st of serialTypes) stBytes.push(...encodeVarint(st));

    // headerLen includes its own varint size (1 byte for small headers)
    let headerLen = 1 + stBytes.length;
    if (headerLen >= 128) headerLen += 1;
    const header = new Uint8Array([...encodeVarint(headerLen), ...stBytes]);

    const bodyLen = bodyChunks.reduce((acc, c) => acc + c.length, 0);
    const out = new Uint8Array(header.length + bodyLen);
    out.set(header, 0);
    let pos = header.length;
    for (const c of bodyChunks) {
      out.set(c, pos);
      pos += c.length;
    }
    return out;
  }

  function writeLeafPage(
    db: Uint8Array,
    pageNum: number,
    pageSize: number,
    cells: Array<{ rowid: number; payload: Uint8Array; overflowPage?: number; localLen?: number }>,
  ) {
    const pageOffset = (pageNum - 1) * pageSize;
    const headerOffset = pageOffset + (pageNum === 1 ? 100 : 0);
    const view = new DataView(db.buffer);

    db[headerOffset] = 0x0d; // Leaf table B-tree page
    view.setUint16(headerOffset + 3, cells.length, false);

    let cellWriteCursor = pageOffset + pageSize;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i]!;
      const lenBytes = encodeVarint(c.payload.length);
      const idBytes = encodeVarint(c.rowid);
      const storedBytes = c.localLen !== undefined ? c.payload.subarray(0, c.localLen) : c.payload;
      const totalCellSize =
        lenBytes.length +
        idBytes.length +
        storedBytes.length +
        (c.overflowPage ? 4 : 0);
      cellWriteCursor -= totalCellSize;

      let p = cellWriteCursor;
      db.set(lenBytes, p);
      p += lenBytes.length;
      db.set(idBytes, p);
      p += idBytes.length;
      db.set(storedBytes, p);
      p += storedBytes.length;
      if (c.overflowPage) {
        view.setUint32(p, c.overflowPage, false);
      }

      // Pointer array starts at headerOffset + 8
      view.setUint16(headerOffset + 8 + i * 2, cellWriteCursor - pageOffset, false);
    }
  }

  function wrapInStoredZip(filename: string, data: Uint8Array): Uint8Array {
    const nameBytes = new TextEncoder().encode(filename);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 0, true); // stored
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);

    const cdHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cdHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 0, true); // stored
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, 0, true); // local header offset
    cdHeader.set(nameBytes, 46);

    const cdOffset = localHeader.length + data.length;
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, 1, true);
    ev.setUint16(10, 1, true);
    ev.setUint32(12, cdHeader.length, true);
    ev.setUint32(16, cdOffset, true);

    const zip = new Uint8Array(cdOffset + cdHeader.length + eocd.length);
    zip.set(localHeader, 0);
    zip.set(data, localHeader.length);
    zip.set(cdHeader, cdOffset);
    zip.set(eocd, cdOffset + cdHeader.length);
    return zip;
  }

  function wrapInJavaObjectStream(payload: Uint8Array): Uint8Array {
    // 0xaced 0x0005 + TC_BLOCKDATALONG (0x7a) + 4-byte length + payload
    const out = new Uint8Array(9 + payload.length);
    out[0] = 0xac;
    out[1] = 0xed;
    out[2] = 0x00;
    out[3] = 0x05;
    out[4] = 0x7a;
    new DataView(out.buffer).setUint32(5, payload.length, false);
    out.set(payload, 9);
    return out;
  }

  it("Sentetik JavaStream + ZIP + SQLite Overflow sayfası ve exact token ayrıştırma CI ortamında eksiksiz çalışmalıdır", async () => {
    const { convertPeriodCalendarToRegl } = await import(
      "../../src/data/periodCalendarMigration"
    );

    const pageSize = 512;
    const db = new Uint8Array(pageSize * 5); // 5 pages
    db.set(new TextEncoder().encode("SQLite format 3\x00"), 0);
    const dv = new DataView(db.buffer);
    dv.setUint16(16, pageSize, false);
    db[20] = 0; // reserved bytes

    // Page 1: sqlite_master
    writeLeafPage(db, 1, pageSize, [
      {
        rowid: 1,
        payload: buildRecord(["table", "User", "User", 2, "CREATE TABLE User"]),
      },
      {
        rowid: 2,
        payload: buildRecord(["table", "Period", "Period", 3, "CREATE TABLE Period"]),
      },
      {
        rowid: 3,
        payload: buildRecord(["table", "Note", "Note", 4, "CREATE TABLE Note"]),
      },
    ]);

    // Page 2: User settings (period_length = 30)
    writeLeafPage(db, 2, pageSize, [
      {
        rowid: 1,
        payload: buildRecord([
          1,
          null,
          null,
          null,
          JSON.stringify({ g: [{ key: "period_length", value: 30 }] }),
        ]),
      },
    ]);

    // Page 3: Period (2026-08-01, 3 days)
    writeLeafPage(db, 3, pageSize, [
      { rowid: 1, payload: buildRecord([1, null, null, null, 20260801, 3, 30]) },
    ]);

    // Page 4 & 5: Note with > 477 bytes triggering SQLite overflow page 5
    // Also includes "112:1#24:2#" and "17,10," to verify no substring collisions ("12" / "7")
    const longNote = "Uzun gunluk notu ".repeat(38); // ~646 chars -> forces overflow!
    const notePayload = buildRecord([
      1,
      20260802,
      null,
      1785600000000,
      null,
      null,
      null,
      null,
      "112:1#24:2#", // only 24 (cramps), NOT 12 (headache)
      "17,10,", // only 10 (anxious), NOT 7 (angry)
      longNote,
      null,
      null,
      null,
      1,
    ]);

    // For pageSize=512: usableSize=512, maxLocal=477, minLocal=37, ovDataCap=508
    const minLocal = Math.floor(((pageSize - 12) * 32) / 255) - 23;
    const surplus = minLocal + ((notePayload.length - minLocal) % (pageSize - 4));
    const localLen = surplus <= pageSize - 35 ? surplus : minLocal;

    writeLeafPage(db, 4, pageSize, [
      { rowid: 1, payload: notePayload, localLen, overflowPage: 5 },
    ]);

    // Page 5: Overflow page (4-byte next=0 + remaining bytes)
    const ovOffset = 4 * pageSize;
    dv.setUint32(ovOffset, 0, false);
    db.set(notePayload.subarray(localLen), ovOffset + 4);

    const zipBytes = wrapInStoredZip("cloud.db", db);
    const pcBytes = wrapInJavaObjectStream(zipBytes);

    const result = await convertPeriodCalendarToRegl(pcBytes);
    expect(result.settings?.defaultCycleLength).toBe(30);
    expect(result.days.length).toBe(3);

    const aug2 = result.days.find((d) => d.date === "2026-08-02");
    expect(aug2).toBeDefined();
    expect(aug2?.bleeding).toBe("medium");
    expect(aug2?.symptoms).toEqual(["cramps"]);
    expect(aug2?.mood).toEqual(["anxious"]);
    expect(aug2?.sex).toBe("unprotected");
    expect(aug2?.note).toBe(longNote.trim());
  });
});



