import { DayEntry, ISODate } from "../core/types";
import { getDb } from "./db";
import { ValidatedUserSettings } from "./schemas";

export const DEFAULT_USER_SETTINGS: ValidatedUserSettings = {
  trackingMode: "symptothermal",
  defaultCycleLength: 28,
  theme: "auto",
  reminderBbtEnabled: true,
  reminderBbtTime: "07:00",
  reminderPeriodDaysBefore: 2,
};

export class DayRepository {
  /**
   * Retrieves all daily records from IndexedDB.
   */
  async getAllDays(): Promise<DayEntry[]> {
    const db = await getDb();
    return db.getAll("days");
  }

  /**
   * Retrieves a single day entry by ISO date.
   */
  async getDay(date: ISODate): Promise<DayEntry | undefined> {
    const db = await getDb();
    return db.get("days", date);
  }

  /**
   * Saves or updates a day entry.
   */
  async saveDay(entry: DayEntry): Promise<void> {
    const db = await getDb();
    await db.put("days", entry);
  }

  /**
   * Deletes a day entry by date.
   */
  async deleteDay(date: ISODate): Promise<void> {
    const db = await getDb();
    await db.delete("days", date);
  }

  /**
   * Bulk inserts or updates a list of days in a single atomic transaction.
   */
  async bulkSaveDays(entries: readonly DayEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const db = await getDb();
    const tx = db.transaction("days", "readwrite");
    for (const entry of entries) {
      await tx.store.put(entry);
    }
    await tx.done;
  }

  /**
   * Clears all days from database (for full restore or reset).
   */
  async clearAllDays(): Promise<void> {
    const db = await getDb();
    await db.clear("days");
  }

  /**
   * Retrieves user settings or defaults if not yet configured.
   */
  async getSettings(): Promise<ValidatedUserSettings> {
    const db = await getDb();
    const settings = await db.get("settings", "user-settings");
    return settings ?? DEFAULT_USER_SETTINGS;
  }

  /**
   * Saves updated user settings.
   */
  async saveSettings(settings: ValidatedUserSettings): Promise<void> {
    const db = await getDb();
    await db.put("settings", settings, "user-settings");
  }
}

export const dayRepository = new DayRepository();
