export const MEALS = ['breakfast', 'lunch', 'dinner'] as const;
export type Meal = (typeof MEALS)[number];

export interface PlanEntry {
  id: string;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  meal: Meal;
  recipeId: string;
  servings: number;
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function addDays(iso: string, days: number): string {
  const date = fromISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** The seven dates of the Monday-first week containing `iso`. */
export function weekOf(iso: string): string[] {
  const date = fromISODate(iso);
  const sinceMonday = (date.getDay() + 6) % 7;
  const monday = addDays(iso, -sinceMonday);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

let counter = 0;
function newId(): string {
  counter += 1;
  return `p${Date.now().toString(36)}${counter.toString(36)}`;
}

export function addEntry(plan: PlanEntry[], entry: Omit<PlanEntry, 'id'>): PlanEntry[] {
  return [...plan, { ...entry, servings: Math.max(1, Math.round(entry.servings)), id: newId() }];
}

export function removeEntry(plan: PlanEntry[], id: string): PlanEntry[] {
  return plan.filter((entry) => entry.id !== id);
}

export function moveEntry(plan: PlanEntry[], id: string, date: string, meal: Meal): PlanEntry[] {
  return plan.map((entry) => (entry.id === id ? { ...entry, date, meal } : entry));
}

export function setServings(plan: PlanEntry[], id: string, servings: number): PlanEntry[] {
  return plan.map((entry) => (entry.id === id ? { ...entry, servings: Math.max(1, Math.round(servings)) } : entry));
}

export function entriesFor(plan: PlanEntry[], date: string, meal: Meal): PlanEntry[] {
  return plan.filter((entry) => entry.date === date && entry.meal === meal);
}

export function entriesInWeek(plan: PlanEntry[], iso: string): PlanEntry[] {
  const days = new Set(weekOf(iso));
  return plan.filter((entry) => days.has(entry.date));
}

/** Drop entries whose recipe is no longer in the library. */
export function pruneEntries(plan: PlanEntry[], knownIds: ReadonlySet<string>): PlanEntry[] {
  return plan.filter((entry) => knownIds.has(entry.recipeId));
}

export function formatDay(iso: string, today: string): { weekday: string; day: string; isToday: boolean } {
  const date = fromISODate(iso);
  return {
    weekday: date.toLocaleDateString('en-GB', { weekday: 'short' }),
    day: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    isToday: iso === today,
  };
}
