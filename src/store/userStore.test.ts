import { beforeEach, describe, expect, it } from 'vitest';
import { curry, pasta } from '../test/fixtures';
import { EMPTY_USER_DATA, createBackup, parseBackup } from './backup';
import { useUser, userData } from './userStore';

const state = () => useUser.getState();

beforeEach(() => {
  state().replaceAll(EMPTY_USER_DATA);
});

describe('personal data', () => {
  it('toggles favourites', () => {
    state().toggleFavourite('a');
    state().toggleFavourite('b');
    state().toggleFavourite('a');
    expect(state().favourites).toEqual(['b']);
  });

  it('saves a note and deletes it when emptied', () => {
    state().setNote('a', 'More garlic next time');
    expect(state().notes.a).toBe('More garlic next time');
    state().setNote('a', '   ');
    expect(state().notes).toEqual({});
  });

  it('sets a rating, and clears it when the same star is tapped again', () => {
    state().setRating('a', 4);
    expect(state().ratings.a).toBe(4);
    state().setRating('a', 5);
    expect(state().ratings.a).toBe(5);
    state().setRating('a', 5);
    expect(state().ratings.a).toBeUndefined();
    state().setRating('a', 9);
    expect(state().ratings.a).toBeUndefined();
  });

  it('logs a cook once per day', () => {
    state().logCooked('a', '2026-10-09');
    state().logCooked('a', '2026-10-09');
    state().logCooked('a', '2026-10-10');
    expect(state().cooked).toHaveLength(2);
    state().removeCooked('a', '2026-10-09');
    expect(state().cooked).toEqual([{ recipeId: 'a', date: '2026-10-10' }]);
  });

  it('keeps recently viewed recipes newest first, without repeats, capped', () => {
    for (let i = 0; i < 15; i++) state().visit(`r${i}`);
    state().visit('r5');
    expect(state().recent[0]).toBe('r5');
    expect(state().recent).toHaveLength(12);
    expect(new Set(state().recent).size).toBe(12);
  });

  it('remembers servings per recipe', () => {
    state().setServings('a', 6);
    expect(state().servings.a).toBe(6);
    state().setServings('a', 0);
    expect(state().servings.a).toBeUndefined();
  });
});

describe('collections', () => {
  it('creates, fills, renames and deletes', () => {
    const id = state().createCollection('  Sunday lunch ')!;
    expect(state().collections[0]).toMatchObject({ name: 'Sunday lunch', recipeIds: [] });
    state().toggleInCollection(id, 'a');
    state().toggleInCollection(id, 'b');
    state().toggleInCollection(id, 'a');
    expect(state().collections[0]?.recipeIds).toEqual(['b']);
    state().renameCollection(id, 'Roasts');
    state().renameCollection(id, '   ');
    expect(state().collections[0]?.name).toBe('Roasts');
    state().deleteCollection(id);
    expect(state().collections).toEqual([]);
  });

  it('refuses a blank name', () => {
    expect(state().createCollection('  ')).toBeNull();
    expect(state().collections).toEqual([]);
  });
});

describe('shopping and plan', () => {
  it('builds a shopping list from recipes and manual items', () => {
    state().addRecipeToShopping(pasta, 2);
    state().addRecipeToShopping(curry, 4);
    state().addManualItem('Foil');
    const garlic = state().shopping.find((i) => i.key === 'garlic');
    expect(garlic?.qty).toBe(5);
    state().toggleShoppingItem(garlic!.id);
    state().clearCheckedShopping();
    expect(state().shopping.some((i) => i.key === 'garlic')).toBe(false);
    state().clearShopping();
    expect(state().shopping).toEqual([]);
  });

  it('plans meals', () => {
    state().planAdd({ date: '2026-10-09', meal: 'dinner', recipeId: pasta.id, servings: 2 });
    const id = state().plan[0]!.id;
    state().planMove(id, '2026-10-10', 'lunch');
    state().planSetServings(id, 4);
    expect(state().plan[0]).toMatchObject({ date: '2026-10-10', meal: 'lunch', servings: 4 });
    state().planRemove(id);
    expect(state().plan).toEqual([]);
  });

  it('tracks the pantry', () => {
    state().togglePantry('garlic');
    state().togglePantry('egg');
    state().togglePantry('garlic');
    expect(state().pantry).toEqual(['egg']);
    state().clearPantry();
    expect(state().pantry).toEqual([]);
  });
});

describe('settings and reset', () => {
  it('patches settings', () => {
    state().updateSettings({ units: 'us', theme: 'dark' });
    expect(state().settings).toMatchObject({ units: 'us', theme: 'dark', textSize: 'medium' });
  });

  it('reset clears data but keeps settings', () => {
    state().toggleFavourite('a');
    state().updateSettings({ units: 'us' });
    state().reset();
    expect(state().favourites).toEqual([]);
    expect(state().settings.units).toBe('us');
  });
});

describe('backup', () => {
  it('round-trips everything', () => {
    state().toggleFavourite(pasta.id);
    state().setNote(pasta.id, 'Lovely');
    state().addRecipeToShopping(pasta, 2);
    state().planAdd({ date: '2026-10-09', meal: 'dinner', recipeId: pasta.id, servings: 2 });
    state().updateSettings({ theme: 'dark' });
    const snapshot = userData(state());
    const file = createBackup(snapshot, new Date('2026-10-09T12:00:00Z'));

    state().replaceAll(EMPTY_USER_DATA);
    const parsed = parseBackup(file);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) state().replaceAll(parsed.data);
    expect(userData(state())).toEqual(snapshot);
  });

  it('rejects files that are not backups, leaving data untouched', () => {
    expect(parseBackup('not json')).toEqual({ ok: false, error: 'That file is not valid JSON.' });
    expect(parseBackup('{"hello":"world"}').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: 'simmer', version: 2, exportedAt: '', data: {} })).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: 'simmer', version: 1, exportedAt: '', data: { favourites: 'nope' } })).ok).toBe(false);
  });

  it('fills in fields missing from an older backup', () => {
    const parsed = parseBackup(JSON.stringify({ app: 'simmer', version: 1, exportedAt: '', data: { favourites: ['a'] } }));
    expect(parsed).toMatchObject({ ok: true, data: { favourites: ['a'], shopping: [], settings: { theme: 'system' } } });
  });

  it('repairs an unknown setting value instead of failing', () => {
    const parsed = parseBackup(
      JSON.stringify({ app: 'simmer', version: 1, exportedAt: '', data: { settings: { theme: 'neon', units: 'us' } } }),
    );
    expect(parsed).toMatchObject({ ok: true, data: { settings: { theme: 'system', units: 'us' } } });
  });
});
