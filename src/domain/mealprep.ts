import { addDays, formatDay, fromISODate, toISODate } from './planner';
import type { MealPrep, Recipe, Reheat } from './schema';

// Batch cooking: how long cooked food keeps, what goes where, and how to bring it back.
// Defaults follow UK Food Standards Agency advice for leftovers: chill within 2 hours,
// eat within 2 days, defrost in the fridge and eat within 24 hours, reheat once.

export const PLACES = ['fridge', 'freezer', 'cupboard'] as const;
export type Place = (typeof PLACES)[number];

export const PLACE_LABELS: Record<Place, string> = { fridge: 'Fridge', freezer: 'Freezer', cupboard: 'Tin' };

/** Cooked portions waiting in the fridge, freezer or a tin. */
export interface StashItem {
  id: string;
  recipeId: string;
  /** Kept so the portion still makes sense if the recipe leaves the library. */
  title: string;
  portions: number;
  place: Place;
  /** The day it was cooked. */
  madeOn: string;
  /** The last day it should be eaten (fridge, tin) or is at its best (freezer). */
  useBy: string;
  /** Came out of the freezer: it must not go back in. */
  defrosted?: boolean;
  /** Estimated energy in one portion, when the recipe gives it. */
  kcal?: number;
}

export interface Keeping {
  fridgeDays: number;
  freezerMonths: number;
  roomDays?: number;
  /** True when the recipe says nothing and general food safety advice is used. */
  general: boolean;
}

const GENERAL: Keeping = { fridgeDays: 2, freezerMonths: 3, general: true };

export function keeping(recipe: Pick<Recipe, 'mealPrep'>): Keeping {
  const prep = recipe.mealPrep;
  if (!prep) return GENERAL;
  return { fridgeDays: prep.fridgeDays, freezerMonths: prep.freezerMonths, ...(prep.roomDays ? { roomDays: prep.roomDays } : {}), general: false };
}

/** Where this dish can be kept, best first. */
export function placesFor(recipe: Pick<Recipe, 'mealPrep'>): Place[] {
  const keeps = keeping(recipe);
  const places: Place[] = [];
  if (keeps.roomDays) places.push('cupboard');
  if (keeps.fridgeDays > 0) places.push('fridge');
  if (keeps.freezerMonths > 0) places.push('freezer');
  return places;
}

export function isPrepFriendly(recipe: Pick<Recipe, 'mealPrep'>): boolean {
  return recipe.mealPrep?.rating === 'great' || recipe.mealPrep?.rating === 'good';
}

export function freezes(recipe: Pick<Recipe, 'mealPrep'>): boolean {
  return (recipe.mealPrep?.freezerMonths ?? 0) > 0;
}

export function addMonths(iso: string, months: number): string {
  const date = fromISODate(iso);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  // 31 Jan + 1 month is the end of February, not early March.
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, last));
  return toISODate(date);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((fromISODate(to).getTime() - fromISODate(from).getTime()) / 86_400_000);
}

/** The use-by date for food put in `place` on `from`. */
export function useByFor(keeps: Keeping, place: Place, from: string, defrosted = false): string {
  if (place === 'freezer') return addMonths(from, keeps.freezerMonths || GENERAL.freezerMonths);
  if (place === 'cupboard') return addDays(from, keeps.roomDays ?? 1);
  // Defrosted food is eaten within 24 hours.
  if (defrosted) return addDays(from, 1);
  return addDays(from, keeps.fridgeDays || 1);
}

export type Freshness = 'ok' | 'soon' | 'today' | 'past';

export function freshness(item: Pick<StashItem, 'useBy' | 'place'>, today: string): Freshness {
  const left = daysBetween(today, item.useBy);
  if (left < 0) return 'past';
  if (left === 0) return 'today';
  if (left <= (item.place === 'freezer' ? 14 : 1)) return 'soon';
  return 'ok';
}

