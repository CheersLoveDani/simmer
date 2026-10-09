import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Recipe } from '../domain/schema';

interface SimmerDB extends DBSchema {
  recipes: { key: string; value: Recipe };
  /** Small values: feed revision, sync times, persisted app state. */
  kv: { key: string; value: unknown };
  images: { key: string; value: { hash: string; blob: Blob } };
}

export type Database = IDBPDatabase<SimmerDB>;

const connections = new Map<string, Promise<Database>>();

export function openDatabase(name = 'simmer'): Promise<Database> {
  let connection = connections.get(name);
  if (!connection) {
    connection = openDB<SimmerDB>(name, 1, {
      upgrade(db) {
        db.createObjectStore('recipes', { keyPath: 'id' });
        db.createObjectStore('kv');
        db.createObjectStore('images');
      },
    });
    connections.set(name, connection);
  }
  return connection;
}

export async function kvGet<T>(key: string, dbName?: string): Promise<T | undefined> {
  return (await (await openDatabase(dbName)).get('kv', key)) as T | undefined;
}

export async function kvSet(key: string, value: unknown, dbName?: string): Promise<void> {
  await (await openDatabase(dbName)).put('kv', value, key);
}

export async function kvDelete(key: string, dbName?: string): Promise<void> {
  await (await openDatabase(dbName)).delete('kv', key);
}
