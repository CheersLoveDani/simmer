import { allIngredients, type Aisle, type Recipe } from './schema';

/** Assumed to be in every kitchen; never counted as missing. */
export const STAPLES: ReadonlySet<string> = new Set(['salt', 'black pepper', 'water']);

export interface PantryMatch {
  recipe: Recipe;
  /** Display names of required ingredients the cook has. */
  have: string[];
  /** Display names of required ingredients the cook lacks. */
  missing: string[];
  /** 0..1 share of required ingredients on hand. */
  coverage: number;
}

export interface PantryItem {
  key: string;
  aisle: Aisle;
  /** How many recipes use it. */
  count: number;
}

/** Every ingredient in the library, for the pantry picker. */
export function pantryItems(recipes: Recipe[]): PantryItem[] {
  const items = new Map<string, PantryItem>();
  for (const recipe of recipes) {
    const seen = new Set<string>();
    for (const ingredient of allIngredients(recipe)) {
      if (STAPLES.has(ingredient.key) || seen.has(ingredient.key)) continue;
      seen.add(ingredient.key);
      const item = items.get(ingredient.key);
      if (item) item.count += 1;
      else items.set(ingredient.key, { key: ingredient.key, aisle: ingredient.aisle, count: 1 });
    }
  }
  return [...items.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/**
 * Rank recipes by how completely the cook's pantry covers them.
 * Recipes using none of the pantry are left out.
 */
export function rankByPantry(recipes: Recipe[], pantry: ReadonlySet<string>): PantryMatch[] {
  const matches: PantryMatch[] = [];
  for (const recipe of recipes) {
    const required = new Map<string, string>();
    for (const ingredient of allIngredients(recipe)) {
      if (ingredient.optional || STAPLES.has(ingredient.key)) continue;
      if (!required.has(ingredient.key)) required.set(ingredient.key, ingredient.item);
    }
    const have: string[] = [];
    const missing: string[] = [];
    for (const [key, name] of required) (pantry.has(key) ? have : missing).push(name);
    if (have.length === 0) continue;
    matches.push({ recipe, have, missing, coverage: have.length / required.size });
  }
  return matches.sort(
    (a, b) =>
      b.coverage - a.coverage ||
      a.missing.length - b.missing.length ||
      a.recipe.title.localeCompare(b.recipe.title),
  );
}
