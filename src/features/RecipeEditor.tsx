import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { buildRecipe, slug, type DraftIngredient, type RecipeDraft } from '../domain/draft';
import { formatIngredientLine, parseIngredientLine } from '../domain/ingredientLine';
import { AISLES, COURSES, DIETS, DIFFICULTIES, label, type Recipe } from '../domain/schema';
import { useLibrary } from '../store/libraryStore';
import { toast, useRecipeImage } from '../ui/hooks';
import { Button, Chip, IconButton, Segmented, Stepper } from '../ui/primitives';

export interface EditorPhoto {
  blob: Blob;
  credit?: Recipe['imageCredit'];
}

interface Props {
  initial: RecipeDraft;
  /** The recipe being edited; absent when adding a new one. */
  recipe?: Recipe;
  photo?: EditorPhoto;
  /** Where to keep the half-written draft, so leaving the page by accident loses nothing. */
  draftKey?: string;
}

const STEPS = ['Basics', 'Ingredients', 'Method', 'Extras', 'Photo'] as const;

const AISLE_NAMES: Record<(typeof AISLES)[number], string> = {
  produce: 'Fruit & veg',
  'meat-fish': 'Meat & fish',
  'dairy-eggs': 'Dairy & eggs',
  bakery: 'Bakery',
  pantry: 'Cupboard',
  spices: 'Herbs & spices',
  'tins-jars': 'Tins & jars',
  frozen: 'Frozen',
  drinks: 'Drinks',
  other: 'Other',
};

/** One ingredient as it is being typed: the text, and what was read from it. */
interface Line {
  text: string;
  item: DraftIngredient | null;
}
interface Group {
  section: string;
  lines: Line[];
}

function toGroups(draft: RecipeDraft): Group[] {
  const groups = draft.ingredients.map((group) => ({
    section: group.section ?? '',
    lines: group.items.map((item) => ({ text: formatIngredientLine(item), item })),
  }));
  return groups.length ? groups : [{ section: '', lines: [] }];
}

function fromGroups(groups: Group[]): RecipeDraft['ingredients'] {
  return groups.map((group) => ({
    section: group.section.trim() || null,
    items: group.lines.filter((line) => line.text.trim() !== '').map((line) => line.item ?? parseIngredientLine(line.text)),
  }));
}

function loadDraft(key: string | undefined): RecipeDraft | null {
  if (!key) return null;
  try {
    const saved = sessionStorage.getItem(key);
    return saved ? (JSON.parse(saved) as RecipeDraft) : null;
  } catch {
    return null;
  }
}

function keepDraft(key: string | undefined, draft: RecipeDraft | null) {
  if (!key) return;
  try {
    if (draft) sessionStorage.setItem(key, JSON.stringify(draft));
    else sessionStorage.removeItem(key);
  } catch {
    // Storage can be unavailable; the form still works.
  }
}

const lines = (text: string) => text.split('\n');
const joined = (items: string[]) => items.join('\n');

