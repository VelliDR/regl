import * as v from "valibot";

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
  date: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/)),
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
  defaultCycleLength: v.number(),
  theme: v.picklist(["auto", "dark", "light"]),
  reminderBbtEnabled: v.boolean(),
  reminderBbtTime: v.string(), // '07:00'
  reminderPeriodDaysBefore: v.number(), // 2
  lastBackupDate: v.optional(v.string()),
  onboardingCompleted: v.optional(v.boolean()),
  lockEnabled: v.optional(v.boolean()),
  lockEnvelopeJson: v.optional(v.string()),
  lockAutoMinutes: v.optional(v.number()),
});

export const BackupPayloadSchema = v.object({
  format: v.literal("regl-backup-v1"),
  exportedAt: v.string(),
  days: v.array(DayEntrySchema),
  settings: v.optional(UserSettingsSchema),
});

export type ValidatedDayEntry = v.InferOutput<typeof DayEntrySchema>;
export type ValidatedUserSettings = v.InferOutput<typeof UserSettingsSchema>;
export type ValidatedBackupPayload = v.InferOutput<typeof BackupPayloadSchema>;
