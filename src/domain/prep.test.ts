import { describe, expect, it } from 'vitest';
import bundle from '../../e2e/library/bundle.json';
import { prepBefore, prepDuring, prepWhen } from './prep';
import { recipeSchema } from './schema';

const base = bundle.recipes[0]!;
const withPrep = (prep: unknown) => recipeSchema.parse({ ...base, prep });

describe('prep', () => {
  it('defaults to an empty list for recipes without one', () => {
    expect(recipeSchema.parse(base).prep).toEqual([]);
  });

  it('splits tasks into before-you-start and during a step', () => {
    const recipe = withPrep([{ text: 'Chop the onion.' }, { text: 'Grate the cheese.', during: 1 }]);
    expect(prepBefore(recipe).map((t) => t.text)).toEqual(['Chop the onion.']);
    expect(prepDuring(recipe, 0).map((t) => t.text)).toEqual(['Grate the cheese.']);
    expect(prepDuring(recipe, 1)).toEqual([]);
  });

  it('treats a step number past the end as before you start', () => {
    const recipe = withPrep([{ text: 'Chop the onion.', during: 99 }]);
    expect(prepBefore(recipe)).toHaveLength(1);
    expect(prepWhen(recipe.prep[0]!, recipe)).toBe('Before you start');
  });

  it('names the step and its timer', () => {
    const recipe = withPrep([{ text: 'Grate the cheese.', during: 1 }]);
    const timer = recipe.steps[0]!.timer;
    expect(prepWhen(recipe.prep[0]!, recipe)).toBe(`During step 1${timer ? ` (${timer.label})` : ''}`);
  });

  it('drops a malformed list rather than the whole recipe', () => {
    const recipe = withPrep('not a list');
    expect(recipe.prep).toEqual([]);
    expect(recipe.title).toBe(base.title);
  });
});
