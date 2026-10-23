import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recipe } from '../domain/schema';
import { MIRRORS } from '../sync/sync';
import { curry, pasta } from '../test/fixtures';
import { EMPTY_USER_DATA } from './backup';
import { useLibrary } from './libraryStore';
import { createRecipeStore } from './recipeStore';
import { useUser } from './userStore';

const BOOK = { key: 'alice-family-recipes', name: 'family recipes', mirrors: ['https://alice.test/v1/'] };

/** Serve a feed at each mirror; a mirror mapped to null is unreachable. */
function serve(feeds: Record<string, Recipe[] | null>) {
  vi.stubGlobal('fetch', (async (input: RequestInfo | URL) => {
    const url = String(input).split('?')[0]!;
    const root = Object.keys(feeds).find((m) => url.startsWith(m));
    const recipes = root ? feeds[root] : null;
    if (!root || !recipes) throw new TypeError('Failed to fetch');
    const path = url.slice(root.length);
    if (path === 'manifest.json') {
      return Response.json({
        schemaVersion: 1,
        revision: recipes.map((r) => r.hash).join('|'),
        generatedAt: '2026-10-23T00:00:00Z',
        bundle: { path: 'bundle.json', hash: 'b', bytes: 1 },
        recipes: recipes.map((r) => ({ id: r.id, hash: r.hash, path: `r/${r.id}.json` })),
      });
    }
    if (path === 'bundle.json') return Response.json({ schemaVersion: 1, recipes });
    const one = recipes.find((r) => path === `r/${r.id}.json`);
    return one ? Response.json(one) : new Response('', { status: 404 });
  }) as typeof fetch);
}

const ids = () => useLibrary.getState().recipes.map((r) => r.id).sort();

beforeEach(async () => {
  // Let the persisted store finish loading so it cannot overwrite what a test sets.
  await useUser.persist.rehydrate();
  useUser.getState().replaceAll(EMPTY_USER_DATA);
  await createRecipeStore(undefined, BOOK.key).clear();
  serve({ [MIRRORS[0]!]: [] });
  await useLibrary.getState().sync();
});

describe('recipe books', () => {
  it('syncs a book next to the main library', async () => {
    useUser.getState().addBook(BOOK);
    serve({ [MIRRORS[0]!]: [pasta], [BOOK.mirrors[0]!]: [curry] });
    await useLibrary.getState().sync();
    expect(ids()).toEqual([pasta.id, `${BOOK.key}.${curry.id}`].sort());
    expect(useLibrary.getState().bookStatus[BOOK.key]).toBe('ok');
  });

  it('a failing book does not stop the main library', async () => {
    useUser.getState().addBook(BOOK);
    serve({ [MIRRORS[0]!]: [pasta, curry], [BOOK.mirrors[0]!]: null });
    const result = await useLibrary.getState().sync();
    expect(result.status).not.toBe('failed');
    expect(ids()).toEqual([pasta.id, curry.id].sort());
    expect(useLibrary.getState().bookStatus[BOOK.key]).toBe('failed');
  });

  it('removing a book deletes only its recipes', async () => {
    useUser.getState().addBook(BOOK);
    serve({ [MIRRORS[0]!]: [pasta], [BOOK.mirrors[0]!]: [curry] });
    await useLibrary.getState().sync();
    useUser.getState().removeBook(BOOK.key);
    await useLibrary.getState().removeBook(BOOK.key);
    expect(ids()).toEqual([pasta.id]);
  });

  it('adds a book only once', () => {
    expect(useUser.getState().addBook(BOOK)).toBe(true);
    expect(useUser.getState().addBook(BOOK)).toBe(false);
    expect(useUser.getState().books).toHaveLength(1);
  });
});