function shortDate(iso: string, today: string): string {
  const date = fromISODate(iso);
  const sameYear = date.getFullYear() === fromISODate(today).getFullYear();
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** "Eat today", "Eat by tomorrow", "Best by 16 Jan". */
export function useByLabel(item: Pick<StashItem, 'useBy' | 'place'>, today: string): string {
  const left = daysBetween(today, item.useBy);
  if (item.place === 'freezer') {
    return left < 0 ? `Past its best since ${shortDate(item.useBy, today)}` : `Best by ${shortDate(item.useBy, today)}`;
  }
  if (left < 0) return left === -1 ? 'Should have been eaten yesterday' : `Should have been eaten by ${shortDate(item.useBy, today)}`;
  if (left === 0) return 'Eat today';
  if (left === 1) return 'Eat by tomorrow';
  if (left < 7) return `Eat by ${formatDay(item.useBy, today).weekday}`;
  return `Eat by ${shortDate(item.useBy, today)}`;
}

// ---- The stash -------------------------------------------------------------

let counter = 0;
function newId(): string {
  counter += 1;
  return `s${Date.now().toString(36)}${counter.toString(36)}`;
}

export interface Split {
  /** Portions eaten straight away. */
  now: number;
  fridge: number;
  freezer: number;
  cupboard: number;
}

export const EMPTY_SPLIT: Split = { now: 0, fridge: 0, freezer: 0, cupboard: 0 };

export function splitTotal(split: Split): number {
  return split.now + split.fridge + split.freezer + split.cupboard;
}

export function keptPortions(split: Split): number {
  return split.fridge + split.freezer + split.cupboard;
}

/**
 * A sensible first split for a batch: two portions to eat now when cooking for
 * the table, the rest frozen if it freezes, otherwise in the fridge.
 */
export function suggestSplit(recipe: Pick<Recipe, 'mealPrep'>, total: number, eatNow: number): Split {
  const places = placesFor(recipe);
  const now = Math.min(Math.max(0, eatNow), total);
  const rest = total - now;
  if (places.length === 0) return { ...EMPTY_SPLIT, now: total };
  const keeps = keeping(recipe);
  if (places.includes('cupboard')) return { ...EMPTY_SPLIT, now, cupboard: rest };
  if (!places.includes('freezer')) return { ...EMPTY_SPLIT, now, fridge: rest };
  if (!places.includes('fridge')) return { ...EMPTY_SPLIT, now, freezer: rest };
  // Enough for the next day or two in the fridge, the rest in the freezer.
  const fridge = Math.min(rest, Math.max(1, Math.min(keeps.fridgeDays, 2)));
  return { ...EMPTY_SPLIT, now, fridge, freezer: rest - fridge };
}

/** Make the split add up to `total` again after one part changed, taking from the others. */
export function rebalance(split: Split, total: number, changed: keyof Split, places: Place[]): Split {
  const next = { ...split };
  const order: (keyof Split)[] = ['freezer', 'fridge', 'cupboard', 'now'].filter(
    (key) => key !== changed && (key === 'now' || places.includes(key as Place)),
  ) as (keyof Split)[];
  let over = splitTotal(next) - total;
  for (const key of order) {
    if (over <= 0) break;
    const take = Math.min(next[key], over);
    next[key] -= take;
    over -= take;
  }
  if (over < 0) {
    // Fewer portions than cooked: the gap goes to the first other place.
    const target = order.find((key) => key !== 'now') ?? order[0] ?? changed;
    next[target] += -over;
  }
  return next;
}

export function packAway(recipe: Pick<Recipe, 'id' | 'title' | 'mealPrep' | 'nutrition'>, split: Split, today: string): StashItem[] {
  const keeps = keeping(recipe);
  return (['fridge', 'freezer', 'cupboard'] as const)
    .filter((place) => split[place] > 0)
    .map((place) => ({
      id: newId(),
      recipeId: recipe.id,
      title: recipe.title,
      portions: split[place],
      place,
      madeOn: today,
      useBy: useByFor(keeps, place, today),
      ...(recipe.nutrition ? { kcal: Math.round(recipe.nutrition.kcal) } : {}),
    }));
}

/** Add new portions, joining any batch of the same dish made the same day in the same place. */
export function addToStash(stash: StashItem[], items: StashItem[]): StashItem[] {
  let next = [...stash];
  for (const item of items) {
    const same = next.find((s) => s.recipeId === item.recipeId && s.place === item.place && s.madeOn === item.madeOn && !s.defrosted && !item.defrosted);
    next = same ? next.map((s) => (s === same ? { ...s, portions: s.portions + item.portions } : s)) : [...next, item];
  }
  return next;
}

export function takePortions(stash: StashItem[], id: string, count: number): StashItem[] {
  return stash.flatMap((item) => {
    if (item.id !== id) return [item];
    const left = item.portions - count;
    return left > 0 ? [{ ...item, portions: left }] : [];
  });
}

export function setPortions(stash: StashItem[], id: string, portions: number): StashItem[] {
  return portions < 1 ? stash.filter((item) => item.id !== id) : stash.map((item) => (item.id === id ? { ...item, portions: Math.round(portions) } : item));
}

/** Where an item may go next: fridge food can be frozen while still in date, frozen food defrosted. */
export function movesFor(item: StashItem, keeps: Keeping, today: string): Place[] {
  if (item.place === 'freezer') return ['fridge'];
  if (item.place === 'fridge' && !item.defrosted && keeps.freezerMonths > 0 && daysBetween(today, item.useBy) >= 0) return ['freezer'];
  return [];
}

/**
 * Move some or all of a batch. Moving part of one splits it in two, so each
 * part keeps its own date.
 */
export function moveItem(stash: StashItem[], id: string, to: Place, count: number, keeps: Keeping, today: string): StashItem[] {
  const item = stash.find((s) => s.id === id);
  if (!item || count < 1) return stash;
  const defrosted = item.place === 'freezer' && to === 'fridge';
  const moved: StashItem = {
    ...item,
    id: count >= item.portions ? item.id : newId(),
    portions: Math.min(count, item.portions),
    place: to,
    useBy: useByFor(keeps, to, today, defrosted),
    ...(defrosted ? { defrosted: true } : {}),
  };
  const rest = takePortions(stash, id, moved.portions);
  return count >= item.portions ? stash.map((s) => (s.id === id ? moved : s)) : [...rest, moved];
}

/** Soonest first, so what needs eating is at the top. */
export function sortStash(stash: StashItem[]): StashItem[] {
  return [...stash].sort((a, b) => a.useBy.localeCompare(b.useBy) || a.title.localeCompare(b.title));
}

export function portionsIn(stash: StashItem[], place?: Place): number {
  return stash.filter((item) => !place || item.place === place).reduce((sum, item) => sum + item.portions, 0);
}

// ---- Reheating -------------------------------------------------------------

export const METHOD_LABELS: Record<string, string> = {
  microwave: 'Microwave',
  oven: 'Oven',
  hob: 'Hob',
  'air-fryer': 'Air fryer',
  grill: 'Grill',
  toaster: 'Toaster',
  none: 'No reheating',
};

export function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method.charAt(0).toUpperCase() + method.slice(1).replace(/-/g, ' ');
}

