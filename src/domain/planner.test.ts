import { describe, expect, it } from 'vitest';
import { brownies, curry, pasta } from '../test/fixtures';
import {
  addDays,
  addEntry,
  entriesFor,
  entriesInWeek,
  formatDay,
  fromISODate,
  moveEntry,
  pruneEntries,
  removeEntry,
  setServings,
  toISODate,
  weekOf,
} from './planner';
import { ingredientsInStep, recipeToText } from './recipeText';
import { formatClock, newlyDone, planAlerts, progress, remaining, timersReducer, type Timer } from './timers';

describe('dates', () => {
  it('round-trips local dates', () => {
    expect(toISODate(fromISODate('2026-10-09'))).toBe('2026-10-09');
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('gives the Monday-first week containing a date', () => {
    // 9 Oct 2026 is a Friday.
    const week = weekOf('2026-10-09');
    expect(week).toHaveLength(7);
    expect(week[0]).toBe('2026-10-05');
    expect(week[6]).toBe('2026-10-11');
    expect(weekOf('2026-10-11')[0]).toBe('2026-10-05');
    expect(weekOf('2026-10-05')[0]).toBe('2026-10-05');
  });

  it('labels a day', () => {
    expect(formatDay('2026-10-09', '2026-10-09')).toMatchObject({ weekday: 'Fri', isToday: true });
    expect(formatDay('2026-10-10', '2026-10-09').isToday).toBe(false);
  });
});

describe('plan', () => {
  const base = addEntry([], { date: '2026-10-09', meal: 'dinner', recipeId: pasta.id, servings: 2 });

  it('adds entries with unique ids', () => {
    const plan = addEntry(base, { date: '2026-10-09', meal: 'dinner', recipeId: curry.id, servings: 4 });
    expect(new Set(plan.map((e) => e.id)).size).toBe(2);
    expect(entriesFor(plan, '2026-10-09', 'dinner')).toHaveLength(2);
    expect(entriesFor(plan, '2026-10-09', 'lunch')).toEqual([]);
  });

  it('moves, resizes and removes', () => {
    const id = base[0]!.id;
    expect(moveEntry(base, id, '2026-10-10', 'lunch')[0]).toMatchObject({ date: '2026-10-10', meal: 'lunch' });
    expect(setServings(base, id, 5.4)[0]?.servings).toBe(5);
    expect(setServings(base, id, 0)[0]?.servings).toBe(1);
    expect(removeEntry(base, id)).toEqual([]);
  });

  it('never stores less than one serving', () => {
    expect(addEntry([], { date: '2026-10-09', meal: 'lunch', recipeId: pasta.id, servings: 0 })[0]?.servings).toBe(1);
  });

  it('selects the entries in a week', () => {
    const plan = addEntry(base, { date: '2026-10-12', meal: 'dinner', recipeId: curry.id, servings: 4 });
    expect(entriesInWeek(plan, '2026-10-07').map((e) => e.recipeId)).toEqual([pasta.id]);
  });

  it('drops entries for recipes that no longer exist', () => {
    const plan = addEntry(base, { date: '2026-10-10', meal: 'dinner', recipeId: 'gone', servings: 2 });
    expect(pruneEntries(plan, new Set([pasta.id])).map((e) => e.recipeId)).toEqual([pasta.id]);
  });
});

describe('timers', () => {
  const start = (timers: Timer[] = [], id = 'a', minutes = 1, now = 1000) =>
    timersReducer(timers, { type: 'start', id, label: 'Pasta', minutes, now });

  it('starts a running timer', () => {
    const [timer] = start();
    expect(timer).toMatchObject({ status: 'running', durationMs: 60_000, endsAt: 61_000 });
    expect(remaining(timer!, 31_000)).toBe(30_000);
  });

  it('ignores a zero or invalid duration', () => {
    expect(start([], 'a', 0)).toEqual([]);
    expect(start([], 'a', Number.NaN)).toEqual([]);
  });

  it('restarts rather than duplicates a timer with the same id', () => {
    const timers = start(start(), 'a', 2, 5000);
    expect(timers).toHaveLength(1);
    expect(timers[0]?.durationMs).toBe(120_000);
  });

  it('pauses and resumes without losing time', () => {
    let timers = timersReducer(start(), { type: 'pause', id: 'a', now: 21_000 });
    expect(timers[0]).toMatchObject({ status: 'paused', remainingMs: 40_000 });
    expect(remaining(timers[0]!, 999_999)).toBe(40_000);
    timers = timersReducer(timers, { type: 'resume', id: 'a', now: 100_000 });
    expect(timers[0]).toMatchObject({ status: 'running', endsAt: 140_000 });
  });

  it('finishes on tick and reports it once', () => {
    const before = start();
    const same = timersReducer(before, { type: 'tick', now: 60_999 });
    expect(same).toBe(before);
    const after = timersReducer(before, { type: 'tick', now: 61_000 });
    expect(after[0]?.status).toBe('done');
    expect(newlyDone(before, after).map((t) => t.id)).toEqual(['a']);
    expect(newlyDone(after, timersReducer(after, { type: 'tick', now: 70_000 }))).toEqual([]);
  });

  it('does not finish a paused timer', () => {
    const paused = timersReducer(start(), { type: 'pause', id: 'a', now: 2000 });
    expect(timersReducer(paused, { type: 'tick', now: 9_999_999 })[0]?.status).toBe('paused');
  });

  it('adds time while running, paused or done', () => {
    expect(timersReducer(start(), { type: 'add', id: 'a', minutes: 1, now: 2000 })[0]?.endsAt).toBe(121_000);
    const paused = timersReducer(start(), { type: 'pause', id: 'a', now: 1000 });
    expect(timersReducer(paused, { type: 'add', id: 'a', minutes: 1, now: 5000 })[0]?.remainingMs).toBe(120_000);
    const done = timersReducer(start(), { type: 'tick', now: 70_000 });
    expect(timersReducer(done, { type: 'add', id: 'a', minutes: 1, now: 80_000 })[0]).toMatchObject({
      status: 'running',
      endsAt: 140_000,
    });
  });

  it('dismisses', () => {
    expect(timersReducer(start(), { type: 'dismiss', id: 'a' })).toEqual([]);
  });

  it('plans system alerts to match the running timers', () => {
    const running = start(start([], 'a', 1), 'b', 2);
    const first = planAlerts(new Map(), running);
    expect(first.schedule.map((t) => t.id)).toEqual(['a', 'b']);
    expect(first.cancel).toEqual([]);

    // Nothing changed: nothing to do.
    expect(planAlerts(first.scheduled, running)).toMatchObject({ schedule: [], cancel: [] });

    // Extending a timer moves its alert; pausing or removing one withdraws it.
    const extended = timersReducer(running, { type: 'add', id: 'a', minutes: 1, now: 2000 });
    const second = planAlerts(first.scheduled, extended);
    expect(second.schedule.map((t) => t.id)).toEqual(['a']);
    expect(second.cancel).toEqual(['a']);

    const paused = timersReducer(extended, { type: 'pause', id: 'b', now: 3000 });
    expect(planAlerts(second.scheduled, paused)).toMatchObject({ schedule: [], cancel: ['b'] });
    expect(planAlerts(second.scheduled, timersReducer(extended, { type: 'dismiss', id: 'b' })).cancel).toEqual(['b']);
  });

  it('leaves the alert alone when a timer finishes', () => {
    const running = start();
    const { scheduled } = planAlerts(new Map(), running);
    const done = timersReducer(running, { type: 'tick', now: 999_999 });
    const plan = planAlerts(scheduled, done);
    expect(plan).toMatchObject({ schedule: [], cancel: [] });
    expect(plan.scheduled.size).toBe(0);
  });

  it('formats a clock', () => {
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(3_723_000)).toBe('1:02:03');
    expect(formatClock(500)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-5)).toBe('0:00');
  });

  it('reports progress between 0 and 1', () => {
    const [timer] = start();
    expect(progress(timer!, 1000)).toBe(0);
    expect(progress(timer!, 31_000)).toBe(0.5);
    expect(progress(timer!, 999_000)).toBe(1);
  });
});

