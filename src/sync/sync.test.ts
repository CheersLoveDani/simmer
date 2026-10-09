import { beforeEach, describe, expect, it } from 'vitest';
import type { Manifest, Recipe } from '../domain/schema';
import { createRecipeStore, type RecipeStore } from '../store/recipeStore';
import { brownies, curry, makeRecipe, pasta } from '../test/fixtures';
import { describeSync, seedIfEmpty, syncRecipes } from './sync';

const A = 'https://a.test/v1/';
const B = 'https://b.test/v1/';

/** An in-memory feed; `down` lists URL fragments that should fail. */
function feed(recipes: unknown[], options: { schemaVersion?: number; revision?: string; themes?: unknown[] } = {}) {
  const entries = (recipes as Recipe[]).map((r) => ({ id: r.id, hash: r.hash, path: `r/${r.id}.${r.hash}.json` }));
  const manifest: Manifest = {
    schemaVersion: options.schemaVersion ?? 1,
    revision: options.revision ?? entries.map((e) => e.hash).join('|'),
    generatedAt: '2026-10-09T00:00:00Z',
    bundle: { path: 'recipes.bundle.json', hash: 'b', bytes: 1 },
    recipes: entries,
    images: [],
    themes: options.themes ?? [],
  };
  const files = new Map<string, unknown>([
    ['manifest.json', manifest],
    ['recipes.bundle.json', { schemaVersion: manifest.schemaVersion, recipes }],
    ...entries.map((e, i) => [e.path, recipes[i]] as [string, unknown]),
  ]);
  const requests: string[] = [];
  const down: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(url);
    if (down.some((fragment) => url.includes(fragment))) throw new TypeError('Failed to fetch');
    const path = url.replace(A, '').replace(B, '').split('?')[0]!;
    if (!files.has(path)) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(files.get(path)), { status: 200 });
  }) as typeof fetch;
  return { fetcher, requests, down, manifest };
}

let store: RecipeStore;
let n = 0;

beforeEach(() => {
  n += 1;
  store = createRecipeStore(`sync-test-${n}`);
});

const ids = async () => (await store.all()).map((r) => r.id).sort();
const run = (f: ReturnType<typeof feed>, mirrors = [A, B]) => syncRecipes({ fetch: f.fetcher, store, mirrors });

describe('syncRecipes', () => {
  it('fills an empty store from the bundle in one request', async () => {
    const f = feed([pasta, curry, brownies]);
    const result = await run(f);
    expect(result.status).toBe('updated');
    expect(result.added.sort()).toEqual([pasta.id, curry.id, brownies.id].sort());
    expect(await ids()).toHaveLength(3);
    expect(await store.revision()).toBe(f.manifest.revision);
    expect(f.requests.filter((u) => !u.includes('manifest'))).toEqual([`${A}recipes.bundle.json`]);
  });

  it('does nothing when the revision is unchanged', async () => {
    const f = feed([pasta]);
    await run(f);
    f.requests.length = 0;
    const result = await run(f);
    expect(result.status).toBe('up-to-date');
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0]).toContain('manifest.json');
  });

  it('fetches only the changed recipes, and applies additions, updates and removals', async () => {
    await run(feed([pasta, curry]));
    const editedCurry = { ...curry, title: 'Better Curry', hash: 'h-curry-2' };
    const f = feed([editedCurry, brownies]);
    const result = await run(f);

    expect(result).toMatchObject({ status: 'updated', added: [brownies.id], updated: [curry.id], removed: [pasta.id], skipped: [] });
    expect(await ids()).toEqual([curry.id, brownies.id].sort());
    expect((await store.all()).find((r) => r.id === curry.id)?.title).toBe('Better Curry');
    const fetched = f.requests.filter((u) => !u.includes('manifest'));
    expect(fetched).toHaveLength(2);
    expect(fetched.every((u) => u.includes('/r/'))).toBe(true);
  });

  it('switches to the bundle when many recipes changed', async () => {
    await run(feed([pasta]));
    const many = Array.from({ length: 21 }, (_, i) => makeRecipe({ id: `bulk-${i}` }));
    const f = feed([pasta, ...many]);
    const result = await run(f);
    expect(result.added).toHaveLength(21);
    expect(f.requests.filter((u) => !u.includes('manifest'))).toEqual([`${A}recipes.bundle.json`]);
  });

  it('records a removal-only change', async () => {
    await run(feed([pasta, curry]));
    const result = await run(feed([pasta]));
    expect(result).toMatchObject({ status: 'updated', removed: [curry.id] });
    expect(await ids()).toEqual([pasta.id]);
  });

  it('falls back to the second mirror when the first is down', async () => {
    const f = feed([pasta]);
    f.down.push('a.test');
    const result = await run(f);
    expect(result.status).toBe('updated');
    expect(await ids()).toEqual([pasta.id]);
  });

  it('fetches a recipe file from another mirror if the first loses it', async () => {
    await run(feed([pasta]));
    const f = feed([pasta, curry]);
    f.down.push(`${A}r/`);
    const result = await run(f);
    expect(result.added).toEqual([curry.id]);
  });

  it('keeps existing recipes when the network fails after the manifest', async () => {
    await run(feed([pasta, curry]));
    const before = await store.revision();
    const f = feed([{ ...pasta, hash: 'changed' }, brownies]);
    f.down.push('/r/', 'bundle');
    const result = await run(f);

    expect(result.status).toBe('failed');
    expect(result.error).toBeTruthy();
    expect(await ids()).toEqual([pasta.id, curry.id].sort());
    expect((await store.all()).find((r) => r.id === pasta.id)?.hash).toBe(pasta.hash);
    expect(await store.revision()).toBe(before);
  });

  it('reports failure without throwing when everything is offline', async () => {
    const f = feed([pasta]);
    f.down.push('a.test', 'b.test');
    expect(await run(f)).toMatchObject({ status: 'failed' });
    expect(await ids()).toEqual([]);
  });

  it('reports failure for a malformed manifest', async () => {
    const fetcher = (async () => new Response('{"hello":1}', { status: 200 })) as unknown as typeof fetch;
    expect((await syncRecipes({ fetch: fetcher, store, mirrors: [A] })).status).toBe('failed');
    const html = (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch;
    expect((await syncRecipes({ fetch: html, store, mirrors: [A] })).status).toBe('failed');
  });

  it('skips an invalid recipe, applies the rest, and retries next time', async () => {
    const broken = { id: 'broken', hash: 'h-broken', title: 'No steps' };
    const f = feed([pasta, broken, curry]);
    const result = await run(f);

    expect(result.status).toBe('updated');
    expect(result.skipped).toEqual(['broken']);
    expect(await ids()).toEqual([pasta.id, curry.id].sort());
    expect(await store.revision()).toBeNull();

    // The feed fixes the recipe; a later sync picks it up.
    const fixed = makeRecipe({ id: 'broken', hash: 'h-broken-2' });
    expect((await run(feed([pasta, fixed, curry]))).added).toEqual(['broken']);
  });

  it('keeps the old version of a recipe whose update is invalid', async () => {
    await run(feed([pasta]));
    const result = await run(feed([{ id: pasta.id, hash: 'bad', title: 'Broken' }]));
    expect(result.skipped).toEqual([pasta.id]);
    expect((await store.all())[0]).toMatchObject({ hash: pasta.hash, title: pasta.title });
  });

  it('leaves the store alone for a newer feed schema', async () => {
    await run(feed([pasta]));
    const result = await run(feed([curry], { schemaVersion: 2 }));
    expect(result.status).toBe('unsupported');
    expect(await ids()).toEqual([pasta.id]);
  });

  it('strips fields it does not know', async () => {
    await run(feed([{ ...pasta, futureField: { nested: true } }]));
    expect((await store.all())[0]).not.toHaveProperty('futureField');
  });
});

