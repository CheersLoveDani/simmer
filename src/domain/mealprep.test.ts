import { describe, expect, it } from 'vitest';
import { makeRecipe } from '../test/fixtures';
import { applyFilters, NO_FILTERS, sortRecipes } from './browse';
import { buildRecipe, draftFromRecipe } from './draft';
import {
  addMonths,
  addToStash,
  freshness,
  keeping,
  labelText,
  moveItem,
  movesFor,
  packAway,
  packSteps,
  placesFor,
  rebalance,
  reheatForItem,
  splitTotal,
  suggestSplit,
  takePortions,
  useByFor,
  useByLabel,
  type StashItem,
} from './mealprep';
import { dayEstimate, formatKcal, macroSplit, nutritionFor } from './nutrition';
import { recipeToText } from './recipeText';
import { parseRecipe, type MealPrep } from './schema';
import { mealAt, tendFoodLink, tendFoodText } from './tend';

const prep: MealPrep = {
  rating: 'great',
  fridgeDays: 2,
  freezerMonths: 2,
  portion: 'Cut into 4.',
  freeze: 'Cool, lid and freeze within 2 hours.',
  defrost: 'Overnight in the fridge.',
  reheat: [
    { method: 'microwave', from: 'chilled', minutes: 4, text: 'Cover and heat until steaming.' },
    { method: 'oven', from: 'frozen', minutes: 50, text: 'Covered, until hot in the centre.' },
  ],
  serveFresh: ['spring onions', 'gherkins'],
  tips: [],
};

const bake = makeRecipe({ id: 'bake', title: 'Pasta bake', serves: 4, nutrition: { kcal: 830, protein: 50, carbs: 82, fat: 33 }, mealPrep: prep });
const plain = makeRecipe({ id: 'plain' });
const scones = makeRecipe({ id: 'scones', mealPrep: { ...prep, fridgeDays: 0, roomDays: 2, freezerMonths: 3 } });
const guac = makeRecipe({ id: 'guac', mealPrep: { ...prep, rating: 'fresh', fridgeDays: 1, freezerMonths: 0, freeze: undefined, reheat: [] } });

describe('the feed', () => {
  it('reads meal prep and drops a malformed block without losing the recipe', () => {
    const ok = parseRecipe({ ...bake, mealPrep: prep });
    expect(ok?.mealPrep?.reheat).toHaveLength(2);
    const bad = parseRecipe({ ...bake, mealPrep: { rating: 'great' } });
    expect(bad).not.toBeNull();
    expect(bad?.mealPrep).toBeUndefined();
  });
});

describe('keeping', () => {
  it('uses the recipe, or general food safety advice', () => {
    expect(keeping(bake)).toEqual({ fridgeDays: 2, freezerMonths: 2, general: false });
    expect(keeping(plain)).toMatchObject({ fridgeDays: 2, freezerMonths: 3, general: true });
    expect(placesFor(bake)).toEqual(['fridge', 'freezer']);
    expect(placesFor(scones)).toEqual(['cupboard', 'freezer']);
    expect(placesFor(guac)).toEqual(['fridge']);
  });

  it('dates each place, and gives defrosted food a day', () => {
    const k = keeping(bake);
    expect(useByFor(k, 'fridge', '2026-11-16')).toBe('2026-11-18');
    expect(useByFor(k, 'freezer', '2026-11-16')).toBe('2027-01-16');
    expect(useByFor(k, 'fridge', '2026-11-16', true)).toBe('2026-11-17');
    expect(useByFor(keeping(scones), 'cupboard', '2026-11-16')).toBe('2026-11-18');
  });

  it('adds months without spilling into the next one', () => {
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
  });

  it('says how fresh a batch is', () => {
    const today = '2026-11-16';
    expect(freshness({ place: 'fridge', useBy: '2026-11-18' }, today)).toBe('ok');
    expect(freshness({ place: 'fridge', useBy: '2026-11-17' }, today)).toBe('soon');
    expect(freshness({ place: 'fridge', useBy: today }, today)).toBe('today');
    expect(freshness({ place: 'fridge', useBy: '2026-11-15' }, today)).toBe('past');
    expect(freshness({ place: 'freezer', useBy: '2026-11-25' }, today)).toBe('soon');
    expect(useByLabel({ place: 'fridge', useBy: today }, today)).toBe('Eat today');
    expect(useByLabel({ place: 'fridge', useBy: '2026-11-17' }, today)).toBe('Eat by tomorrow');
    expect(useByLabel({ place: 'freezer', useBy: '2027-01-16' }, today)).toBe('Best by 16 Jan 2027');
  });
});

