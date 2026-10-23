import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recipe } from '../domain/schema';
import { MIRRORS } from '../sync/sync';
import { curry, pasta } from '../test/fixtures';
import { EMPTY_USER_DATA } from './backup';
import { useLibrary } from './libraryStore';
import { createRecipeStore } from './recipeStore';
import { restoreBackup } from './restore';
import { useUser } from './userStore';

const OLD = { key: 'alice-family-recipes', name: 'family recipes', mirrors: ['https://alice.test/v1/'] };
const NEW = { key: 'bob-bakes', name: 'bakes', mirrors: ['https://bob.test/v1/'] };

function serve(feeds: Record<string, Recipe[]>) {
  vi.stubGlobal('fetch', (async (input: RequestInfo | URL) => {
    const url = String(input).split('?')[0]!;
    const root = Object.keys(feeds).find((m) => url.startsWith(m));
    if (!root) throw new TypeError('Failed to fetch');
    const recipes = feeds[root]!;
    const path = url.slice(root.length);
    if (path === 'manifest.json') {
      return Response.json({
        schemaVersion: 1,
        revision: recipes.map((r) => r.hash).join('|') || 'empty',
        generatedAt: '2026-10-23T00:00:00Z',
        bundle: { path: 'bundle.json', hash: 'b', bytes: 1 },
        recipes: recipes.map((r) => ({ id: r.id, hash: r.hash, path: `r/${r.id}.json` })),
      });
    }
    return Response.json({ schemaVersion: 1, recipes });
  }) as typeof fetch);
}

const ids = () => useLibrary.getState().recipes.map((r) => r.id).sort();

beforeEach(async () => {
  await useUser.persist.rehydrate();
  useUser.getState().replaceAll(EMPTY_USER_DATA);
  for (const key of [OLD.key, NEW.key, 'mine']) await createRecipeStore(undefined, key).clear();
  serve({ [MIRRORS[0]!]: [pasta], [OLD.mirrors[0]!]: [curry], [NEW.mirrors[0]!]: [{ ...curry, id: 'scones', hash: 'h-scones' }] });
  useUser.getState().addBook(OLD);
  await useLibrary.getState().sync();
});

describe('restoreBackup', () => {
  it('forgets the recipes of books the backup does not have, and syncs the ones it does', async () => {
    expect(ids()).toContain(`${OLD.key}.${curry.id}`);
    await restoreBackup({ data: { ...EMPTY_USER_DATA, books: [NEW] }, recipes: [] });
    expect(useUser.getState().books).toEqual([NEW]);
    expect(ids()).toEqual([`${NEW.key}.scones`, pasta.id].sort());
  });

  it('puts back your own recipes', async () => {
    const own = { ...curry, id: 'mine.curry-ab12', source: 'mine' };
    await restoreBackup({ data: { ...EMPTY_USER_DATA, books: [OLD] }, recipes: [own] });
    expect(ids()).toContain(own.id);
  });
});
