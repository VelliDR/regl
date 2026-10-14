import * as v from "valibot";
import { BleedingIntensity } from "../core/types";
import {
  BackupPayloadSchema,
  ValidatedBackupPayload,
  ValidatedDayEntry,
} from "./schemas";


export interface ZipEntryInfo {
  readonly name: string;
  readonly method: number; // 0 = stored, 8 = deflate
  readonly compSize: number;
  readonly uncompSize: number;
  readonly dataOffset: number;
}

/**
 * Checks whether the given byte buffer starts with the standard SQLite 3 header ("SQLite format 3\0").
 */
export function isSqliteDatabase(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  const magic = [
    0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61,
    0x74, 0x20, 0x33, 0x00,
  ];
  for (let i = 0; i < 16; i++) {
    if (bytes[i] !== magic[i]) return false;
  }
  return true;
}

/**
 * Strips Java ObjectOutputStream block headers (0xaced 0x0005, TC_BLOCKDATA 0x77,
 * TC_BLOCKDATALONG 0x7a) to reveal the clean underlying ZIP stream or payload.
 */
export function unblockJavaStream(rawBytes: Uint8Array): Uint8Array {
  // If it starts with Java serialization magic header (0xaced 0x0005)
  if (
    rawBytes.length >= 4 &&
    rawBytes[0] === 0xac &&
    rawBytes[1] === 0xed &&
    rawBytes[2] === 0x00 &&
    rawBytes[3] === 0x05
  ) {
    let pos = 4;
    const chunks: Uint8Array[] = [];
    let totalLen = 0;
    const view = new DataView(
      rawBytes.buffer,
      rawBytes.byteOffset,
      rawBytes.byteLength,
    );

    while (pos < rawBytes.length) {
      const tag = rawBytes[pos];
      pos++;
      if (tag === 0x77) {
        // TC_BLOCKDATA (1-byte length <= 255)
        if (pos >= rawBytes.length) break;
        const len = rawBytes[pos]!;
        pos++;
        if (pos + len > rawBytes.length) break;
        chunks.push(rawBytes.subarray(pos, pos + len));
        totalLen += len;
        pos += len;
      } else if (tag === 0x7a) {
        // TC_BLOCKDATALONG (4-byte length > 255)
        if (pos + 4 > rawBytes.length) break;
        const len = view.getUint32(pos, false);
        pos += 4;
        if (pos + len > rawBytes.length) break;
        chunks.push(rawBytes.subarray(pos, pos + len));
        totalLen += len;
        pos += len;
      } else if (tag === 0x78) {
        // TC_ENDBLOCKDATA
        continue;
      } else {
        break;
      }
    }

    const unblocked = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      unblocked.set(chunk, offset);
      offset += chunk.length;
    }
    return unblocked;
  }

  // Already ZIP archive
  if (
    rawBytes.length >= 4 &&
    rawBytes[0] === 0x50 &&
    rawBytes[1] === 0x4b &&
    rawBytes[2] === 0x03 &&
    rawBytes[3] === 0x04
  ) {
    return rawBytes;
  }

  // Direct SQLite file
  if (isSqliteDatabase(rawBytes)) {
    return rawBytes;
  }

  throw new Error(
    "Geçersiz dosya formatı: Java ObjectStream, ZIP veya SQLite başlığı bulunamadı.",
  );
}

/**
 * Period Calendar backups often have metadata bytes before the ZIP header.
 * This finds the first PK\x03\x04 signature and slices from there.
 */
export function findZipSlice(bytes: Uint8Array): Uint8Array {
  for (let i = 0; i <= bytes.length - 4; i++) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x03 &&
      bytes[i + 3] === 0x04
    ) {
      return bytes.subarray(i);
    }
  }
  return bytes;
}

/**
 * Decompresses raw Deflate bytes using modern Web API DecompressionStream.
 */
