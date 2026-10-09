import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { relatedRecipes } from '../domain/browse';
import { MEALS, addDays, formatDay, toISODate, type Meal } from '../domain/planner';
import { displayIngredient, formatMinutes, scaleFactor } from '../domain/quantity';
import { recipeToText } from '../domain/recipeText';
import { label, type Recipe as RecipeType } from '../domain/schema';
import { shareText } from '../platform/device';
import { openExternal } from '../platform/env';
import { useLibrary, useRecipe } from '../store/libraryStore';
import { useSession } from '../store/sessionStore';
import { useUser } from '../store/userStore';
import { Icon } from '../ui/Icon';
import { CardRow, RecipeArt, RecipeCard } from '../ui/RecipeCard';
import { toast, useWide } from '../ui/hooks';
import { Button, Chip, Empty, IconButton, Segmented, Sheet, Stars, Stepper } from '../ui/primitives';
import { StepTimer } from './timers';

export function Recipe() {
  const { id } = useParams();
  const recipe = useRecipe(id);
  const ready = useLibrary((s) => s.status === 'ready');
  const navigate = useNavigate();

  if (!recipe) {
    if (!ready) return null;
    return (
      <div className="page">
        <Empty icon="pot" title="That recipe is no longer in the library">
          <p>It may have been renamed or removed in a recent update.</p>
          <Button variant="primary" onClick={() => navigate('/')}>
            Back to the cookbook
          </Button>
        </Empty>
      </div>
    );
  }
  return <RecipeView key={recipe.id} recipe={recipe} />;
}

