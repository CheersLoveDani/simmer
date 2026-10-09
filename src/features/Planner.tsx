import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { MEALS, addDays, entriesFor, entriesInWeek, formatDay, fromISODate, toISODate, weekOf, type Meal } from '../domain/planner';
import { label } from '../domain/schema';
import { useLibrary } from '../store/libraryStore';
import { useUser } from '../store/userStore';
import { Icon } from '../ui/Icon';
import { RecipeArt } from '../ui/RecipeCard';
import { toast } from '../ui/hooks';
import { Button, IconButton, PageHeader, Sheet, Stepper } from '../ui/primitives';

export function Planner() {
  const today = toISODate(new Date());
  const [anchor, setAnchor] = useState(today);
  const [adding, setAdding] = useState<{ date: string; meal: Meal } | null>(null);
  const plan = useUser((s) => s.plan);
  const planRemove = useUser((s) => s.planRemove);
  const planSetServings = useUser((s) => s.planSetServings);
  const addRecipeToShopping = useUser((s) => s.addRecipeToShopping);
  const byId = useLibrary((s) => s.byId);
  const navigate = useNavigate();

  const days = weekOf(anchor);
  const inWeek = entriesInWeek(plan, anchor);
  const first = fromISODate(days[0]!);
  const lastDay = fromISODate(days[6]!);
  const range = `${first.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} to ${lastDay.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;

  const shopWeek = () => {
    const cookable = inWeek.filter((entry) => byId.has(entry.recipeId));
    for (const entry of cookable) addRecipeToShopping(byId.get(entry.recipeId)!, entry.servings);
    toast(`Added ${cookable.length} ${cookable.length === 1 ? 'meal' : 'meals'} to your shopping list`, { label: 'View', run: () => navigate('/shopping') });
  };

  return (
    <div className="page planner">
      <PageHeader title="Meal plan" lead={range}>
        <IconButton icon="back" label="Previous week" onClick={() => setAnchor(addDays(anchor, -7))} />
        <Button onClick={() => setAnchor(today)} disabled={days.includes(today)}>
          This week
        </Button>
        <IconButton icon="forward" label="Next week" onClick={() => setAnchor(addDays(anchor, 7))} />
      </PageHeader>

      <div className="week" data-testid="week">
        {days.map((date) => {
          const info = formatDay(date, today);
          return (
            <section key={date} className={`day ${info.isToday ? 'is-today' : ''}`} aria-label={`${info.weekday} ${info.day}`}>
              <h2 className="day-head">
                <span>{info.weekday}</span>
                <span className="muted">{info.day}</span>
              </h2>
              {MEALS.map((meal) => {
                const entries = entriesFor(plan, date, meal);
                return (
                  <div key={meal} className="slot">
                    <div className="slot-head">
                      <span className="muted">{label(meal)}</span>
                      <button type="button" className="slot-add" aria-label={`Add ${meal} on ${info.weekday} ${info.day}`} onClick={() => setAdding({ date, meal })}>
                        <Icon name="plus" size={16} />
                      </button>
                    </div>
                    {entries.map((entry) => {
                      const recipe = byId.get(entry.recipeId);
                      return (
                        <div key={entry.id} className="plan-entry" data-testid="plan-entry">
                          {recipe ? (
                            <Link to={`/recipe/${recipe.id}`} viewTransition className="plan-entry-title">
                              {recipe.title}
                            </Link>
                          ) : (
                            <span className="plan-entry-title muted">Recipe no longer available</span>
                          )}
                          <div className="plan-entry-foot">
                            {recipe && <Stepper label="Servings" value={entry.servings} onChange={(value) => planSetServings(entry.id, value)} />}
                            <IconButton icon="trash" label={`Remove ${recipe?.title ?? 'entry'} from plan`} onClick={() => planRemove(entry.id)} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      <div className="page-foot">
        <Button variant="primary" icon="basket" onClick={shopWeek} disabled={inWeek.every((entry) => !byId.has(entry.recipeId))}>
          Add this week to shopping list
        </Button>
      </div>

      <Sheet
        open={adding !== null}
        title={adding ? `${label(adding.meal)}, ${formatDay(adding.date, today).weekday} ${formatDay(adding.date, today).day}` : 'Add a recipe'}
        onClose={() => setAdding(null)}
      >
        {adding && <PickerBody date={adding.date} meal={adding.meal} onDone={() => setAdding(null)} />}
      </Sheet>
    </div>
  );

}

function PickerBody({ date, meal, onDone }: { date: string; meal: Meal; onDone(): void }) {
  const recipes = useLibrary((s) => s.recipes);
  const byId = useLibrary((s) => s.byId);
  const index = useLibrary((s) => s.index);
  const favourites = useUser((s) => s.favourites);
  const servings = useUser((s) => s.servings);
  const planAdd = useUser((s) => s.planAdd);
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (query.trim()) return index.search(query, 30).map((hit) => byId.get(hit.id)).filter((r) => r !== undefined);
    const favs = favourites.map((id) => byId.get(id)).filter((r) => r !== undefined);
    const rest = recipes.filter((r) => !favourites.includes(r.id));
    return [...favs, ...rest];
  }, [query, index, byId, recipes, favourites]);

  return (
    <>
      <label className="search-field">
        <Icon name="search" size={18} />
        <span className="visually-hidden">Find a recipe to plan</span>
        <input type="search" value={query} placeholder="Find a recipe" onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
      </label>
      <ul className="pick-list">
        {results.map((recipe) => (
          <li key={recipe.id}>
            <button
              type="button"
              className="pick-item"
              onClick={() => {
                planAdd({ date, meal, recipeId: recipe.id, servings: servings[recipe.id] ?? recipe.serves });
                onDone();
              }}
            >
              <span className="pick-thumb">
                <RecipeArt recipe={recipe} />
              </span>
              <span>{recipe.title}</span>
            </button>
          </li>
        ))}
      </ul>
      {results.length === 0 && <p className="muted">No recipe matches “{query}”.</p>}
    </>
  );
}
