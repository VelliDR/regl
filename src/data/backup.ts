import * as v from "valibot";
import { DayEntry, ISODate } from "../core/types";
import {
  createKeyEnvelope,
  decryptWithDek,
  encryptWithDek,
  generateDek,
  unwrapDekFromEnvelope,
} from "./crypto";
import { dayRepository } from "./repo";
import {
  BackupPayloadSchema,
  EncryptedVaultSchema,
  ValidatedBackupPayload,
  ValidatedEncryptedVault,
  ValidatedUserSettings,
} from "./schemas";

export interface ImportSummary {
  readonly importedCount: number;
  readonly skippedCount: number;
  readonly mode: "merge" | "replace";
}

function sanitizeSettingsForExport(
  settings?: ValidatedUserSettings,
): ValidatedUserSettings | undefined {
  if (!settings) return undefined;
  const {
    lockEnabled: _lockEnabled,
    lockEnvelopeJson: _lockEnvelopeJson,
    ...safeSettings
  } = settings;
  return safeSettings;
}

/**
 * Serializes all day entries and user settings into a JSON backup payload.
 */
export function exportToJson(
  days: readonly DayEntry[],
  settings?: ValidatedUserSettings,
): string {
  const safeSettings = sanitizeSettingsForExport(settings);
  const payload: ValidatedBackupPayload = {
    format: "regl-backup-v1",
    exportedAt: new Date().toISOString(),
    days: days as unknown as ValidatedBackupPayload["days"],
    ...(safeSettings ? { settings: safeSettings } : {}),
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Serializes all day entries and settings into an AES-GCM + PBKDF2 encrypted .reglvault archive.
 */
export async function exportToEncryptedVault(
  days: readonly DayEntry[],
  settings: ValidatedUserSettings | undefined,
  passphrase: string,
): Promise<string> {
  if (passphrase.length < 4 || !passphrase.trim()) {
    throw new Error("Yedekleme parolası en az 4 karakter olmalıdır.");
  }

  const plainJson = exportToJson(days, settings);
  const dek = await generateDek();
  const { envelope, rawDek } = await createKeyEnvelope(passphrase, dek);
  const encryptedPayload = await encryptWithDek(plainJson, rawDek);

  const vault: ValidatedEncryptedVault = {
    format: "regl-vault-v1",
    exportedAt: new Date().toISOString(),
    envelope,
    encryptedPayload,
  };

  return JSON.stringify(vault, null, 2);
}

/**
 * Checks whether a backup string is a .reglvault encrypted payload.
 */
export function isEncryptedVaultString(jsonString: string): boolean {
  try {
    const parsed = JSON.parse(jsonString) as { format?: unknown };
    return parsed?.format === "regl-vault-v1";
  } catch {
    return false;
  }
}

/**
 * Decrypts and validates a .reglvault encrypted backup string using the user's passphrase.
 */
export async function decryptVaultBackup(
  vaultJsonString: string,
  passphrase: string,
): Promise<ValidatedBackupPayload> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(vaultJsonString);
  } catch (err) {
    throw new Error(`Vault JSON ayrıştırma hatası: ${(err as Error).message}`);
  }

  const result = v.safeParse(EncryptedVaultSchema, parsed);
  if (!result.success) {
    const issues = result.issues.map((i) => i.message).join(", ");
    throw new Error(`Şifreli kasa dosyası formatı geçersiz: ${issues}`);
  }

  const dek = await unwrapDekFromEnvelope(passphrase, result.output.envelope);
  const plainJson = await decryptWithDek(result.output.encryptedPayload, dek);
  return validateBackupString(plainJson);
}

