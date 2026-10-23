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

  it('reads unit words whatever their case', () => {
    expect(parseIngredientLine('2 Tbsp olive oil')).toMatchObject({ qty: 2, unit: 'tbsp', item: 'olive oil' });
    expect(parseIngredientLine('1 Cup flour')).toMatchObject({ qty: 1, unit: 'cup', item: 'flour' });
    expect(parseIngredientLine('3 Cloves garlic')).toMatchObject({ unit: 'clove', item: 'garlic' });
    expect(parseIngredientLine('1 T sugar')).toMatchObject({ unit: 'tbsp' });
    expect(parseIngredientLine('1 t salt')).toMatchObject({ unit: 'tsp' });
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

  it('reads a count of packs with their size', () => {
    expect(parseIngredientLine('2 x 400 g tins chopped tomatoes')).toMatchObject({ qty: 2, unit: 'can', item: 'chopped tomatoes', note: '400 g' });
    expect(parseIngredientLine('2 × 400g cans chickpeas, drained')).toMatchObject({ qty: 2, unit: 'can', item: 'chickpeas', prep: 'drained', note: '400g' });
    expect(parseIngredientLine('1 (400g) tin coconut milk')).toMatchObject({ qty: 1, unit: 'can', item: 'coconut milk', note: '400g' });
    expect(parseIngredientLine('3 x 150 g fillets salmon')).toMatchObject({ qty: 3, unit: null, item: 'fillets salmon', note: '150 g' });
  });

  it('keeps a note written in brackets', () => {
    expect(parseIngredientLine('black pepper (lots)')).toMatchObject({ qty: null, item: 'black pepper', note: 'lots' });
    expect(parseIngredientLine('2 onions, sliced (red if you have them)')).toMatchObject({ item: 'onions', prep: 'sliced', note: 'red if you have them' });
  });

  it('does not take a word that starts like a unit for one', () => {
    expect(parseIngredientLine('2 large eggs')).toMatchObject({ qty: 2, unit: null, item: 'large eggs' });
    expect(parseIngredientLine('1 lemon')).toMatchObject({ qty: 1, unit: null, item: 'lemon' });
  });
});

describe('formatIngredientLine', () => {
  it('writes back what it read', () => {
    for (const line of ['200 g spaghetti', '1–2 tbsp olive oil', '½ tsp salt', '2 onions, finely sliced', '1 egg (optional)', 'salt to taste', '3 cloves garlic', 'black pepper (lots)', '2 cans chopped tomatoes (400 g)', '1 egg, beaten (large) (optional)']) {
      expect(formatIngredientLine(parseIngredientLine(line))).toBe(line);
    }
  });
});

describe('editing keeps every detail', () => {
  it('writes back a note the parser did not set itself', () => {
    expect(formatIngredientLine({ qty: null, unit: null, item: 'black pepper', aisle: 'spices', note: 'lots' })).toBe('black pepper (lots)');
  });
});