describe('recipe text', () => {
  it('writes a shareable recipe scaled to the servings', () => {
    const text = recipeToText(pasta, 4, 'metric');
    expect(text.startsWith('Brown Butter Miso Pasta\n')).toBe(true);
    expect(text).toContain('Serves 4 · 17 min');
    expect(text).toContain('- 400 g spaghetti');
    expect(text).toContain('- 4 cloves garlic, finely grated');
    expect(text).toContain('- black pepper, lots');
    expect(text).toContain('1. Boil the spaghetti');
  });

  it('includes section headings', () => {
    expect(recipeToText({ ...brownies, ingredients: [{ section: 'Batter', items: brownies.ingredients[0]!.items }] }, 16, 'metric')).toContain(
      'Batter:',
    );
  });

  it('finds the ingredients a step mentions', () => {
    const keys = (index: number) => ingredientsInStep(pasta.steps[index]!, pasta).map((i) => i.key);
    expect(keys(0)).toEqual(['spaghetti']);
    expect(keys(1)).toEqual(['butter', 'miso', 'garlic']);
    expect(keys(2)).toEqual(['black pepper']);
  });

  it('matches plurals', () => {
    const step = { text: 'Crack in the egg and add the tomatoes.' };
    const recipe = { ...brownies, steps: [step] };
    expect(ingredientsInStep(step, recipe).map((i) => i.key)).toEqual(['egg']);
  });
});
