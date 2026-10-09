import { create } from 'zustand';
import type { Recipe, Theme } from '../domain/schema';
import { createSearchIndex, type SearchIndex } from '../domain/search';
import { themeSearchText } from '../domain/theme';
import { describeSync, seedIfEmpty, syncRecipes, type SyncResult } from '../sync/sync';
import { feedMirrors } from '../sync/config';
import { kvGet, kvSet } from './db';
import { createRecipeStore } from './recipeStore';

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
  init(): Promise<void>;
  sync(): Promise<SyncResult>;
  dismissNotice(): void;
}

const store = createRecipeStore();

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

  async init() {
    if (get().status === 'ready') return;
    try {
      await seedIfEmpty(store, loadSeed);
    } catch {
      // A missing or unreadable snapshot only matters offline on first run.
    }
    const [recipes, themes, lastSyncedAt] = await Promise.all([store.all(), store.themes(), kvGet<number>(LAST_SYNC_KEY)]);
    set({ status: 'ready', ...view(recipes, themes), lastSyncedAt: lastSyncedAt ?? null });
    void get().sync();
  },

  sync() {
    if (syncing) return syncing;
    set({ syncState: 'syncing' });
    syncing = (async () => {
      const result = await syncRecipes({ fetch: (input, init) => fetch(input, init), store, mirrors: feedMirrors() });
      const patch: Partial<LibraryState> = { lastResult: result };
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
      if (result.status === 'updated' || (themes && JSON.stringify(themes) !== JSON.stringify([...get().themes.values()]))) {
        Object.assign(patch, view(await store.all(), themes ?? []));
      }
      set(patch);
      return result;
    })().finally(() => {
      syncing = null;
    });
    return syncing;
  },

  dismissNotice: () => set({ notice: null }),
}));

export function useRecipe(id: string | undefined): Recipe | undefined {
  return useLibrary((s) => (id ? s.byId.get(id) : undefined));
}
