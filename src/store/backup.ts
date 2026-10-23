import { z } from 'zod';
import { AISLES, parseRecipe, type Recipe } from '../domain/schema';
import { MEALS } from '../domain/planner';
import { MINE, SIMMER } from './recipeStore';

export const settingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).catch('system'),
  units: z.enum(['metric', 'us']).catch('metric'),
  textSize: z.enum(['small', 'medium', 'large']).catch('medium'),
  reduceMotion: z.boolean().catch(false),
  keepAwake: z.boolean().catch(true),
  timerSound: z.boolean().catch(true),
  autoUpdate: z.boolean().catch(true),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  units: 'metric',
  textSize: 'medium',
  reduceMotion: false,
  keepAwake: true,
  timerSound: true,
  autoUpdate: true,
};

const shoppingItemSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  aisle: z.enum(AISLES).catch('other'),
  qty: z.number().nullable(),
  unit: z.string().nullable(),
  checked: z.boolean(),
  sources: z.array(z.object({ recipeId: z.string(), title: z.string() })).default([]),
});

function isHttps(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Another published recipe feed someone has added. */
export const bookSchema = z.object({
  // A book's key names its library, so it must never be one the app already uses.
  key: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .refine((key) => key !== SIMMER && key !== MINE),
  name: z.string(),
  mirrors: z.array(z.string().refine(isHttps)).min(1),
});
export type Book = z.infer<typeof bookSchema>;

/** A damaged or hostile book is dropped on its own; the rest are kept. */
const booksSchema = z
  .array(z.unknown())
  .catch([])
  .transform((items) =>
    items.flatMap((item) => {
      const parsed = bookSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
  );

export const userDataSchema = z.object({
  favourites: z.array(z.string()).default([]),
  notes: z.record(z.string(), z.string()).default({}),
  ratings: z.record(z.string(), z.number().min(1).max(5)).default({}),
  cooked: z.array(z.object({ recipeId: z.string(), date: z.string() })).default([]),
  recent: z.array(z.string()).default([]),
  collections: z.array(z.object({ id: z.string(), name: z.string(), recipeIds: z.array(z.string()) })).default([]),
  pantry: z.array(z.string()).default([]),
  shopping: z.array(shoppingItemSchema).default([]),
  plan: z
    .array(
      z.object({
        id: z.string(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        meal: z.enum(MEALS),
        recipeId: z.string(),
        servings: z.number().positive(),
      }),
    )
    .default([]),
  servings: z.record(z.string(), z.number().positive()).default({}),
  books: booksSchema.default([]),
  settings: settingsSchema.default(DEFAULT_SETTINGS),
});
export type UserData = z.infer<typeof userDataSchema>;

export const EMPTY_USER_DATA: UserData = userDataSchema.parse({});

const backupSchema = z.object({
  app: z.literal('simmer'),
  version: z.literal(1),
  exportedAt: z.string(),
  data: userDataSchema,
  /** Your own recipes; absent from backups made before you could add them. */
  recipes: z.array(z.unknown()).catch([]).default([]),
});

export function createBackup(data: UserData, now = new Date(), recipes: Recipe[] = []): string {
  return JSON.stringify({ app: 'simmer', version: 1, exportedAt: now.toISOString(), data, recipes }, null, 2);
}

export type BackupResult = { ok: true; data: UserData; recipes: Recipe[] } | { ok: false; error: string };

/** Validate a backup file completely before anything is replaced. */
export function parseBackup(text: string): BackupResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  const result = backupSchema.safeParse(json);
  if (!result.success) return { ok: false, error: 'That file is not a Simmer backup.' };
  // Only your own recipes come back from a file: it must not be able to replace library ones.
  const recipes = result.data.recipes
    .map(parseRecipe)
    .filter((r): r is Recipe => r !== null && r.source === MINE && r.id.startsWith(`${MINE}.`));
  return { ok: true, data: result.data.data, recipes };
}
