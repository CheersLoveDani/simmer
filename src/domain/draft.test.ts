import { describe, expect, it } from 'vitest';
import { pasta } from '../test/fixtures';
import { buildRecipe, draftFromRecipe, draftSchema, emptyDraft, type RecipeDraft } from './draft';
import { parseIngredientLine } from './ingredientLine';
import { parseRecipe } from './schema';

const hotpot: RecipeDraft = {
  ...emptyDraft(),
  title: 'Lamb hotpot',
  description: 'My nan’s, slow and golden.',
  cuisine: 'british',
  serves: 4,
  time: { prep: 20, cook: 120, rest: 10 },
  ingredients: [{ section: null, items: [parseIngredientLine('500 g lamb neck'), parseIngredientLine('3 onions, sliced')] }],
  steps: [{ text: 'Layer everything in a deep dish.' }, { text: 'Bake.', timer: { minutes: 120, label: 'Hotpot' } }],
};

describe('buildRecipe', () => {
  it('turns a filled-in draft into a recipe the app can read', () => {
    const recipe = buildRecipe(hotpot, { now: new Date('2026-10-23T12:00:00Z') })!;
    expect(recipe).not.toBeNull();
    expect(parseRecipe(recipe)).not.toBeNull();
    expect(recipe.id).toMatch(/^mine\.lamb-hotpot-[a-z0-9]{4}$/);
    expect(recipe.time.total).toBe(150);
    expect(recipe.source).toBe('mine');
    expect(recipe.author).toBe('You');
    expect(recipe.created).toBe('2026-10-23');
    expect(recipe.ingredients[0]!.items[0]).toMatchObject({ item: 'lamb neck', key: 'lamb-neck', qty: 500, unit: 'g' });
  });

  it('builds nothing from an empty draft', () => {
    expect(buildRecipe(emptyDraft(), {})).toBeNull();
  });

  it('builds nothing without a title, an ingredient or a step', () => {
    expect(buildRecipe({ ...hotpot, title: '  ' }, {})).toBeNull();
    expect(buildRecipe({ ...hotpot, steps: [{ text: ' ' }] }, {})).toBeNull();
    expect(buildRecipe({ ...hotpot, ingredients: [{ section: null, items: [] }] }, {})).toBeNull();
  });

  it('drops blank lines left in the form', () => {
    const recipe = buildRecipe({ ...hotpot, steps: [...hotpot.steps, { text: '' }], tips: ['', 'Use a lid.'] }, {})!;
    expect(recipe.steps).toHaveLength(2);
    expect(recipe.tips).toEqual(['Use a lid.']);
  });

  it('treats an impossible quantity as no quantity rather than refusing the recipe', () => {
    const odd = { ...hotpot, ingredients: [{ section: null, items: [parseIngredientLine('0 g salt'), parseIngredientLine('1/0 cups flour'), { ...parseIngredientLine('2 eggs'), qtyMax: 1 }] }] };
    const recipe = buildRecipe(odd, {})!;
    expect(recipe).not.toBeNull();
    expect(recipe.ingredients[0]!.items.map((i) => [i.qty, i.qtyMax])).toEqual([[null, undefined], [null, undefined], [2, undefined]]);
  });

  it('does not let a bad timer stop the recipe saving', () => {
    const recipe = buildRecipe({ ...hotpot, steps: [{ text: 'Bake.', timer: { minutes: 0, label: '' } }] }, {})!;
    expect(recipe.steps[0]!.timer).toBeUndefined();
  });

  it('keeps the id and creation date when editing', () => {
    const first = buildRecipe(hotpot, { now: new Date('2026-10-01T00:00:00Z') })!;
    const again = buildRecipe({ ...draftFromRecipe(first), title: 'Nan’s lamb hotpot' }, { id: first.id, created: first.created })!;
    expect(again.id).toBe(first.id);
    expect(again.created).toBe('2026-10-01');
    expect(again.title).toBe('Nan’s lamb hotpot');
    expect(again.hash).not.toBe(first.hash);
  });

  it('gives a recipe a cover of its own', () => {
    const recipe = buildRecipe(hotpot, {})!;
    expect(recipe.cover.hue).toBeGreaterThanOrEqual(0);
    expect(recipe.cover.hue).toBeLessThan(360);
    expect(buildRecipe({ ...hotpot, title: 'Fish pie' }, {})!.cover.motif).toBe('fish');
  });
});

describe('draftFromRecipe', () => {
  it('round-trips a library recipe through the form', () => {
    const draft = draftFromRecipe(pasta);
    expect(draftSchema.safeParse(draft).success).toBe(true);
    const rebuilt = buildRecipe(draft, { id: 'mine.pasta-copy' })!;
    expect(rebuilt.ingredients).toEqual(pasta.ingredients);
    expect(rebuilt.steps).toEqual(pasta.steps);
  });
});
