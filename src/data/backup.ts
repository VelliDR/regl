import * as v from 'valibot';
import { DayEntry, ISODate } from '../core/types';
import { dayRepository } from './repo';
import {
  BackupPayloadSchema,
  ValidatedBackupPayload,
  ValidatedUserSettings,
} from './schemas';

export interface ImportSummary {
  readonly importedCount: number;
  readonly skippedCount: number;
  readonly mode: 'merge' | 'replace';
}

/**
 * Serializes all day entries and user settings into a JSON backup payload.
 */
export function exportToJson(
  days: readonly DayEntry[],
  settings?: ValidatedUserSettings
): string {
  const payload: ValidatedBackupPayload = {
    format: 'regl-backup-v1',
    exportedAt: new Date().toISOString(),
    days: days as unknown as ValidatedBackupPayload['days'],
    ...(settings ? { settings } : {}),
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Serializes entries into CSV format for easy sharing with a physician or spreadsheet import.
 */
export function exportToCsv(days: readonly DayEntry[]): string {
  const header = [
    'Tarih',
    'Kanama',
    'BBT (°C)',
    'Ölçüm Saati',
    'Bozucu Etkenler',
    'Ölçüm Hariç',
    'Mukus His',
    'Mukus Görünüm',
    'Belirtiler',
    'Ruh Hali',
    'Cinsel Aktivite',
    'Not',
  ];

  const rows = days.map((d) => {
    const bbtDeg = d.bbt ? (d.bbt.value / 100).toFixed(2) : '';
    const bbtTime = d.bbt?.time ?? '';
    const bbtDist = d.bbt?.disturbances ? d.bbt.disturbances.join(';') : '';
    const bbtExc = d.bbt?.excluded ? 'Evet' : '';
    const mucusSens = d.mucus?.sensation ?? '';
    const mucusApp = d.mucus?.appearance ?? '';
    const symptoms = d.symptoms ? d.symptoms.join(';') : '';
    const mood = d.mood ? d.mood.join(';') : '';
    const sex = d.sex ?? '';
    const note = d.note ? `"${d.note.replace(/"/g, '""')}"` : '';

    return [
      d.date,
      d.bleeding ?? '',
      bbtDeg,
      bbtTime,
      bbtDist,
      bbtExc,
      mucusSens,
      mucusApp,
      symptoms,
      mood,
      sex,
      note,
    ].join(',');
  });

  return [header.join(','), ...rows].join('\r\n');
}

/**
 * Validates a JSON backup string with Valibot schema validation.
 */
export function validateBackupString(jsonString: string): ValidatedBackupPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new Error(`JSON ayrıştırma hatası: ${(err as Error).message}`);
  }

  const result = v.safeParse(BackupPayloadSchema, parsed);
  if (!result.success) {
    const issues = result.issues.map((i) => i.message).join(', ');
    throw new Error(`Yedekleme dosyası formatı geçersiz: ${issues}`);
  }

  return result.output;
}

/**
 * Imports a validated backup into the database with conflict handling.
 */
export async function importBackup(
  payload: ValidatedBackupPayload,
  mode: 'merge' | 'replace'
): Promise<ImportSummary> {
  const days = payload.days as unknown as DayEntry[];

  if (mode === 'replace') {
    await dayRepository.clearAllDays();
    await dayRepository.bulkSaveDays(days);
    if (payload.settings) {
      await dayRepository.saveSettings(payload.settings);
    }
    return {
      importedCount: days.length,
      skippedCount: 0,
      mode: 'replace',
    };
  }

  // 'merge' mode: only overwrite if imported updatedAt >= existing updatedAt
  const existingDays = await dayRepository.getAllDays();
  const existingMap = new Map<ISODate, DayEntry>();
  for (const ed of existingDays) {
    existingMap.set(ed.date, ed);
  }

  const toSave: DayEntry[] = [];
  let skippedCount = 0;

  for (const imported of days) {
    const existing = existingMap.get(imported.date);
    if (!existing || imported.updatedAt >= existing.updatedAt) {
      toSave.push(imported);
    } else {
      skippedCount++;
    }
  }

  await dayRepository.bulkSaveDays(toSave);

  if (payload.settings) {
    await dayRepository.saveSettings(payload.settings);
  }

  return {
    importedCount: toSave.length,
    skippedCount,
    mode: 'merge',
  };
}
