import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  EMPTY_SPLIT,
  PLACE_LABELS,
  RATING_TEXT,
  defrostText,
  keeping,
  keptPortions,
  labelText,
  methodLabel,
  movesFor,
  packAway,
  placesFor,
  rebalance,
  reheatFor,
  reheatForItem,
  reheatMinutesLabel,
  suggestSplit,
  useByFor,
  useByLabel,
  freshness,
  joinList,
  type Place,
  type Split,
  type StashItem,
} from '../domain/mealprep';
import { formatKcal, nutritionFor } from '../domain/nutrition';
import { MEALS, addDays, formatDay, toISODate, type Meal } from '../domain/planner';
import { label, type Recipe, type Reheat } from '../domain/schema';
import { mealAt, tendFoodLink, tendFoodText, type TendFood } from '../domain/tend';
import { copyText, openAppLink } from '../platform/device';
import { useLibrary } from '../store/libraryStore';
import { useSession } from '../store/sessionStore';
import { useUser } from '../store/userStore';
import { Icon, type IconName } from '../ui/Icon';
import { RecipeArt } from '../ui/RecipeCard';
import { toast } from '../ui/hooks';
import { Button, Chip, Segmented, Sheet, Stepper } from '../ui/primitives';
import { StepTimer } from './timers';

export const PLACE_ICONS: Record<Place, IconName> = { fridge: 'fridge', freezer: 'snow', cupboard: 'box' };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const today = () => toISODate(new Date());

// ---- Tend ------------------------------------------------------------------

/** Hand a meal to Tend, falling back to the clipboard when Tend cannot be opened. */
export async function sendToTend(food: TendFood): Promise<void> {
  const opened = await openAppLink(tendFoodLink(food));
  if (opened) {
    toast('Sent to Tend to confirm');
    return;
  }
  toast('Could not open Tend', {
    label: 'Copy instead',
    run: () => void copyText(tendFoodText(food)).then((ok) => toast(ok ? 'Copied. Paste it into your food log.' : 'Could not copy')),
  });
}

export function foodFor(recipe: Pick<Recipe, 'id' | 'title' | 'nutrition'>, portions: number, when = new Date()): TendFood | null {
  const nutrition = nutritionFor(recipe, portions);
  if (!nutrition || portions <= 0) return null;
  return { name: recipe.title, portions, nutrition, meal: mealAt(when), at: when.getTime(), ref: recipe.id };
}

/** "Also log 1 portion in Tend", shown wherever someone eats something. */
function TendToggle({ on, onChange, portions, kcal }: { on: boolean; onChange(on: boolean): void; portions: number; kcal: number | undefined }) {
  const enabled = useUser((s) => s.settings.tend);
  if (!enabled || kcal == null || portions <= 0) return null;
  return (
    <label className={`ingredient tend-toggle ${on ? 'is-picked' : ''}`}>
      <input type="checkbox" checked={on} onChange={(event) => onChange(event.target.checked)} />
      <span className="tick" aria-hidden="true">
        <Icon name="check" size={14} />
      </span>
      <span className="ingredient-text">
        Log {plural(portions, 'portion')} in Tend <span className="muted">· about {formatKcal(kcal * portions)}</span>
      </span>
    </label>
  );
}

// ---- Small pieces ----------------------------------------------------------

