import * as v from "valibot";
import { DayEntry, ISODate } from "../core/types";
import { decryptWithDek, encryptWithDek } from "./crypto";
import { EncryptedDayRecord, getDb, isEncryptedDayRecord } from "./db";
import { DayEntrySchema, ValidatedUserSettings } from "./schemas";

export const DEFAULT_USER_SETTINGS: ValidatedUserSettings = {
  trackingMode: "symptothermal",
  defaultCycleLength: 28,
  theme: "auto",
  reminderBbtEnabled: true,
  reminderBbtTime: "07:00",
  reminderPeriodDaysBefore: 2,
};

export class DayRepository {
  private activeDek: CryptoKey | null = null;

  /**
   * Sets or clears the in-memory non-extractable Data Encryption Key (DEK).
   */
  setActiveDek(dek: CryptoKey | null): void {
    this.activeDek = dek;
  }

  getActiveDek(): CryptoKey | null {
    return this.activeDek;
  }

  clearActiveDek(): void {
    this.activeDek = null;
  }

  private async isLockConfigured(): Promise<boolean> {
    const settings = await this.getSettings();
    return Boolean(settings.lockEnabled && settings.lockEnvelopeJson);
  }

  private async serializeForStorage(
    entry: DayEntry,
    dekOverride?: CryptoKey | null,
  ): Promise<DayEntry | EncryptedDayRecord> {
    const dek = dekOverride !== undefined ? dekOverride : this.activeDek;
    if (dek) {
      const payload = await encryptWithDek(JSON.stringify(entry), dek);
      return {
        date: entry.date,
        __enc: 1,
        iv: payload.iv,
        ciphertext: payload.ciphertext,
      };
    }

    if (await this.isLockConfigured()) {
      throw new Error(
        "Kasa kilitli iken şifresiz sağlık kaydı yazılamaz. Lütfen kilidi açın.",
      );
    }

    return entry;
  }

  private async deserializeFromStorage(
    raw: DayEntry | EncryptedDayRecord,
    dekOverride?: CryptoKey | null,
  ): Promise<DayEntry> {
    if (!isEncryptedDayRecord(raw)) {
      return raw;
    }

    const dek = dekOverride !== undefined ? dekOverride : this.activeDek;
    if (!dek) {
      throw new Error(
        "Kasa kilitli: Şifreli sağlık kayıtları anahtar olmadan okunamaz.",
      );
    }

    const plainJson = await decryptWithDek(
      { iv: raw.iv, ciphertext: raw.ciphertext },
      dek,
    );
    const parsed = JSON.parse(plainJson) as unknown;
    const validated = v.parse(DayEntrySchema, parsed);
    return validated as unknown as DayEntry;
  }

  /**
   * Retrieves and decrypts all daily records from IndexedDB.
   */
  async getAllDays(): Promise<DayEntry[]> {
    const db = await getDb();
    const rawRecords = await db.getAll("days");
    if (rawRecords.length === 0) return [];

    const hasEncrypted = rawRecords.some((r) => isEncryptedDayRecord(r));
    if (hasEncrypted && !this.activeDek) {
      throw new Error(
        "Kasa kilitli: Şifreli sağlık kayıtları anahtar olmadan okunamaz.",
      );
    }

    return Promise.all(
      rawRecords.map((raw) => this.deserializeFromStorage(raw)),
    );
  }

  /**
   * Retrieves and decrypts a single day entry by ISO date.
   */
  async getDay(date: ISODate): Promise<DayEntry | undefined> {
    const db = await getDb();
    const raw = await db.get("days", date);
    if (!raw) return undefined;
    return this.deserializeFromStorage(raw);
  }

  /**
   * Encrypts (if lock active) and saves/updates a day entry.
   */
  async saveDay(entry: DayEntry): Promise<void> {
    const stored = await this.serializeForStorage(entry);
    const db = await getDb();
    await db.put("days", stored);
  }

  /**
   * Deletes a day entry by date.
   */
  async deleteDay(date: ISODate): Promise<void> {
    if (!this.activeDek && (await this.isLockConfigured())) {
      throw new Error("Kasa kilitli iken kayıt silinemez.");
    }
    const db = await getDb();
    await db.delete("days", date);
  }

