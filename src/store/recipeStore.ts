import type { Recipe } from '../domain/schema';
import { openDatabase } from './db';

export interface RecipeChange {
  put: Recipe[];
  remove: string[];
  /** New feed revision, or null to leave the stored one as it is. */
  revision: string | null;
}

export interface RecipeStore {
  all(): Promise<Recipe[]>;
  revision(): Promise<string | null>;
  hashes(): Promise<Map<string, string>>;
  /** All-or-nothing: either every change lands or none does. */
  apply(change: RecipeChange): Promise<void>;
  image(id: string, hash: string): Promise<Blob | null>;
  saveImage(id: string, hash: string, blob: Blob): Promise<void>;
}

const REVISION_KEY = 'feed.revision';

export function createRecipeStore(dbName?: string): RecipeStore {
  return {
    async all() {
      return (await openDatabase(dbName)).getAll('recipes');
    },
    async revision() {
      return ((await (await openDatabase(dbName)).get('kv', REVISION_KEY)) as string | undefined) ?? null;
    },
    async hashes() {
      const recipes = await (await openDatabase(dbName)).getAll('recipes');
      return new Map(recipes.map((r) => [r.id, r.hash]));
    },
    async apply({ put, remove, revision }) {
      const db = await openDatabase(dbName);
      const tx = db.transaction(['recipes', 'kv', 'images'], 'readwrite');
      const recipes = tx.objectStore('recipes');
      for (const recipe of put) void recipes.put(recipe);
      for (const id of remove) {
        void recipes.delete(id);
        void tx.objectStore('images').delete(id);
      }
      if (revision != null) void tx.objectStore('kv').put(revision, REVISION_KEY);
      await tx.done;
    },
    async image(id, hash) {
      const entry = await (await openDatabase(dbName)).get('images', id);
      return entry && entry.hash === hash ? entry.blob : null;
    },
    async saveImage(id, hash, blob) {
      await (await openDatabase(dbName)).put('images', { hash, blob }, id);
    },
  };
}
