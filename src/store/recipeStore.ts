import { parseRecipe, parseThemes, type Recipe, type Theme } from '../domain/schema';
import { openDatabase } from './db';

export interface RecipeChange {
  put: Recipe[];
  remove: string[];
  /** New feed revision, or null to leave the stored one as it is. */
  revision: string | null;
  /** The full set of themes, replacing what is stored; omitted to leave them alone. */
  themes?: Theme[];
}

/** One library's recipes. Every library shares the database; each only sees its own. */
export interface RecipeStore {
  all(): Promise<Recipe[]>;
  revision(): Promise<string | null>;
  hashes(): Promise<Map<string, string>>;
  themes(): Promise<Theme[]>;
  /** All-or-nothing: either every change lands or none does. */
  apply(change: RecipeChange): Promise<void>;
  /** Forget this library entirely: recipes, photos, revision and themes. */
  clear(): Promise<void>;
  image(id: string, hash: string): Promise<Blob | null>;
  saveImage(id: string, hash: string, blob: Blob): Promise<void>;
}

/** The Simmer library itself. */
export const SIMMER = 'simmer';
/** Recipes people add themselves. */
export const MINE = 'mine';

// The main library keeps the keys it has always used, so stored data carries over.
const revisionKey = (source: string) => (source === SIMMER ? 'feed.revision' : `feed.revision:${source}`);
const themesKey = (source: string) => (source === SIMMER ? 'feed.themes' : `feed.themes:${source}`);

/** Every stored recipe, from every library, read through the schema. */
export async function allRecipes(dbName?: string): Promise<Recipe[]> {
  // Re-read through the schema so recipes saved by an older version get the fields added since.
  const stored = await (await openDatabase(dbName)).getAll('recipes');
  return stored.map(parseRecipe).filter((r): r is Recipe => r !== null);
}

export function createRecipeStore(dbName?: string, source: string = SIMMER): RecipeStore {
  const own = async () => (await allRecipes(dbName)).filter((r) => r.source === source);
  return {
    all: own,
    async revision() {
      return ((await (await openDatabase(dbName)).get('kv', revisionKey(source))) as string | undefined) ?? null;
    },
    async hashes() {
      // An unreadable stored recipe has no hash, so the next sync fetches it again.
      return new Map((await own()).map((r) => [r.id, r.hash]));
    },
    async themes() {
      return parseThemes(await (await openDatabase(dbName)).get('kv', themesKey(source)));
    },
    async apply({ put, remove, revision, themes }) {
      const mine = new Set((await own()).map((r) => r.id));
      const db = await openDatabase(dbName);
      const tx = db.transaction(['recipes', 'kv', 'images'], 'readwrite');
      const recipes = tx.objectStore('recipes');
      for (const recipe of put) void recipes.put({ ...recipe, source });
      for (const id of remove.filter((id) => mine.has(id))) {
        void recipes.delete(id);
        void tx.objectStore('images').delete(id);
      }
      if (revision != null) void tx.objectStore('kv').put(revision, revisionKey(source));
      if (themes) void tx.objectStore('kv').put(themes, themesKey(source));
      await tx.done;
    },
    async clear() {
      const ids = (await own()).map((r) => r.id);
      const db = await openDatabase(dbName);
      const tx = db.transaction(['recipes', 'kv', 'images'], 'readwrite');
      for (const id of ids) {
        void tx.objectStore('recipes').delete(id);
        void tx.objectStore('images').delete(id);
      }
      void tx.objectStore('kv').delete(revisionKey(source));
      void tx.objectStore('kv').delete(themesKey(source));
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
