import type { Recipe, Theme } from './schema';

/** How one recipe should look once its theme and style are worked out. */
export interface RecipeLook {
  themeId: string;
  /** The theme's name, e.g. the cookbook the recipe came from. */
  name: string;
  /** The style within the theme, e.g. a character. */
  label: string | null;
  accent: string;
  /** Text colour that stays readable on the accent. */
  accentInk: string;
  /** Feed path of the background art, if the theme has any. */
  art: string | null;
  credit: string | null;
}

/** Relative luminance of a "#rrggbb" colour, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const channel = (at: number) => {
    const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Black or white, whichever reads better on `hex`. */
export function inkOn(hex: string): string {
  return luminance(hex) > 0.36 ? '#14181a' : '#ffffff';
}

/**
 * The look for a recipe, or null when it has no theme or the theme is not
 * (or no longer) in the library. A style falls back to its theme for
 * anything it does not set, and dark mode falls back to the light accent.
 */
export function recipeLook(recipe: Pick<Recipe, 'theme'>, themes: ReadonlyMap<string, Theme>, dark: boolean): RecipeLook | null {
  if (!recipe.theme) return null;
  const theme = themes.get(recipe.theme.id);
  if (!theme) return null;
  const style = recipe.theme.style ? theme.styles[recipe.theme.style] : undefined;
  const light = style?.accent ?? theme.accent;
  const accent = dark ? (style?.accentDark ?? (style?.accent ? style.accent : (theme.accentDark ?? theme.accent))) : light;
  return {
    themeId: theme.id,
    name: theme.name,
    label: style?.label ?? null,
    accent,
    accentInk: inkOn(accent),
    art: style?.art ?? theme.art ?? null,
    credit: theme.credit ?? null,
  };
}

/** Words a themed recipe should also be findable by. */
export function themeSearchText(recipe: Pick<Recipe, 'theme'>, themes: ReadonlyMap<string, Theme>): string {
  const look = recipeLook(recipe, themes, false);
  return look ? [look.name, look.label].filter(Boolean).join(' ') : '';
}