export function KeepsFacts({ recipe }: { recipe: Pick<Recipe, 'mealPrep'> }) {
  const keeps = keeping(recipe);
  const facts: { icon: IconName; title: string; value: string; off?: boolean }[] = [];
  if (keeps.roomDays) facts.push({ icon: 'box', title: 'In a tin', value: plural(keeps.roomDays, 'day') });
  facts.push(keeps.fridgeDays > 0 ? { icon: 'fridge', title: 'Fridge', value: plural(keeps.fridgeDays, 'day') } : { icon: 'fridge', title: 'Fridge', value: 'Not needed', off: true });
  facts.push(keeps.freezerMonths > 0 ? { icon: 'snow', title: 'Freezer', value: plural(keeps.freezerMonths, 'month') } : { icon: 'snow', title: 'Freezer', value: 'Does not freeze well', off: true });
  return (
    <ul className="keeps" aria-label="How long it keeps">
      {facts.map((fact) => (
        <li key={fact.title} className={fact.off ? 'is-off' : ''}>
          <Icon name={fact.icon} size={20} />
          <span>
            <span className="keeps-title">{fact.title}</span>
            <strong>{fact.value}</strong>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function RatingBadge({ rating, compact = false }: { rating: NonNullable<Recipe['mealPrep']>['rating']; compact?: boolean }) {
  return (
    <span className={`prep-badge is-${rating} ${compact ? 'is-compact' : ''}`}>
      <Icon name={rating === 'fresh' ? 'flame' : 'layers'} size={compact ? 14 : 16} />
      {RATING_TEXT[rating].title}
    </span>
  );
}

function ReheatList({ recipe, options, timerPrefix }: { recipe: Recipe; options: Reheat[]; timerPrefix: string }) {
  return (
    <ul className="reheat-list">
      {options.map((option, i) => {
        const minutes = reheatMinutesLabel(option);
        return (
          <li key={i} className="reheat">
            <div className="reheat-head">
              <strong>{methodLabel(option.method)}</strong>
              {minutes && <span className="reheat-time tabular">{minutes}</span>}
            </div>
            <p>{option.text}</p>
            {option.minutes != null && option.minutes >= 1 && option.method !== 'none' && (
              <StepTimer id={`${timerPrefix}:${i}`} label={`Reheat ${recipe.title}`.slice(0, 40)} minutes={option.minutes} recipeId={recipe.id} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

const SAFETY = 'Heat until steaming hot all the way through, and reheat only once.';

// ---- On the recipe page ----------------------------------------------------

export function MealPrepSection({ recipe, onCookBatch }: { recipe: Recipe; onCookBatch(): void }) {
  const prep = recipe.mealPrep;
  const [from, setFrom] = useState<'chilled' | 'frozen'>('chilled');
  const [addOpen, setAddOpen] = useState(false);
  const stash = useUser((s) => s.stash);
  const stashedCount = useMemo(() => stash.filter((item) => item.recipeId === recipe.id).reduce((sum, item) => sum + item.portions, 0), [stash, recipe.id]);
  if (!prep) {
    return (
      <section className="mealprep is-quiet no-print" aria-labelledby="meal-prep-title">
        <h2 id="meal-prep-title">Meal prep</h2>
        <p className="muted">This recipe has no make-ahead notes. As a rule, cooked food keeps 2 days in the fridge once cooled within 2 hours. {SAFETY}</p>
        <div className="mealprep-actions">
          <Button icon="layers" onClick={onCookBatch}>
            Cook a batch
          </Button>
          <Button icon="box" onClick={() => setAddOpen(true)}>
            Add portions I made
          </Button>
        </div>
        <AddToStashSheet recipe={recipe} open={addOpen} onClose={() => setAddOpen(false)} />
      </section>
    );
  }
  const frozen = reheatFor(recipe, 'frozen');
  const chilled = reheatFor(recipe, 'chilled');
  const shown = from === 'frozen' && frozen.length > 0 ? frozen : chilled;

  return (
    <section className="mealprep" id="meal-prep" aria-labelledby="meal-prep-title" data-testid="meal-prep">
      <div className="mealprep-head">
        <h2 id="meal-prep-title">Meal prep</h2>
        <RatingBadge rating={prep.rating} />
      </div>
      <p className="muted">{RATING_TEXT[prep.rating].lead}</p>
      <KeepsFacts recipe={recipe} />

      <div className="mealprep-grid">
        <PrepBlock icon="box" title="Portioning">
          <p>{prep.portion}</p>
        </PrepBlock>
        {prep.freeze && (
          <PrepBlock icon="snow" title="Freezing">
            <p>{prep.freeze}</p>
          </PrepBlock>
        )}
        {prep.defrost && (
          <PrepBlock icon="fridge" title="Defrosting">
            <p>{prep.defrost}</p>
          </PrepBlock>
        )}
        {prep.serveFresh.length > 0 && (
          <PrepBlock icon="leaf" title="Add on the day">
            <p>Keep back the {joinList(prep.serveFresh)} and add them when you eat.</p>
          </PrepBlock>
        )}
      </div>

      {(chilled.length > 0 || frozen.length > 0) && (
        <div className="reheat-block">
          <div className="reheat-block-head">
            <h3>Reheating</h3>
            {frozen.length > 0 && chilled.length > 0 && (
              <Segmented<'chilled' | 'frozen'>
                label="Reheat from"
                value={from}
                onChange={setFrom}
                options={[
                  { value: 'chilled', label: 'From the fridge' },
                  { value: 'frozen', label: 'From frozen' },
                ]}
              />
            )}
          </div>
          <ReheatList recipe={recipe} options={shown} timerPrefix={`${recipe.id}:reheat-${from}`} />
          {shown.some((r) => r.method !== 'none') && <p className="muted mealprep-safety">{SAFETY}</p>}
        </div>
      )}

      {prep.tips.length > 0 && (
        <div>
          <h3>Batch cooking tips</h3>
          <ul className="plain-list">
            {prep.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mealprep-actions no-print">
        <Button variant="primary" icon="layers" onClick={onCookBatch}>
          Cook a batch
        </Button>
        <Button icon="box" onClick={() => setAddOpen(true)}>
          Add portions I made
        </Button>
        {stashedCount > 0 && (
          <Link to="/prep" className="btn btn-plain">
            {plural(stashedCount, 'portion')} put away
            <Icon name="forward" size={16} />
          </Link>
        )}
      </div>
      <AddToStashSheet recipe={recipe} open={addOpen} onClose={() => setAddOpen(false)} />
    </section>
  );
}

function PrepBlock({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <div className="prep-block">
      <span className="prep-block-icon">
        <Icon name={icon} size={20} />
      </span>
      <div>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

// ---- Splitting a batch -----------------------------------------------------

function SplitEditor({ recipe, total, split, onChange, showNow = true }: { recipe: Recipe; total: number; split: Split; onChange(split: Split): void; showNow?: boolean }) {
  const places = placesFor(recipe);
  const keeps = keeping(recipe);
  const day = today();
  const rows: { key: keyof Split; icon: IconName; title: string; hint: string }[] = [];
  if (showNow) rows.push({ key: 'now', icon: 'pot', title: 'Eat now', hint: 'Straight to the table' });
  for (const place of places) {
    const useBy = useByFor(keeps, place, day);
    rows.push({ key: place, icon: PLACE_ICONS[place], title: place === 'cupboard' ? 'In a tin' : PLACE_LABELS[place], hint: useByLabel({ useBy, place }, day) });
  }
  return (
    <ul className="split" aria-label="Where the portions go">
      {rows.map((row) => (
        <li key={row.key} className="split-row">
          <span className="split-icon">
            <Icon name={row.icon} size={20} />
          </span>
          <span className="split-text">
            <span className="split-title">{row.title}</span>
            <span className="muted">{row.hint}</span>
          </span>
          <Stepper label={`${row.title} portions`} value={split[row.key]} min={0} max={total} onChange={(value) => onChange(rebalance({ ...split, [row.key]: value }, total, row.key, places))} />
        </li>
      ))}
    </ul>
  );
}

// ---- Before cooking: now or meal prep? -------------------------------------

export function CookChoiceSheet({ recipe, open, initialMode, onClose }: { recipe: Recipe; open: boolean; initialMode: 'now' | 'prep'; onClose(): void }) {
  const navigate = useNavigate();
  const servings = useUser((s) => s.servings[recipe.id]) ?? recipe.serves;
  const setServings = useUser((s) => s.setServings);
  const addRecipeToShopping = useUser((s) => s.addRecipeToShopping);
  const showCalories = useUser((s) => s.settings.showCalories);
  const setCookPlan = useSession((s) => s.setCookPlan);
  const [mode, setMode] = useState(initialMode);
  const [total, setTotal] = useState(servings);
  const [split, setSplit] = useState<Split>(() => suggestSplit(recipe, servings, 0));
  const places = placesFor(recipe);
  const prep = recipe.mealPrep;

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setTotal(servings);
    setSplit(suggestSplit(recipe, servings, 0));
  }, [open, initialMode, recipe, servings]);

  const changeTotal = (value: number) => {
    setTotal(value);
    setSplit((current) => suggestSplit(recipe, value, Math.min(current.now, value)));
  };

  const start = () => {
    const portions = mode === 'now' ? servings : total;
    setServings(recipe.id, portions === recipe.serves ? 0 : portions);
    setCookPlan(recipe.id, { mode, total: portions, split: mode === 'now' ? { ...EMPTY_SPLIT, now: portions } : split });
    onClose();
    navigate(`/recipe/${recipe.id}/cook`);
  };

  const kcal = recipe.nutrition?.kcal;
  return (
    <Sheet
      open={open}
      title="How are you cooking this?"
      onClose={onClose}
      footer={
        <>
          {mode === 'prep' && (
            <Button
              icon="basket"
              onClick={() => {
                addRecipeToShopping(recipe, total);
                toast(`Ingredients for ${total} added to your list`);
              }}
            >
              Shop for {total}
            </Button>
          )}
          <Button variant="primary" icon="pot" onClick={start} data-testid="start-cooking">
            Start cooking
          </Button>
        </>
      }
    >
      <div className="cook-choices" role="radiogroup" aria-label="What this cook is for">
        <ChoiceCard selected={mode === 'now'} icon="pot" title="Eating now" onSelect={() => setMode('now')}>
          Cook {plural(servings, 'serving')} for the table. You can save any leftovers at the end.
        </ChoiceCard>
        <ChoiceCard selected={mode === 'prep'} icon="layers" title="Meal prep" onSelect={() => setMode('prep')}>
          Cook a batch to portion up, chill or freeze, with reheating notes for each portion.
        </ChoiceCard>
      </div>

      {mode === 'prep' && (
        <div className="cook-plan">
          {prep?.rating === 'fresh' && (
            <p className="notice">
              <Icon name="flame" size={18} />
              {RATING_TEXT.fresh.lead}
              {prep.freezerMonths === 0 ? ' It does not freeze well.' : ''}
            </p>
          )}
          {places.length === 0 ? (
            <p className="notice">This one does not keep: it is best cooked and eaten fresh.</p>
          ) : (
            <>
              <div className="servings">
                <span>Portions to make</span>
                <Stepper label="Portions" value={total} min={1} max={48} onChange={changeTotal} />
              </div>
              <SplitEditor recipe={recipe} total={total} split={split} onChange={setSplit} />
              <p className="muted">
                {total !== recipe.serves && `The ingredients are scaled to ${total}. `}
                {kcal != null && showCalories && `About ${formatKcal(kcal)} a portion.`}
              </p>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

function ChoiceCard({ selected, icon, title, children, onSelect }: { selected: boolean; icon: IconName; title: string; children: ReactNode; onSelect(): void }) {
  return (
    <button type="button" role="radio" aria-checked={selected} className={`cook-choice ${selected ? 'is-selected' : ''}`} onClick={onSelect}>
      <span className="add-choice-icon">
        <Icon name={icon} />
      </span>
      <span className="add-choice-text">
        <span className="cook-choice-title">{title}</span>
        <span className="muted">{children}</span>
      </span>
      <span className="cook-choice-dot" aria-hidden="true" />
    </button>
  );
}

// ---- After cooking: pack it away -------------------------------------------

export function FinishSheet({ recipe, open, onClose, onFinished }: { recipe: Recipe; open: boolean; onClose(): void; onFinished(): void }) {
  const navigate = useNavigate();
  const servings = useUser((s) => s.servings[recipe.id]) ?? recipe.serves;
  const stashAdd = useUser((s) => s.stashAdd);
  const logCooked = useUser((s) => s.logCooked);
  const tendOn = useUser((s) => s.settings.tend);
  const plan = useSession((s) => s.cookPlan[recipe.id]);
  const setCookPlan = useSession((s) => s.setCookPlan);
  const total = plan?.total ?? servings;
  const prepping = plan?.mode === 'prep';
  const [split, setSplit] = useState<Split>({ ...EMPTY_SPLIT, now: total });
  const [tend, setTend] = useState(true);
  const places = placesFor(recipe);

  useEffect(() => {
    if (!open) return;
    setSplit(plan?.split && plan.total === total ? plan.split : { ...EMPTY_SPLIT, now: total });
    setTend(true);
  }, [open, plan, total]);

  const finish = () => {
    const day = today();
    const items = packAway(recipe, split, day);
    stashAdd(items);
    logCooked(recipe.id, day);
    setCookPlan(recipe.id, null);
    const kept = keptPortions(split);
    const food = tendOn && tend ? foodFor(recipe, split.now) : null;
    onFinished();
    if (food) void sendToTend(food);
    else if (kept > 0) {
      const where = items.map((item) => `${item.portions} in the ${item.place === 'cupboard' ? 'tin' : item.place}`).join(', ');
      toast(`Put away: ${where}`, { label: 'View', run: () => navigate('/prep') });
    } else toast('Enjoy. Logged as cooked today.');
  };

  return (
    <Sheet
      open={open}
      title={prepping ? 'Pack it away' : 'Enjoy. Anything left over?'}
      onClose={onClose}
      footer={
        <Button variant="primary" icon="check" onClick={finish} data-testid="finish-cook">
          {keptPortions(split) > 0 ? `Put away ${plural(keptPortions(split), 'portion')}` : 'Done'}
        </Button>
      }
    >
      {places.length === 0 ? (
        <p className="muted">This one is best eaten fresh, so there is nothing to put away.</p>
      ) : (
        <>
          <p className="muted">
            {prepping
              ? 'Check how many portions went where. Simmer keeps track of them, with use-by dates and reheating notes.'
              : 'Save leftovers and Simmer will remind you to eat them while they are good.'}
          </p>
          <SplitEditor recipe={recipe} total={total} split={split} onChange={setSplit} />
        </>
      )}
      <TendToggle on={tend} onChange={setTend} portions={split.now} kcal={recipe.nutrition?.kcal} />
    </Sheet>
  );
}

// ---- Adding portions by hand -----------------------------------------------

export function AddToStashSheet({ recipe, open, onClose }: { recipe: Recipe; open: boolean; onClose(): void }) {
  const navigate = useNavigate();
  const stashAdd = useUser((s) => s.stashAdd);
  const places = placesFor(recipe);
  const keeps = keeping(recipe);
  const day = today();
  const [place, setPlace] = useState<Place>(places.includes('freezer') ? 'freezer' : (places[0] ?? 'fridge'));
  const [portions, setPortions] = useState(2);
  const [ago, setAgo] = useState(0);

  useEffect(() => {
    if (!open) return;
    setPlace(places.includes('freezer') ? 'freezer' : (places[0] ?? 'fridge'));
    setPortions(2);
    setAgo(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const madeOn = addDays(day, -ago);
  const useBy = useByFor(keeps, place, madeOn);
  const state = freshness({ useBy, place }, day);

  return (
    <Sheet
      open={open}
      title="Add portions you made"
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          disabled={state === 'past'}
          onClick={() => {
            stashAdd(packAway(recipe, { ...EMPTY_SPLIT, [place]: portions }, madeOn).map((item) => ({ ...item, useBy })));
            toast(`${plural(portions, 'portion')} added`, { label: 'View', run: () => navigate('/prep') });
            onClose();
          }}
        >
          Add {plural(portions, 'portion')}
        </Button>
      }
    >
      <fieldset className="filter-group">
        <legend>Where</legend>
        <div className="chip-wrap">
          {(places.length ? places : (['fridge'] as Place[])).map((p) => (
            <Chip key={p} selected={p === place} onToggle={() => setPlace(p)}>
              {p === 'cupboard' ? 'In a tin' : PLACE_LABELS[p]}
            </Chip>
          ))}
        </div>
      </fieldset>
      <fieldset className="filter-group">
        <legend>Made</legend>
        <div className="chip-wrap">
          {[0, 1, 2, 3].map((n) => (
            <Chip key={n} selected={n === ago} onToggle={() => setAgo(n)}>
              {n === 0 ? 'Today' : n === 1 ? 'Yesterday' : `${formatDay(addDays(day, -n), day).weekday}`}
            </Chip>
          ))}
        </div>
      </fieldset>
      <div className="servings">
        <span>Portions</span>
        <Stepper label="Portions" value={portions} min={1} max={48} onChange={setPortions} />
      </div>
      <p className={`muted ${state === 'past' ? 'is-warning' : ''}`}>
        {state === 'past' ? 'That is past its safe keeping time. Best thrown away.' : useByLabel({ useBy, place }, day)}
      </p>
    </Sheet>
  );
}

// ---- Eating a portion ------------------------------------------------------

export function EatSheet({ item, onClose }: { item: StashItem | null; onClose(): void }) {
  const recipe = useLibrary((s) => (item ? s.byId.get(item.recipeId) : undefined));
  const stash = useUser((s) => s.stash);
  const stashTake = useUser((s) => s.stashTake);
  const stashRestore = useUser((s) => s.stashRestore);
  const [count, setCount] = useState(1);
  const [tend, setTend] = useState(true);

  useEffect(() => {
    setCount(1);
    setTend(true);
  }, [item?.id]);

  const options = item ? reheatForItem(recipe, item) : [];
  const frozen = item?.place === 'freezer';
  const day = today();

  return (
    <Sheet
      open={item !== null}
      title={item ? item.title : 'Eat a portion'}
      onClose={onClose}
      footer={
        item && (
          <Button
            variant="primary"
            icon="check"
            onClick={() => {
              const before = stash;
              stashTake(item.id, count);
              const left = item.portions - count;
              const food = tend && item.kcal != null ? foodFor({ id: item.recipeId, title: item.title, nutrition: recipe?.nutrition ?? { kcal: item.kcal } }, count) : null;
              onClose();
              if (food && useUser.getState().settings.tend) void sendToTend(food);
              else
                toast(left > 0 ? `Enjoy. ${plural(left, 'portion')} left.` : 'Enjoy. That was the last one.', {
                  label: 'Undo',
                  run: () => stashRestore(before),
                });
            }}
          >
            {count === 1 ? 'Eaten one' : `Eaten ${count}`}
          </Button>
        )
      }
    >
      {item && (
        <>
          <div className="eat-head">
            <span className="pick-thumb">{recipe && <RecipeArt recipe={recipe} />}</span>
            <div>
              <p className="eat-where">
                <Icon name={PLACE_ICONS[item.place]} size={16} />
                {plural(item.portions, 'portion')} in the {item.place === 'cupboard' ? 'tin' : item.place}
              </p>
              <p className={`fresh-pill is-${freshness(item, day)}`}>{useByLabel(item, day)}</p>
            </div>
          </div>
          {freshness(item, day) === 'past' && item.place !== 'freezer' && (
            <p className="notice is-warning">This is past its safe keeping time. To be safe, throw it away rather than eat it.</p>
          )}
          {item.portions > 1 && (
            <div className="servings">
              <span>Portions</span>
              <Stepper label="Portions to eat" value={count} min={1} max={item.portions} onChange={setCount} />
            </div>
          )}
          {frozen && (
            <div>
              <h3 className="sheet-label">Defrosting</h3>
              <p>{defrostText(recipe ?? { mealPrep: undefined })}</p>
            </div>
          )}
          {options.length > 0 && (
            <div>
              <h3 className="sheet-label">{frozen ? 'Reheating from frozen' : 'Reheating'}</h3>
              {recipe ? <ReheatList recipe={recipe} options={options} timerPrefix={`${item.id}:eat`} /> : <p>{options[0]!.text}</p>}
              {options.some((o) => o.method !== 'none') && <p className="muted mealprep-safety">{SAFETY}</p>}
            </div>
          )}
          {recipe?.mealPrep?.serveFresh.length ? <p className="notice">Add the {joinList(recipe.mealPrep.serveFresh)} fresh.</p> : null}
          <TendToggle on={tend} onChange={setTend} portions={count} kcal={item.kcal} />
        </>
      )}
    </Sheet>
  );
}

// ---- Managing a batch ------------------------------------------------------

export function ItemSheet({ item, onClose }: { item: StashItem | null; onClose(): void }) {
  const recipe = useLibrary((s) => (item ? s.byId.get(item.recipeId) : undefined));
  const stash = useUser((s) => s.stash);
  const stashSetPortions = useUser((s) => s.stashSetPortions);
  const stashMove = useUser((s) => s.stashMove);
  const stashRemove = useUser((s) => s.stashRemove);
  const stashRestore = useUser((s) => s.stashRestore);
  const planAdd = useUser((s) => s.planAdd);
  const navigate = useNavigate();
  const day = today();
  const [planning, setPlanning] = useState(false);
  const [moveCount, setMoveCount] = useState(1);
  const [date, setDate] = useState(day);
  const [meal, setMeal] = useState<Meal>('dinner');

  useEffect(() => {
    setPlanning(false);
    setMoveCount(1);
    setDate(day);
  }, [item?.id, day]);

  // Follow the live record, so steppers reflect changes straight away.
  const live = item ? (stash.find((s) => s.id === item.id) ?? null) : null;
  const keeps = keeping(recipe ?? { mealPrep: undefined });
  const moves = live ? movesFor(live, keeps, day) : [];
  const days = Array.from({ length: 7 }, (_, i) => addDays(day, i)).filter((d) => !live || d <= live.useBy || live.place === 'freezer');

  return (
    <Sheet open={item !== null && live !== null} title={live?.title ?? 'Portions'} onClose={onClose}>
      {live && (
        <div className="item-sheet">
          <div className="servings">
            <span>Portions</span>
            <Stepper label="Portions" value={live.portions} min={1} max={99} onChange={(value) => stashSetPortions(live.id, value)} />
          </div>
          <p className={`fresh-pill is-${freshness(live, day)}`}>{useByLabel(live, day)}</p>
          <p className="muted">
            Made {formatDay(live.madeOn, day).isToday ? 'today' : `${formatDay(live.madeOn, day).weekday} ${formatDay(live.madeOn, day).day}`}
            {live.kcal != null ? ` · about ${formatKcal(live.kcal)} a portion` : ''}
            {live.defrosted ? ' · defrosted, do not refreeze' : ''}
          </p>

          {moves.map((to) => (
            <div key={to} className="item-move">
              <div>
                <strong>{to === 'freezer' ? 'Freeze some' : 'Defrost some'}</strong>
                <p className="muted">
                  {to === 'freezer'
                    ? `Keeps ${plural(keeps.freezerMonths, 'month')} frozen. Freeze it sooner rather than later.`
                    : 'Moves to the fridge to thaw overnight. Eat within 24 hours.'}
                </p>
              </div>
              <div className="item-move-row">
                {live.portions > 1 && <Stepper label="Portions to move" value={Math.min(moveCount, live.portions)} min={1} max={live.portions} onChange={setMoveCount} />}
                <Button
                  icon={PLACE_ICONS[to]}
                  onClick={() => {
                    const n = Math.min(moveCount, live.portions);
                    stashMove(live.id, to, n, keeps, day);
                    toast(to === 'freezer' ? `${plural(n, 'portion')} frozen` : `${plural(n, 'portion')} defrosting in the fridge`);
                    onClose();
                  }}
                >
                  {to === 'freezer' ? 'Freeze' : 'Defrost'}
                </Button>
              </div>
            </div>
          ))}

          {planning ? (
            <div className="item-plan">
              <fieldset className="filter-group">
                <legend>Day</legend>
                <div className="chip-wrap">
                  {days.map((d) => {
                    const info = formatDay(d, day);
                    return (
                      <Chip key={d} selected={d === date} onToggle={() => setDate(d)}>
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
              <Button
                variant="primary"
                onClick={() => {
                  planAdd({ date, meal, recipeId: live.recipeId, servings: 1, stashId: live.id });
                  toast(`Planned for ${formatDay(date, day).weekday} ${meal}`, { label: 'View', run: () => navigate('/plan') });
                  onClose();
                }}
              >
                Add to plan
              </Button>
            </div>
          ) : (
            <div className="item-actions">
              {recipe && (
                <Button icon="calendar" onClick={() => setPlanning(true)}>
                  Plan a meal
                </Button>
              )}
              <Button
                icon="copy"
                onClick={() => void copyText(labelText(live, recipe)).then((ok) => toast(ok ? 'Label copied' : 'Could not copy'))}
              >
                Copy label
              </Button>
              {recipe && (
                <Button icon="forward" onClick={() => navigate(`/recipe/${recipe.id}`)}>
                  Recipe
                </Button>
              )}
              <Button
                className="btn-danger"
                icon="trash"
                onClick={() => {
                  const before = stash;
                  stashRemove(live.id);
                  onClose();
                  toast(`Removed ${live.title}`, { label: 'Undo', run: () => stashRestore(before) });
                }}
              >
                Throw away
              </Button>
            </div>
          )}
          <details className="label-preview">
            <summary>Container label</summary>
            <pre>{labelText(live, recipe)}</pre>
          </details>
        </div>
      )}
    </Sheet>
  );
}

// ---- Logging a portion from the recipe -------------------------------------

export function LogMealSheet({ recipe, open, onClose }: { recipe: Recipe; open: boolean; onClose(): void }) {
  const [portions, setPortions] = useState(1);
  useEffect(() => {
    if (open) setPortions(1);
  }, [open]);
  const food = useMemo(() => foodFor(recipe, portions), [recipe, portions]);
  return (
    <Sheet
      open={open}
      title="Log to Tend"
      onClose={onClose}
      footer={
        <>
          <Button
            icon="copy"
            onClick={() => food && void copyText(tendFoodText(food)).then((ok) => toast(ok ? 'Copied' : 'Could not copy'))}
          >
            Copy
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (food) void sendToTend(food);
              onClose();
            }}
          >
            Send to Tend
          </Button>
        </>
      }
    >
      <div className="servings">
        <span>Portions eaten</span>
        <Stepper label="Portions eaten" value={portions} min={1} max={12} onChange={setPortions} />
      </div>
      {food && (
        <dl className="facts nutrition">
          <div>
            <dt>Energy</dt>
            <dd>{formatKcal(food.nutrition.kcal)}</dd>
          </div>
          {(['protein', 'carbs', 'fat'] as const).map((m) =>
            food.nutrition[m] != null ? (
              <div key={m}>
                <dt>{label(m)}</dt>
                <dd>{Math.round(food.nutrition[m]!)} g</dd>
              </div>
            ) : null,
          )}
        </dl>
      )}
      <p className="muted">Tend opens with this filled in as {label(food?.meal ?? 'dinner')}, for you to check and save.</p>
    </Sheet>
  );
}