describe('splitting a batch', () => {
  it('suggests a split that always adds up', () => {
    expect(suggestSplit(bake, 6, 2)).toEqual({ now: 2, fridge: 2, freezer: 2, cupboard: 0 });
    expect(suggestSplit(guac, 4, 0)).toEqual({ now: 0, fridge: 4, freezer: 0, cupboard: 0 });
    expect(suggestSplit(scones, 8, 0)).toEqual({ now: 0, fridge: 0, freezer: 0, cupboard: 8 });
  });

  it('takes from the other places when one grows, and gives back when it shrinks', () => {
    const places = placesFor(bake);
    const more = rebalance({ now: 0, fridge: 3, freezer: 2, cupboard: 0 }, 4, 'fridge', places);
    expect(more).toEqual({ now: 0, fridge: 3, freezer: 1, cupboard: 0 });
    const less = rebalance({ now: 0, fridge: 1, freezer: 2, cupboard: 0 }, 4, 'fridge', places);
    expect(splitTotal(less)).toBe(4);
    expect(less.fridge).toBe(1);
  });

  it('writes the packing steps, without repeating the cooling advice', () => {
    const steps = packSteps(bake, { now: 1, fridge: 0, freezer: 3, cupboard: 0 });
    expect(steps[0]).toMatch(/Serve 1 portion now/);
    expect(steps.join(' ')).toMatch(/Keep back the spring onions and gherkins/);
    expect(steps.filter((s) => /2 hours/.test(s))).toHaveLength(1);
    expect(packSteps(bake, { now: 4, fridge: 0, freezer: 0, cupboard: 0 })).toEqual([]);
  });
});

describe('the stash', () => {
  const today = '2026-11-16';
  const packed = packAway(bake, { now: 0, fridge: 2, freezer: 2, cupboard: 0 }, today);

  it('packs portions with dates and calories', () => {
    expect(packed).toHaveLength(2);
    expect(packed[0]).toMatchObject({ place: 'fridge', portions: 2, useBy: '2026-11-18', kcal: 830, title: 'Pasta bake' });
    expect(packed[1]).toMatchObject({ place: 'freezer', useBy: '2027-01-16' });
  });

  it('joins a second batch made the same day', () => {
    const stash = addToStash(packed, packAway(bake, { now: 0, fridge: 1, freezer: 0, cupboard: 0 }, today));
    expect(stash).toHaveLength(2);
    expect(stash.find((s) => s.place === 'fridge')!.portions).toBe(3);
  });

  it('eats portions and drops an empty batch', () => {
    const id = packed[0]!.id;
    expect(takePortions(packed, id, 1).find((s) => s.id === id)!.portions).toBe(1);
    expect(takePortions(packed, id, 2).some((s) => s.id === id)).toBe(false);
  });

  it('defrosts part of a frozen batch, which then cannot go back', () => {
    const frozen = packed[1]!;
    const k = keeping(bake);
    const after = moveItem(packed, frozen.id, 'fridge', 1, k, '2026-12-01');
    const thawed = after.find((s) => s.defrosted)!;
    expect(thawed).toMatchObject({ place: 'fridge', portions: 1, useBy: '2026-12-02' });
    expect(after.find((s) => s.id === frozen.id)!.portions).toBe(1);
    expect(movesFor(thawed, k, '2026-12-01')).toEqual([]);
    expect(movesFor(packed[0]!, k, today)).toEqual(['freezer']);
    expect(movesFor(packed[0]!, k, '2026-11-20')).toEqual([]);
  });

  it('reheats from frozen or chilled, and labels a container', () => {
    expect(reheatForItem(bake, packed[1]!)[0]!.method).toBe('oven');
    expect(reheatForItem(bake, packed[0]!)[0]!.method).toBe('microwave');
    expect(reheatForItem(undefined, packed[0]!)[0]!.text).toMatch(/steaming hot/);
    const text = labelText(packed[1]!, bake);
    expect(text).toContain('Pasta bake');
    expect(text).toContain('about 830 kcal each');
    expect(text).toContain('Best by 16 Jan 2027');
    expect(text).toContain('Defrost: Overnight in the fridge.');
    expect(text).toContain('Reheat: Oven, about 50 min.');
    expect(text).toContain('Add on the day: spring onions and gherkins');
    expect(text).toContain('Reheat once only');
  });
});

