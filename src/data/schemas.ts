import * as v from "valibot";
import { parseISODate } from "../core/date";

export const BleedingSchema = v.picklist([
  "spotting",
  "light",
  "medium",
  "heavy",
]);
export const MucusSensationSchema = v.picklist([
  "dry",
  "nothing",
  "moist",
  "wet",
]);
export const MucusAppearanceSchema = v.picklist([
  "none",
  "thick",
  "creamy",
  "clear",
  "stretchy",
]);
export const DisturbanceSchema = v.picklist([
  "alcohol",
  "illness",
  "badSleep",
  "lateMeasure",
  "medication",
  "travel",
]);

export const BbtRecordSchema = v.object({
  value: v.number(), // CentiCelsius e.g. 3665
  time: v.optional(v.string()),
  disturbances: v.optional(v.array(DisturbanceSchema)),
  excluded: v.optional(v.boolean()),
});

export const MucusRecordSchema = v.object({
  sensation: MucusSensationSchema,
  appearance: MucusAppearanceSchema,
});

export const CervixRecordSchema = v.object({
  position: v.optional(v.picklist(["low", "high"])),
  firmness: v.optional(v.picklist(["firm", "soft"])),
  opening: v.optional(v.picklist(["closed", "open"])),
});

export const DayEntrySchema = v.object({
  date: v.pipe(
    v.string(),
    v.regex(/^\d{4}-\d{2}-\d{2}$/),
    v.check((val) => {
      try {
        parseISODate(val);
        return true;
      } catch {
        return false;
      }
    }, "Geçersiz takvim tarihi."),
  ),
  bleeding: v.optional(BleedingSchema),
  cycleStartOverride: v.optional(v.boolean()),
  bbt: v.optional(BbtRecordSchema),
  mucus: v.optional(MucusRecordSchema),
  cervix: v.optional(CervixRecordSchema),
  symptoms: v.optional(v.array(v.string())),
  mood: v.optional(v.array(v.string())),
  sex: v.optional(v.picklist(["none", "protected", "unprotected"])),
  note: v.optional(v.string()),
  updatedAt: v.number(),
});

export const UserSettingsSchema = v.object({
  trackingMode: v.picklist(["basic", "symptothermal"]),
  goal: v.optional(
    v.picklist(["avoid_pregnancy", "conceive", "track_only"]),
  ),
  defaultCycleLength: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(15),
    v.maxValue(60),
  ),
  theme: v.picklist(["auto", "dark", "light"]),
  reminderBbtEnabled: v.boolean(),
  reminderBbtTime: v.string(), // '07:00'
  reminderPeriodDaysBefore: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(14),
  ), // 2
  lastBackupDate: v.optional(v.string()),
  onboardingCompleted: v.optional(v.boolean()),
  lockEnabled: v.optional(v.boolean()),
  lockEnvelopeJson: v.optional(v.string()),
  lockAutoMinutes: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(60)),
  ),
});

export const BackupPayloadSchema = v.object({
  format: v.literal("regl-backup-v1"),
  exportedAt: v.string(),
  days: v.array(DayEntrySchema),
  settings: v.optional(UserSettingsSchema),
});

export const EncryptedPayloadSchema = v.object({
  iv: v.string(),
  ciphertext: v.string(),
});

export const WrappedKeyEnvelopeSchema = v.object({
  salt: v.string(),
  iterations: v.pipe(v.number(), v.integer(), v.minValue(100000)),
  iv: v.string(),
  wrappedDek: v.string(),
  verifierIv: v.string(),
  verifierCiphertext: v.string(),
});

export const EncryptedVaultSchema = v.object({
  format: v.literal("regl-vault-v1"),
  exportedAt: v.string(),
  envelope: WrappedKeyEnvelopeSchema,
  encryptedPayload: EncryptedPayloadSchema,
});

export type ValidatedDayEntry = v.InferOutput<typeof DayEntrySchema>;
export type ValidatedUserSettings = v.InferOutput<typeof UserSettingsSchema>;
export type ValidatedBackupPayload = v.InferOutput<typeof BackupPayloadSchema>;
export type ValidatedEncryptedVault = v.InferOutput<typeof EncryptedVaultSchema>;
