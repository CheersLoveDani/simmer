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
  lines.push('', 'METHOD');
  recipe.steps.forEach((step, i) => lines.push(`${i + 1}. ${step.text}`));
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
