import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { DayEntry, ISODate } from '../core/types';
import { ValidatedUserSettings } from './schemas';

export interface ReglDBSchema extends DBSchema {
  days: {
    key: ISODate;
    value: DayEntry;
  };
  settings: {
    key: string;
    value: ValidatedUserSettings;
  };
  meta: {
    key: string;
    value: {
      schemaVersion: number;
      createdAt: number;
      lastOpenedAt?: number;
    };
  };
}

export const DB_NAME = 'regl-db';
export const CURRENT_DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ReglDBSchema>> | null = null;

/**
 * Opens or retrieves the singleton IndexedDB connection.
 * Handles schema creation and forward migrations safely.
 */
export function getDb(): Promise<IDBPDatabase<ReglDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<ReglDBSchema>(DB_NAME, CURRENT_DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, _transaction) {
        if (oldVersion < 1) {
          // Schema v1 initialization
          // The 'days' store does NOT index BBT or bleeding, keeping records unexposed.
          if (!db.objectStoreNames.contains('days')) {
            db.createObjectStore('days', { keyPath: 'date' });
          }
          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings');
          }
          if (!db.objectStoreNames.contains('meta')) {
            db.createObjectStore('meta');
          }
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Resets the connection handle (useful for testing or db deletion).
 */
export function closeDb(): void {
  if (dbPromise) {
    dbPromise.then((db) => db.close()).catch(() => {});
    dbPromise = null;
  }
}
