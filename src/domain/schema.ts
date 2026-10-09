import { z } from 'zod';

/** Highest feed schema major version this build understands. */
export const SUPPORTED_SCHEMA_VERSION = 1;

export const AISLES = [
  'produce',
  'meat-fish',
  'dairy-eggs',
  'bakery',
  'pantry',
  'spices',
  'tins-jars',
  'frozen',
  'drinks',
  'other',
] as const;
export type Aisle = (typeof AISLES)[number];

export const COURSES = [
  'breakfast',
  'starter',
  'soup',
  'salad',
  'main',
  'side',
  'sauce',
  'snack',
  'baking',
  'dessert',
  'drink',
] as const;

export const DIETS = ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free', 'pescatarian'] as const;

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

// The feed may gain new courses, units or motifs within a major version, so
// those stay open strings here; only fields the app branches on are narrowed.
const ingredientSchema = z.object({
  qty: z.number().positive().nullable(),
  qtyMax: z.number().positive().optional(),
  unit: z.string().nullable(),
  item: z.string().min(1),
  key: z.string().min(1),
  aisle: z.enum(AISLES).catch('other'),
  prep: z.string().optional(),
  note: z.string().optional(),
  optional: z.boolean().optional(),
  fixed: z.boolean().optional(),
});

const stepSchema = z.object({
  text: z.string().min(1),
  timer: z.object({ minutes: z.number().positive(), label: z.string().min(1) }).optional(),
  tip: z.string().optional(),
});

/** A link that is safe to open: feed content must never smuggle in another scheme. */
const webUrl = z.string().refine((value) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}, 'must be an https link');

const hexColour = z.string().regex(/^#[0-9a-f]{6}$/i);
/** Theme art is only ever loaded from the feed's own theme folder. */
const themeArt = z.string().regex(/^img\/t\/[a-z0-9-]+\/[A-Za-z0-9._-]+\.(webp|png|svg)$/);
const themeLook = {
  accentDark: hexColour.optional().catch(undefined),
  art: themeArt.optional().catch(undefined),
};

/** A shared look for a group of recipes, such as those from one cookbook. */
export const themeSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().min(1),
  description: z.string().optional(),
  credit: z.string().optional(),
  accent: hexColour,
  ...themeLook,
  /** Variations a recipe can pick, e.g. one per character. */
  styles: z.record(z.string(), z.object({ label: z.string().min(1), accent: hexColour.optional().catch(undefined), ...themeLook })).default({}),
});
export type Theme = z.infer<typeof themeSchema>;

/** Themes are read one by one so a malformed one is skipped, not fatal. */
export function parseThemes(raw: unknown): Theme[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = themeSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export const recipeSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  hash: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  course: z.string().min(1),
  cuisine: z.string().min(1),
  tags: z.array(z.string()).default([]),
  diet: z.array(z.string()).default([]),
  difficulty: z.enum(DIFFICULTIES).catch('medium'),
  serves: z.number().int().positive(),
  yield: z.string().optional(),
  time: z.object({
    prep: z.number().nonnegative(),
    cook: z.number().nonnegative(),
    rest: z.number().nonnegative().default(0),
    total: z.number().nonnegative(),
  }),
  ingredients: z
    .array(z.object({ section: z.string().nullable().default(null), items: z.array(ingredientSchema).min(1) }))
    .min(1),
  steps: z.array(stepSchema).min(1),
  equipment: z.array(z.string()).default([]),
  tips: z.array(z.string()).default([]),
  substitutions: z.array(z.object({ for: z.string(), use: z.string(), note: z.string().optional() })).default([]),
  storage: z.string().optional(),
  nutrition: z
    .object({
      kcal: z.number(),
      protein: z.number().optional(),
      carbs: z.number().optional(),
      fat: z.number().optional(),
      fibre: z.number().optional(),
    })
    .optional(),
  cover: z.object({ hue: z.number().min(0).max(360), motif: z.string() }),
  image: z.string().optional(),
  /** The look this recipe borrows: a theme, and optionally one of its styles. */
  theme: z
    .object({ id: z.string(), style: z.string().optional() })
    .optional()
    .catch(undefined),
  /** Who made the photo and its licence; shown wherever the photo is the subject. */
  imageCredit: z
    .object({ author: z.string(), license: z.string(), licenseUrl: webUrl.optional().catch(undefined), source: webUrl })
    .optional()
    .catch(undefined),
  author: z.string().default('Simmer'),
  created: z.string(),
  updated: z.string().optional(),
});

export type Recipe = z.infer<typeof recipeSchema>;
export type Ingredient = Recipe['ingredients'][number]['items'][number];
export type Step = Recipe['steps'][number];
export type Nutrition = NonNullable<Recipe['nutrition']>;

const fileRef = z.object({ id: z.string(), hash: z.string(), path: z.string() });

export const manifestSchema = z.object({
  schemaVersion: z.number().int().positive(),
  revision: z.string().min(1),
  generatedAt: z.string(),
  bundle: z.object({ path: z.string(), hash: z.string(), bytes: z.number() }),
  recipes: z.array(fileRef),
  images: z.array(fileRef).default([]),
  themes: z.array(z.unknown()).default([]),
});
export type Manifest = z.infer<typeof manifestSchema>;

/** The bundle's recipes are validated one by one so a bad one can be skipped. */
export const bundleSchema = z.object({
  schemaVersion: z.number().int().positive(),
  recipes: z.array(z.unknown()),
});

export function parseRecipe(input: unknown): Recipe | null {
  const result = recipeSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function allIngredients(recipe: Recipe): Ingredient[] {
  return recipe.ingredients.flatMap((group) => group.items);
}

export function label(slug: string): string {
  const text = slug.replace(/-/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
