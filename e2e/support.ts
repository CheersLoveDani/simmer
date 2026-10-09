import { test as base, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

type FeedRecipe = { id: string; hash: string; title: string; [key: string]: unknown };

const seedDir = path.resolve(import.meta.dirname, '../src/seed');
const seedBundle = JSON.parse(readFileSync(path.join(seedDir, 'bundle.json'), 'utf8')) as { recipes: FeedRecipe[] };
const seedManifest = JSON.parse(readFileSync(path.join(seedDir, 'manifest.json'), 'utf8')) as { revision: string };

export const seedRecipes = seedBundle.recipes;
export const PASTA = 'Brown Butter Miso Pasta';

export interface Feed {
  /** Replace what the feed serves; the app sees it on its next sync. */
  publish(recipes: FeedRecipe[], revision: string): void;
  goOffline(): void;
  goOnline(): void;
  requests: string[];
}

/** Stand in for the recipe feed so tests never touch the network. */
async function mockFeed(page: Page): Promise<Feed> {
  let recipes = seedRecipes;
  let revision = seedManifest.revision;
  let offline = false;
  const requests: string[] = [];

  await page.route('http://feed.test/**', async (route) => {
    const url = new URL(route.request().url());
    const file = url.pathname.replace('/v1/', '');
    requests.push(file);
    if (offline) return route.abort('internetdisconnected');
    const entries = recipes.map((r) => ({ id: r.id, hash: r.hash, path: `r/${r.id}.${r.hash}.json` }));
    const json = (body: unknown) => route.fulfill({ json: body, headers: { 'access-control-allow-origin': '*' } });
    if (file === 'manifest.json') {
      return json({ schemaVersion: 1, revision, generatedAt: '2026-10-09T00:00:00Z', bundle: { path: 'bundle.json', hash: 'x', bytes: 1 }, recipes: entries, images: [] });
    }
    if (file === 'bundle.json') return json({ schemaVersion: 1, recipes });
    const single = recipes.find((r) => file === `r/${r.id}.${r.hash}.json`);
    return single ? json(single) : route.fulfill({ status: 404 });
  });

  return {
    publish(next, nextRevision) {
      recipes = next;
      revision = nextRevision;
    },
    goOffline: () => void (offline = true),
    goOnline: () => void (offline = false),
    requests,
  };
}

export const test = base.extend<{ feed: Feed; wide: boolean }>({
  feed: [
    async ({ page }, use) => {
      await use(await mockFeed(page));
    },
    { auto: true },
  ],
  wide: async ({ viewport }, use) => {
    await use((viewport?.width ?? 0) >= 820);
  },
});

export { expect };

/** Open the app and wait until the library is on screen. */
export async function open(page: Page, hash = '/'): Promise<void> {
  await page.goto(`/#${hash}`);
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
}

export async function goTo(page: Page, name: 'Home' | 'Search' | 'Plan' | 'Shopping' | 'Saved'): Promise<void> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true }).click();
}

export async function openRecipe(page: Page, id = 'brown-butter-miso-pasta'): Promise<void> {
  await open(page, `/recipe/${id}`);
  await expect(page.getByTestId('recipe-page')).toBeVisible();
}

export const cards = (page: Page) => page.getByTestId('recipe-card');
