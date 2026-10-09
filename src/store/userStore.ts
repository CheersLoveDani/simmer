import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import * as planner from '../domain/planner';
import type { Recipe } from '../domain/schema';
import * as shopping from '../domain/shopping';
import { DEFAULT_SETTINGS, EMPTY_USER_DATA, userDataSchema, type Settings, type UserData } from './backup';
import { kvDelete, kvGet, kvSet } from './db';

const RECENT_LIMIT = 12;

interface Actions {
  toggleFavourite(id: string): void;
  setNote(id: string, text: string): void;
  setRating(id: string, stars: number): void;
  logCooked(id: string, date: string): void;
  removeCooked(id: string, date: string): void;
  visit(id: string): void;
  setServings(id: string, servings: number): void;

  createCollection(name: string): string | null;
  renameCollection(id: string, name: string): void;
  deleteCollection(id: string): void;
  toggleInCollection(collectionId: string, recipeId: string): void;

  togglePantry(key: string): void;
  clearPantry(): void;

  addRecipeToShopping(recipe: Recipe, servings: number): void;
  addManualItem(name: string): void;
  toggleShoppingItem(id: string): void;
  removeShoppingItem(id: string): void;
  clearCheckedShopping(): void;
  clearShopping(): void;

  planAdd(entry: Omit<planner.PlanEntry, 'id'>): void;
  planRemove(id: string): void;
  planMove(id: string, date: string, meal: planner.Meal): void;
  planSetServings(id: string, servings: number): void;

  updateSettings(patch: Partial<Settings>): void;
  replaceAll(data: UserData): void;
  reset(): void;
}

export type UserState = UserData & Actions;

const idbStorage: StateStorage = {
  getItem: async (name) => (await kvGet<string>(name)) ?? null,
  setItem: (name, value) => kvSet(name, value),
  removeItem: (name) => kvDelete(name),
};

let collectionCounter = 0;

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function without<V>(record: Record<string, V>, key: string): Record<string, V> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

export const useUser = create<UserState>()(
  persist(
    (set, get) => ({
      ...EMPTY_USER_DATA,

      toggleFavourite: (id) => set((s) => ({ favourites: toggle(s.favourites, id) })),
      setNote: (id, text) =>
        set((s) => ({ notes: text.trim() === '' ? without(s.notes, id) : { ...s.notes, [id]: text } })),
      setRating: (id, stars) =>
        set((s) => {
          const value = Math.round(stars);
          // Tapping the current rating clears it.
          if (value < 1 || value > 5 || s.ratings[id] === value) return { ratings: without(s.ratings, id) };
          return { ratings: { ...s.ratings, [id]: value } };
        }),
      logCooked: (id, date) =>
        set((s) =>
          s.cooked.some((c) => c.recipeId === id && c.date === date)
            ? s
            : { cooked: [...s.cooked, { recipeId: id, date }] },
        ),
      removeCooked: (id, date) =>
        set((s) => ({ cooked: s.cooked.filter((c) => !(c.recipeId === id && c.date === date)) })),
      visit: (id) => set((s) => ({ recent: [id, ...s.recent.filter((r) => r !== id)].slice(0, RECENT_LIMIT) })),
      setServings: (id, servings) =>
        set((s) => ({ servings: servings > 0 ? { ...s.servings, [id]: servings } : without(s.servings, id) })),

      createCollection: (name) => {
        const trimmed = name.trim();
        if (trimmed === '') return null;
        collectionCounter += 1;
        const id = `c${Date.now().toString(36)}${collectionCounter}`;
        set((s) => ({ collections: [...s.collections, { id, name: trimmed, recipeIds: [] }] }));
        return id;
      },
      renameCollection: (id, name) =>
        set((s) => ({
          collections: s.collections.map((c) => (c.id === id && name.trim() ? { ...c, name: name.trim() } : c)),
        })),
      deleteCollection: (id) => set((s) => ({ collections: s.collections.filter((c) => c.id !== id) })),
      toggleInCollection: (collectionId, recipeId) =>
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === collectionId ? { ...c, recipeIds: toggle(c.recipeIds, recipeId) } : c,
          ),
        })),

      togglePantry: (key) => set((s) => ({ pantry: toggle(s.pantry, key) })),
      clearPantry: () => set({ pantry: [] }),

      addRecipeToShopping: (recipe, servings) => set((s) => ({ shopping: shopping.addRecipe(s.shopping, recipe, servings) })),
      addManualItem: (name) => set((s) => ({ shopping: shopping.addManual(s.shopping, name) })),
      toggleShoppingItem: (id) => set((s) => ({ shopping: shopping.toggleItem(s.shopping, id) })),
      removeShoppingItem: (id) => set((s) => ({ shopping: shopping.removeItem(s.shopping, id) })),
      clearCheckedShopping: () => set((s) => ({ shopping: shopping.clearChecked(s.shopping) })),
      clearShopping: () => set({ shopping: [] }),

      planAdd: (entry) => set((s) => ({ plan: planner.addEntry(s.plan, entry) })),
      planRemove: (id) => set((s) => ({ plan: planner.removeEntry(s.plan, id) })),
      planMove: (id, date, meal) => set((s) => ({ plan: planner.moveEntry(s.plan, id, date, meal) })),
      planSetServings: (id, servings) => set((s) => ({ plan: planner.setServings(s.plan, id, servings) })),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      replaceAll: (data) => set({ ...data }),
      reset: () => set({ ...EMPTY_USER_DATA, settings: get().settings }),
    }),
    {
      name: 'user',
      version: 1,
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => userDataSchema.parse(state),
      // Stored data is validated on the way in, so a damaged or older record
      // falls back to defaults field by field instead of breaking the app.
      merge: (persisted, current) => {
        const parsed = userDataSchema.safeParse(persisted ?? {});
        return { ...current, ...(parsed.success ? parsed.data : { ...EMPTY_USER_DATA, settings: DEFAULT_SETTINGS }) };
      },
    },
  ),
);

export function userData(state: UserState): UserData {
  return userDataSchema.parse(state);
}