describe('calories', () => {
  it('scales nutrition and formats it', () => {
    expect(nutritionFor(bake, 2)).toEqual({ kcal: 1660, protein: 100, carbs: 164, fat: 66 });
    expect(nutritionFor(plain, 2)).toBeNull();
    expect(formatKcal(1660.4)).toBe('1,660 kcal');
    const split = macroSplit(bake.nutrition!)!;
    expect(split.protein + split.carbs + split.fat).toBeCloseTo(1);
  });

  it('adds up a day, counting meals with no estimate separately', () => {
    const byId = new Map([bake, plain].map((r) => [r.id, r]));
    const entries = [
      { id: 'a', date: '2026-11-16', meal: 'lunch' as const, recipeId: 'bake', servings: 2 },
      { id: 'b', date: '2026-11-16', meal: 'dinner' as const, recipeId: 'plain', servings: 2 },
    ];
    expect(dayEstimate(entries, byId)).toEqual({ kcal: 830, meals: 2, unknown: 1 });
  });

  it('filters and sorts by calories and meal prep', () => {
    const all = [bake, plain, guac, makeRecipe({ id: 'light', nutrition: { kcal: 300 } })];
    expect(applyFilters(all, { ...NO_FILTERS, keeps: 'prep' }).map((r) => r.id)).toEqual(['bake']);
    expect(applyFilters(all, { ...NO_FILTERS, keeps: 'freezer' }).map((r) => r.id)).toEqual(['bake']);
    expect(applyFilters(all, { ...NO_FILTERS, maxKcal: 400 }).map((r) => r.id)).toEqual(['light']);
    expect(sortRecipes(all, 'lightest').map((r) => r.id).slice(0, 2)).toEqual(['light', 'bake']);
  });
});

describe('Tend', () => {
  const food = { name: 'Pasta bake', portions: 2, nutrition: nutritionFor(bake, 2)!, meal: 'dinner' as const, at: 1_763_300_000_000, ref: 'bake' };

  it('builds a food log link Tend can read', () => {
    const url = new URL(tendFoodLink(food));
    expect(url.protocol).toBe('tend:');
    expect(url.host).toBe('food');
    expect(url.pathname).toBe('/add');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      v: '1',
      name: 'Pasta bake',
      portions: '2',
      kcal: '1660',
      protein: '100',
      carbs: '164',
      fat: '66',
      meal: 'dinner',
      at: '1763300000000',
      source: 'simmer',
      ref: 'bake',
    });
  });

  it('describes the meal in words, and guesses the meal from the time', () => {
    expect(tendFoodText(food)).toBe('Pasta bake, 2 portions: about 1660 kcal (protein 100 g, carbs 164 g, fat 66 g)');
    expect(mealAt(new Date(2026, 10, 16, 8))).toBe('breakfast');
    expect(mealAt(new Date(2026, 10, 16, 12))).toBe('lunch');
    expect(mealAt(new Date(2026, 10, 16, 19))).toBe('dinner');
    expect(mealAt(new Date(2026, 10, 16, 23))).toBe('snack');
  });
});

describe('your own recipes', () => {
  it('keep nutrition and meal prep through the editor', () => {
    const draft = draftFromRecipe(bake);
    const rebuilt = buildRecipe(draft, { id: 'mine.bake-x' })!;
    expect(rebuilt.nutrition).toEqual(bake.nutrition);
    expect(rebuilt.mealPrep).toEqual(prep);
  });

  it('drop frozen reheating when the dish does not freeze, and blank notes entirely', () => {
    const draft = draftFromRecipe(bake);
    const rebuilt = buildRecipe({ ...draft, mealPrep: { ...draft.mealPrep!, freezerMonths: 0 } }, { id: 'mine.bake-x' })!;
    expect(rebuilt.mealPrep!.reheat.every((r) => r.from === 'chilled')).toBe(true);
    expect(rebuilt.mealPrep!.freeze).toBeUndefined();
    const blank = buildRecipe({ ...draft, mealPrep: { ...draft.mealPrep!, portion: ' ' }, nutrition: { kcal: 0 } }, { id: 'mine.bake-x' })!;
    expect(blank.mealPrep).toBeUndefined();
    expect(blank.nutrition).toBeUndefined();
  });

  it('share meal prep and calories as text', () => {
    const text = recipeToText(bake, 4, 'metric');
    expect(text).toContain('MEAL PREP');
    expect(text).toContain('Keeps 2 days in the fridge, 2 months in the freezer.');
    expect(text).toContain('Reheat from frozen, oven: Covered, until hot in the centre.');
    expect(text).toContain('About 830 kcal per serving.');
  });
});

describe('backups', () => {
  it('keep the stash and drop a damaged entry', async () => {
    const { parseBackup, createBackup, EMPTY_USER_DATA } = await import('../store/backup');
    const item: StashItem = packAway(bake, { now: 0, fridge: 1, freezer: 0, cupboard: 0 }, '2026-11-16')[0]!;
    const file = createBackup({ ...EMPTY_USER_DATA, stash: [item, { id: 'bad' } as unknown as StashItem] });
    const result = parseBackup(file);
    expect(result.ok && result.data.stash).toEqual([item]);
  });
});
