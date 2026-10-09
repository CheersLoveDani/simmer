import type { CSSProperties } from 'react';
import type { Recipe } from '../domain/schema';
import { recipeLook, type RecipeLook } from '../domain/theme';
import { useLibrary } from '../store/libraryStore';
import { useDark, useFeedImage } from './hooks';

/**
 * A recipe's theme, worked out for the current light or dark mode, with the
 * inline style that recolours everything inside the element it is put on.
 */
export function useRecipeLook(recipe: Pick<Recipe, 'theme'> | undefined): { look: RecipeLook | null; style: CSSProperties | undefined } {
  const themes = useLibrary((s) => s.themes);
  const dark = useDark();
  const look = recipe ? recipeLook(recipe, themes, dark) : null;
  const style = look ? ({ '--theme-accent': look.accent, '--theme-ink': look.accentInk } as CSSProperties) : undefined;
  return { look, style };
}

/** The theme's artwork, faint in a corner behind the page. */
export function ThemeArt({ look }: { look: RecipeLook | null }) {
  const url = useFeedImage(look?.art ?? null);
  if (!url) return null;
  return <div className="theme-art no-print" data-testid="theme-art" style={{ backgroundImage: `url("${url}")` }} aria-hidden="true" />;
}

/** Names the theme, and the style within it, a recipe belongs to. */
export function ThemeBadge({ look, compact = false }: { look: RecipeLook | null; compact?: boolean }) {
  if (!look) return null;
  return (
    <span className={`theme-badge ${compact ? 'is-compact' : ''}`} data-testid="theme-badge" style={{ color: 'var(--flame)' }}>
      <span className="theme-dot" aria-hidden="true" />
      {look.name}
      {look.label && !compact && <span className="theme-style">{look.label}</span>}
    </span>
  );
}
