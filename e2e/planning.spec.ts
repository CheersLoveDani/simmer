import { readFileSync } from 'node:fs';
import { PASTA, cards, expect, goTo, open, openRecipe, seedRecipes, test } from './support';

const items = (page: import('@playwright/test').Page) => page.getByTestId('shopping-item');

test.describe('shopping list', () => {
  test('collects a recipe at the chosen servings', async ({ page }) => {
    await openRecipe(page);
    await page.getByRole('region', { name: 'Ingredients' }).getByRole('button', { name: 'More servings' }).click();
    await page.getByRole('button', { name: 'Add to shopping list' }).click();
    await expect(page.locator('.toasts')).toContainText('Added to shopping list');
    await goTo(page, 'Shopping');

    await expect(items(page).filter({ hasText: 'Spaghetti' })).toContainText('300 g');
    await expect(items(page).filter({ hasText: 'Spaghetti' })).toContainText(PASTA);
    await expect(page.getByRole('region', { name: 'Cupboard' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Dairy & eggs' })).toContainText('Butter');
  });

  test('merges the same ingredient from two recipes', async ({ page }) => {
    await openRecipe(page);
    await page.getByRole('button', { name: 'Add to shopping list' }).click();
    await openRecipe(page, 'chickpea-spinach-curry');
    await page.getByRole('button', { name: 'Add to shopping list' }).click();
    await goTo(page, 'Shopping');

    const garlic = items(page).filter({ hasText: /^Garlic/ });
    await expect(garlic).toHaveCount(1);
    await expect(garlic).toContainText(PASTA);
    await expect(garlic).toContainText('Chickpea');
  });

  test('adds, ticks and removes items, and keeps them after a restart', async ({ page }) => {
    await open(page, '/shopping');
    await expect(page.getByRole('heading', { name: 'Nothing to buy yet' })).toBeVisible();
    const add = page.getByRole('textbox', { name: 'Add an item' });
    await add.fill('Kitchen roll');
    await add.press('Enter');
    await add.fill('Foil');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(items(page)).toHaveCount(2);
    await expect(page.getByText('2 to get')).toBeVisible();

    await page.getByText('Foil', { exact: true }).click();
    await expect(page.getByRole('checkbox', { name: /Foil/ })).toBeChecked();
    await expect(page.getByText('1 to get')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('checkbox', { name: /Foil/ })).toBeChecked();
    await page.getByRole('button', { name: 'Remove 1 ticked' }).click();
    await expect(items(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Remove Kitchen roll' }).click();
    await expect(page.getByRole('heading', { name: 'Nothing to buy yet' })).toBeVisible();
  });

  test('clears the list and can undo it', async ({ page }) => {
    await open(page, '/shopping');
    const add = page.getByRole('textbox', { name: 'Add an item' });
    await add.fill('Foil');
    await add.press('Enter');
    await page.getByRole('button', { name: 'Clear list' }).click();
    await expect(items(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(items(page)).toHaveCount(1);
  });

  test('copies the list as text', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    // Without a system share sheet the list goes to the clipboard.
    await page.addInitScript(() => Object.defineProperty(navigator, 'share', { value: undefined }));
    await openRecipe(page);
    await page.getByRole('button', { name: 'Add to shopping list' }).click();
    await goTo(page, 'Shopping');
    await page.getByRole('button', { name: 'Share list' }).click();
    await expect(page.locator('.toasts')).toContainText('Shopping list copied');
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain('- spaghetti (200 g)');
    expect(text).toContain('Cupboard');
  });
});

test.describe('meal plan', () => {
  test('plans a meal from the planner and shops for the week', async ({ page }) => {
    await open(page, '/plan');
    const today = page.locator('.day.is-today');
    await today.getByRole('button', { name: /^Add dinner/ }).click();
    const picker = page.getByRole('dialog');
    await picker.getByRole('searchbox').fill('miso pasta');
    await picker.getByRole('button', { name: PASTA }).click();
    await expect(picker).toBeHidden();

    const entry = today.getByTestId('plan-entry');
    await expect(entry).toContainText(PASTA);
    await entry.getByRole('button', { name: 'More servings' }).click();

    await page.getByRole('button', { name: 'Add this week to shopping list' }).click();
    await goTo(page, 'Shopping');
    await expect(items(page).filter({ hasText: 'Spaghetti' })).toContainText('300 g');

    await goTo(page, 'Home');
    await expect(page.getByRole('heading', { name: 'On the plan today' })).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(`Dinner.*${PASTA}`) })).toBeVisible();
  });

  test('plans from a recipe, survives a restart, and removes', async ({ page }) => {
    await openRecipe(page);
    await page.getByRole('button', { name: 'Add to meal plan' }).click();
    const sheet = page.getByRole('dialog', { name: 'Add to meal plan' });
    await sheet.getByRole('button', { name: 'Lunch' }).click();
    await sheet.getByRole('button', { name: 'Add to plan' }).click();
    await expect(page.locator('.toasts')).toContainText('lunch');

    await goTo(page, 'Plan');
    await page.reload();
    const entry = page.locator('.day.is-today').getByTestId('plan-entry');
    await expect(entry).toContainText(PASTA);
    await entry.getByRole('button', { name: /^Remove/ }).click();
    await expect(page.getByTestId('plan-entry')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add this week to shopping list' })).toBeDisabled();
  });

  test('moves between weeks', async ({ page }) => {
    await open(page, '/plan');
    await expect(page.locator('.day.is-today')).toHaveCount(1);
    await page.getByRole('button', { name: 'Next week' }).click();
    await expect(page.locator('.day.is-today')).toHaveCount(0);
    await page.getByRole('button', { name: 'This week', exact: true }).click();
    await expect(page.locator('.day.is-today')).toHaveCount(1);
  });
});

test.describe('settings', () => {
  test('switches theme, text size and motion', async ({ page }) => {
    await open(page, '/settings');
    const html = page.locator('html');
    await page.getByRole('radio', { name: 'Dark' }).click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('radio', { name: 'Light' }).click();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await page.getByRole('radio', { name: 'Large' }).click();
    await expect(html).toHaveAttribute('data-text', 'large');
    await page.getByRole('switch', { name: 'Reduce motion' }).click();
    await expect(html).toHaveAttribute('data-motion', 'reduced');

    await page.reload();
    await expect(html).toHaveAttribute('data-text', 'large');
    await expect(page.getByRole('switch', { name: 'Reduce motion' })).toHaveAttribute('aria-checked', 'true');
  });

  test('follows the system theme by default', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('the measurement setting applies to recipes', async ({ page }) => {
    await open(page, '/settings');
    await page.getByRole('radio', { name: 'US' }).click();
    await openRecipe(page);
    await expect(page.getByRole('region', { name: 'Ingredients' })).toContainText('7.1 oz spaghetti');
  });

  test('backs up, erases and restores personal data', async ({ page }) => {
    await openRecipe(page);
    await page.getByRole('button', { name: 'Add to favourites' }).click();
    await open(page, '/settings');

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save file' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^simmer-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const file = await download.path();
    expect(JSON.parse(readFileSync(file, 'utf8')).data.favourites).toEqual(['brown-butter-miso-pasta']);

    await page.getByRole('button', { name: 'Erase…' }).click();
    await page.getByRole('button', { name: 'Erase', exact: true }).click();
    await goTo(page, 'Saved');
    await expect(page.getByRole('heading', { name: 'No favourites yet' })).toBeVisible();

    await open(page, '/settings');
    await page.getByLabel('Backup file').setInputFiles(file);
    await expect(page.locator('.toasts')).toContainText('Backup restored');
    await goTo(page, 'Saved');
    await expect(cards(page)).toContainText(PASTA);
  });

  test('refuses a file that is not a backup', async ({ page }) => {
    await openRecipe(page);
    await page.getByRole('button', { name: 'Add to favourites' }).click();
    await open(page, '/settings');
    await page.getByLabel('Backup file').setInputFiles({ name: 'nope.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":"world"}') });
    await expect(page.locator('.toasts')).toContainText('not a Simmer backup');
    await goTo(page, 'Saved');
    await expect(cards(page)).toContainText(PASTA);
  });
});

test.describe('recipe updates', () => {
  const toast = { ...seedRecipes[0]!, id: 'test-kitchen-toast', hash: 'new-1', title: 'Test Kitchen Toast' };

  test('picks up new, changed and removed recipes on its own', async ({ page, feed }) => {
    await openRecipe(page, 'guacamole');
    await page.getByRole('button', { name: 'Add to favourites' }).click();

    const next = seedRecipes
      .filter((r) => r.id !== 'guacamole')
      .map((r) => (r.id === 'hummus' ? { ...r, hash: 'hummus-2', title: 'Silky Hummus' } : r));
    feed.publish([...next, toast], 'revision-2');

    await page.reload();
    await expect(page.locator('.toasts')).toContainText('Recipes updated: 1 new recipe, 1 updated, 1 removed');
    // Only the two changed recipes are downloaded, not the whole library.
    expect(feed.requests.filter((r) => r.startsWith('r/'))).toHaveLength(2);
    expect(feed.requests).not.toContain('bundle.json');

    await goTo(page, 'Search');
    const box = page.getByRole('searchbox', { name: 'Search recipes' });
    await box.fill('test kitchen');
    await expect(cards(page).first()).toContainText('Test Kitchen Toast');
    await box.fill('hummus');
    await expect(cards(page).first()).toContainText('Silky Hummus');
    await box.fill('guacamole');
    await expect(cards(page).filter({ hasText: 'Guacamole' })).toHaveCount(0);

    // A favourite whose recipe was withdrawn quietly disappears.
    await goTo(page, 'Saved');
    await expect(page.getByRole('heading', { name: 'No favourites yet' })).toBeVisible();
    await page.goto('/#/recipe/guacamole');
    await expect(page.getByRole('heading', { name: 'That recipe is no longer in the library' })).toBeVisible();
  });

  test('works offline from the bundled library and says so', async ({ page, feed }) => {
    feed.goOffline();
    await open(page, '/search');
    await expect(page.getByTestId('result-count')).toHaveText(`${seedRecipes.length} recipes`);

    await open(page, '/settings');
    await expect(page.getByTestId('sync-status')).toContainText('Offline');
    await page.getByRole('button', { name: 'Check now' }).click();
    await expect(page.locator('.toasts')).toContainText('Could not reach the recipe library');

    feed.publish([...seedRecipes, toast], 'revision-3');
    feed.goOnline();
    await page.getByRole('button', { name: 'Check now' }).click();
    await expect(page.locator('.toasts')).toContainText('Recipes updated: 1 new recipe');
    await expect(page.getByText(`${seedRecipes.length + 1} recipes`)).toBeVisible();
  });

  test('keeps the library when the feed is newer than the app understands', async ({ page }) => {
    await page.route('http://feed.test/v1/manifest.json*', (route) =>
      route.fulfill({ json: { schemaVersion: 99, revision: 'future', generatedAt: '', bundle: { path: 'b', hash: 'b', bytes: 1 }, recipes: [], images: [] } }),
    );
    await open(page, '/settings');
    await expect(page.getByTestId('sync-status')).toContainText('need a newer version of Simmer');
    await expect(page.getByText(`${seedRecipes.length} recipes`)).toBeVisible();
  });

  test('says when everything is current', async ({ page }) => {
    await open(page, '/settings');
    await page.getByRole('button', { name: 'Check now' }).click();
    await expect(page.locator('.toasts')).toContainText('Recipes are up to date');
  });
});