/** The guided form for writing or correcting one of your own recipes. */
export function RecipeEditor({ initial, recipe, photo: offeredPhoto, draftKey }: Props) {
  const navigate = useNavigate();
  const saveOwn = useLibrary((s) => s.saveOwn);
  const [draft, setDraft] = useState<RecipeDraft>(() => loadDraft(draftKey) ?? initial);
  const [groups, setGroups] = useState<Group[]>(() => toGroups(draft));
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState<EditorPhoto | null>(offeredPhoto ?? null);
  const [keepExisting, setKeepExisting] = useState(Boolean(recipe?.image));
  const [saving, setSaving] = useState(false);

  const full: RecipeDraft = useMemo(() => ({ ...draft, ingredients: fromGroups(groups) }), [draft, groups]);
  useEffect(() => keepDraft(draftKey, full), [draftKey, full]);
  const ready = useMemo(() => buildRecipe(full, {}) !== null, [full]);

  const update = (patch: Partial<RecipeDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    const image = photo ? `local:${Date.now().toString(36)}` : keepExisting ? recipe?.image : undefined;
    const imageCredit = photo ? photo.credit : keepExisting ? recipe?.imageCredit : undefined;
    const built = buildRecipe(full, {
      ...(recipe ? { id: recipe.id, created: recipe.created } : {}),
      ...(image ? { image } : {}),
      ...(imageCredit ? { imageCredit } : {}),
    });
    if (!built) return;
    setSaving(true);
    try {
      await saveOwn(built, photo?.blob);
    } catch {
      setSaving(false);
      toast('Could not save the recipe');
      return;
    }
    keepDraft(draftKey, null);
    toast(recipe ? 'Recipe updated' : 'Recipe saved');
    navigate(`/recipe/${built.id}`, { replace: true });
  };

  const missing = !full.title.trim()
    ? 'Give the recipe a title.'
    : full.ingredients.every((g) => g.items.length === 0) || full.steps.every((s) => !s.text.trim())
      ? 'Add at least one ingredient and one step.'
      : null;
  const last = step === STEPS.length - 1;

  return (
    <div className="editor">
      <ol className="editor-steps" aria-label="Sections">
        {STEPS.map((name, i) => (
          <li key={name}>
            <button type="button" className={`editor-step ${i === step ? 'is-current' : ''} ${i < step ? 'is-done' : ''}`} aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)}>
              <span className="editor-step-number tabular">{i + 1}</span>
              <span className="editor-step-name">{name}</span>
            </button>
          </li>
        ))}
      </ol>

      <section className="editor-panel" aria-label={STEPS[step]}>
        {step === 0 && <Basics draft={draft} update={update} />}
        {step === 1 && <Ingredients groups={groups} setGroups={setGroups} />}
        {step === 2 && <Method draft={draft} update={update} />}
        {step === 3 && <Extras draft={draft} update={update} />}
        {step === 4 && <PhotoStep recipe={recipe} photo={photo} setPhoto={setPhoto} keepExisting={keepExisting} setKeepExisting={setKeepExisting} />}
      </section>

      <div className="editor-foot">
        {step > 0 ? (
          <Button icon="back" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        ) : (
          <span />
        )}
        <div className="editor-foot-end">
          {last && missing && <span className="muted">{missing}</span>}
          {last ? (
            <Button variant="primary" icon="check" disabled={!ready || saving} onClick={() => void save()}>
              Save recipe
            </Button>
          ) : (
            <>
              {recipe && ready && (
                <Button disabled={saving} onClick={() => void save()}>
                  Save recipe
                </Button>
              )}
              <Button variant="primary" onClick={() => setStep(step + 1)}>
                Next
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label: text, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{text}</span>
      {children}
      {hint && <span className="field-hint muted">{hint}</span>}
    </label>
  );
}

type Edit = { draft: RecipeDraft; update(patch: Partial<RecipeDraft>): void };