export async function decompressDeflate(
  compressedBytes: Uint8Array,
): Promise<Uint8Array> {
  const DecompStream =
    typeof DecompressionStream !== "undefined"
      ? DecompressionStream
      : (
          globalThis as unknown as {
            DecompressionStream?: typeof DecompressionStream;
          }
        ).DecompressionStream;

  if (typeof DecompStream !== "undefined") {
    const ds = new DecompStream("deflate-raw");
    const writer = ds.writable.getWriter();
    // Do not await write, start reading concurrently to avoid buffer lock
    void writer.write(compressedBytes as unknown as BufferSource);
    void writer.close();

    const chunks: Uint8Array[] = [];
    const reader = ds.readable.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const total = chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  throw new Error("Tarayıcıda yerel DecompressionStream desteği bulunamadı.");
}

/**
 * Parses the Central Directory of a ZIP archive and indexes all contained files.
 */
export function parseZipCentralDirectory(
  zipBytes: Uint8Array,
): Map<string, ZipEntryInfo> {
  const view = new DataView(
    zipBytes.buffer,
    zipBytes.byteOffset,
    zipBytes.byteLength,
  );

  // Search backwards for End of Central Directory (EOCD): 0x06054b50
  let eocdPos = -1;
  const minPos = Math.max(0, zipBytes.length - 65535 - 22);
  for (let i = zipBytes.length - 22; i >= minPos; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdPos = i;
      break;
    }
  }

  if (eocdPos < 0) {
    throw new Error("ZIP arşivi sonu (EOCD) bulunamadı.");
  }

  const cdOffset = view.getUint32(eocdPos + 16, true);
  const cdCount = view.getUint16(eocdPos + 10, true);

  const files = new Map<string, ZipEntryInfo>();
  let pos = cdOffset;
  const decoder = new TextDecoder();

  for (let i = 0; i < cdCount; i++) {
    if (pos + 46 > zipBytes.length) break;
    if (view.getUint32(pos, true) !== 0x02014b50) break;

    const method = view.getUint16(pos + 10, true);
    const compSize = view.getUint32(pos + 20, true);
    const uncompSize = view.getUint32(pos + 24, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localHeaderOffset = view.getUint32(pos + 42, true);

    const name = decoder.decode(zipBytes.subarray(pos + 46, pos + 46 + nameLen));

    if (localHeaderOffset + 30 <= zipBytes.length) {
      const localNameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;

      files.set(name, {
        name,
        method,
        compSize,
        uncompSize,
        dataOffset,
      });
    }

    pos += 46 + nameLen + extraLen + commentLen;
  }

  return files;
}

/**
 * Extracts a specific file by name from a ZIP archive.
 */
export async function extractZipFile(
  zipBytes: Uint8Array,
  targetFilename: string,
): Promise<Uint8Array> {
  const entries = parseZipCentralDirectory(zipBytes);
  const entry = entries.get(targetFilename);

  if (!entry) {
    throw new Error(
      `ZIP arşivi içinde aranan dosya bulunamadı: ${targetFilename}`,
    );
  }

  const compressedSlice = zipBytes.subarray(
    entry.dataOffset,
    entry.dataOffset + entry.compSize,
  );

  if (entry.method === 0) {
    // Stored (no compression)
    return compressedSlice;
  }

  if (entry.method === 8) {
    // Deflate
    return await decompressDeflate(compressedSlice);
  }

  throw new Error(`Desteklenmeyen ZIP sıkıştırma yöntemi: ${entry.method}`);
}

/**
 * Extracts cloud.db from a Period Calendar .pc or .bak backup payload.
 */
export async function extractCloudDbFromBackup(
  backupBytes: Uint8Array,
): Promise<Uint8Array> {
  // Direct SQLite file
  if (isSqliteDatabase(backupBytes)) {
    return backupBytes;
  }

  // Java ObjectOutputStream wrapped or direct ZIP
  const unblocked = unblockJavaStream(backupBytes);
  if (isSqliteDatabase(unblocked)) {
    return unblocked;
  }

  const zip = findZipSlice(unblocked);
  return await extractZipFile(zip, "cloud.db");
}

/* ========================================================================== */
/* Stage 2: Pure TypeScript Lightweight SQLite Format 3 B-Tree Reader         */
/* ========================================================================== */

export type SqliteValue = null | number | string | Uint8Array;

export interface SqliteRow {
  readonly rowid: number;
  readonly record: readonly SqliteValue[];
}

export interface SqliteMasterEntry {
  readonly type: string;
  readonly name: string;
  readonly tblName: string;
  readonly rootpage: number;
  readonly sql: string;
}

/**
 * Reads a SQLite variable-length integer (varint) between 1 and 9 bytes.
 */
export function readVarint(
  buf: Uint8Array,
  offset: number,
): [value: number, bytesRead: number] {
  let res = 0;
  for (let i = 0; i < 8; i++) {
    if (offset + i >= buf.length) return [res, i];
    const b = buf[offset + i]!;
    res = res * 128 + (b & 0x7f);
    if ((b & 0x80) === 0) return [res, i + 1];
  }
  if (offset + 8 < buf.length) {
    const b = buf[offset + 8]!;
    res = res * 256 + b;
    return [res, 9];
  }
  return [res, 8];
}

/**
 * Parses a SQLite record payload according to the SQLite record format specification.
 */
export function parseSqliteRecord(payload: Uint8Array): SqliteValue[] {
  let pos = 0;
  const [headerLen, hlBytes] = readVarint(payload, pos);
  pos += hlBytes;

  const serialTypes: number[] = [];
  while (pos < headerLen) {
    const [st, stBytes] = readVarint(payload, pos);
    serialTypes.push(st);
    pos += stBytes;
  }

  const values: SqliteValue[] = [];
  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );
  let dataPos = headerLen;
  const decoder = new TextDecoder();

  for (const st of serialTypes) {
    if (st === 0) {
      values.push(null);
    } else if (st === 1) {
      if (dataPos < payload.length) {
        values.push(view.getInt8(dataPos));
        dataPos += 1;
      } else {
        values.push(null);
      }
    } else if (st === 2) {
      if (dataPos + 2 <= payload.length) {
        values.push(view.getInt16(dataPos, false));
        dataPos += 2;
      } else {
        values.push(null);
      }
    } else if (st === 3) {
      if (dataPos + 3 <= payload.length) {
        const b0 = payload[dataPos]!;
        const b1 = payload[dataPos + 1]!;
        const b2 = payload[dataPos + 2]!;
        let val = (b0 << 16) | (b1 << 8) | b2;
        if (val & 0x800000) val -= 0x1000000;
        values.push(val);
        dataPos += 3;
      } else {
        values.push(null);
      }
    } else if (st === 4) {
      if (dataPos + 4 <= payload.length) {
        values.push(view.getInt32(dataPos, false));
        dataPos += 4;
      } else {
        values.push(null);
      }
    } else if (st === 5) {
      if (dataPos + 6 <= payload.length) {
        const hi = view.getInt16(dataPos, false);
        const lo = view.getUint32(dataPos + 2, false);
        values.push(hi * 4294967296 + lo);
        dataPos += 6;
      } else {
        values.push(null);
      }
    } else if (st === 6) {
      if (dataPos + 8 <= payload.length) {
        values.push(Number(view.getBigInt64(dataPos, false)));
        dataPos += 8;
      } else {
        values.push(null);
      }
    } else if (st === 7) {
      if (dataPos + 8 <= payload.length) {
        values.push(view.getFloat64(dataPos, false));
        dataPos += 8;
      } else {
        values.push(null);
      }
    } else if (st === 8) {
      values.push(0);
    } else if (st === 9) {
      values.push(1);
    } else if (st >= 12 && st % 2 === 0) {
      const len = (st - 12) / 2;
      if (dataPos + len <= payload.length) {
        values.push(payload.subarray(dataPos, dataPos + len));
        dataPos += len;
      } else {
        values.push(null);
      }
    } else if (st >= 13 && st % 2 === 1) {
      const len = (st - 13) / 2;
      if (dataPos + len <= payload.length) {
        values.push(decoder.decode(payload.subarray(dataPos, dataPos + len)));
        dataPos += len;
      } else {
        values.push(null);
      }
    } else {
      values.push(null);
    }
  }

  return values;
}

