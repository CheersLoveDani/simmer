import { useMemo } from 'react';
import { Link } from 'react-router';
import { dailyPicks, facets, sortRecipes } from '../domain/browse';
import { toISODate } from '../domain/planner';
import { formatMinutes } from '../domain/quantity';
import { COURSES, label } from '../domain/schema';
import { useLibrary } from '../store/libraryStore';
import { useUser } from '../store/userStore';
import { Icon } from '../ui/Icon';
import { CardRow, RecipeArt, RecipeCard } from '../ui/RecipeCard';
import { useWide } from '../ui/hooks';
import { IconButton } from '../ui/primitives';
import { useTimerSheet } from './timers';

function greeting(hour: number): { title: string; lead: string } {
  if (hour < 5) return { title: 'Still up?', lead: 'Something small and quick, perhaps.' };
  if (hour < 11) return { title: 'Good morning.', lead: 'Breakfast now, or planning for later?' };
  if (hour < 15) return { title: 'Good afternoon.', lead: 'Lunch is a good idea.' };
  if (hour < 18) return { title: 'Good afternoon.', lead: 'Time to think about dinner.' };
  return { title: 'Good evening.', lead: 'What are we cooking tonight?' };
}

export function Home() {
  const recipes = useLibrary((s) => s.recipes);
  const byId = useLibrary((s) => s.byId);
  const recent = useUser((s) => s.recent);
  const plan = useUser((s) => s.plan);
  const wide = useWide();
  const openTimers = useTimerSheet((s) => s.setOpen);
  const now = new Date();
  const today = toISODate(now);
  const hello = greeting(now.getHours());

  const pick = useMemo(() => dailyPicks(recipes, today, 1)[0], [recipes, today]);
  const quick = useMemo(() => sortRecipes(recipes.filter((r) => r.time.total <= 30 && r.id !== pick?.id), 'quickest').slice(0, 12), [recipes, pick]);
  const newest = useMemo(() => sortRecipes(recipes, 'newest').slice(0, 12), [recipes]);
  const more = useMemo(() => dailyPicks(recipes.filter((r) => r.id !== pick?.id), `${today}-more`, 12), [recipes, pick, today]);
  const courses = useMemo(() => {
    const counts = new Map(facets(recipes, (r) => r.course).map((f) => [f.value, f.count]));
    const known = COURSES.filter((c) => counts.has(c)).map((c) => ({ value: c as string, count: counts.get(c)! }));
    const extra = [...counts].filter(([c]) => !(COURSES as readonly string[]).includes(c)).map(([value, count]) => ({ value, count }));
    return [...known, ...extra];
  }, [recipes]);
  const recents = recent.map((id) => byId.get(id)).filter((r) => r !== undefined);
  const tonight = plan.filter((e) => e.date === today).map((e) => ({ entry: e, recipe: byId.get(e.recipeId) })).filter((x) => x.recipe);

  return (
    <div className="page home">
      <header className="home-head">
        <div>
          <h1 className="home-greeting">{hello.title}</h1>
          <p className="home-lead muted">{hello.lead}</p>
        </div>
        {!wide && (
          <div className="home-tools">
            <IconButton icon="timer" label="Timers" onClick={() => openTimers(true)} />
            <Link to="/settings" className="icon-btn" aria-label="Settings">
              <Icon name="settings" />
            </Link>
          </div>
        )}
      </header>

      <Link to="/search" className="search-launch" viewTransition>
        <Icon name="search" size={20} />
        <span>Search recipes or ingredients</span>
        {wide && <kbd>Ctrl K</kbd>}
      </Link>

      {tonight.length > 0 && (
        <section className="tonight">
          <h2>On the plan today</h2>
          <ul>
            {tonight.map(({ entry, recipe }) => (
              <li key={entry.id}>
                <Link to={`/recipe/${recipe!.id}`} viewTransition className="tonight-item">
                  <span className="tonight-meal muted">{label(entry.meal)}</span>
                  <span className="tonight-title">{recipe!.title}</span>
                  <Icon name="forward" size={18} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pick && (
        <Link to={`/recipe/${pick.id}`} viewTransition className="feature" data-testid="todays-pick">
          <div className="feature-cover">
            <RecipeArt recipe={pick} />
          </div>
          <div className="feature-text">
            <p className="feature-kicker muted">Today&rsquo;s pick</p>
            <h2>{pick.title}</h2>
            <p className="feature-desc">{pick.description}</p>
            <p className="card-meta muted">
              <span>{formatMinutes(pick.time.total)}</span>
              <span className="dot" aria-hidden="true" />
              <span>{label(pick.difficulty)}</span>
              <span className="dot" aria-hidden="true" />
              <span>Serves {pick.serves}</span>
            </p>
          </div>
        </Link>
      )}

      {recents.length > 0 && (
        <CardRow title="Pick up where you left off">
          {recents.map((r) => (
            <RecipeCard key={r.id} recipe={r} size="small" />
          ))}
        </CardRow>
      )}

      {quick.length > 0 && (
        <CardRow title="On the table in 30 minutes" action={<Link className="row-link" to="/search?time=30">See all</Link>}>
          {quick.map((r) => (
            <RecipeCard key={r.id} recipe={r} size="small" />
          ))}
        </CardRow>
      )}

      <section className="row-section">
        <div className="row-head">
          <h2>Browse by course</h2>
        </div>
        <ul className="course-list">
          {courses.map((c) => (
            <li key={c.value}>
              <Link to={`/search?course=${c.value}`} className="course-link">
                <span>{label(c.value)}</span>
                <span className="muted tabular">{c.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {more.length > 0 && (
        <CardRow title="Something different">
          {more.map((r) => (
            <RecipeCard key={r.id} recipe={r} size="small" />
          ))}
        </CardRow>
      )}

      {newest.length > 0 && (
        <CardRow title="New to the library" action={<Link className="row-link" to="/search?sort=newest">See all</Link>}>
          {newest.map((r) => (
            <RecipeCard key={r.id} recipe={r} size="small" />
          ))}
        </CardRow>
      )}

      {recipes.length === 0 && (
        <p className="muted">No recipes yet. Simmer will download the library as soon as it can reach the internet.</p>
      )}
    </div>
  );
}
