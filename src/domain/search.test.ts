import { describe, expect, it } from 'vitest';
import { brownies, curry, ing, library, makeRecipe, pasta } from '../test/fixtures';
import { createSearchIndex, fold, highlight } from './search';

const index = createSearchIndex(library);
const ids = (query: string) => index.search(query).map((hit) => hit.id);

describe('search', () => {
  it('finds a recipe by title', () => {
    expect(ids('brownies')[0]).toBe(brownies.id);
  });

  it('finds recipes by ingredient', () => {
    expect(ids('chickpeas')).toEqual([curry.id]);
    expect(ids('garlic')).toEqual(expect.arrayContaining([pasta.id, curry.id]));
    expect(ids('garlic')).not.toContain(brownies.id);
  });

  it('finds a recipe by the canonical ingredient key as well as the written name', () => {
    expect(ids('unsalted')).toContain(pasta.id);
    expect(ids('cumin')).toEqual([curry.id]);
  });

  it('tolerates typos', () => {
    expect(ids('spagetti')).toEqual([pasta.id]);
    expect(ids('browneis')).toEqual([brownies.id]);
    expect(ids('chikpea')).toEqual([curry.id]);
  });

  it('matches as you type', () => {
    expect(ids('choc')).toEqual([brownies.id]);
    expect(ids('mi')).toContain(pasta.id);
  });

  it('finds by tag, diet, cuisine and course', () => {
    expect(ids('umami')).toEqual([pasta.id]);
    expect(ids('vegan')).toEqual([curry.id]);
    expect(ids('indian')).toEqual([curry.id]);
    expect(ids('baking')).toEqual([brownies.id]);
  });

  it('requires every word when that gives results', () => {
    expect(ids('garlic coconut')).toEqual([curry.id]);
  });

  it('falls back to any word when no recipe has them all', () => {
    expect(ids('chocolate chickpeas')).toEqual(expect.arrayContaining([brownies.id, curry.id]));
  });

  it('ranks a title match above an ingredient match', () => {
    const butterCake = makeRecipe({ id: 'butter-cake', title: 'Butter Cake' });
    // Brownies only list butter as an ingredient.
    const local = createSearchIndex([brownies, curry, butterCake]);
    expect(local.search('butter').map((hit) => hit.id)).toEqual(['butter-cake', brownies.id]);
  });

  it('ignores accents in both the query and the recipe', () => {
    const brulee = makeRecipe({
      id: 'creme-brulee',
      title: 'Crème Brûlée',
      ingredients: [{ section: null, items: [ing({ item: 'jalapeño' })] }],
    });
    const local = createSearchIndex([brulee]);
    expect(local.search('creme brulee')).toHaveLength(1);
    expect(local.search('crème')).toHaveLength(1);
    expect(local.search('jalapeno')).toHaveLength(1);
  });

  it('reports which ingredients matched', () => {
    const [hit] = index.search('miso');
    expect(hit?.ingredients).toEqual(['white miso']);
  });

  it.each(['', '   ', '!!!', '?', '--', '"'])('returns nothing for %j without throwing', (query) => {
    expect(index.search(query)).toEqual([]);
    expect(index.suggest(query)).toEqual([]);
  });

  it('copes with punctuation around real words', () => {
    expect(ids('chickpea & spinach!')).toEqual([curry.id]);
    expect(ids('(garlic)')).toContain(pasta.id);
  });

  it('respects the limit', () => {
    expect(index.search('garlic', 1)).toHaveLength(1);
  });

  it('returns no results for something absent', () => {
    expect(ids('zzzzqqq')).toEqual([]);
  });

  it('works on an empty library', () => {
    expect(createSearchIndex([]).search('anything')).toEqual([]);
  });

  it('suggests completions', () => {
    expect(index.suggest('brow')).toContain('brownies');
  });
});

describe('fold', () => {
  it('lowercases and strips accents', () => {
    expect(fold('Crème FRAÎCHE')).toBe('creme fraiche');
  });
});

describe('highlight', () => {
  it('marks matching words and keeps the original text', () => {
    const segments = highlight('Brown Butter Miso Pasta', ['miso', 'butter']);
    expect(segments.map((s) => s.text).join('')).toBe('Brown Butter Miso Pasta');
    expect(segments.filter((s) => s.hit).map((s) => s.text)).toEqual(['Butter', 'Miso']);
  });

  it('matches regardless of accents', () => {
    expect(highlight('Crème Brûlée', ['creme']).find((s) => s.hit)?.text).toBe('Crème');
  });

  it('returns one plain segment when there is nothing to mark', () => {
    expect(highlight('Plain', [])).toEqual([{ text: 'Plain', hit: false }]);
    expect(highlight('Plain', ['other'])).toEqual([{ text: 'Plain', hit: false }]);
  });
});
