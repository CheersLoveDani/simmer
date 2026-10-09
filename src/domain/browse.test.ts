import { describe, expect, it } from 'vitest';
import { brownies, curry, ing, library, makeRecipe, pasta } from '../test/fixtures';
import {
  NO_FILTERS,
  activeFilterCount,
  applyFilters,
  dailyPicks,
  facets,
  relatedRecipes,
  sortRecipes,
} from './browse';
import { STAPLES, pantryItems, rankByPantry } from './pantry';

const ids = (recipes: { id: string }[]) => recipes.map((r) => r.id);

describe('applyFilters', () => {
  it('returns everything with no filters', () => {
    expect(applyFilters(library, NO_FILTERS)).toHaveLength(3);
  });

  it('filters by course, cuisine and difficulty', () => {
    expect(ids(applyFilters(library, { ...NO_FILTERS, courses: ['baking'] }))).toEqual([brownies.id]);
    expect(ids(applyFilters(library, { ...NO_FILTERS, cuisines: ['indian', 'japanese'] }))).toEqual([pasta.id, curry.id]);
    expect(ids(applyFilters(library, { ...NO_FILTERS, difficulties: ['medium'] }))).toEqual([brownies.id]);
  });

  it('requires every selected diet', () => {
    expect(ids(applyFilters(library, { ...NO_FILTERS, diets: ['vegetarian'] }))).toHaveLength(3);
    expect(ids(applyFilters(library, { ...NO_FILTERS, diets: ['vegetarian', 'gluten-free'] }))).toEqual([curry.id]);
  });

  it('filters by total time, inclusive', () => {
    expect(ids(applyFilters(library, { ...NO_FILTERS, maxTime: 17 }))).toEqual([pasta.id]);
    expect(ids(applyFilters(library, { ...NO_FILTERS, maxTime: 16 }))).toEqual([]);
  });

  it('combines filters', () => {
    expect(applyFilters(library, { ...NO_FILTERS, courses: ['main'], diets: ['vegan'], maxTime: 40 })).toEqual([curry]);
  });

  it('counts active filters', () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...NO_FILTERS, courses: ['main', 'soup'], maxTime: 30 })).toBe(3);
  });
});

describe('sortRecipes', () => {
  it('sorts without mutating the input', () => {
    const input = [...library];
    expect(ids(sortRecipes(input, 'title'))).toEqual([pasta.id, curry.id, brownies.id]);
    expect(input).toEqual(library);
  });

  it('sorts by time and difficulty', () => {
    expect(ids(sortRecipes(library, 'quickest'))).toEqual([pasta.id, curry.id, brownies.id]);
    expect(ids(sortRecipes(library, 'easiest')).at(-1)).toBe(brownies.id);
  });

  it('sorts newest first, counting an update as new', () => {
    const old = makeRecipe({ id: 'old', created: '2025-01-01' });
    const revised = makeRecipe({ id: 'revised', created: '2024-01-01', updated: '2026-12-01' });
    expect(ids(sortRecipes([old, pasta, revised], 'newest'))).toEqual(['revised', pasta.id, 'old']);
  });
});

describe('facets', () => {
  it('counts values, most common first', () => {
    expect(facets(library, (r) => r.course)).toEqual([
      { value: 'main', count: 2 },
      { value: 'baking', count: 1 },
    ]);
    expect(facets(library, (r) => r.diet)[0]).toEqual({ value: 'vegetarian', count: 3 });
  });
});

describe('relatedRecipes', () => {
  it('prefers recipes sharing ingredients and tags, and never returns the recipe itself', () => {
    const related = relatedRecipes(pasta, library);
    expect(ids(related)).not.toContain(pasta.id);
    expect(related[0]).toBe(curry);
  });

  it('leaves out recipes with nothing in common', () => {
    const loner = makeRecipe({
      id: 'loner',
      course: 'drink',
      cuisine: 'martian',
      ingredients: [{ section: null, items: [ing({ item: 'moon dust' })] }],
    });
    expect(relatedRecipes(loner, library)).toEqual([]);
  });

  it('respects the limit', () => {
    expect(relatedRecipes(pasta, library, 1)).toHaveLength(1);
  });
});

describe('dailyPicks', () => {
  it('is stable within a day and bounded by the library size', () => {
    expect(dailyPicks(library, '2026-10-09', 2)).toEqual(dailyPicks(library, '2026-10-09', 2));
    expect(dailyPicks(library, '2026-10-09', 10)).toHaveLength(3);
    expect(dailyPicks([], '2026-10-09', 3)).toEqual([]);
  });

  it('changes across days', () => {
    const days = Array.from({ length: 12 }, (_, i) => ids(dailyPicks(library, `2026-10-${10 + i}`, 1))[0]);
    expect(new Set(days).size).toBeGreaterThan(1);
  });
});

describe('pantry', () => {
  it('lists each ingredient once per recipe, without staples', () => {
    const items = pantryItems(library);
    expect(items.find((i) => i.key === 'garlic')).toEqual({ key: 'garlic', aisle: 'produce', count: 2 });
    expect(items.some((i) => STAPLES.has(i.key))).toBe(false);
    expect(items[0]?.count).toBeGreaterThanOrEqual(items.at(-1)?.count ?? 0);
  });

  it('ranks by coverage and lists what is missing', () => {
    const matches = rankByPantry(library, new Set(['spaghetti', 'butter', 'miso', 'garlic']));
    expect(matches[0]?.recipe).toBe(pasta);
    expect(matches[0]?.coverage).toBe(1);
    expect(matches[0]?.missing).toEqual([]);
    const curryMatch = matches.find((m) => m.recipe === curry);
    expect(curryMatch?.have).toEqual(['garlic']);
    expect(curryMatch?.missing).toContain('chickpeas');
  });

  it('ignores staples and optional ingredients when judging coverage', () => {
    const recipe = makeRecipe({
      id: 'toast',
      ingredients: [
        {
          section: null,
          items: [
            ing({ item: 'bread' }),
            ing({ item: 'salt' }),
            ing({ item: 'truffle', optional: true }),
          ],
        },
      ],
    });
    expect(rankByPantry([recipe], new Set(['bread']))[0]).toMatchObject({ coverage: 1, missing: [] });
  });

  it('counts an ingredient used in two sections once', () => {
    const recipe = makeRecipe({
      id: 'cake',
      ingredients: [
        { section: 'Cake', items: [ing({ item: 'butter' }), ing({ item: 'flour' })] },
        { section: 'Icing', items: [ing({ item: 'butter' })] },
      ],
    });
    expect(rankByPantry([recipe], new Set(['butter']))[0]?.coverage).toBe(0.5);
  });

  it('leaves out recipes that use nothing from the pantry', () => {
    expect(rankByPantry(library, new Set(['saffron']))).toEqual([]);
    expect(rankByPantry(library, new Set())).toEqual([]);
  });
});