  /**
   * Bulk inserts or updates a list of days in a single atomic transaction.
   */
  async bulkSaveDays(entries: readonly DayEntry[]): Promise<void> {
    if (entries.length === 0) return;

    if (!this.activeDek && (await this.isLockConfigured())) {
      throw new Error("Kasa kilitli iken toplu kayıt yazılamaz.");
    }

    const dek = this.activeDek;
    const recordsToStore = await Promise.all(
      entries.map((entry) => this.serializeForStorage(entry, dek)),
    );

    const db = await getDb();
    const tx = db.transaction("days", "readwrite");
    for (const rec of recordsToStore) {
      await tx.store.put(rec);
    }
    await tx.done;
  }

  /**
   * Atomically replaces all days in a single IndexedDB transaction.
   * All encryption work completes before clearing existing data.
   */
  async replaceAllDays(entries: readonly DayEntry[]): Promise<void> {
    if (!this.activeDek && (await this.isLockConfigured())) {
      throw new Error("Kasa kilitli iken veri geri yüklenemez.");
    }

    const dek = this.activeDek;
    const recordsToStore = await Promise.all(
      entries.map((entry) => this.serializeForStorage(entry, dek)),
    );

    const db = await getDb();
    const tx = db.transaction("days", "readwrite");
    await tx.store.clear();
    for (const rec of recordsToStore) {
      await tx.store.put(rec);
    }
    await tx.done;
  }

  /**
   * Migrates any plaintext records in 'days' store to AES-GCM encrypted records.
   */
  async encryptAllPlaintextDays(dek: CryptoKey): Promise<number> {
    const db = await getDb();
    const rawRecords = await db.getAll("days");
    const plaintextEntries = rawRecords.filter(
      (rec): rec is DayEntry => !isEncryptedDayRecord(rec),
    );

    if (plaintextEntries.length === 0) {
      return 0;
    }

    const encryptedRecords = await Promise.all(
      plaintextEntries.map((entry) => this.serializeForStorage(entry, dek)),
    );

    const tx = db.transaction("days", "readwrite");
    for (const rec of encryptedRecords) {
      await tx.store.put(rec);
    }
    await tx.done;
    return encryptedRecords.length;
  }

  /**
   * Decrypts all encrypted records in 'days' store back to plaintext (when lock is disabled).
   */
  async decryptAllEncryptedDays(dek: CryptoKey): Promise<number> {
    const db = await getDb();
    const rawRecords = await db.getAll("days");
    const encryptedRecords = rawRecords.filter((rec) =>
      isEncryptedDayRecord(rec),
    );

    if (encryptedRecords.length === 0) {
      return 0;
    }

    const plaintextEntries = await Promise.all(
      encryptedRecords.map((rec) => this.deserializeFromStorage(rec, dek)),
    );

    const tx = db.transaction("days", "readwrite");
    for (const entry of plaintextEntries) {
      await tx.store.put(entry);
    }
    await tx.done;
    return plaintextEntries.length;
  }

  /**
   * Re-encrypts all records with a new DEK (used during passphrase rotation).
   */
  async reEncryptAllDays(
    oldDek: CryptoKey,
    newDek: CryptoKey,
  ): Promise<number> {
    const db = await getDb();
    const rawRecords = await db.getAll("days");
    if (rawRecords.length === 0) return 0;

    const decryptedEntries = await Promise.all(
      rawRecords.map((rec) => this.deserializeFromStorage(rec, oldDek)),
    );
    const reEncrypted = await Promise.all(
      decryptedEntries.map((entry) => this.serializeForStorage(entry, newDek)),
    );

    const tx = db.transaction("days", "readwrite");
    for (const rec of reEncrypted) {
      await tx.store.put(rec);
    }
    await tx.done;
    return reEncrypted.length;
  }

  /**
   * Clears all days from database (for full restore or reset).
   */
  async clearAllDays(): Promise<void> {
    const db = await getDb();
    await db.clear("days");
  }

  /**
   * Completely wipes all application stores (days, settings, meta).
   */
  async clearAllData(): Promise<void> {
    this.activeDek = null;
    const db = await getDb();
    const tx = db.transaction(["days", "settings", "meta"], "readwrite");
    await tx.objectStore("days").clear();
    await tx.objectStore("settings").clear();
    await tx.objectStore("meta").clear();
    await tx.done;
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
