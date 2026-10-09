import { describe, expect, it } from 'vitest';
import { curry, ing, makeRecipe, pasta } from '../test/fixtures';
import {
  addManual,
  addRecipe,
  clearChecked,
  formatAmount,
  groupByAisle,
  removeItem,
  toText,
  toggleItem,
  type ShoppingItem,
} from './shopping';

const find = (list: ShoppingItem[], key: string) => list.filter((item) => item.key === key);

describe('addRecipe', () => {
  it('adds every ingredient with its aisle and source', () => {
    const list = addRecipe([], pasta, 2);
    expect(list).toHaveLength(5);
    expect(find(list, 'spaghetti')[0]).toMatchObject({ qty: 200, unit: 'g', aisle: 'pantry', checked: false });
    expect(find(list, 'butter')[0]?.sources).toEqual([{ recipeId: pasta.id, title: pasta.title }]);
  });

  it('scales to the requested servings', () => {
    expect(find(addRecipe([], pasta, 6), 'spaghetti')[0]?.qty).toBe(600);
  });

  it('merges the same ingredient across recipes and records both sources', () => {
    const list = addRecipe(addRecipe([], pasta, 2), curry, 4);
    const garlic = find(list, 'garlic');
    expect(garlic).toHaveLength(1);
    expect(garlic[0]).toMatchObject({ qty: 5, unit: 'clove' });
    expect(garlic[0]?.sources.map((s) => s.recipeId)).toEqual([pasta.id, curry.id]);
  });

  it('sums the same recipe added twice without repeating the source', () => {
    const list = addRecipe(addRecipe([], pasta, 2), pasta, 2);
    expect(list).toHaveLength(5);
    expect(find(list, 'spaghetti')[0]).toMatchObject({ qty: 400 });
    expect(find(list, 'spaghetti')[0]?.sources).toHaveLength(1);
  });

  it('adds across units of the same dimension', () => {
    const a = makeRecipe({
      id: 'a',
      ingredients: [
        {
          section: null,
          items: [
            ing({ qty: 1, unit: 'kg', item: 'flour' }),
            ing({ qty: 1, unit: 'tbsp', item: 'soy sauce' }),
            ing({ qty: 0.5, unit: 'l', item: 'stock' }),
          ],
        },
      ],
    });
    const b = makeRecipe({
      id: 'b',
      ingredients: [
        {
          section: null,
          items: [
            ing({ qty: 250, unit: 'g', item: 'flour' }),
            ing({ qty: 1, unit: 'tsp', item: 'soy sauce' }),
            ing({ qty: 250, unit: 'ml', item: 'stock' }),
          ],
        },
      ],
    });
    const list = addRecipe(addRecipe([], a, 2), b, 2);
    expect(find(list, 'flour')[0]).toMatchObject({ qty: 1250, unit: 'g' });
    expect(find(list, 'soy sauce')[0]).toMatchObject({ qty: 4, unit: 'tsp' });
    expect(find(list, 'stock')[0]).toMatchObject({ qty: 750, unit: 'ml' });
  });

  it('keeps separate lines for amounts that cannot be added', () => {
    const a = makeRecipe({ id: 'a', ingredients: [{ section: null, items: [ing({ qty: 2, unit: null, item: 'lemon' })] }] });
    const b = makeRecipe({ id: 'b', ingredients: [{ section: null, items: [ing({ qty: 30, unit: 'ml', item: 'lemon' })] }] });
    expect(find(addRecipe(addRecipe([], a, 2), b, 2), 'lemon')).toHaveLength(2);
  });

  it('keeps one line for an unquantified ingredient', () => {
    const list = addRecipe(addRecipe([], pasta, 2), pasta, 4);
    expect(find(list, 'black pepper')).toHaveLength(1);
    expect(find(list, 'black pepper')[0]?.qty).toBeNull();
  });

  it('uses the top of a range and leaves fixed amounts unscaled', () => {
    const recipe = makeRecipe({
      id: 'r',
      ingredients: [
        {
          section: null,
          items: [
            ing({ qty: 1, qtyMax: 2, unit: 'tbsp', item: 'honey' }),
            ing({ qty: 1, unit: null, item: 'bay leaf', fixed: true }),
          ],
        },
      ],
    });
    const list = addRecipe([], recipe, 4);
    expect(find(list, 'honey')[0]).toMatchObject({ qty: 12, unit: 'tsp' });
    expect(find(list, 'bay leaf')[0]?.qty).toBe(1);
  });

  it('starts a new line rather than adding to something already bought', () => {
    let list = addRecipe([], pasta, 2);
    list = toggleItem(list, find(list, 'spaghetti')[0]!.id);
    list = addRecipe(list, pasta, 2);
    const lines = find(list, 'spaghetti');
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.qty)).toEqual([200, 200]);
  });

  it('does not mutate the list it was given', () => {
    const before = addRecipe([], pasta, 2);
    const snapshot = structuredClone(before);
    addRecipe(before, curry, 4);
    expect(before).toEqual(snapshot);
  });
});