function RecipeView({ recipe }: { recipe: RecipeType }) {
  const navigate = useNavigate();
  const wide = useWide();
  const all = useLibrary((s) => s.recipes);
  const user = useUser();
  const units = user.settings.units;
  const servings = user.servings[recipe.id] ?? recipe.serves;
  const factor = scaleFactor(recipe.serves, servings);
  const favourite = user.favourites.includes(recipe.id);
  const ticked = useSession((s) => s.ticked[recipe.id]) ?? [];
  const toggleTick = useSession((s) => s.toggleTick);
  const [planOpen, setPlanOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);

  const visit = user.visit;
  useEffect(() => {
    visit(recipe.id);
    window.scrollTo(0, 0);
  }, [recipe.id, visit]);

  const related = useMemo(() => relatedRecipes(recipe, all, 8), [recipe, all]);
  const cookedDates = user.cooked.filter((c) => c.recipeId === recipe.id).map((c) => c.date).sort();
  const today = toISODate(new Date());

  const share = async () => {
    const outcome = await shareText(recipe.title, recipeToText(recipe, servings, units));
    if (outcome === 'copied') toast('Recipe copied');
    if (outcome === 'failed') toast('Could not share this recipe');
  };

  const addToList = () => {
    user.addRecipeToShopping(recipe, servings);
    toast('Added to shopping list', { label: 'View', run: () => navigate('/shopping') });
  };

  const times = [
    { name: 'Prep', minutes: recipe.time.prep },
    { name: 'Cook', minutes: recipe.time.cook },
    { name: 'Rest', minutes: recipe.time.rest },
  ].filter((t) => t.minutes > 0);

  return (
    <article className="page recipe" data-testid="recipe-page">
      <div className="recipe-top no-print">
        <IconButton icon="back" label="Back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} />
        <div className="recipe-top-actions">
          <IconButton icon="heart" label={favourite ? 'Remove from favourites' : 'Add to favourites'} filled={favourite} active={favourite} aria-pressed={favourite} onClick={() => user.toggleFavourite(recipe.id)} />
          <IconButton icon="folder" label="Add to a collection" onClick={() => setCollectionsOpen(true)} />
          <IconButton icon="calendar" label="Add to meal plan" onClick={() => setPlanOpen(true)} />
          <IconButton icon="share" label="Share recipe" onClick={() => void share()} />
          {wide && <IconButton icon="print" label="Print recipe" onClick={() => window.print()} />}
        </div>
      </div>

      <div className="recipe-layout">
        <aside className="recipe-side">
          <div className="recipe-cover">
            <RecipeArt recipe={recipe} shared />
          </div>
          {recipe.image && recipe.imageCredit && (
            <p className="photo-credit">
              Photo by {recipe.imageCredit.author},{' '}
              <a
                href={recipe.imageCredit.source}
                onClick={(event) => {
                  event.preventDefault();
                  void openExternal(recipe.imageCredit!.source);
                }}
              >
                {recipe.imageCredit.license}
              </a>
            </p>
          )}

          <section className="ingredients" aria-labelledby="ingredients-title">
            <div className="ingredients-head">
              <h2 id="ingredients-title">Ingredients</h2>
              <Segmented
                label="Units"
                value={units}
                onChange={(value) => user.updateSettings({ units: value })}
                options={[
                  { value: 'metric', label: 'Metric' },
                  { value: 'us', label: 'US' },
                ]}
              />
            </div>
            <div className="servings">
              <span>Serves</span>
              <Stepper label="Servings" value={servings} min={1} max={48} onChange={(value) => user.setServings(recipe.id, value === recipe.serves ? 0 : value)} />
              {servings !== recipe.serves && (
                <button type="button" className="link-btn" onClick={() => user.setServings(recipe.id, 0)}>
                  Reset to {recipe.serves}
                </button>
              )}
            </div>
            {recipe.ingredients.map((group, g) => (
              <div key={g} className="ingredient-group">
                {group.section && <h3>{group.section}</h3>}
                <ul>
                  {group.items.map((item, i) => {
                    const key = `${g}-${i}`;
                    const view = displayIngredient(item, factor, units);
                    const done = ticked.includes(key);
                    return (
                      <li key={key}>
                        <label className={`ingredient ${done ? 'is-done' : ''}`}>
                          <input type="checkbox" checked={done} onChange={() => toggleTick(recipe.id, key)} />
                          <span className="tick" aria-hidden="true">
                            <Icon name="check" size={14} />
                          </span>
                          <span className="ingredient-text">
                            {view.amount && <strong className="tabular">{view.amount} </strong>}
                            <span>{view.name}</span>
                            {view.detail && <span className="muted">, {view.detail}</span>}
                            {item.optional && <span className="muted"> (optional)</span>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <Button icon="basket" className="no-print" onClick={addToList}>
              Add to shopping list
            </Button>
          </section>
        </aside>

        <div className="recipe-main">
          <header className="recipe-head">
            <h1>{recipe.title}</h1>
            <p className="recipe-desc">{recipe.description}</p>
            <dl className="facts">
              <div>
                <dt>Total</dt>
                <dd>{formatMinutes(recipe.time.total)}</dd>
              </div>
              {times.map((t) => (
                <div key={t.name}>
                  <dt>{t.name}</dt>
                  <dd>{formatMinutes(t.minutes)}</dd>
                </div>
              ))}
              <div>
                <dt>Difficulty</dt>
                <dd>{label(recipe.difficulty)}</dd>
              </div>
              {recipe.yield && (
                <div>
                  <dt>Makes</dt>
                  <dd>{recipe.yield}</dd>
                </div>
              )}
            </dl>
            <ul className="tag-list">
              {[recipe.course, recipe.cuisine, ...recipe.diet].map((tag) => (
                <li key={tag} className="tag">
                  {label(tag)}
                </li>
              ))}
            </ul>
            <Link to={`/recipe/${recipe.id}/cook`} className="btn btn-primary cook-btn no-print">
              <Icon name="pot" size={20} />
              Start cooking
            </Link>
          </header>

          <section aria-labelledby="method-title">
            <h2 id="method-title">Method</h2>
            <ol className="steps">
              {recipe.steps.map((step, i) => (
                <li key={i} className="step">
                  <span className="step-number tabular" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div className="step-body">
                    <p>{step.text}</p>
                    {step.tip && <p className="step-tip">{step.tip}</p>}
                    {step.timer && (
                      <div className="no-print">
                        <StepTimer id={`${recipe.id}:${i}`} label={step.timer.label} minutes={step.timer.minutes} recipeId={recipe.id} />
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {(recipe.tips.length > 0 || recipe.substitutions.length > 0 || recipe.storage || recipe.equipment.length > 0) && (
            <section className="extras">
              {recipe.tips.length > 0 && (
                <div>
                  <h3>Good to know</h3>
                  <ul className="plain-list">
                    {recipe.tips.map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                </div>
              )}
              {recipe.substitutions.length > 0 && (
                <div>
                  <h3>Swaps</h3>
                  <ul className="plain-list">
                    {recipe.substitutions.map((swap) => (
                      <li key={swap.for}>
                        No {swap.for}? Use {swap.use}
                        {swap.note ? ` (${swap.note})` : ''}.
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {recipe.equipment.length > 0 && (
                <div>
                  <h3>You will need</h3>
                  <p>{recipe.equipment.map((e, i) => (i === 0 ? label(e) : e)).join(', ')}</p>
                </div>
              )}
              {recipe.storage && (
                <div>
                  <h3>Keeping it</h3>
                  <p>{recipe.storage}</p>
                </div>
              )}
            </section>
          )}

          {recipe.nutrition && (
            <section aria-labelledby="nutrition-title">
              <h3 id="nutrition-title">Per serving, roughly</h3>
              <dl className="facts nutrition">
                <div>
                  <dt>Energy</dt>
                  <dd>{Math.round(recipe.nutrition.kcal)} kcal</dd>
                </div>
                {(['protein', 'carbs', 'fat', 'fibre'] as const).map((n) =>
                  recipe.nutrition?.[n] != null ? (
                    <div key={n}>
                      <dt>{label(n)}</dt>
                      <dd>{Math.round(recipe.nutrition[n]!)} g</dd>
                    </div>
                  ) : null,
                )}
              </dl>
            </section>
          )}

          <section className="yours no-print" aria-labelledby="yours-title">
            <h2 id="yours-title">Your kitchen notes</h2>
            <div className="yours-row">
              <Stars value={user.ratings[recipe.id] ?? 0} onChange={(stars) => user.setRating(recipe.id, stars)} />
              <Button
                icon="check"
                onClick={() => {
                  user.logCooked(recipe.id, today);
                  toast('Logged. Nicely done.');
                }}
                disabled={cookedDates.includes(today)}
              >
                {cookedDates.includes(today) ? 'Cooked today' : 'I cooked this'}
              </Button>
            </div>
            {cookedDates.length > 0 && (
              <p className="muted" data-testid="cooked-count">
                Cooked {cookedDates.length} {cookedDates.length === 1 ? 'time' : 'times'}, last on {formatDay(cookedDates.at(-1)!, today).day}.
              </p>
            )}
            <label className="note-field">
              <span className="visually-hidden">Your notes on this recipe</span>
              <textarea
                rows={3}
                value={user.notes[recipe.id] ?? ''}
                placeholder="What would you change next time?"
                onChange={(event) => user.setNote(recipe.id, event.target.value)}
              />
            </label>
          </section>
        </div>
      </div>

      {related.length > 0 && (
        <div className="no-print">
          <CardRow title="You might also like">
            {related.map((r) => (
              <RecipeCard key={r.id} recipe={r} size="small" />
            ))}
          </CardRow>
        </div>
      )}

      <PlanSheet recipe={recipe} servings={servings} open={planOpen} onClose={() => setPlanOpen(false)} />
      <CollectionsSheet recipeId={recipe.id} open={collectionsOpen} onClose={() => setCollectionsOpen(false)} />
    </article>
  );
}

function PlanSheet({ recipe, servings, open, onClose }: { recipe: RecipeType; servings: number; open: boolean; onClose(): void }) {
  const planAdd = useUser((s) => s.planAdd);
  const today = toISODate(new Date());
  const [date, setDate] = useState(today);
  const [meal, setMeal] = useState<Meal>('dinner');
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  return (
    <Sheet
      open={open}
      title="Add to meal plan"
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          onClick={() => {
            planAdd({ date, meal, recipeId: recipe.id, servings });
            toast(`Planned for ${formatDay(date, today).weekday} ${meal}`);
            onClose();
          }}
        >
          Add to plan
        </Button>
      }
    >
      <fieldset className="filter-group">
        <legend>Day</legend>
        <div className="chip-wrap">
          {days.map((day) => {
            const info = formatDay(day, today);
            return (
              <Chip key={day} selected={day === date} onToggle={() => setDate(day)}>
                {info.isToday ? 'Today' : `${info.weekday} ${info.day}`}
              </Chip>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="filter-group">
        <legend>Meal</legend>
        <div className="chip-wrap">
          {MEALS.map((m) => (
            <Chip key={m} selected={m === meal} onToggle={() => setMeal(m)}>
              {label(m)}
            </Chip>
          ))}
        </div>
      </fieldset>
    </Sheet>
  );
}

function CollectionsSheet({ recipeId, open, onClose }: { recipeId: string; open: boolean; onClose(): void }) {
  const collections = useUser((s) => s.collections);
  const toggleInCollection = useUser((s) => s.toggleInCollection);
  const createCollection = useUser((s) => s.createCollection);
  const [name, setName] = useState('');

  return (
    <Sheet open={open} title="Collections" onClose={onClose}>
      {collections.length === 0 && <p className="muted">Collections group recipes your way: Sunday lunches, things the kids eat, bakes to try.</p>}
      <ul className="check-list">
        {collections.map((collection) => {
          const inside = collection.recipeIds.includes(recipeId);
          return (
            <li key={collection.id}>
              <label className={`ingredient ${inside ? 'is-picked' : ''}`}>
                <input type="checkbox" checked={inside} onChange={() => toggleInCollection(collection.id, recipeId)} />
                <span className="tick" aria-hidden="true">
                  <Icon name="check" size={14} />
                </span>
                <span className="ingredient-text">{collection.name}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          const id = createCollection(name);
          if (id) {
            toggleInCollection(id, recipeId);
            setName('');
          }
        }}
      >
        <input type="text" value={name} placeholder="New collection name" aria-label="New collection name" onChange={(event) => setName(event.target.value)} />
        <Button type="submit" variant="primary" disabled={name.trim() === ''}>
          Create
        </Button>
      </form>
    </Sheet>
  );
}