/**
 * Traverses a SQLite table B-Tree (leaf and interior pages) and returns all rows.
 */
export function readTableRows(
  dbBytes: Uint8Array,
  rootPageNum: number,
): SqliteRow[] {
  if (dbBytes.length < 100) return [];

  const rawPageSize = (dbBytes[16]! << 8) | dbBytes[17]!;
  const pageSize = rawPageSize === 1 ? 65536 : rawPageSize || 4096;
  const rows: SqliteRow[] = [];
  const visited = new Set<number>();

  const view = new DataView(
    dbBytes.buffer,
    dbBytes.byteOffset,
    dbBytes.byteLength,
  );

  function visitPage(pageNum: number) {
    if (pageNum <= 0 || visited.has(pageNum)) return;
    visited.add(pageNum);

    const pageOffset = (pageNum - 1) * pageSize;
    if (pageOffset + 8 > dbBytes.length) return;

    const isPage1 = pageNum === 1;
    const headerOffset = pageOffset + (isPage1 ? 100 : 0);
    const pageType = dbBytes[headerOffset];

    if (pageType === 0x0d) {
      // Leaf table page
      const cellCount = view.getUint16(headerOffset + 3, false);
      const cellPointerArrayOffset = headerOffset + 8;

      for (let i = 0; i < cellCount; i++) {
        const ptrOffset = cellPointerArrayOffset + i * 2;
        if (ptrOffset + 2 > dbBytes.length) break;

        const cellOffset = pageOffset + view.getUint16(ptrOffset, false);
        if (cellOffset >= dbBytes.length) continue;

        const [payloadLen, pLenBytes] = readVarint(dbBytes, cellOffset);
        const [rowid, rowidBytes] = readVarint(
          dbBytes,
          cellOffset + pLenBytes,
        );
        const payloadStart = cellOffset + pLenBytes + rowidBytes;
        const payloadEnd = Math.min(dbBytes.length, payloadStart + payloadLen);

        const payload = dbBytes.subarray(payloadStart, payloadEnd);
        const record = parseSqliteRecord(payload);
        rows.push({ rowid, record });
      }
    } else if (pageType === 0x05) {
      // Interior table page
      const cellCount = view.getUint16(headerOffset + 3, false);
      const rightMostChild = view.getUint32(headerOffset + 8, false);
      const cellPointerArrayOffset = headerOffset + 12;

      for (let i = 0; i < cellCount; i++) {
        const ptrOffset = cellPointerArrayOffset + i * 2;
        if (ptrOffset + 2 > dbBytes.length) break;

        const cellOffset = pageOffset + view.getUint16(ptrOffset, false);
        if (cellOffset + 4 > dbBytes.length) continue;

        const childPage = view.getUint32(cellOffset, false);
        visitPage(childPage);
      }

      visitPage(rightMostChild);
    }
  }

  visitPage(rootPageNum);
  return rows;
}