describe('manual items', () => {
  it('adds trimmed text in the catch-all aisle', () => {
    const list = addManual([], '  Kitchen   roll ');
    expect(list[0]).toMatchObject({ name: 'Kitchen roll', key: 'kitchen roll', aisle: 'other', qty: null });
  });

  it('ignores blanks and duplicates', () => {
    const list = addManual([], 'Foil');
    expect(addManual(list, '   ')).toBe(list);
    expect(addManual(list, 'foil')).toBe(list);
  });
});

describe('list operations', () => {
  it('toggles, removes and clears', () => {
    let list = addRecipe([], pasta, 2);
    const id = list[0]!.id;
    list = toggleItem(list, id);
    expect(list[0]?.checked).toBe(true);
    expect(clearChecked(list)).toHaveLength(4);
    expect(removeItem(list, id)).toHaveLength(4);
    expect(toggleItem(list, 'missing')).toEqual(list);
  });
});

describe('presentation', () => {
  it('formats amounts in readable units', () => {
    const item = (qty: number | null, unit: string | null) => ({ qty, unit }) as ShoppingItem;
    expect(formatAmount(item(1250, 'g'), 'metric')).toBe('1.25 kg');
    expect(formatAmount(item(4, 'tsp'), 'metric')).toBe('1⅓ tbsp');
    expect(formatAmount(item(2, 'tsp'), 'metric')).toBe('2 tsp');
    expect(formatAmount(item(5, 'clove'), 'metric')).toBe('5 cloves');
    expect(formatAmount(item(3, null), 'metric')).toBe('3');
    expect(formatAmount(item(null, null), 'metric')).toBe('');
    expect(formatAmount(item(454, 'g'), 'us')).toBe('1 lb');
  });

  it('groups by aisle in shop order with ticked items last', () => {
    let list = addRecipe([], curry, 4);
    list = toggleItem(list, find(list, 'garlic')[0]!.id);
    const groups = groupByAisle(list);
    expect(groups.map((g) => g.aisle)).toEqual(['produce', 'spices', 'tins-jars']);
    expect(groups[0]?.items.map((i) => i.key)).toEqual(['onion', 'spinach', 'garlic']);
  });

  it('exports only what is left to buy', () => {
    let list = addManual(addRecipe([], pasta, 2), 'Foil');
    list = toggleItem(list, find(list, 'butter')[0]!.id);
    const text = toText(list, 'metric');
    expect(text).toContain('Cupboard\n- miso (2 tbsp)\n- spaghetti (200 g)');
    expect(text).toContain('- black pepper');
    expect(text).toContain('Everything else\n- Foil');
    expect(text).not.toContain('butter');
    expect(toText([], 'metric')).toBe('');
  });
});
