import type { Ingredient } from './schema';

export type UnitSystem = 'metric' | 'us';

export interface Amount {
  qty: number;
  unit: string | null;
}

const G_PER_OZ = 28.3495;
const ML_PER_TSP = 4.92892;
const ML_PER_TBSP = 14.7868;
const ML_PER_CUP = 236.588;

const FRACTIONS: [number, string][] = [
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
];

const PLURALS: Record<string, string> = {
  cup: 'cups',
  clove: 'cloves',
  sprig: 'sprigs',
  slice: 'slices',
  can: 'cans',
  bunch: 'bunches',
  stick: 'sticks',
  leaf: 'leaves',
  handful: 'handfuls',
  pinch: 'pinches',
  piece: 'pieces',
};

/** Units written as decimals (25 g) rather than kitchen fractions (½ tsp). */
const DECIMAL_UNITS = new Set(['g', 'kg', 'ml', 'l', 'oz', 'lb']);

/** Convert between systems, then pick the most readable unit for the size. */
export function convert(amount: Amount, system: UnitSystem): Amount {
  const { qty, unit } = amount;
  if (system === 'us') {
    if (unit === 'g' || unit === 'kg') {
      const oz = (unit === 'kg' ? qty * 1000 : qty) / G_PER_OZ;
      return oz >= 16 ? { qty: oz / 16, unit: 'lb' } : { qty: oz, unit: 'oz' };
    }
    if (unit === 'ml' || unit === 'l') {
      const ml = unit === 'l' ? qty * 1000 : qty;
      if (ml < 14) return { qty: ml / ML_PER_TSP, unit: 'tsp' };
      if (ml < 59) return { qty: ml / ML_PER_TBSP, unit: 'tbsp' };
      return { qty: ml / ML_PER_CUP, unit: 'cup' };
    }
    return amount;
  }
  if (unit === 'oz') return tidyMetric({ qty: qty * G_PER_OZ, unit: 'g' });
  if (unit === 'lb') return tidyMetric({ qty: qty * G_PER_OZ * 16, unit: 'g' });
  if (unit === 'cup') return tidyMetric({ qty: qty * ML_PER_CUP, unit: 'ml' });
  return tidyMetric(amount);
}

function tidyMetric(amount: Amount): Amount {
  const { qty, unit } = amount;
  if (unit === 'g' && qty >= 1000) return { qty: qty / 1000, unit: 'kg' };
  if (unit === 'kg' && qty < 1) return { qty: qty * 1000, unit: 'g' };
  if (unit === 'ml' && qty >= 1000) return { qty: qty / 1000, unit: 'l' };
  if (unit === 'l' && qty < 1) return { qty: qty * 1000, unit: 'ml' };
  return amount;
}

function trimDecimal(value: number, places: number): string {
  return String(Number(value.toFixed(places)));
}

function formatDecimal(qty: number, unit: string): string {
  if (unit === 'kg' || unit === 'l' || unit === 'lb') return trimDecimal(qty, 2);
  if (unit === 'oz') return qty >= 10 ? trimDecimal(qty, 0) : trimDecimal(qty, 1);
  // g and ml: precise when small, rounded to a sensible step when large.
  if (qty >= 100) return String(Math.round(qty / 5) * 5);
  if (qty >= 10) return String(Math.round(qty));
  return trimDecimal(qty, 1) === '0' ? '0.1' : trimDecimal(qty, 1);
}

/** 1.5 -> "1½". Never returns "0" for a positive quantity. */
export function formatFraction(qty: number): string {
  if (qty >= 10) return trimDecimal(Math.round(qty * 2) / 2, 1);
  let whole = Math.floor(qty);
  const rest = qty - whole;
  let glyph = '';
  let best = Math.abs(rest); // distance to "no fraction"
  for (const [value, symbol] of FRACTIONS) {
    const distance = Math.abs(rest - value);
    if (distance < best) {
      best = distance;
      glyph = symbol;
    }
  }
  if (Math.abs(rest - 1) < best) {
    whole += 1;
    glyph = '';
  }
  if (whole === 0 && glyph === '') return '⅛';
  return `${whole === 0 ? '' : whole}${glyph}`;
}

export function formatQty(qty: number, unit: string | null): string {
  if (!Number.isFinite(qty) || qty <= 0) return '';
  return unit && DECIMAL_UNITS.has(unit) ? formatDecimal(qty, unit) : formatFraction(qty);
}

export function unitLabel(unit: string | null, qty: number): string {
  if (!unit) return '';
  return qty > 1 ? (PLURALS[unit] ?? unit) : unit;
}

export interface DisplayIngredient {
  /** "200 g", "1½–2 tbsp", or "" when the recipe gives no quantity. */
  amount: string;
  name: string;
  /** Preparation and notes, e.g. "finely chopped, to taste". */
  detail: string;
}

export function displayIngredient(ingredient: Ingredient, factor: number, system: UnitSystem): DisplayIngredient {
  const detail = [ingredient.prep, ingredient.note].filter(Boolean).join(', ');
  if (ingredient.qty == null) return { amount: '', name: ingredient.item, detail };

  const scale = ingredient.fixed || !Number.isFinite(factor) || factor <= 0 ? 1 : factor;
  const low = convert({ qty: ingredient.qty * scale, unit: ingredient.unit }, system);
  let number = formatQty(low.qty, low.unit);
  let size = low.qty;

  if (ingredient.qtyMax != null) {
    // Conversions are linear, so the upper end stays in the lower end's unit.
    const high = low.qty * (ingredient.qtyMax / ingredient.qty);
    const top = formatQty(high, low.unit);
    if (top !== number) number = `${number}–${top}`;
    size = high;
  }

  const unit = unitLabel(low.unit, size);
  return { amount: unit ? `${number} ${unit}` : number, name: ingredient.item, detail };
}

export function scaleFactor(baseServes: number, servings: number): number {
  if (!Number.isFinite(servings) || servings <= 0 || baseServes <= 0) return 1;
  return servings / baseServes;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes - hours * 60);
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}
