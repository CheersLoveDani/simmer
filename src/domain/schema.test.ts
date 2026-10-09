import { describe, expect, it } from 'vitest';
import bundle from '../../e2e/library/bundle.json';
import { recipeSchema } from './schema';

const base = bundle.recipes.find((r) => 'imageCredit' in r)!;
const withCredit = (credit: Record<string, unknown>) => recipeSchema.parse({ ...base, imageCredit: credit });

describe('photo credits', () => {
  it('keeps a credit with https links', () => {
    const credit = { author: 'A. Baker', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0', source: 'https://example.org/p' };
    expect(withCredit(credit).imageCredit).toEqual(credit);
  });

  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'http://example.org/p', 'not a link'])('drops a credit whose source is %s', (source) => {
    const recipe = withCredit({ author: 'A', license: 'CC0', source });
    expect(recipe.imageCredit).toBeUndefined();
    expect(recipe.title).toBe(base.title);
  });

  it('drops only an unsafe licence link', () => {
    const recipe = withCredit({ author: 'A', license: 'CC0', licenseUrl: 'javascript:alert(1)', source: 'https://example.org/p' });
    expect(recipe.imageCredit).toEqual({ author: 'A', license: 'CC0', source: 'https://example.org/p' });
  });
});
