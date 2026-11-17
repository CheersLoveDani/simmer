import type { PlanEntry } from './planner';
import type { Nutrition, Recipe } from './schema';

export const MACROS = ['protein', 'carbs', 'fat', 'fibre'] as const;
export type Macro = (typeof MACROS)[number];

export function formatKcal(kcal: number): string {
  return `${Math.round(kcal).toLocaleString('en-GB')} kcal`;
}

/** Everything in `portions` servings of a recipe, or null when it has no estimate. */
export function nutritionFor(recipe: Pick<Recipe, 'nutrition'>, portions: number): Nutrition | null {
  const per = recipe.nutrition;
  if (!per) return null;
  const scaled: Nutrition = { kcal: per.kcal * portions };
  for (const macro of MACROS) if (per[macro] != null) scaled[macro] = per[macro]! * portions;
  return scaled;
}

/** Energy per person across a day's planned meals; meals with no estimate are counted, not guessed. */
export function dayEstimate(entries: PlanEntry[], byId: ReadonlyMap<string, Recipe>): { kcal: number; meals: number; unknown: number } {
  let kcal = 0;
  let meals = 0;
  let unknown = 0;
  for (const entry of entries) {
    const recipe = byId.get(entry.recipeId);
    if (!recipe) continue;
    meals += 1;
    if (recipe.nutrition) kcal += recipe.nutrition.kcal;
    else unknown += 1;
  }
  return { kcal, meals, unknown };
}

/** Share of energy from each macro, for a small bar. */
export function macroSplit(n: Nutrition): { protein: number; carbs: number; fat: number } | null {
  if (n.protein == null || n.carbs == null || n.fat == null) return null;
  const energy = n.protein * 4 + n.carbs * 4 + n.fat * 9;
  if (energy <= 0) return null;
  return { protein: (n.protein * 4) / energy, carbs: (n.carbs * 4) / energy, fat: (n.fat * 9) / energy };
}
