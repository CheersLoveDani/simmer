import type { Recipe } from './schema';

export type PrepTask = Recipe['prep'][number];

/** The step a task can be fitted into, as a 0-based index, or null for "before you start". */
function stepIndex(task: PrepTask, recipe: Recipe): number | null {
  const index = (task.during ?? 0) - 1;
  return index >= 0 && index < recipe.steps.length ? index : null;
}

/** Jobs to do before cooking starts. */
export function prepBefore(recipe: Recipe): PrepTask[] {
  return recipe.prep.filter((task) => stepIndex(task, recipe) === null);
}

/** Jobs that fit into the waiting time of the step at `index` (0-based). */
export function prepDuring(recipe: Recipe, index: number): PrepTask[] {
  return recipe.prep.filter((task) => stepIndex(task, recipe) === index);
}

/** When to do a task, in words: "Before you start" or "During step 2 (Pasta)". */
export function prepWhen(task: PrepTask, recipe: Recipe): string {
  const index = stepIndex(task, recipe);
  if (index === null) return 'Before you start';
  const timer = recipe.steps[index]!.timer;
  return `During step ${index + 1}${timer ? ` (${timer.label})` : ''}`;
}
