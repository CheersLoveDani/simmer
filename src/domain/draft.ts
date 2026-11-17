import { z } from 'zod';
import { MOTIFS } from './cover';
import { AISLES, DIFFICULTIES, MEAL_PREP_RATINGS, parseRecipe, type Recipe } from './schema';

// A recipe as someone is still writing it: by hand in the editor, or by an
// assistant. Deliberately loose (no minimum lengths) so a half-finished form
// and a structured-output schema both fit; `buildRecipe` decides when it is done.
const draftIngredientSchema = z.object({
  qty: z.number().nullable(),
  qtyMax: z.number().optional(),
  unit: z.string().nullable(),
  item: z.string(),
  /** Kept when editing so pantry matches and shopping totals carry on working. */
  key: z.string().optional(),
  aisle: z.enum(AISLES),
  prep: z.string().optional(),
  note: z.string().optional(),
  optional: z.boolean().optional(),
});

export const draftSchema = z.object({
  title: z.string(),
  description: z.string(),
  course: z.string(),
  cuisine: z.string(),
  serves: z.number(),
  difficulty: z.enum(DIFFICULTIES),
  diet: z.array(z.string()),
  tags: z.array(z.string()),
  time: z.object({ prep: z.number(), cook: z.number(), rest: z.number() }),
  ingredients: z.array(z.object({ section: z.string().nullable(), items: z.array(draftIngredientSchema) })),
  prep: z.array(z.object({ text: z.string(), during: z.number().optional() })),
  steps: z.array(
    z.object({
      text: z.string(),
      timer: z.object({ minutes: z.number(), label: z.string() }).optional(),
      tip: z.string().optional(),
    }),
  ),
  equipment: z.array(z.string()),
  tips: z.array(z.string()),
  storage: z.string().optional(),
  /** Estimated per serving. */
  nutrition: z
    .object({
      kcal: z.number(),
      protein: z.number().optional(),
      carbs: z.number().optional(),
      fat: z.number().optional(),
      fibre: z.number().optional(),
    })
    .optional(),
  /** How it keeps for batch cooking. */
  mealPrep: z
    .object({
      rating: z.enum(MEAL_PREP_RATINGS),
      fridgeDays: z.number(),
      roomDays: z.number().optional(),
      freezerMonths: z.number(),
      portion: z.string(),
      freeze: z.string().optional(),
      defrost: z.string().optional(),
      reheat: z.array(z.object({ method: z.string(), from: z.enum(['chilled', 'frozen']), minutes: z.number().optional(), text: z.string() })),
      serveFresh: z.array(z.string()).optional(),
      tips: z.array(z.string()).optional(),
    })
    .optional(),
  /** A few plain words to search for a photo with. */
  photoQuery: z.string().optional(),
  /** Where the recipe was found, if it came from a web page. */
  sourceUrl: z.string().optional(),
});

export type RecipeDraft = z.infer<typeof draftSchema>;
export type DraftIngredient = RecipeDraft['ingredients'][number]['items'][number];

export function emptyDraft(): RecipeDraft {
  return {
    title: '',
    description: '',
    course: 'main',
    cuisine: '',
    serves: 4,
    difficulty: 'easy',
    diet: [],
    tags: [],
    time: { prep: 0, cook: 0, rest: 0 },
    ingredients: [{ section: null, items: [] }],
    prep: [],
    steps: [],
    equipment: [],
    tips: [],
  };
}

