import { z } from 'zod';
import { MOTIFS } from './cover';
import { AISLES, DIFFICULTIES, parseRecipe, type Recipe } from './schema';

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
        .map(({ key, ...item }) => ({ ...item, item: item.item.trim(), key: key || slug(item.item) || 'ingredient' })),
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
    prep: draft.prep.filter((p) => filled(p.text)).map((p) => ({ ...p, text: p.text.trim() })),
    steps: draft.steps.filter((s) => filled(s.text)).map((s) => ({ ...s, text: s.text.trim() })),
    equipment: draft.equipment.map((e) => e.trim()).filter(Boolean),
    tips: draft.tips.map((t) => t.trim()).filter(Boolean),
    substitutions: [],
    ...(filled(draft.storage) ? { storage: draft.storage!.trim() } : {}),
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
    ...(recipe.sourceUrl ? { sourceUrl: recipe.sourceUrl } : {}),
  };
}
