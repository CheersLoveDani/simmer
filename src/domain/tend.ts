import type { Nutrition } from './schema';

// Tend is a companion app with a food log. Simmer hands it a meal as a link
// (tend://food/add?...), and Tend shows it prefilled for the person to confirm,
// so nothing is logged without them seeing it first.

export const TEND_MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type TendMeal = (typeof TEND_MEALS)[number];

export interface TendFood {
  /** What was eaten, e.g. "Cheesy frankfurter pasta bake". */
  name: string;
  portions: number;
  /** Totals for all the portions. */
  nutrition: Nutrition;
  meal: TendMeal;
  /** When it was eaten, ms since the epoch. */
  at: number;
  /** The recipe id, so Tend can group repeats. */
  ref: string;
}

/** The meal a time of day most likely is. */
export function mealAt(date: Date): TendMeal {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snack';
}

const round = (n: number) => String(Math.round(n * 10) / 10);

export function tendFoodLink(food: TendFood): string {
  const params = new URLSearchParams({ v: '1', name: food.name, portions: round(food.portions), kcal: String(Math.round(food.nutrition.kcal)) });
  for (const macro of ['protein', 'carbs', 'fat', 'fibre'] as const) {
    const value = food.nutrition[macro];
    if (value != null) params.set(macro, round(value));
  }
  params.set('meal', food.meal);
  params.set('at', String(Math.round(food.at)));
  params.set('source', 'simmer');
  params.set('ref', food.ref);
  return `tend://food/add?${params.toString()}`;
}

/** The same meal as words, for when the link cannot be opened. */
export function tendFoodText(food: TendFood): string {
  const n = food.nutrition;
  const macros = (['protein', 'carbs', 'fat'] as const)
    .filter((m) => n[m] != null)
    .map((m) => `${m} ${Math.round(n[m]!)} g`)
    .join(', ');
  const portions = food.portions === 1 ? '1 portion' : `${round(food.portions)} portions`;
  return `${food.name}, ${portions}: about ${Math.round(n.kcal)} kcal${macros ? ` (${macros})` : ''}`;
}
