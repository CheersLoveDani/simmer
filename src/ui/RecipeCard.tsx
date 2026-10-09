import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
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

/** How far the pointer must travel before a press on a card becomes a drag. */
const DRAG_THRESHOLD = 6;

/**
 * A row of cards that scrolls sideways. Touch scrolls it natively; with a
 * mouse it can be dragged, and arrows appear when there is more to see.
 */
export function CardRow({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const [can, setCan] = useState({ back: false, forward: false });
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  const measure = useCallback(() => {
    const el = row.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const next = { back: el.scrollLeft > 4, forward: el.scrollLeft < max - 4 };
    setCan((prev) => (prev.back === next.back && prev.forward === next.forward ? prev : next));
  }, []);

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [measure, children]);

  const page = (direction: 1 | -1) => {
    const el = row.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !row.current) return;
    drag.current = { x: event.clientX, left: row.current.scrollLeft, moved: false };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || !row.current) return;
    const delta = event.clientX - state.x;
    if (!state.moved) {
      if (Math.abs(delta) < DRAG_THRESHOLD) return;
      state.moved = true;
      setDragging(true);
      row.current.setPointerCapture(event.pointerId);
    }
    row.current.scrollLeft = state.left - delta;
  };
  const endDrag = () => {
    if (!drag.current) return;
    const moved = drag.current.moved;
    // Kept until the click that follows a drag has been swallowed.
    if (moved) setTimeout(() => (drag.current = null), 0);
    else drag.current = null;
    setDragging(false);
  };

  const arrows = can.back || can.forward;
  return (
    <section className="row-section">
      <div className="row-head">
        <h2>{title}</h2>
        <div className="row-tools">
          {action}
          {arrows && (
            <div className="row-arrows no-print">
              <button type="button" className="row-arrow" onClick={() => page(-1)} disabled={!can.back} aria-label={`Scroll ${title} back`}>
                <Icon name="back" size={18} />
              </button>
              <button type="button" className="row-arrow" onClick={() => page(1)} disabled={!can.forward} aria-label={`Scroll ${title} forward`}>
                <Icon name="forward" size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
      <div
        ref={row}
        className={`card-row ${dragging ? 'is-dragging' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDragStart={(event) => event.preventDefault()}
        onClickCapture={(event) => {
          // Letting go after a drag must not open the card under the pointer.
          if (drag.current?.moved) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        {children}
      </div>
    </section>
  );
}
