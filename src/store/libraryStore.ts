import { create } from 'zustand';
import type { Recipe, Theme } from '../domain/schema';
import { createSearchIndex, type SearchIndex } from '../domain/search';
import { themeSearchText } from '../domain/theme';
import { describeSync, seedIfEmpty, syncRecipes, type SyncResult } from '../sync/sync';
import { feedMirrors } from '../sync/config';
import { kvGet, kvSet } from './db';
import { useUser } from './userStore';
import { MINE, SIMMER, allRecipes, createRecipeStore } from './recipeStore';

export const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const LAST_SYNC_KEY = 'feed.lastSyncedAt';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'unsupported';

interface LibraryState {
  status: 'loading' | 'ready';
  recipes: Recipe[];
  byId: Map<string, Recipe>;
  themes: Map<string, Theme>;
  index: SearchIndex;
  syncState: SyncState;
  lastSyncedAt: number | null;
  lastResult: SyncResult | null;
  /** One-line summary of the most recent change, shown as a toast. */
  notice: string | null;
  /** How each recipe book fared on the last sync, by key. */
  bookStatus: Record<string, 'ok' | 'failed'>;
  init(): Promise<void>;
  sync(): Promise<SyncResult>;
  dismissNotice(): void;
  /** Forget a recipe book's recipes (the book itself lives in the user store). */
  removeBook(key: string): Promise<void>;
  /** Add or replace one of your own recipes, with the photo chosen for it. */
  saveOwn(recipe: Recipe, photo?: Blob): Promise<void>;
  deleteOwn(id: string): Promise<void>;
}

const store = createRecipeStore();
const own = createRecipeStore(undefined, MINE);

function view(recipes: Recipe[], themeList: Theme[]) {
  const sorted = [...recipes].sort((a, b) => a.title.localeCompare(b.title));
  const themes = new Map(themeList.map((t) => [t.id, t]));
  return {
    recipes: sorted,
    byId: new Map(sorted.map((r) => [r.id, r])),
    themes,
    index: createSearchIndex(sorted, (recipe) => themeSearchText(recipe, themes)),
  };
}

async function loadSeed() {
  const [manifest, bundle] = await Promise.all([import('@seed/manifest.json'), import('@seed/bundle.json')]);
  return { revision: manifest.default.revision, recipes: bundle.default.recipes as unknown[], themes: (manifest.default as { themes?: unknown }).themes };
}

let syncing: Promise<SyncResult> | null = null;

export const useLibrary = create<LibraryState>()((set, get) => ({
  status: 'loading',
  ...view([], []),
  syncState: 'idle',
  lastSyncedAt: null,
  lastResult: null,
  notice: null,
  bookStatus: {},

  async init() {
    if (get().status === 'ready') return;
    try {
      await seedIfEmpty(store, loadSeed);
    } catch {
      // A missing or unreadable snapshot only matters offline on first run.
    }
    const [recipes, themes, lastSyncedAt] = await Promise.all([allRecipes(), store.themes(), kvGet<number>(LAST_SYNC_KEY)]);
    set({ status: 'ready', ...view(recipes, themes), lastSyncedAt: lastSyncedAt ?? null });
    void get().sync();
  },

  sync() {
    if (syncing) return syncing;
    set({ syncState: 'syncing' });
    syncing = (async () => {
      const fetcher: typeof fetch = (input, init) => fetch(input, init);
      const result = await syncRecipes({ fetch: fetcher, store, mirrors: feedMirrors() });
      const patch: Partial<LibraryState> = { lastResult: result };
      // Books sync after the main library, and a broken one only marks itself.
      const bookStatus: LibraryState['bookStatus'] = {};
      let booksChanged = false;
      for (const book of useUser.getState().books.filter((b) => b.key !== SIMMER && b.key !== MINE)) {
        const outcome = await syncRecipes({ fetch: fetcher, store: createRecipeStore(undefined, book.key), mirrors: book.mirrors, prefix: book.key });
        bookStatus[book.key] = outcome.status === 'failed' ? 'failed' : 'ok';
        if (outcome.status === 'updated') booksChanged = true;
      }
      patch.bookStatus = bookStatus;
      if (result.status === 'failed') {
        patch.syncState = 'offline';
      } else {
        patch.syncState = result.status === 'unsupported' ? 'unsupported' : 'idle';
        patch.lastSyncedAt = Date.now();
        await kvSet(LAST_SYNC_KEY, patch.lastSyncedAt);
      }
      if (result.status === 'updated') patch.notice = describeSync(result);
      // A theme can be restyled without any recipe changing.
      const themes = result.status === 'failed' ? null : await store.themes();
      if (result.status === 'updated' || booksChanged || (themes && JSON.stringify(themes) !== JSON.stringify([...get().themes.values()]))) {
        Object.assign(patch, view(await allRecipes(), themes ?? [...get().themes.values()]));
      }
      set(patch);
      return result;
    })().finally(() => {
      syncing = null;
    });
    return syncing;
  },

  dismissNotice: () => set({ notice: null }),

  async saveOwn(recipe, photo) {
    await own.apply({ put: [recipe], remove: [], revision: null });
    if (photo && recipe.image) await own.saveImage(recipe.id, recipe.image, photo);
    set(view(await allRecipes(), [...get().themes.values()]));
  },

  async deleteOwn(id) {
    await own.apply({ put: [], remove: [id], revision: null });
    set(view(await allRecipes(), [...get().themes.values()]));
  },

  async removeBook(key) {
    if (key === SIMMER || key === MINE) return;
    await createRecipeStore(undefined, key).clear();
    const { [key]: _gone, ...bookStatus } = get().bookStatus;
    set({ bookStatus, ...view(await allRecipes(), [...get().themes.values()]) });
  },
}));

export function useRecipe(id: string | undefined): Recipe | undefined {
  return useLibrary((s) => (id ? s.byId.get(id) : undefined));
}
