import { describe, expect, it } from 'vitest';
import { pasta } from '../test/fixtures';
import { openDatabase } from './db';
import { createRecipeStore } from './recipeStore';

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
});
