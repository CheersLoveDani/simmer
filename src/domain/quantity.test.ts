import { describe, expect, it } from 'vitest';
import { ing } from '../test/fixtures';
import {
  convert,
  displayIngredient,
  formatFraction,
  formatMinutes,
  formatQty,
  scaleFactor,
  unitLabel,
} from './quantity';

describe('formatFraction', () => {
  it.each([
    [0.5, '½'],
    [1.5, '1½'],
    [0.333 * 1.5, '½'],
    [0.25, '¼'],
    [0.66, '⅔'],
    [2, '2'],
    [2.96, '3'],
    [1.02, '1'],
    [0.01, '⅛'],
    [12.3, '12.5'],
    [11, '11'],
  ])('%f -> %s', (input, expected) => {
    expect(formatFraction(input)).toBe(expected);
  });
});

describe('formatQty', () => {
  it('rounds metric weights to readable steps', () => {
    expect(formatQty(333.33, 'g')).toBe('335');
    expect(formatQty(66.6, 'g')).toBe('67');
    expect(formatQty(2.25, 'g')).toBe('2.3');
    expect(formatQty(1.25, 'kg')).toBe('1.25');
  });

  it('never shows zero for a real quantity', () => {
    expect(formatQty(0.01, 'g')).toBe('0.1');
    expect(formatQty(0.02, 'tsp')).toBe('⅛');
  });

  it('returns an empty string for nonsense', () => {
    expect(formatQty(Number.NaN, 'g')).toBe('');
    expect(formatQty(0, 'tsp')).toBe('');
    expect(formatQty(-2, null)).toBe('');
  });
});

describe('convert', () => {
  it('promotes large metric amounts', () => {
    expect(convert({ qty: 1500, unit: 'g' }, 'metric')).toEqual({ qty: 1.5, unit: 'kg' });
    expect(convert({ qty: 0.4, unit: 'l' }, 'metric')).toEqual({ qty: 400, unit: 'ml' });
  });

  it('converts metric to US units sized to the amount', () => {
    expect(convert({ qty: 200, unit: 'g' }, 'us').unit).toBe('oz');
    expect(convert({ qty: 200, unit: 'g' }, 'us').qty).toBeCloseTo(7.05, 1);
    expect(convert({ qty: 1, unit: 'kg' }, 'us')).toMatchObject({ unit: 'lb' });
    expect(convert({ qty: 5, unit: 'ml' }, 'us').unit).toBe('tsp');
    expect(convert({ qty: 30, unit: 'ml' }, 'us').unit).toBe('tbsp');
    expect(convert({ qty: 500, unit: 'ml' }, 'us').unit).toBe('cup');
  });

  it('converts US to metric', () => {
    expect(convert({ qty: 8, unit: 'oz' }, 'metric').qty).toBeCloseTo(226.8, 0);
    expect(convert({ qty: 1, unit: 'cup' }, 'metric')).toMatchObject({ unit: 'ml' });
  });

  it('leaves spoons and counts alone', () => {
    expect(convert({ qty: 2, unit: 'tbsp' }, 'us')).toEqual({ qty: 2, unit: 'tbsp' });
    expect(convert({ qty: 3, unit: null }, 'metric')).toEqual({ qty: 3, unit: null });
  });
});

describe('unitLabel', () => {
  it('pluralises count units', () => {
    expect(unitLabel('clove', 1)).toBe('clove');
    expect(unitLabel('clove', 3)).toBe('cloves');
    expect(unitLabel('leaf', 2)).toBe('leaves');
    expect(unitLabel('g', 200)).toBe('g');
    expect(unitLabel(null, 2)).toBe('');
  });
});

describe('displayIngredient', () => {
  it('scales and formats', () => {
    const view = displayIngredient(ing({ qty: 200, unit: 'g', item: 'spaghetti' }), 1.5, 'metric');
    expect(view).toEqual({ amount: '300 g', name: 'spaghetti', detail: '' });
  });

  it('joins prep and note', () => {
    const view = displayIngredient(ing({ qty: 2, unit: 'clove', item: 'garlic', prep: 'grated', note: 'or more' }), 1, 'metric');
    expect(view.amount).toBe('2 cloves');
    expect(view.detail).toBe('grated, or more');
  });

  it('shows no amount for "to taste" ingredients at any scale', () => {
    const view = displayIngredient(ing({ qty: null, item: 'black pepper', note: 'to taste' }), 3, 'us');
    expect(view.amount).toBe('');
    expect(view.detail).toBe('to taste');
  });

  it('does not scale fixed ingredients', () => {
    expect(displayIngredient(ing({ qty: 1, unit: 'tbsp', item: 'oil', fixed: true }), 4, 'metric').amount).toBe('1 tbsp');
  });

  it('formats ranges, collapsing them when both ends round the same', () => {
    expect(displayIngredient(ing({ qty: 1, qtyMax: 2, unit: 'tbsp', item: 'honey' }), 1.5, 'metric').amount).toBe('1½–3 tbsp');
    expect(displayIngredient(ing({ qty: 200, qtyMax: 250, unit: 'g', item: 'flour' }), 1, 'us').amount).toBe('7.1–8.8 oz');
    expect(displayIngredient(ing({ qty: 100, qtyMax: 101, unit: 'g', item: 'flour' }), 1, 'metric').amount).toBe('100 g');
  });

  it('formats a count with no unit', () => {
    expect(displayIngredient(ing({ qty: 3, item: 'eggs' }), 0.5, 'metric').amount).toBe('1½');
  });

  it('falls back to the written quantity for a broken factor', () => {
    expect(displayIngredient(ing({ qty: 2, unit: 'tsp', item: 'salt' }), Number.NaN, 'metric').amount).toBe('2 tsp');
    expect(displayIngredient(ing({ qty: 2, unit: 'tsp', item: 'salt' }), 0, 'metric').amount).toBe('2 tsp');
  });
});

describe('scaleFactor', () => {
  it('divides servings by the base', () => {
    expect(scaleFactor(4, 6)).toBe(1.5);
  });
  it('is 1 for invalid input', () => {
    expect(scaleFactor(4, 0)).toBe(1);
    expect(scaleFactor(0, 4)).toBe(1);
    expect(scaleFactor(4, Number.NaN)).toBe(1);
  });
});

describe('formatMinutes', () => {
  it('formats short and long durations', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 hr');
    expect(formatMinutes(100)).toBe('1 hr 40 min');
  });
});
