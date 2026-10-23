import { describe, expect, it } from 'vitest';
import { formatIngredientLine, parseIngredientLine } from './ingredientLine';

describe('parseIngredientLine', () => {
  it('reads a quantity and a unit', () => {
    expect(parseIngredientLine('200 g spaghetti')).toMatchObject({ qty: 200, unit: 'g', item: 'spaghetti' });
    expect(parseIngredientLine('200g spaghetti')).toMatchObject({ qty: 200, unit: 'g', item: 'spaghetti' });
  });

  it('knows unit words and plurals', () => {
    expect(parseIngredientLine('2 tablespoons white miso')).toMatchObject({ qty: 2, unit: 'tbsp', item: 'white miso' });
    expect(parseIngredientLine('3 cloves garlic')).toMatchObject({ qty: 3, unit: 'clove', item: 'garlic' });
    expect(parseIngredientLine('1 litre stock')).toMatchObject({ qty: 1, unit: 'l', item: 'stock' });
  });

  it('reads ranges', () => {
    expect(parseIngredientLine('1-2 tbsp olive oil')).toMatchObject({ qty: 1, qtyMax: 2, unit: 'tbsp', item: 'olive oil' });
    expect(parseIngredientLine('2 – 3 carrots')).toMatchObject({ qty: 2, qtyMax: 3, unit: null, item: 'carrots' });
  });

  it('reads fractions', () => {
    expect(parseIngredientLine('½ tsp salt')).toMatchObject({ qty: 0.5, unit: 'tsp', item: 'salt' });
    expect(parseIngredientLine('1 1/2 cups flour')).toMatchObject({ qty: 1.5, unit: 'cup', item: 'flour' });
    expect(parseIngredientLine('1½ cups flour').qty).toBe(1.5);
    expect(parseIngredientLine('0.5 kg potatoes')).toMatchObject({ qty: 0.5, unit: 'kg' });
  });

  it('splits the preparation after a comma', () => {
    expect(parseIngredientLine('2 onions, finely sliced')).toMatchObject({ qty: 2, unit: null, item: 'onions', prep: 'finely sliced' });
  });

  it('leaves the quantity empty when there is none', () => {
    expect(parseIngredientLine('salt to taste')).toMatchObject({ qty: null, unit: null, item: 'salt', note: 'to taste' });
    expect(parseIngredientLine('black pepper')).toMatchObject({ qty: null, unit: null, item: 'black pepper' });
  });

  it('notices optional ingredients', () => {
    expect(parseIngredientLine('1 egg (optional)')).toMatchObject({ qty: 1, item: 'egg', optional: true });
  });

  it('does not take a word that starts like a unit for one', () => {
    expect(parseIngredientLine('2 large eggs')).toMatchObject({ qty: 2, unit: null, item: 'large eggs' });
    expect(parseIngredientLine('1 lemon')).toMatchObject({ qty: 1, unit: null, item: 'lemon' });
  });
});

describe('formatIngredientLine', () => {
  it('writes back what it read', () => {
    for (const line of ['200 g spaghetti', '1–2 tbsp olive oil', '½ tsp salt', '2 onions, finely sliced', '1 egg (optional)', 'salt to taste', '3 cloves garlic']) {
      expect(formatIngredientLine(parseIngredientLine(line))).toBe(line);
    }
  });
});