describe('seedIfEmpty', () => {
  it('loads the snapshot into an empty store', async () => {
    expect(await seedIfEmpty(store, async () => ({ revision: 'seed', recipes: [pasta, curry] }))).toBe(true);
    expect(await ids()).toHaveLength(2);
    expect(await store.revision()).toBe('seed');
  });

  it('does not touch a store that already has recipes', async () => {
    await run(feed([pasta]));
    let loaded = false;
    const seeded = await seedIfEmpty(store, async () => {
      loaded = true;
      return { revision: 'seed', recipes: [curry] };
    });
    expect(seeded).toBe(false);
    expect(loaded).toBe(false);
    expect(await ids()).toEqual([pasta.id]);
  });

  it('survives a snapshot with a bad recipe in it', async () => {
    await seedIfEmpty(store, async () => ({ revision: 'seed', recipes: [pasta, { nope: true }] }));
    expect(await ids()).toEqual([pasta.id]);
    expect(await store.revision()).toBeNull();
  });
});

describe('themes', () => {
  const arcade = { id: 'arcade', name: 'Arcade Nights', accent: '#f79a1e', styles: {} };

  it('arrive with a sync and are replaced by the next one', async () => {
    await run(feed([pasta], { revision: 'r1', themes: [arcade, { id: 'broken' }] }));
    expect((await store.themes()).map((t) => t.id)).toEqual(['arcade']);

    // Only the theme changed: no recipe is fetched, but the new look is stored.
    const second = await run(feed([pasta], { revision: 'r2', themes: [{ ...arcade, accent: '#112233' }] }));
    expect(second.status).toBe('up-to-date');
    expect((await store.themes())[0]!.accent).toBe('#112233');

    await run(feed([pasta], { revision: 'r3' }));
    expect(await store.themes()).toEqual([]);
  });

  it('come with the bundled snapshot', async () => {
    await seedIfEmpty(store, async () => ({ revision: 'seed', recipes: [pasta], themes: [arcade] }));
    expect((await store.themes()).map((t) => t.name)).toEqual(['Arcade Nights']);
  });
});

describe('store', () => {
  it('removes a recipe image along with the recipe', async () => {
    await store.apply({ put: [pasta], remove: [], revision: 'r1' });
    await store.saveImage(pasta.id, 'img1', new Blob(['x']));
    expect(await store.image(pasta.id, 'img1')).not.toBeNull();
    expect(await store.image(pasta.id, 'other-hash')).toBeNull();
    await store.apply({ put: [], remove: [pasta.id], revision: 'r2' });
    expect(await store.image(pasta.id, 'img1')).toBeNull();
  });
});

describe('describeSync', () => {
  it('summarises a change in words', () => {
    expect(describeSync({ status: 'updated', added: ['a', 'b'], updated: ['c'], removed: [], skipped: [] })).toBe('2 new recipes, 1 updated');
    expect(describeSync({ status: 'updated', added: ['a'], updated: [], removed: ['x'], skipped: [] })).toBe('1 new recipe, 1 removed');
    expect(describeSync({ status: 'up-to-date', added: [], updated: [], removed: [], skipped: [] })).toBeNull();
  });
});
