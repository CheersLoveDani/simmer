import { create } from 'zustand';
import type { Recipe } from '../domain/schema';
import { createSearchIndex, type SearchIndex } from '../domain/search';
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

function view(recipes: Recipe[]) {
  const sorted = [...recipes].sort((a, b) => a.title.localeCompare(b.title));
  return { recipes: sorted, byId: new Map(sorted.map((r) => [r.id, r])), index: createSearchIndex(sorted) };
}

async function loadSeed() {
  const [manifest, bundle] = await Promise.all([import('../seed/manifest.json'), import('../seed/bundle.json')]);
  return { revision: manifest.default.revision, recipes: bundle.default.recipes as unknown[] };
}

let syncing: Promise<SyncResult> | null = null;

export const useLibrary = create<LibraryState>()((set, get) => ({
  status: 'loading',
  ...view([]),
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
    const [recipes, lastSyncedAt] = await Promise.all([store.all(), kvGet<number>(LAST_SYNC_KEY)]);
    set({ status: 'ready', ...view(recipes), lastSyncedAt: lastSyncedAt ?? null });
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
      if (result.status === 'updated') {
        Object.assign(patch, view(await store.all()));
        patch.notice = describeSync(result);
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
