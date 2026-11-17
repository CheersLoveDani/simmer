import { methodLabel } from './mealprep';
import { prepWhen } from './prep';
import { displayIngredient, formatMinutes, scaleFactor, type UnitSystem } from './quantity';
import { fold } from './search';
import type { Ingredient, Recipe, Step } from './schema';

/** A recipe as plain text, for sharing or copying. */
export function recipeToText(recipe: Recipe, servings: number, system: UnitSystem): string {
  const factor = scaleFactor(recipe.serves, servings);
  const lines: string[] = [recipe.title, '', recipe.description, ''];
  lines.push(`Serves ${servings} · ${formatMinutes(recipe.time.total)}`, '', 'INGREDIENTS');
  for (const group of recipe.ingredients) {
    if (group.section) lines.push('', `${group.section}:`);
    for (const item of group.items) {
      const view = displayIngredient(item, factor, system);
      lines.push(`- ${[view.amount, view.name].filter(Boolean).join(' ')}${view.detail ? `, ${view.detail}` : ''}`);
    }
  }
  if (recipe.prep.length > 0) {
    lines.push('', 'GET READY');
    for (const task of recipe.prep) lines.push(`- ${task.text} (${prepWhen(task, recipe).toLowerCase()})`);
  }
  lines.push('', 'METHOD');
  recipe.steps.forEach((step, i) => lines.push(`${i + 1}. ${step.text}`));
  const prep = recipe.mealPrep;
  if (prep) {
    const keeps = [
      prep.roomDays ? `${prep.roomDays} days in a tin` : null,
      prep.fridgeDays > 0 ? `${prep.fridgeDays} ${prep.fridgeDays === 1 ? 'day' : 'days'} in the fridge` : null,
      prep.freezerMonths > 0 ? `${prep.freezerMonths} ${prep.freezerMonths === 1 ? 'month' : 'months'} in the freezer` : 'does not freeze well',
    ].filter(Boolean);
    lines.push('', 'MEAL PREP', `Keeps ${keeps.join(', ')}.`, `Portioning: ${prep.portion}`);
    if (prep.freeze) lines.push(`Freezing: ${prep.freeze}`);
    if (prep.defrost) lines.push(`Defrosting: ${prep.defrost}`);
    for (const reheat of prep.reheat) {
      lines.push(`Reheat ${reheat.from === 'frozen' ? 'from frozen' : 'from the fridge'}, ${methodLabel(reheat.method).toLowerCase()}: ${reheat.text}`);
    }
  }
  if (recipe.nutrition) lines.push('', `About ${Math.round(recipe.nutrition.kcal)} kcal per serving.`);
  return lines.join('\n');
}

function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith('oes')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function words(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(stem);
}

/** Words too generic to tie a step to an ingredient ("fresh", "ground"). */
const WEAK = new Set(['fresh', 'ground', 'dried', 'large', 'small', 'whole', 'white', 'black', 'red', 'green', 'extra', 'virgin', 'unsalted', 'plain', 'of', 'and', 'or']);

/** Ingredients a step mentions, so cook mode can show amounts in context. */
export function ingredientsInStep(step: Step, recipe: Recipe): Ingredient[] {
  const stepWords = new Set(words(step.text));
  const seen = new Set<string>();
  const found: Ingredient[] = [];
  for (const group of recipe.ingredients) {
    for (const item of group.items) {
      if (seen.has(item.key)) continue;
      const candidates = [...words(item.item), ...words(item.key)].filter((w) => !WEAK.has(w) && w.length > 2);
      if (candidates.some((w) => stepWords.has(w))) {
        seen.add(item.key);
        found.push(item);
      }
    }
  }
  return found;
}