const GENERAL_REHEAT: Reheat[] = [
  { method: 'microwave', from: 'chilled', text: 'Cover loosely and heat on full, stirring halfway, until steaming hot all the way through.' },
  { method: 'oven', from: 'chilled', text: 'Cover with foil and heat at 180°C (160°C fan) until steaming hot in the centre.' },
];
const GENERAL_DEFROST = 'Defrost in the fridge overnight and eat within 24 hours, or reheat from frozen until steaming hot all the way through.';

/** How to bring a portion back, from the fridge or the freezer. */
export function reheatFor(recipe: Pick<Recipe, 'mealPrep'>, from: 'chilled' | 'frozen'): Reheat[] {
  const listed = recipe.mealPrep?.reheat ?? [];
  if (listed.length === 0) return from === 'chilled' ? GENERAL_REHEAT : [];
  const own = listed.filter((r) => r.from === from);
  return own;
}

export function defrostText(recipe: Pick<Recipe, 'mealPrep'>): string {
  return recipe.mealPrep?.defrost ?? GENERAL_DEFROST;
}

/** What to do with a portion from this place, ready for "Eat one". */
export function reheatForItem(recipe: Pick<Recipe, 'mealPrep'> | undefined, item: StashItem): Reheat[] {
  const prep = recipe ?? { mealPrep: undefined };
  if (item.place === 'freezer') {
    const frozen = reheatFor(prep, 'frozen');
    return frozen.length > 0 ? frozen : reheatFor(prep, 'chilled');
  }
  return reheatFor(prep, 'chilled');
}