function escapeCsvCell(rawValue: string): string {
  if (!rawValue) return "";
  // Defend against CSV formula injection in spreadsheet tools (Excel, Sheets)
  const sanitized = /^[=+\-@\t\r]/.test(rawValue)
    ? `'${rawValue}`
    : rawValue;
  if (/[",\n\r]/.test(sanitized) || sanitized !== rawValue) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

/**
 * Serializes entries into CSV format for easy sharing with a physician or spreadsheet import.
 * Includes UTF-8 BOM for proper Turkish character rendering in Excel.
 */
export function exportToCsv(days: readonly DayEntry[]): string {
  const header = [
    "Tarih",
    "Kanama",
    "BBT (°C)",
    "Ölçüm Saati",
    "Bozucu Etkenler",
    "Ölçüm Hariç",
    "Mukus His",
    "Mukus Görünüm",
    "Belirtiler",
    "Ruh Hali",
    "Cinsel Aktivite",
    "Not",
    "Serviks Konum",
    "Serviks Sertlik",
    "Serviks Açıklık",
  ];

  const rows = days.map((d) => {
    const bbtDeg = d.bbt ? (d.bbt.value / 100).toFixed(2) : "";
    const bbtTime = d.bbt?.time ?? "";
    const bbtDist = d.bbt?.disturbances ? d.bbt.disturbances.join(";") : "";
    const bbtExc = d.bbt?.excluded ? "Evet" : "";
    const mucusSens = d.mucus?.sensation ?? "";
    const mucusApp = d.mucus?.appearance ?? "";
    const symptoms = d.symptoms ? d.symptoms.join(";") : "";
    const mood = d.mood ? d.mood.join(";") : "";
    const sex = d.sex ?? "";
    const note = d.note ?? "";
    const cervixPos = d.cervix?.position ?? "";
    const cervixFirm = d.cervix?.firmness ?? "";
    const cervixOpen = d.cervix?.opening ?? "";

    return [
      d.date,
      d.bleeding ?? "",
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
      cervixPos,
      cervixFirm,
      cervixOpen,
    ]
      .map(escapeCsvCell)
      .join(",");
  });

  return `\uFEFF${[header.join(","), ...rows].join("\r\n")}`;
}

/**
 * Validates a JSON backup string with Valibot schema validation.
 */
export function validateBackupString(
  jsonString: string,
): ValidatedBackupPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new Error(`JSON ayrıştırma hatası: ${(err as Error).message}`);
  }

  const result = v.safeParse(BackupPayloadSchema, parsed);
  if (!result.success) {
    const issues = result.issues.map((i) => i.message).join(", ");
    throw new Error(`Yedekleme dosyası formatı geçersiz: ${issues}`);
  }

  return result.output;
}

/**
 * Imports a validated backup into the database with conflict handling.
 * Preserves local security/vault lock settings across restores.
 */
export async function importBackup(
  payload: ValidatedBackupPayload,
  mode: "merge" | "replace",
): Promise<ImportSummary> {
  const days = payload.days as unknown as DayEntry[];
  const currentSettings = await dayRepository.getSettings();

  const preserveSecuritySettings = (
    imported: ValidatedUserSettings,
  ): ValidatedUserSettings => {
    const {
      lockEnabled: _le,
      lockEnvelopeJson: _lej,
      lockAutoMinutes: _lam,
      ...safeImported
    } = imported;

    return {
      ...safeImported,
      ...(currentSettings.lockEnabled !== undefined
        ? { lockEnabled: currentSettings.lockEnabled }
        : {}),
      ...(currentSettings.lockEnvelopeJson !== undefined
        ? { lockEnvelopeJson: currentSettings.lockEnvelopeJson }
        : {}),
      ...(currentSettings.lockAutoMinutes !== undefined
        ? { lockAutoMinutes: currentSettings.lockAutoMinutes }
        : {}),
    };
  };

  if (mode === "replace") {
    await dayRepository.replaceAllDays(days);
    if (payload.settings) {
      await dayRepository.saveSettings(
        preserveSecuritySettings(payload.settings),
      );
    }
    return {
      importedCount: days.length,
      skippedCount: 0,
      mode: "replace",
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

  if (payload.settings && !currentSettings.onboardingCompleted) {
    await dayRepository.saveSettings(
      preserveSecuritySettings(payload.settings),
    );
  }

  return {
    importedCount: toSave.length,
    skippedCount,
    mode: "merge",
  };
}