/**
 * Reads sqlite_master (page 1) to index all database tables and their root pages.
 */
export function readSqliteMaster(
  dbBytes: Uint8Array,
): Map<string, SqliteMasterEntry> {
  const masterRows = readTableRows(dbBytes, 1);
  const tables = new Map<string, SqliteMasterEntry>();

  for (const r of masterRows) {
    const type = typeof r.record[0] === "string" ? r.record[0] : "";
    const name = typeof r.record[1] === "string" ? r.record[1] : "";
    const tblName = typeof r.record[2] === "string" ? r.record[2] : "";
    const rootpage = typeof r.record[3] === "number" ? r.record[3] : 0;
    const sql = typeof r.record[4] === "string" ? r.record[4] : "";

    if (name) {
      tables.set(name, { type, name, tblName, rootpage, sql });
    }
  }

  return tables;
}

/* ========================================================================== */
/* Stage 3: Clinical Data Mapping and Schema Validation                       */
/* ========================================================================== */

interface IntermediateDayEntry {
  date: string;
  bleeding?: BleedingIntensity;
  symptoms?: string[];
  mood?: string[];
  sex?: "unprotected";
  note?: string;
  updatedAt: number;
}

/**
 * Converts Period Calendar database into a fully validated regl-backup-v1 payload.
 */
