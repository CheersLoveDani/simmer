import type { DraftIngredient } from './draft';
import { formatQty, unitLabel } from './quantity';

/** Every way of writing a unit people type, mapped to the one recipes use. */
const UNITS: Record<string, string> = {};
const add = (unit: string, ...spellings: string[]) => {
  for (const s of [unit, ...spellings]) UNITS[s] = unit;
};
add('g', 'gram', 'grams', 'gr', 'grm');
add('kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms');
add('ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters', 'mls');
add('l', 'litre', 'litres', 'liter', 'liters', 'ltr');
add('oz', 'ounce', 'ounces');
add('lb', 'lbs', 'pound', 'pounds');
add('tsp', 'tsps', 'teaspoon', 'teaspoons', 't');
add('tbsp', 'tbsps', 'tbs', 'tbl', 'tablespoon', 'tablespoons', 'T');
add('cup', 'cups');
add('clove', 'cloves');
add('sprig', 'sprigs');
add('slice', 'slices');
add('can', 'cans', 'tin', 'tins');
add('bunch', 'bunches');
add('stick', 'sticks');
add('leaf', 'leaves');
add('handful', 'handfuls');
add('pinch', 'pinches');
add('piece', 'pieces');

const VULGAR: Record<string, number> = { '½': 1 / 2, '¼': 1 / 4, '¾': 3 / 4, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 1 / 8 };

// One number: "1", "1.5", "1/2", "½", "1½" or "1 1/2".
const NUMBER = String.raw`(?:\d+(?:[.,]\d+)?(?:\s*[½¼¾⅓⅔⅛]|\s+\d+\/\d+)?|\d+\/\d+|[½¼¾⅓⅔⅛])`;
const LEADING = new RegExp(String.raw`^(${NUMBER})(?:\s*(?:-|–|—|to)\s*(${NUMBER}))?\s*`);

function toNumber(text: string): number {
  let total = 0;
  for (const part of text.trim().split(/\s+|(?=[½¼¾⅓⅔⅛])/)) {
    if (part in VULGAR) total += VULGAR[part]!;
    else if (part.includes('/')) {
      const [a, b] = part.split('/').map(Number);
      total += a! / b!;
    } else total += Number(part.replace(',', '.'));
  }
  return Math.round(total * 1000) / 1000;
}

/** Read a line as people write it ("2 onions, finely sliced") into an ingredient. */
export function parseIngredientLine(line: string): DraftIngredient {
  let rest = line.trim().replace(/\s+/g, ' ');
  const ingredient: DraftIngredient = { qty: null, unit: null, item: '', aisle: 'other' };

  if (/\(optional\)\s*$/i.test(rest)) {
    ingredient.optional = true;
    rest = rest.replace(/\s*\(optional\)\s*$/i, '');
  }
  const amount = LEADING.exec(rest);
  if (amount) {
    ingredient.qty = toNumber(amount[1]!);
    if (amount[2]) ingredient.qtyMax = toNumber(amount[2]);
    rest = rest.slice(amount[0].length);
    const word = /^([A-Za-z]+)\.?(?:\s+(?:of\s+)?|$)/.exec(rest);
    // Case only matters for the one-letter t (teaspoon) and T (tablespoon).
    const unit = word && (word[1]!.length === 1 ? UNITS[word[1]!] : UNITS[word[1]!.toLowerCase()]);
    if (word && unit) {
      ingredient.unit = unit;
      rest = rest.slice(word[0].length);
    }
  }
  if (/\bto taste$/i.test(rest)) {
    ingredient.note = 'to taste';
    rest = rest.replace(/,?\s*to taste$/i, '');
  }
  const comma = rest.indexOf(',');
  if (comma > 0) {
    const prep = rest.slice(comma + 1).trim();
    if (prep) ingredient.prep = prep;
    rest = rest.slice(0, comma);
  }
  ingredient.item = rest.trim();
  return ingredient;
}

/** The line a person would type for this ingredient; reads back to the same thing. */
export function formatIngredientLine(ingredient: DraftIngredient): string {
  const parts: string[] = [];
  if (ingredient.qty !== null) {
    const low = formatQty(ingredient.qty, ingredient.unit);
    const amount = ingredient.qtyMax ? `${low}–${formatQty(ingredient.qtyMax, ingredient.unit)}` : low;
    const unit = unitLabel(ingredient.unit, ingredient.qtyMax ?? ingredient.qty);
    parts.push(unit ? `${amount} ${unit}` : amount);
  }
  parts.push(ingredient.item);
  let line = parts.join(' ');
  if (ingredient.prep) line += `, ${ingredient.prep}`;
  if (ingredient.note === 'to taste') line += ' to taste';
  if (ingredient.optional) line += ' (optional)';
  return line;
}
