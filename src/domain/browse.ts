import { allIngredients, type Difficulty, type Recipe } from './schema';

export interface Filters {
  courses: string[];
  cuisines: string[];
  /** A recipe must satisfy every selected diet. */
  diets: string[];
  difficulties: Difficulty[];
  /** Total minutes, or null for any. */
  maxTime: number | null;
}

export const NO_FILTERS: Filters = { courses: [], cuisines: [], diets: [], difficulties: [], maxTime: null };

export type SortKey = 'title' | 'quickest' | 'newest' | 'easiest';

export function activeFilterCount(filters: Filters): number {
  return (
    filters.courses.length +
    filters.cuisines.length +
    filters.diets.length +
    filters.difficulties.length +
    (filters.maxTime == null ? 0 : 1)
  );
}

export function applyFilters(recipes: Recipe[], filters: Filters): Recipe[] {
  return recipes.filter(
    (r) =>
      (filters.courses.length === 0 || filters.courses.includes(r.course)) &&
      (filters.cuisines.length === 0 || filters.cuisines.includes(r.cuisine)) &&
      filters.diets.every((d) => r.diet.includes(d)) &&
      (filters.difficulties.length === 0 || filters.difficulties.includes(r.difficulty)) &&
      (filters.maxTime == null || r.time.total <= filters.maxTime),
  );
}

const DIFFICULTY_ORDER: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };

export function sortRecipes(recipes: Recipe[], key: SortKey): Recipe[] {
  const byTitle = (a: Recipe, b: Recipe) => a.title.localeCompare(b.title);
  const sorted = [...recipes];
  switch (key) {
    case 'title':
      return sorted.sort(byTitle);
    case 'quickest':
      return sorted.sort((a, b) => a.time.total - b.time.total || byTitle(a, b));
    case 'newest':
      return sorted.sort((a, b) => (b.updated ?? b.created).localeCompare(a.updated ?? a.created) || byTitle(a, b));
    case 'easiest':
      return sorted.sort(
        (a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty] || a.time.total - b.time.total || byTitle(a, b),
      );
  }
}

export interface Facet {
  value: string;
  count: number;
}

/** Distinct values of a field with how many recipes have each, most common first. */
export function facets(recipes: Recipe[], pick: (recipe: Recipe) => string | string[]): Facet[] {
  const counts = new Map<string, number>();
  for (const recipe of recipes) {
    const picked = pick(recipe);
    for (const value of Array.isArray(picked) ? picked : [picked]) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** Recipes most like the given one, by shared ingredients, tags, cuisine and course. */
export function relatedRecipes(recipe: Recipe, all: Recipe[], limit = 4): Recipe[] {
  const keys = new Set(allIngredients(recipe).map((i) => i.key));
  const tags = new Set(recipe.tags);
  return all
    .filter((other) => other.id !== recipe.id)
    .map((other) => {
      const otherKeys = new Set(allIngredients(other).map((i) => i.key));
      const shared = [...otherKeys].filter((k) => keys.has(k)).length;
      const overlap = shared / Math.max(1, Math.min(keys.size, otherKeys.size));
      const score =
        overlap * 3 +
        other.tags.filter((t) => tags.has(t)).length +
        (other.cuisine === recipe.cuisine ? 2 : 0) +
        (other.course === recipe.course ? 1 : 0);
      return { other, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.other.title.localeCompare(b.other.title))
    .slice(0, limit)
    .map((entry) => entry.other);
}

/** Stable pick of n recipes that changes once a day. */
export function dailyPicks(recipes: Recipe[], day: string, count: number): Recipe[] {
  const scored = recipes.map((recipe) => ({ recipe, score: hashString(`${day}:${recipe.id}`) }));
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, count)
    .map((entry) => entry.recipe);
}

export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