export function slug(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function hashText(text: string): number {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

function motifFor(title: string, course: string): string {
  const words = `${title} ${course}`.toLowerCase();
  return MOTIFS.find((motif) => new RegExp(`\\b${motif}`).test(words)) ?? MOTIFS[0];
}

const randomSuffix = () => Math.random().toString(36).slice(2, 6).padEnd(4, '0');
const filled = (text: string | undefined) => (text ?? '').trim() !== '';
const minutes = (n: number) => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);

export interface BuildOptions {
  /** Keep this id when editing an existing recipe. */
  id?: string;
  created?: string;
  image?: string;
  imageCredit?: Recipe['imageCredit'];
  now?: Date;
}

/** Turn a draft into a recipe the rest of the app can use, or null while something essential is missing. */
export function buildRecipe(draft: RecipeDraft, options: BuildOptions): Recipe | null {
  const now = options.now ?? new Date();
  const title = draft.title.trim();
  const base = slug(title).slice(0, 48).replace(/-+$/, '') || 'recipe';
  const ingredients = draft.ingredients
    .map((group) => ({
      section: filled(group.section ?? undefined) ? group.section!.trim() : null,
      items: group.items
        .filter((item) => filled(item.item))
        .map(({ key, qty, qtyMax, unit, ...item }) => {
          // A quantity the form could not make sense of becomes "no quantity" rather than blocking the save.
          const amount = qty !== null && Number.isFinite(qty) && qty > 0 ? qty : null;
          const upTo = amount !== null && qtyMax !== undefined && Number.isFinite(qtyMax) && qtyMax > amount ? qtyMax : undefined;
          return {
            ...item,
            qty: amount,
            ...(upTo !== undefined ? { qtyMax: upTo } : {}),
            unit: unit?.trim() || null,
            item: item.item.trim(),
            key: key || slug(item.item) || 'ingredient',
          };
        }),
    }))
    .filter((group) => group.items.length > 0);
  const time = { prep: minutes(draft.time.prep), cook: minutes(draft.time.cook), rest: minutes(draft.time.rest) };

  return parseRecipe({
    id: options.id ?? `mine.${base}-${randomSuffix()}`,
    hash: `mine-${now.getTime().toString(36)}${randomSuffix()}`,
    title,
    description: draft.description.trim(),
    course: draft.course.trim() || 'main',
    cuisine: slug(draft.cuisine) || 'other',
    tags: draft.tags.map((t) => t.trim()).filter(Boolean),
    diet: draft.diet,
    difficulty: draft.difficulty,
    serves: Math.max(1, Math.round(draft.serves) || 1),
    time: { ...time, total: time.prep + time.cook + time.rest },
    ingredients,
    prep: draft.prep
      .filter((p) => filled(p.text))
      .map(({ during, ...p }) => ({ ...p, text: p.text.trim(), ...(during !== undefined && Number.isInteger(during) && during > 0 ? { during } : {}) })),
    steps: draft.steps
      .filter((s) => filled(s.text))
      .map(({ timer, ...s }, i) => ({
        ...s,
        text: s.text.trim(),
        ...(timer && Number.isFinite(timer.minutes) && timer.minutes > 0 ? { timer: { minutes: timer.minutes, label: timer.label.trim() || `Step ${i + 1}` } } : {}),
      })),
    equipment: draft.equipment.map((e) => e.trim()).filter(Boolean),
    tips: draft.tips.map((t) => t.trim()).filter(Boolean),
    substitutions: [],
    ...(filled(draft.storage) ? { storage: draft.storage!.trim() } : {}),
    ...nutritionOf(draft),
    ...mealPrepOf(draft),
    cover: { hue: hashText(title) % 360, motif: motifFor(title, draft.course) },
    ...(options.image ? { image: options.image } : {}),
    ...(options.imageCredit ? { imageCredit: options.imageCredit } : {}),
    ...(draft.sourceUrl ? { sourceUrl: draft.sourceUrl } : {}),
    author: 'You',
    created: options.created ?? now.toISOString().slice(0, 10),
    ...(options.created ? { updated: now.toISOString().slice(0, 10) } : {}),
    source: 'mine',
  });
}

const whole = (n: number | undefined, max: number) => (n !== undefined && Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n))) : 0);
const amount = (n: number | undefined) => (n !== undefined && Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : undefined);

function nutritionOf(draft: RecipeDraft): { nutrition?: Recipe['nutrition'] } {
  const n = draft.nutrition;
  if (!n || !Number.isFinite(n.kcal) || n.kcal <= 0) return {};
  const nutrition: NonNullable<Recipe['nutrition']> = { kcal: Math.round(n.kcal) };
  for (const key of ['protein', 'carbs', 'fat', 'fibre'] as const) {
    const value = amount(n[key]);
    if (value !== undefined) nutrition[key] = value;
  }
  return { nutrition };
}

/** Meal prep notes count once there is something to say about portioning. */
function mealPrepOf(draft: RecipeDraft): { mealPrep?: Recipe['mealPrep'] } {
  const m = draft.mealPrep;
  if (!m || !filled(m.portion)) return {};
  const freezerMonths = whole(m.freezerMonths, 12);
  const reheat = m.reheat
    .filter((r) => filled(r.text) && (freezerMonths > 0 || r.from === 'chilled'))
    .map((r) => ({ method: r.method || 'microwave', from: r.from, text: r.text.trim(), ...(amount(r.minutes) ? { minutes: amount(r.minutes) } : {}) }));
  const roomDays = whole(m.roomDays, 14);
  return {
    mealPrep: {
      rating: m.rating,
      fridgeDays: whole(m.fridgeDays, 14),
      ...(roomDays > 0 ? { roomDays } : {}),
      freezerMonths,
      portion: m.portion.trim(),
      ...(freezerMonths > 0 && filled(m.freeze) ? { freeze: m.freeze!.trim() } : {}),
      ...(freezerMonths > 0 && filled(m.defrost) ? { defrost: m.defrost!.trim() } : {}),
      reheat,
      serveFresh: (m.serveFresh ?? []).map((s) => s.trim()).filter(Boolean),
      tips: (m.tips ?? []).map((s) => s.trim()).filter(Boolean),
    },
  };
}

/** Open any recipe in the editor. */
export function draftFromRecipe(recipe: Recipe): RecipeDraft {
  return {
    title: recipe.title,
    description: recipe.description,
    course: recipe.course,
    cuisine: recipe.cuisine,
    serves: recipe.serves,
    difficulty: recipe.difficulty,
    diet: recipe.diet,
    tags: recipe.tags,
    time: { prep: recipe.time.prep, cook: recipe.time.cook, rest: recipe.time.rest },
    ingredients: recipe.ingredients.map((group) => ({ section: group.section, items: group.items.map((item) => ({ ...item })) })),
    prep: recipe.prep,
    steps: recipe.steps,
    equipment: recipe.equipment,
    tips: recipe.tips,
    ...(recipe.storage ? { storage: recipe.storage } : {}),
    ...(recipe.nutrition ? { nutrition: { ...recipe.nutrition } } : {}),
    ...(recipe.mealPrep ? { mealPrep: { ...recipe.mealPrep, reheat: recipe.mealPrep.reheat.map((r) => ({ ...r })) } } : {}),
    ...(recipe.sourceUrl ? { sourceUrl: recipe.sourceUrl } : {}),
  };
}
