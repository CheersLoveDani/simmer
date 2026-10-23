import { describe, expect, it } from 'vitest';
import { resolveBook } from './books';

describe('resolveBook', () => {
  it('reads owner/repo as a GitHub recipe book', () => {
    expect(resolveBook('Alice/family-recipes')).toEqual({
      key: expect.stringMatching(/^alice-family-recipes-[a-z0-9]{5}$/),
      name: 'family recipes',
      mirrors: ['https://alice.github.io/family-recipes/v1/', 'https://raw.githubusercontent.com/Alice/family-recipes/gh-pages/v1/'],
    });
  });

  it('reads a github.com link, wherever in the repo it points', () => {
    const key = resolveBook('Alice/family-recipes')!.key;
    expect(resolveBook('https://github.com/Alice/family-recipes/tree/main/recipes')?.key).toBe(key);
    expect(resolveBook(' github.com/Alice/family-recipes.git ')?.key).toBe(key);
  });

  it('reads a GitHub Pages address', () => {
    expect(resolveBook('https://alice.github.io/family-recipes/')?.mirrors[0]).toBe('https://alice.github.io/family-recipes/v1/');
    expect(resolveBook('https://alice.github.io/family-recipes/v1/')?.key).toBe(resolveBook('alice/family-recipes')!.key);
  });

  it('takes any other https address as a feed root', () => {
    const book = resolveBook('https://food.example.org/feed');
    expect(book?.mirrors).toEqual(['https://food.example.org/feed/']);
    expect(book?.key).toMatch(/^food-example-org-feed-[a-z0-9]{5}$/);
  });

  it('refuses the main library and anything that is not an address', () => {
    expect(resolveBook('https://cheerslovedani.github.io/simmer-recipes')).toBeNull();
    expect(resolveBook('CheersLoveDani/simmer-recipes')).toBeNull();
    expect(resolveBook('ftp://x.org/')).toBeNull();
    expect(resolveBook('http://x.org/')).toBeNull();
    expect(resolveBook('hello')).toBeNull();
    expect(resolveBook('')).toBeNull();
  });

  it('gives different repos different keys, even when their names run together', () => {
    expect(resolveBook('a-b/c')!.key).not.toBe(resolveBook('a/b-c')!.key);
    expect(resolveBook('https://food.example.org/a-b')!.key).not.toBe(resolveBook('https://food.example.org/a/b')!.key);
    expect(resolveBook('Alice/Family-Recipes')!.key).toBe(resolveBook('alice/family-recipes')!.key);
  });

  it('keeps keys short', () => {
    expect(resolveBook(`alice/${'a'.repeat(80)}`)!.key.length).toBeLessThanOrEqual(40);
  });
});