export async function convertPeriodCalendarToRegl(
  backupBytes: Uint8Array,
): Promise<ValidatedBackupPayload> {
  const dbBytes = await extractCloudDbFromBackup(backupBytes);
  const tables = readSqliteMaster(dbBytes);

  // 1. Read User Settings (default cycle length)
  let defaultCycle = 28;
  const userTable = tables.get("User");
  if (userTable) {
    const userRows = readTableRows(dbBytes, userTable.rootpage);
    if (userRows.length > 0 && typeof userRows[0]?.record[4] === "string") {
      try {
        const settingsJson = JSON.parse(userRows[0].record[4]) as Record<
          string,
          unknown
        >;
        for (const group of Object.values(settingsJson)) {
          if (Array.isArray(group)) {
            for (const item of group) {
              if (
                item &&
                typeof item === "object" &&
                "key" in item &&
                "value" in item &&
                item.key === "period_length" &&
                typeof item.value === "number"
              ) {
                defaultCycle = item.value;
              }
            }
          }
        }
      } catch {
        // Fallback to default 28
      }
    }
  }

  const daysMap = new Map<string, IntermediateDayEntry>();

  // 2. Read Period table (bleeding flow & cycles)
  const periodTable = tables.get("Period");
  if (periodTable) {
    const periodRows = readTableRows(dbBytes, periodTable.rootpage);
    for (const r of periodRows) {
      const dtInt = typeof r.record[4] === "number" ? r.record[4] : null;
      const periodDur = typeof r.record[5] === "number" ? r.record[5] : null;
      if (!dtInt || !periodDur || periodDur === 0) continue;

      const dtStr = String(dtInt);
      if (dtStr.length < 8) continue;
      const y = parseInt(dtStr.slice(0, 4), 10);
      const m = parseInt(dtStr.slice(4, 6), 10) - 1;
      const d = parseInt(dtStr.slice(6, 8), 10);

      const dur = Math.abs(periodDur);
      for (let offset = 0; offset < dur; offset++) {
        const curDate = new Date(Date.UTC(y, m, d + offset));
        const isoDate = curDate.toISOString().slice(0, 10);

        let intensity: BleedingIntensity = "medium";
        if (dur === 1) {
          intensity = "medium";
        } else if (dur === 2) {
          intensity = offset === 0 ? "heavy" : "medium";
        } else if (dur === 3) {
          intensity =
            offset === 0 ? "heavy" : offset === 1 ? "medium" : "light";
        } else if (dur >= 4) {
          if (offset === 0) {
            intensity = "heavy";
          } else if (offset === 1) {
            intensity = dur >= 5 ? "heavy" : "medium";
          } else if (offset === 2) {
            intensity = "medium";
          } else {
            intensity = "light";
          }
        }

        const existing = daysMap.get(isoDate) ?? {
          date: isoDate,
          updatedAt: curDate.getTime(),
        };
        existing.bleeding = intensity;
        daysMap.set(isoDate, existing);
      }
    }
  }

  // 3. Read Note table (notes, symptoms, mood, intimacy)
  const noteTable = tables.get("Note");
  if (noteTable) {
    const noteRows = readTableRows(dbBytes, noteTable.rootpage);
    for (const r of noteRows) {
      const dtInt = typeof r.record[1] === "number" ? r.record[1] : null;
      if (!dtInt) continue;

      const dtStr = String(dtInt);
      if (dtStr.length < 8) continue;
      const y = parseInt(dtStr.slice(0, 4), 10);
      const m = parseInt(dtStr.slice(4, 6), 10) - 1;
      const d = parseInt(dtStr.slice(6, 8), 10);

      const curDate = new Date(Date.UTC(y, m, d));
      const isoDate = curDate.toISOString().slice(0, 10);

      const updateTime =
        typeof r.record[3] === "number" && r.record[3] > 0
          ? r.record[3]
          : curDate.getTime();
      const symptomStr = typeof r.record[8] === "string" ? r.record[8] : "";
      const moodStr = typeof r.record[9] === "string" ? r.record[9] : "";
      const noteStr = typeof r.record[10] === "string" ? r.record[10] : "";
      const sextimes = typeof r.record[14] === "number" ? r.record[14] : 0;

      const entry = daysMap.get(isoDate) ?? {
        date: isoDate,
        updatedAt: updateTime,
      };

      if (noteStr.trim()) {
        entry.note = noteStr.trim();
      }
      if (sextimes > 0) {
        entry.sex = "unprotected";
      }

      // Symptom mapping (24: cramps, 12: headache)
      const symList: string[] = [];
      if (symptomStr.includes("24:")) symList.push("cramps");
      if (symptomStr.includes("12:")) symList.push("headache");
      if (symList.length > 0) {
        entry.symptoms = symList;
      }

      // Mood mapping (10: anxious, 31: tired, 7: angry)
      const moodList: string[] = [];
      if (moodStr.includes("10")) moodList.push("anxious");
      if (moodStr.includes("31")) moodList.push("tired");
      if (moodStr.includes("7")) moodList.push("angry");
      if (moodList.length > 0) {
        entry.mood = moodList;
      }

      entry.updatedAt = Math.max(entry.updatedAt, updateTime);
      daysMap.set(isoDate, entry);
    }
  }

  // 4. Sort and construct strictly-typed DayEntry list
  const sortedDays: ValidatedDayEntry[] = Array.from(daysMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date: d.date,
      updatedAt: d.updatedAt,
      ...(d.bleeding ? { bleeding: d.bleeding } : {}),
      ...(d.symptoms && d.symptoms.length > 0 ? { symptoms: d.symptoms } : {}),
      ...(d.mood && d.mood.length > 0 ? { mood: d.mood } : {}),
      ...(d.sex ? { sex: d.sex } : {}),
      ...(d.note ? { note: d.note } : {}),
    }));

  const rawPayload = {
    format: "regl-backup-v1" as const,
    exportedAt: new Date().toISOString(),
    days: sortedDays,
    settings: {
      trackingMode: "symptothermal" as const,
      defaultCycleLength: defaultCycle,
      theme: "auto" as const,
      reminderBbtEnabled: false,
      reminderBbtTime: "07:00",
      reminderPeriodDaysBefore: 2,
      onboardingCompleted: true,
    },
  };

  // 5. Final schema validation
  const parsed = v.parse(BackupPayloadSchema, rawPayload);
  return parsed;
}


