import { describe, expect, it } from 'vitest';
import { parseRecipe } from '../domain/schema';
import { curry, pasta } from '../test/fixtures';
import { openDatabase } from './db';
import { allRecipes, createRecipeStore } from './recipeStore';

describe('recipe store', () => {
  it('fills in fields an older version saved without', async () => {
    const name = 'recipe-store-older';
    const { prep: _, ...older } = pasta;
    await (await openDatabase(name)).put('recipes', older as typeof pasta);

    const [recipe] = await createRecipeStore(name).all();
    expect(recipe?.prep).toEqual([]);
  });

  it('drops a stored recipe the current schema cannot read', async () => {
    const name = 'recipe-store-broken';
    await (await openDatabase(name)).put('recipes', { ...pasta, id: 'broken', steps: [] });
    await (await openDatabase(name)).put('recipes', pasta);

    expect((await createRecipeStore(name).all()).map((r) => r.id)).toEqual([pasta.id]);
  });

  it('keeps sources apart', async () => {
    const name = 'recipe-store-sources';
    await createRecipeStore(name).apply({ put: [pasta], remove: [], revision: 'r1' });
    await createRecipeStore(name, 'book').apply({ put: [{ ...curry, id: 'book.curry' }], remove: [], revision: 'b1' });

    expect((await createRecipeStore(name).all()).map((r) => r.id)).toEqual([pasta.id]);
    expect((await createRecipeStore(name, 'book').all()).map((r) => r.id)).toEqual(['book.curry']);
    expect((await allRecipes(name)).map((r) => r.id).sort()).toEqual(['book.curry', pasta.id].sort());
    expect(await createRecipeStore(name).revision()).toBe('r1');
    expect(await createRecipeStore(name, 'book').revision()).toBe('b1');
  });

  it('a record without a source belongs to simmer', async () => {
    const name = 'recipe-store-unsourced';
    await (await openDatabase(name)).put('recipes', pasta);
    const [recipe] = await createRecipeStore(name).all();
    expect(recipe?.source).toBe('simmer');
    expect(await createRecipeStore(name, 'book').all()).toEqual([]);
  });

  it('removing through one source leaves the others alone', async () => {
    const name = 'recipe-store-remove';
    await createRecipeStore(name).apply({ put: [pasta], remove: [], revision: null });
    await createRecipeStore(name, 'book').apply({ put: [], remove: [pasta.id], revision: null });
    expect(await createRecipeStore(name).all()).toHaveLength(1);
  });

  it('clear removes only that source', async () => {
    const name = 'recipe-store-clear';
    await createRecipeStore(name).apply({ put: [pasta], remove: [], revision: 'r1' });
    const book = createRecipeStore(name, 'book');
    await book.apply({ put: [{ ...curry, id: 'book.curry' }], remove: [], revision: 'b1' });
    await book.clear();
    expect(await book.all()).toEqual([]);
    expect(await book.revision()).toBeNull();
    expect(await createRecipeStore(name).all()).toHaveLength(1);
  });

  it('a namespaced id parses', () => {
    expect(parseRecipe({ ...pasta, id: 'mine.soup-x1' })).not.toBeNull();
    expect(parseRecipe({ ...pasta, id: 'a..b' })).toBeNull();
    expect(parseRecipe({ ...pasta, id: 'a.b.c' })).toBeNull();
  });
});