export function reheatMinutesLabel(reheat: Reheat): string | null {
  if (!reheat.minutes) return null;
  if (reheat.minutes < 1) return `${Math.round(reheat.minutes * 60)} sec`;
  return `${Math.round(reheat.minutes)} min`;
}

export const RATING_TEXT: Record<MealPrep['rating'], { title: string; lead: string }> = {
  great: { title: 'Great for meal prep', lead: 'Portions, keeps and reheats well.' },
  good: { title: 'Good made ahead', lead: 'Fine cooked a day or two before.' },
  fresh: { title: 'Best eaten fresh', lead: 'Leftovers will keep, but it is at its best straight away.' },
};

/** What to do once the cooking is done, for cook mode's last card. */
export function packSteps(recipe: Pick<Recipe, 'mealPrep'>, split: Split): string[] {
  const prep = recipe.mealPrep;
  const steps: string[] = [];
  const kept = keptPortions(split);
  if (kept === 0) return steps;
  if (split.now > 0) steps.push(`Serve ${split.now} ${split.now === 1 ? 'portion' : 'portions'} now, then pack the rest straight away.`);
  steps.push(prep?.portion ?? `Divide the rest into ${kept} lidded containers.`);
  if (prep?.serveFresh.length) steps.push(`Keep back the ${joinList(prep.serveFresh)} to add on the day.`);
  // The recipe's own freezing note usually covers cooling; only add the general rule when it does not.
  const freezeNote = split.freezer > 0 ? prep?.freeze : undefined;
  if ((split.fridge > 0 || split.freezer > 0) && !(freezeNote && /cool/i.test(freezeNote) && split.fridge === 0)) {
    steps.push('Let it cool, uncovered, then lid it and get it into the fridge or freezer within 2 hours of cooking. Shallow containers cool fastest.');
  }
  if (split.freezer > 0) steps.push(freezeNote ? `For the freezer: ${freezeNote}` : 'Label each container with the name and date before it goes in the freezer.');
  return steps;
}

export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** A label for a container: name, date, how long it keeps and how to reheat it. */
export function labelText(item: StashItem, recipe: (Pick<Recipe, 'mealPrep'> & Partial<Pick<Recipe, 'diet'>>) | undefined): string {
  const reheat = reheatForItem(recipe, item)[0];
  const minutes = reheat ? reheatMinutesLabel(reheat) : null;
  const made = fromISODate(item.madeOn).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const useBy = fromISODate(item.useBy).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const lines = [
    item.title,
    `${item.portions} ${item.portions === 1 ? 'portion' : 'portions'}${item.kcal ? ` · about ${item.kcal} kcal each` : ''}`,
    `Made ${made}`,
    `${item.place === 'freezer' ? 'Best by' : 'Eat by'} ${useBy}`,
  ];
  if (item.place === 'freezer') lines.push(`Defrost: ${defrostText(recipe ?? { mealPrep: undefined })}`);
  if (reheat) lines.push(`Reheat: ${methodLabel(reheat.method)}${minutes ? `, about ${minutes}` : ''}. ${reheat.text}`);
  const fresh = recipe?.mealPrep?.serveFresh ?? [];
  if (fresh.length) lines.push(`Add on the day: ${joinList(fresh)}`);
  if (recipe?.diet?.length) lines.push(`Suits: ${recipe.diet.map((d) => d.replace(/-/g, ' ')).join(', ')}`);
  if (item.defrosted) lines.push('Defrosted: do not refreeze.');
  if (reheat && reheat.method !== 'none') lines.push('Reheat once only, until steaming hot all the way through.');
  return lines.join('\n');
}

export function todayISO(): string {
  return toISODate(new Date());
}
