import { convert, formatQty, unitLabel, type UnitSystem } from './quantity';
import { AISLES, allIngredients, type Aisle, type Recipe } from './schema';

export interface ShoppingSource {
  recipeId: string;
  title: string;
}

export interface ShoppingItem {
  id: string;
  /** Canonical ingredient key, or the typed name for manual items. */
  key: string;
  name: string;
  aisle: Aisle;
  /** Amount in `unit`; null when there is no quantity ("salt, to taste"). */
  qty: number | null;
  /** Base unit: g, ml, tsp, or a count unit such as "clove" or null. */
  unit: string | null;
  checked: boolean;
  sources: ShoppingSource[];
}

type Base = { qty: number; unit: string | null };

/** Fold units of one dimension into a single base so amounts can be added. */
function toBase(qty: number, unit: string | null): Base {
  switch (unit) {
    case 'kg':
      return { qty: qty * 1000, unit: 'g' };
    case 'oz':
      return { qty: qty * 28.3495, unit: 'g' };
    case 'lb':
      return { qty: qty * 453.592, unit: 'g' };
    case 'l':
      return { qty: qty * 1000, unit: 'ml' };
    case 'cup':
      return { qty: qty * 236.588, unit: 'ml' };
    case 'tbsp':
      return { qty: qty * 3, unit: 'tsp' };
    default:
      return { qty, unit };
  }
}

let counter = 0;
function newId(): string {
  counter += 1;
  return `s${Date.now().toString(36)}${counter.toString(36)}`;
}

function addSource(sources: ShoppingSource[], source: ShoppingSource): ShoppingSource[] {
  return sources.some((s) => s.recipeId === source.recipeId) ? sources : [...sources, source];
}

/**
 * Add a recipe's ingredients, scaled to `servings`. Amounts of the same
 * ingredient in the same dimension are summed; a ticked item is not reused,
 * since it has already been bought.
 */
export function addRecipe(list: ShoppingItem[], recipe: Recipe, servings: number): ShoppingItem[] {
  const factor = servings > 0 && recipe.serves > 0 ? servings / recipe.serves : 1;
  const source = { recipeId: recipe.id, title: recipe.title };
  const next = list.map((item) => ({ ...item }));

  for (const ingredient of allIngredients(recipe)) {
    const base =
      ingredient.qty == null
        ? null
        : toBase((ingredient.qtyMax ?? ingredient.qty) * (ingredient.fixed ? 1 : factor), ingredient.unit);
    const existing = next.find(
      (item) =>
        !item.checked &&
        item.key === ingredient.key &&
        (base == null ? item.qty == null : item.qty != null && item.unit === base.unit),
    );
    if (existing) {
      if (base && existing.qty != null) existing.qty += base.qty;
      existing.sources = addSource(existing.sources, source);
    } else {
      next.push({
        id: newId(),
        key: ingredient.key,
        name: ingredient.key,
        aisle: ingredient.aisle,
        qty: base?.qty ?? null,
        unit: base?.unit ?? null,
        checked: false,
        sources: [source],
      });
    }
  }
  return next;
}

export function addManual(list: ShoppingItem[], name: string): ShoppingItem[] {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed === '') return list;
  const key = trimmed.toLowerCase();
  if (list.some((item) => !item.checked && item.key === key && item.qty == null)) return list;
  return [...list, { id: newId(), key, name: trimmed, aisle: 'other', qty: null, unit: null, checked: false, sources: [] }];
}

export function toggleItem(list: ShoppingItem[], id: string): ShoppingItem[] {
  return list.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item));
}

export function removeItem(list: ShoppingItem[], id: string): ShoppingItem[] {
  return list.filter((item) => item.id !== id);
}

export function clearChecked(list: ShoppingItem[]): ShoppingItem[] {
  return list.filter((item) => !item.checked);
}

export function formatAmount(item: ShoppingItem, system: UnitSystem): string {
  if (item.qty == null) return '';
  let amount = { qty: item.qty, unit: item.unit };
  if (amount.unit === 'tsp' && amount.qty >= 3) amount = { qty: amount.qty / 3, unit: 'tbsp' };
  amount = convert(amount, system);
  const number = formatQty(amount.qty, amount.unit);
  const unit = unitLabel(amount.unit, amount.qty);
  return unit ? `${number} ${unit}` : number;
}

export interface AisleGroup {
  aisle: Aisle;
  items: ShoppingItem[];
}

/** Group in shop-walk order; within an aisle, unticked first then by name. */
export function groupByAisle(list: ShoppingItem[]): AisleGroup[] {
  return AISLES.map((aisle) => ({
    aisle,
    items: list
      .filter((item) => item.aisle === aisle)
      .sort((a, b) => Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name)),
  })).filter((group) => group.items.length > 0);
}

export const AISLE_LABELS: Record<Aisle, string> = {
  produce: 'Fruit & veg',
  'meat-fish': 'Meat & fish',
  'dairy-eggs': 'Dairy & eggs',
  bakery: 'Bakery',
  pantry: 'Cupboard',
  spices: 'Herbs & spices',
  'tins-jars': 'Tins & jars',
  frozen: 'Frozen',
  drinks: 'Drinks',
  other: 'Everything else',
};

/** Plain-text list of what is still to buy, for sharing. */
export function toText(list: ShoppingItem[], system: UnitSystem): string {
  return groupByAisle(list.filter((item) => !item.checked))
    .map((group) => {
      const lines = group.items.map((item) => {
        const amount = formatAmount(item, system);
        return `- ${item.name}${amount ? ` (${amount})` : ''}`;
      });
      return [AISLE_LABELS[group.aisle], ...lines].join('\n');
    })
    .join('\n\n');
}
