import {
  SUPPORTED_SCHEMA_VERSION,
  bundleSchema,
  manifestSchema,
  parseRecipe,
  type Manifest,
  type Recipe,
} from '../domain/schema';
import type { RecipeStore } from '../store/recipeStore';

export const MIRRORS = [
  'https://cheerslovedani.github.io/simmer-recipes/v1/',
  'https://raw.githubusercontent.com/CheersLoveDani/simmer-recipes/gh-pages/v1/',
];

/** Above this many changed recipes one bundle download beats many small ones. */
export const BUNDLE_THRESHOLD = 20;

const TIMEOUT_MS = 20_000;

export interface SyncResult {
  status: 'up-to-date' | 'updated' | 'unsupported' | 'failed';
  added: string[];
  updated: string[];
  removed: string[];
  /** Recipes the feed offered that this build could not read. */
  skipped: string[];
  error?: string;
}

export interface SyncDeps {
  fetch: typeof fetch;
  store: RecipeStore;
  mirrors?: string[];
  supportedVersion?: number;
}

const empty = (status: SyncResult['status'], error?: string): SyncResult => ({
  status,
  added: [],
  updated: [],
  removed: [],
  skipped: [],
  ...(error ? { error } : {}),
});

async function getJson(fetcher: typeof fetch, url: string, fresh: boolean): Promise<unknown> {
  const response = await fetcher(url, {
    cache: fresh ? 'no-store' : 'default',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return response.json();
}

/** Try each mirror in turn; every mirror serves the same content-addressed files. */
async function fromMirrors<T>(mirrors: string[], load: (mirror: string) => Promise<T>): Promise<{ value: T; mirror: string }> {
  let lastError: unknown = new Error('No mirrors configured');
  for (const mirror of mirrors) {
    try {
      return { value: await load(mirror), mirror };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function fetchManifest(fetcher: typeof fetch, mirrors: string[]): Promise<{ manifest: Manifest; mirror: string }> {
  const { value, mirror } = await fromMirrors(mirrors, async (m) =>
    manifestSchema.parse(await getJson(fetcher, `${m}manifest.json?t=${Date.now()}`, true)),
  );
  return { manifest: value, mirror };
}

/**
 * Bring the local recipe store in line with the published feed.
 * Never throws: failures are reported in the result and leave the store as it was.
 */
export async function syncRecipes(deps: SyncDeps): Promise<SyncResult> {
  const { fetch: fetcher, store } = deps;
  const mirrors = deps.mirrors ?? MIRRORS;
  const supported = deps.supportedVersion ?? SUPPORTED_SCHEMA_VERSION;

  try {
    const { manifest, mirror } = await fetchManifest(fetcher, mirrors);
    if (manifest.schemaVersion > supported) return empty('unsupported');
    if (manifest.revision === (await store.revision())) return empty('up-to-date');

    const local = await store.hashes();
    const wanted = new Map(manifest.recipes.map((entry) => [entry.id, entry]));
    const changed = manifest.recipes.filter((entry) => local.get(entry.id) !== entry.hash);
    const removed = [...local.keys()].filter((id) => !wanted.has(id));

    // Start with the mirror that answered, fall back to the others.
    const ordered = [mirror, ...mirrors.filter((m) => m !== mirror)];
    const load = async (path: string) => (await fromMirrors(ordered, (m) => getJson(fetcher, `${m}${path}`, false))).value;

    let raw: unknown[] = [];
    if (changed.length > 0) {
      if (local.size === 0 || changed.length > BUNDLE_THRESHOLD) {
        raw = bundleSchema.parse(await load(manifest.bundle.path)).recipes;
      } else {
        raw = await Promise.all(changed.map((entry) => load(entry.path)));
      }
    }

    const changedIds = new Set(changed.map((entry) => entry.id));
    const put: Recipe[] = [];
    for (const item of raw) {
      const recipe = parseRecipe(item);
      if (recipe && changedIds.has(recipe.id)) put.push(recipe);
    }
    const received = new Set(put.map((r) => r.id));
    const skipped = changed.filter((entry) => !received.has(entry.id)).map((entry) => entry.id);

    // With recipes skipped the revision is left alone, so a later build that
    // can read them will pick them up instead of believing it is up to date.
    await store.apply({ put, remove: removed, revision: skipped.length === 0 ? manifest.revision : null });

    const added = put.filter((r) => !local.has(r.id)).map((r) => r.id);
    const updated = put.filter((r) => local.has(r.id)).map((r) => r.id);
    const anything = added.length + updated.length + removed.length > 0;
    return { status: anything ? 'updated' : 'up-to-date', added, updated, removed, skipped };
  } catch (error) {
    return empty('failed', error instanceof Error ? error.message : String(error));
  }
}

/** Load the snapshot shipped with the app when the store has never been filled. */
export async function seedIfEmpty(
  store: RecipeStore,
  loadSeed: () => Promise<{ revision: string; recipes: unknown[] }>,
): Promise<boolean> {
  if ((await store.hashes()).size > 0) return false;
  const seed = await loadSeed();
  const put = seed.recipes.map(parseRecipe).filter((r): r is Recipe => r !== null);
  if (put.length === 0) return false;
  await store.apply({ put, remove: [], revision: put.length === seed.recipes.length ? seed.revision : null });
  return true;
}

export function describeSync(result: SyncResult): string | null {
  if (result.status !== 'updated') return null;
  const parts: string[] = [];
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (result.added.length) parts.push(`${plural(result.added.length, 'new recipe')}`);
  if (result.updated.length) parts.push(`${result.updated.length} updated`);
  if (result.removed.length) parts.push(`${result.removed.length} removed`);
  return parts.join(', ');
}