function Basics({ draft, update }: Edit) {
  const minutesField = (name: 'prep' | 'cook' | 'rest', text: string) => (
    <Field label={text}>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={draft.time[name] || ''}
        placeholder="0"
        onChange={(event) => update({ time: { ...draft.time, [name]: Number(event.target.value) || 0 } })}
      />
    </Field>
  );
  return (
    <div className="editor-fields">
      <Field label="Title">
        <input type="text" value={draft.title} onChange={(event) => update({ title: event.target.value })} autoComplete="off" />
      </Field>
      <Field label="Description" hint="A line or two about why it is good.">
        <textarea rows={2} value={draft.description} onChange={(event) => update({ description: event.target.value })} />
      </Field>
      <div className="field-row">
        <Field label="Course">
          <select value={draft.course} onChange={(event) => update({ course: event.target.value })}>
            {[...new Set([...COURSES, draft.course])].map((course) => (
              <option key={course} value={course}>
                {label(course)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cuisine">
          <input type="text" value={draft.cuisine} placeholder="British" onChange={(event) => update({ cuisine: event.target.value })} autoComplete="off" />
        </Field>
      </div>
      <div className="field">
        <span className="field-label">Serves</span>
        <Stepper label="Servings" value={draft.serves} min={1} max={48} onChange={(serves) => update({ serves })} />
      </div>
      <fieldset className="field-row">
        <legend className="field-label">Time in minutes</legend>
        {minutesField('prep', 'Prep')}
        {minutesField('cook', 'Cook')}
        {minutesField('rest', 'Rest')}
      </fieldset>
      <div className="field">
        <span className="field-label">Difficulty</span>
        <Segmented label="Difficulty" value={draft.difficulty} onChange={(difficulty) => update({ difficulty })} options={DIFFICULTIES.map((d) => ({ value: d, label: label(d) }))} />
      </div>
    </div>
  );
}

/** The aisle the library already files an ingredient under, so new lines land in the right part of the shopping list. */
function useAisles(): Map<string, DraftIngredient['aisle']> {
  const recipes = useLibrary((s) => s.recipes);
  return useMemo(() => {
    const aisles = new Map<string, DraftIngredient['aisle']>();
    for (const recipe of recipes)
      for (const group of recipe.ingredients)
        for (const item of group.items) {
          if (item.aisle === 'other') continue;
          aisles.set(item.key, item.aisle);
          aisles.set(slug(item.item), item.aisle);
        }
    return aisles;
  }, [recipes]);
}

function Ingredients({ groups, setGroups }: { groups: Group[]; setGroups(next: Group[]): void }) {
  const aisles = useAisles();
  const read = (text: string): DraftIngredient => {
    const item = parseIngredientLine(text);
    const name = slug(item.item);
    return { ...item, aisle: aisles.get(name) ?? aisles.get(name.replace(/s$/, '')) ?? item.aisle };
  };
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => {
    if (!focus) return;
    inputs.current.get(focus)?.focus();
    setFocus(null);
  }, [focus, groups]);

  const change = (g: number, fn: (group: Group) => Group) => setGroups(groups.map((group, i) => (i === g ? fn(group) : group)));
  const setLine = (g: number, l: number, text: string) =>
    change(g, (group) => ({
      ...group,
      lines: group.lines.map((line, i) => {
        if (i !== l) return line;
        const next = read(text);
        // Keep what was chosen for this ingredient (its aisle, its pantry key) while only the wording changes.
        const same = line.item && line.item.item === next.item;
        return { text, item: same && line.item ? { ...next, aisle: line.item.aisle, ...(line.item.key ? { key: line.item.key } : {}) } : next };
      }),
    }));
  const addLine = (g: number, after: number) => {
    change(g, (group) => ({ ...group, lines: [...group.lines.slice(0, after + 1), { text: '', item: null }, ...group.lines.slice(after + 1)] }));
    setFocus(`${g}-${after + 1}`);
  };
  const removeLine = (g: number, l: number) => change(g, (group) => ({ ...group, lines: group.lines.filter((_, i) => i !== l) }));
  const setAisle = (g: number, l: number, aisle: DraftIngredient['aisle']) =>
    change(g, (group) => ({
      ...group,
      lines: group.lines.map((line, i) => (i === l ? { ...line, item: { ...(line.item ?? read(line.text)), aisle } } : line)),
    }));

  // Numbered across sections, the way they read on the recipe.
  let number = 0;
  return (
    <div className="editor-fields">
      <p className="muted">One ingredient per line, the way you would write it: “200 g spaghetti” or “2 onions, finely sliced”. Press Enter for the next one.</p>
      {groups.map((group, g) => (
        <div key={g} className="editor-group">
          {(groups.length > 1 || group.section) && (
            <div className="editor-group-head">
              <input type="text" className="editor-section" value={group.section} placeholder="Section, like “For the sauce”" aria-label={`Section ${g + 1} name`} onChange={(event) => change(g, (x) => ({ ...x, section: event.target.value }))} />
              {groups.length > 1 && <IconButton icon="trash" label={`Remove section ${g + 1}`} onClick={() => setGroups(groups.filter((_, i) => i !== g))} />}
            </div>
          )}
          <ul className="editor-lines">
            {(group.lines.length ? group.lines : [{ text: '', item: null }]).map((line, l) => {
              number += 1;
              const id = `${g}-${l}`;
              return (
                <li key={id} className="editor-line">
                  <input
                    ref={(el) => {
                      if (el) inputs.current.set(id, el);
                      else inputs.current.delete(id);
                    }}
                    type="text"
                    value={line.text}
                    aria-label={`Ingredient ${number}`}
                    placeholder={number === 1 ? '200 g spaghetti' : ''}
                    autoComplete="off"
                    onChange={(event) => (group.lines.length ? setLine(g, l, event.target.value) : change(g, (x) => ({ ...x, lines: [{ text: event.target.value, item: read(event.target.value) }] })))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        if (line.text.trim()) addLine(g, l);
                      }
                    }}
                  />
                  <select aria-label={`Aisle for ingredient ${number}`} value={line.item?.aisle ?? 'other'} onChange={(event) => setAisle(g, l, event.target.value as DraftIngredient['aisle'])}>
                    {AISLES.map((aisle) => (
                      <option key={aisle} value={aisle}>
                        {AISLE_NAMES[aisle]}
                      </option>
                    ))}
                  </select>
                  {group.lines.length > 0 && <IconButton icon="close" label={`Remove ingredient ${number}`} onClick={() => removeLine(g, l)} />}
                </li>
              );
            })}
          </ul>
          <Button icon="plus" variant="plain" onClick={() => addLine(g, group.lines.length - 1)}>
            Add an ingredient
          </Button>
        </div>
      ))}
      <Button icon="plus" onClick={() => setGroups([...groups, { section: '', lines: [] }])}>
        Add a section
      </Button>
    </div>
  );
}

function Method({ draft, update }: Edit) {
  const steps = draft.steps.length ? draft.steps : [{ text: '' }];
  const set = (i: number, patch: Partial<RecipeDraft['steps'][number]>) => update({ steps: steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return (
    <div className="editor-fields">
      <p className="muted">Short steps read best in cook mode. Add a timer to any step that has a wait.</p>
      <ol className="editor-method">
        {steps.map((s, i) => (
          <li key={i} className="editor-method-step">
            <span className="editor-method-number tabular" aria-hidden="true">
              {i + 1}
            </span>
            <div className="editor-method-body">
              <textarea rows={2} value={s.text} aria-label={`Step ${i + 1}`} onChange={(event) => set(i, { text: event.target.value })} />
              <label className="editor-timer">
                <span className="muted">Timer</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={s.timer?.minutes ?? ''}
                  placeholder="–"
                  aria-label={`Timer for step ${i + 1} in minutes`}
                  onChange={(event) => {
                    const minutes = Number(event.target.value);
                    const { timer: _old, ...rest } = s;
                    update({ steps: steps.map((x, j) => (j === i ? (minutes > 0 ? { ...rest, timer: { minutes, label: s.timer?.label || `Step ${i + 1}` } } : rest) : x)) });
                  }}
                />
                <span className="muted">min</span>
              </label>
            </div>
            {steps.length > 1 && <IconButton icon="close" label={`Remove step ${i + 1}`} onClick={() => update({ steps: steps.filter((_, j) => j !== i) })} />}
          </li>
        ))}
      </ol>
      <Button icon="plus" variant="plain" onClick={() => update({ steps: [...steps, { text: '' }] })}>
        Add a step
      </Button>
    </div>
  );
}

function Extras({ draft, update }: Edit) {
  return (
    <div className="editor-fields">
      <Field label="Tips" hint="One per line.">
        <textarea rows={3} value={joined(draft.tips)} onChange={(event) => update({ tips: lines(event.target.value) })} />
      </Field>
      <Field label="Equipment" hint="One per line.">
        <textarea rows={2} value={joined(draft.equipment)} onChange={(event) => update({ equipment: lines(event.target.value) })} />
      </Field>
      <Field label="Storage">
        <input type="text" value={draft.storage ?? ''} placeholder="Keeps for 3 days in the fridge." onChange={(event) => update({ storage: event.target.value })} />
      </Field>
      <Field label="Tags" hint="Separate with commas, like “weeknight, cosy”.">
        <input type="text" value={draft.tags.join(', ')} onChange={(event) => update({ tags: event.target.value.split(',').map((t) => t.trimStart()) })} autoComplete="off" />
      </Field>
      <fieldset className="field">
        <legend className="field-label">Suits</legend>
        <div className="chip-wrap">
          {DIETS.map((diet) => (
            <Chip key={diet} selected={draft.diet.includes(diet)} onToggle={() => update({ diet: draft.diet.includes(diet) ? draft.diet.filter((d) => d !== diet) : [...draft.diet, diet] })}>
              {label(diet)}
            </Chip>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function PhotoStep({
  recipe,
  photo,
  setPhoto,
  keepExisting,
  setKeepExisting,
}: {
  recipe?: Recipe;
  photo: EditorPhoto | null;
  setPhoto(photo: EditorPhoto | null): void;
  keepExisting: boolean;
  setKeepExisting(keep: boolean): void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const existing = useRecipeImage(recipe && keepExisting ? recipe : { id: '', image: undefined });
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo.blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const shown = preview ?? existing;
  const credit = photo ? photo.credit : keepExisting ? recipe?.imageCredit : undefined;
  return (
    <div className="editor-fields">
      <div className="editor-photo">
        {shown ? <img src={shown} alt="" /> : <span className="muted">No photo. Simmer draws a cover instead.</span>}
      </div>
      {credit && (
        <p className="photo-credit muted">
          Photo by {credit.author}, {credit.license}
        </p>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="visually-hidden"
        aria-label="Photo file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) setPhoto({ blob: file });
          event.target.value = '';
        }}
      />
      <div className="page-foot">
        <Button icon="image" onClick={() => fileInput.current?.click()}>
          {shown ? 'Choose another photo' : 'Choose a photo'}
        </Button>
        {shown && (
          <Button
            variant="plain"
            onClick={() => {
              setPhoto(null);
              setKeepExisting(false);
            }}
          >
            Remove photo
          </Button>
        )}
      </div>
    </div>
  );
}
