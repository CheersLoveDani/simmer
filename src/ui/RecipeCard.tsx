import type { ReactNode } from 'react';
import { Link, useViewTransitionState } from 'react-router';
import { formatMinutes } from '../domain/quantity';
import { label, type Recipe } from '../domain/schema';
import { highlight } from '../domain/search';
import { useUser } from '../store/userStore';
import { Cover } from './Cover';
import { Icon } from './Icon';
import { useRecipeImage } from './hooks';
import { ThemeBadge, useRecipeLook } from './Themed';

/** A recipe's photo when it has one, otherwise its generated cover. */
export function RecipeArt({ recipe, className = '', shared = false }: { recipe: Recipe; className?: string; shared?: boolean }) {
  const photo = useRecipeImage(recipe);
  const style = shared ? { viewTransitionName: 'cover' } : undefined;
  if (photo) return <img className={`art ${className}`} style={style} src={photo} alt="" />;
  return <Cover recipe={recipe} className={`art ${className}`} style={style} />;
}

export function Highlighted({ text, terms }: { text: string; terms?: string[] }) {
  if (!terms?.length) return <>{text}</>;
  return (
    <>
      {highlight(text, terms).map((segment, i) => (segment.hit ? <mark key={i}>{segment.text}</mark> : <span key={i}>{segment.text}</span>))}
    </>
  );
}

interface CardProps {
  recipe: Recipe;
  terms?: string[];
  /** Extra line under the meta, e.g. matched ingredients. */
  children?: ReactNode;
  size?: 'regular' | 'small';
}

export function RecipeCard({ recipe, terms, children, size = 'regular' }: CardProps) {
  const href = `/recipe/${recipe.id}`;
  const travelling = useViewTransitionState(href);
  const { look, style } = useRecipeLook(recipe);
  const favourite = useUser((s) => s.favourites.includes(recipe.id));
  return (
    <Link to={href} viewTransition className={`card card-${size} ${look ? 'is-themed' : ''}`} style={style} data-testid="recipe-card">
      <div className="card-cover">
        <RecipeArt recipe={recipe} shared={travelling} />
        {favourite && (
          <span className="card-fav" aria-label="Favourite">
            <Icon name="heart" filled size={15} />
          </span>
        )}
      </div>
      <h3 className="card-title">
        <Highlighted text={recipe.title} terms={terms} />
      </h3>
      <p className="card-meta muted">
        <span>{formatMinutes(recipe.time.total)}</span>
        <span className="dot" aria-hidden="true" />
        <span>{label(recipe.difficulty)}</span>
      </p>
      <ThemeBadge look={look} compact />
      {children}
    </Link>
  );
}

export function CardGrid({ children }: { children: ReactNode }) {
  return <div className="card-grid">{children}</div>;
}

export function CardRow({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="row-section">
      <div className="row-head">
        <h2>{title}</h2>
        {action}
      </div>
      <div className="card-row">{children}</div>
    </section>
  );
}
