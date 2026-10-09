import { describe, expect, it } from 'vitest';
import { makeRecipe } from '../test/fixtures';
import { parseThemes, type Theme } from './schema';
import { createSearchIndex } from './search';
import { inkOn, recipeLook, themeSearchText } from './theme';

const [arcade] = parseThemes([
  {
    id: 'arcade',
    name: 'Arcade Nights',
    credit: 'Art by the arcade',
    accent: '#f79a1e',
    accentDark: '#ffb84d',
    art: 'img/t/arcade/logo.abc.svg',
    styles: {
      scout: { label: 'Scout', accent: '#1e88f7', art: 'img/t/arcade/scout.abc.webp' },
      medic: { label: 'Medic', accentDark: '#ffe08a' },
    },
  },
]) as [Theme];
const themes = new Map([[arcade.id, arcade]]);
const themed = (style?: string) => makeRecipe({ id: 'pie', theme: { id: 'arcade', ...(style ? { style } : {}) } });

describe('recipeLook', () => {
  it('is null without a theme, or with one the library does not have', () => {
    expect(recipeLook(makeRecipe({ id: 'pie' }), themes, false)).toBeNull();
    expect(recipeLook(makeRecipe({ id: 'pie', theme: { id: 'gone' } }), themes, false)).toBeNull();
  });

  it('uses the theme on its own', () => {
    expect(recipeLook(themed(), themes, false)).toMatchObject({
      name: 'Arcade Nights',
      label: null,
      accent: '#f79a1e',
      art: 'img/t/arcade/logo.abc.svg',
      credit: 'Art by the arcade',
    });
    expect(recipeLook(themed(), themes, true)?.accent).toBe('#ffb84d');
  });

  it('lets a style override colour and art', () => {
    expect(recipeLook(themed('scout'), themes, false)).toMatchObject({ label: 'Scout', accent: '#1e88f7', art: 'img/t/arcade/scout.abc.webp' });
    // The style chose its own colour, so the theme's dark colour does not apply.
    expect(recipeLook(themed('scout'), themes, true)?.accent).toBe('#1e88f7');
  });

  it('falls back to the theme for what a style leaves out', () => {
    expect(recipeLook(themed('medic'), themes, false)).toMatchObject({ label: 'Medic', accent: '#f79a1e', art: 'img/t/arcade/logo.abc.svg' });
    expect(recipeLook(themed('medic'), themes, true)?.accent).toBe('#ffe08a');
    expect(recipeLook(themed('unknown'), themes, false)).toMatchObject({ label: null, accent: '#f79a1e' });
  });

  it('picks readable text for the accent', () => {
    expect(inkOn('#ffe08a')).toBe('#14181a');
    expect(inkOn('#1b3a8f')).toBe('#ffffff');
  });
});

describe('parseThemes', () => {
  it('skips malformed themes and unsafe art', () => {
    const parsed = parseThemes([
      { id: 'ok', name: 'Ok', accent: '#112233', art: 'https://elsewhere.test/x.png', styles: { a: { label: 'A', art: '../../secret.png', accent: 'red' } } },
      { id: 'bad', name: 'Bad', accent: 'orange' },
      'nonsense',
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.art).toBeUndefined();
    expect(parsed[0]!.styles.a).toEqual({ label: 'A' });
    expect(parseThemes(undefined)).toEqual([]);
  });
});

describe('search', () => {
  it('finds a recipe by its theme and style', () => {
    const recipes = [themed('scout'), makeRecipe({ id: 'plain-soup' })];
    const index = createSearchIndex(recipes, (r) => themeSearchText(r, themes));
    expect(index.search('arcade').map((h) => h.id)).toEqual(['pie']);
    expect(index.search('scout').map((h) => h.id)).toEqual(['pie']);
  });
});
