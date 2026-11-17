import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { PLACES, PLACE_LABELS, freshness, isPrepFriendly, portionsIn, sortStash, useByLabel, type StashItem } from '../domain/mealprep';
import { formatKcal } from '../domain/nutrition';
import { formatDay, toISODate } from '../domain/planner';
import { useLibrary } from '../store/libraryStore';
import { useUser } from '../store/userStore';
import { Icon } from '../ui/Icon';
import { CardRow, RecipeArt, RecipeCard } from '../ui/RecipeCard';
import { Button, Empty, IconButton, PageHeader, Segmented } from '../ui/primitives';
import { EatSheet, ItemSheet, PLACE_ICONS } from './mealprep';

export function PlanTabs({ value }: { value: 'week' | 'prep' }) {
  const navigate = useNavigate();
  const count = useUser((s) => portionsIn(s.stash));
  return (
    <Segmented<'week' | 'prep'>
      label="Show"
      value={value}
      onChange={(next) => navigate(next === 'week' ? '/plan' : '/prep', { replace: true })}
      options={[
        { value: 'week', label: 'Week' },
        { value: 'prep', label: count > 0 ? `Meal prep · ${count}` : 'Meal prep' },
      ]}
    />
  );
}

export function Prepped() {
  const stash = useUser((s) => s.stash);
  const recipes = useLibrary((s) => s.recipes);
  const [eating, setEating] = useState<StashItem | null>(null);
  const [managing, setManaging] = useState<StashItem | null>(null);
  const today = toISODate(new Date());
  const sorted = useMemo(() => sortStash(stash), [stash]);
  const keepers = useMemo(
    () => recipes.filter(isPrepFriendly).sort((a, b) => (a.mealPrep!.rating === b.mealPrep!.rating ? a.title.localeCompare(b.title) : a.mealPrep!.rating === 'great' ? -1 : 1)),
    [recipes],
  );
  const past = sorted.filter((item) => item.place !== 'freezer' && freshness(item, today) === 'past');
  const total = portionsIn(stash);
  const kcal = stash.reduce((sum, item) => sum + (item.kcal ?? 0) * item.portions, 0);
  const showCalories = useUser((s) => s.settings.showCalories);

  return (
    <div className="page prepped" data-testid="prepped">
      <PageHeader
        title="Meal prep"
        lead={total > 0 ? `${total} ${total === 1 ? 'portion' : 'portions'} ready${showCalories && kcal > 0 ? `, about ${formatKcal(kcal)} of food` : ''}` : 'Cooked and waiting'}
      >
        <PlanTabs value="prep" />
      </PageHeader>

      {past.length > 0 && (
        <p className="notice is-warning" role="alert">
          <Icon name="close" size={18} />
          {past.length === 1 ? `${past[0]!.title} is` : `${past.length} batches are`} past the safe keeping time. To be safe, throw {past.length === 1 ? 'it' : 'them'} away.
        </p>
      )}

      {sorted.length === 0 ? (
        <Empty icon="layers" title="Nothing put away yet">
          <p>Cook a batch and Simmer keeps track of every portion in your fridge and freezer: what to eat first, how to defrost it and how to reheat it.</p>
          <Link to="/search?prep=1" className="btn btn-primary">
            Find recipes that keep well
          </Link>
        </Empty>
      ) : (
        PLACES.map((place) => {
          const items = sorted.filter((item) => item.place === place);
          if (items.length === 0) return null;
          return (
            <section key={place} className="stash-group" aria-labelledby={`stash-${place}`}>
              <h2 id={`stash-${place}`} className="stash-head">
                <Icon name={PLACE_ICONS[place]} size={22} />
                {place === 'cupboard' ? 'In a tin' : PLACE_LABELS[place]}
                <span className="muted tabular">{portionsIn(items)}</span>
              </h2>
              <ul className="stash-list">
                {items.map((item) => (
                  <StashRow key={item.id} item={item} today={today} onEat={() => setEating(item)} onManage={() => setManaging(item)} />
                ))}
              </ul>
            </section>
          );
        })
      )}

      {keepers.length > 0 && (
        <CardRow title="Great for meal prep" action={<Link className="row-link" to="/search?prep=1">See all</Link>}>
          {keepers.slice(0, 12).map((r) => (
            <RecipeCard key={r.id} recipe={r} size="small" />
          ))}
        </CardRow>
      )}

      <EatSheet item={eating} onClose={() => setEating(null)} />
      <ItemSheet item={managing} onClose={() => setManaging(null)} />
    </div>
  );
}

export function StashRow({ item, today, onEat, onManage }: { item: StashItem; today: string; onEat(): void; onManage(): void }) {
  const recipe = useLibrary((s) => s.byId.get(item.recipeId));
  const showCalories = useUser((s) => s.settings.showCalories);
  const made = formatDay(item.madeOn, today);
  const state = freshness(item, today);
  return (
    <li className={`stash-row is-${state}`} data-testid="stash-row">
      <button type="button" className="stash-main" onClick={onManage} aria-label={`${item.title}, ${item.portions} ${item.portions === 1 ? 'portion' : 'portions'}. Manage`}>
        <span className="pick-thumb">{recipe ? <RecipeArt recipe={recipe} /> : <Icon name="box" />}</span>
        <span className="stash-text">
          <span className="stash-title">{item.title}</span>
          <span className="muted stash-meta">
            <span className="tabular">
              {item.portions} {item.portions === 1 ? 'portion' : 'portions'}
            </span>
            <span className="dot" aria-hidden="true" />
            <span>Made {made.isToday ? 'today' : `${made.weekday} ${made.day}`}</span>
            {showCalories && item.kcal != null && (
              <>
                <span className="dot" aria-hidden="true" />
                <span>{formatKcal(item.kcal)} each</span>
              </>
            )}
            {item.defrosted && (
              <>
                <span className="dot" aria-hidden="true" />
                <span>Defrosted</span>
              </>
            )}
          </span>
          <span className={`fresh-pill is-${state}`}>{useByLabel(item, today)}</span>
        </span>
      </button>
      <div className="stash-actions">
        <Button variant={state === 'today' || state === 'soon' ? 'primary' : 'quiet'} onClick={onEat}>
          Eat one
        </Button>
        <IconButton icon="dots" label={`More for ${item.title}`} onClick={onManage} />
      </div>
    </li>
  );
}
