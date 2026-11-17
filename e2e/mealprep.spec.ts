import type { Page } from '@playwright/test';
import { PASTA, expect, open, openRecipe, seedRecipes, startCooking, test, type Feed } from './support';

const ID = 'brown-butter-miso-pasta';

const mealPrep = {
  rating: 'great',
  fridgeDays: 2,
  freezerMonths: 2,
  portion: 'Divide between lidded containers while warm.',
  freeze: 'Cool, lid, label and freeze within 2 hours.',
  defrost: 'Defrost overnight in the fridge.',
  reheat: [
    { method: 'microwave', from: 'chilled', minutes: 3, text: 'Splash of water, cover, heat until steaming.' },
    { method: 'microwave', from: 'frozen', minutes: 6, text: 'Defrost setting, then full power until steaming.' },
  ],
  serveFresh: ['spring onions'],
  tips: ['Reheat once only.'],
};

/** Give the pasta meal prep notes and sync them in. */
async function withMealPrep(page: Page, feed: Feed) {
  const next = seedRecipes.map((r) => (r.title === PASTA ? { ...r, hash: 'prep-1', mealPrep } : r));
  feed.publish(next, 'rev-prep');
  await open(page, '/settings');
  await page.getByRole('button', { name: 'Check now' }).click();
  await expect(page.getByTestId('sync-status')).toContainText('Checked');
  await openRecipe(page, ID);
  await expect(page.getByTestId('meal-prep')).toBeVisible();
}

async function cookThrough(page: Page) {
  const cook = page.getByTestId('cook-mode');
  while (await cook.getByRole('button', { name: 'Next step' }).isVisible()) await cook.getByRole('button', { name: 'Next step' }).click();
  await cook.getByTestId('cook-finish').click();
}

test.describe('meal prep', () => {
  test('shows how the dish keeps, portions and reheats', async ({ page, feed }) => {
    await withMealPrep(page, feed);
    const section = page.getByTestId('meal-prep');
    await expect(section).toContainText('Great for meal prep');
    await expect(section.getByRole('list', { name: 'How long it keeps' })).toContainText('2 days');
    await expect(section.getByRole('list', { name: 'How long it keeps' })).toContainText('2 months');
    await expect(section).toContainText('Keep back the spring onions');
    await expect(section).toContainText('Splash of water');
    await section.getByRole('radio', { name: 'From frozen' }).click();
    await expect(section).toContainText('Defrost setting');
    await expect(section.getByRole('button', { name: 'Start 6 min timer' })).toBeVisible();
  });

  test('cooks a batch, packs it away and eats a portion', async ({ page, feed }) => {
    await withMealPrep(page, feed);
    await page.getByTestId('meal-prep').getByRole('button', { name: 'Cook a batch' }).click();
    const sheet = page.getByRole('dialog', { name: 'How are you cooking this?' });
    await expect(sheet.getByRole('radio', { name: /Meal prep/ })).toHaveAttribute('aria-checked', 'true');
    const portions = sheet.getByRole('group', { name: 'Portions', exact: true });
    await portions.getByRole('button', { name: 'More portions' }).click();
    await portions.getByRole('button', { name: 'More portions' }).click();
    await expect(portions).toContainText('4');
    await sheet.getByTestId('start-cooking').click();

    // Ingredients scale to the batch, and the last card is packing it away.
    await expect(page.getByTestId('cook-mode')).toContainText('400 g spaghetti');
    await cookThrough(page);
    await expect(page.getByTestId('cook-mode')).toBeVisible();
    const finish = page.getByRole('dialog', { name: 'Pack it away' });
    await expect(finish).toBeVisible();
    await finish.getByTestId('finish-cook').click();
    await expect(page.getByTestId('recipe-page')).toBeVisible();
    await expect(page.getByTestId('cooked-count')).toContainText('Cooked 1 time');

    await open(page, '/prep');
    const rows = page.getByTestId('stash-row');
    await expect(rows).toHaveCount(2);
    await expect(page.getByRole('region', { name: /Fridge/ })).toContainText('2 portions');
    await expect(page.getByRole('region', { name: /Freezer/ })).toContainText('2 portions');
    await expect(page.getByRole('region', { name: /Fridge/ })).toContainText('Eat by');

    // Eat one from the freezer: it says how to defrost and reheat from frozen.
    await page.getByRole('region', { name: /Freezer/ }).getByRole('button', { name: 'Eat one' }).click();
    const eat = page.getByRole('dialog', { name: 'Brown Butter Miso Pasta' });
    await expect(eat).toContainText('Defrost overnight in the fridge.');
    await expect(eat).toContainText('Defrost setting');
    await eat.getByRole('button', { name: 'Eaten one' }).click();
    await expect(page.getByRole('region', { name: /Freezer/ })).toContainText('1 portion');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('region', { name: /Freezer/ })).toContainText('2 portions');
  });

  test('saves leftovers after eating now, and defrosts a frozen portion', async ({ page, feed }) => {
    await withMealPrep(page, feed);
    await startCooking(page);
    await cookThrough(page);
    const finish = page.getByRole('dialog', { name: 'Enjoy. Anything left over?' });
    await finish.getByRole('group', { name: 'Freezer portions' }).getByRole('button', { name: 'More freezer portions' }).click();
    await finish.getByTestId('finish-cook').click();

    await open(page, '/prep');
    await expect(page.getByTestId('stash-row')).toHaveCount(1);
    await page.getByRole('button', { name: /More for/ }).click();
    const manage = page.getByRole('dialog', { name: 'Brown Butter Miso Pasta' });
    await expect(manage).toContainText('Container label');
    await manage.getByRole('button', { name: 'Defrost' }).click();
    await expect(page.getByRole('region', { name: /Fridge/ })).toContainText('Eat by tomorrow');
    await expect(page.getByRole('region', { name: /Fridge/ })).toContainText('Defrosted');
  });

  test('plans a prepped portion without adding it to the shopping list', async ({ page, feed }) => {
    await withMealPrep(page, feed);
    await page.getByTestId('meal-prep').getByRole('button', { name: 'Add portions I made' }).click();
    await page.getByRole('dialog', { name: 'Add portions you made' }).getByRole('button', { name: 'Add 2 portions' }).click();

    await open(page, '/plan');
    await page.getByRole('button', { name: /^Add dinner on/ }).first().click();
    await page.getByTestId('pick-stash').getByRole('button', { name: /Brown Butter Miso Pasta/ }).click();
    const entry = page.getByTestId('plan-entry');
    await expect(entry).toContainText('From the freezer');
    await expect(page.getByRole('button', { name: 'Add this week to shopping list' })).toBeDisabled();
  });

  test('finds recipes that keep, and shows calories', async ({ page, feed }) => {
    await withMealPrep(page, feed);
    await open(page, '/search?prep=1');
    await expect(page.getByTestId('result-count')).toHaveText('1 recipe');
    await expect(page.getByTestId('recipe-card')).toContainText('kcal');
    await expect(page.getByTestId('recipe-card').getByRole('img', { name: /freezes well/ })).toBeVisible();

    await open(page, '/settings');
    await page.getByRole('switch', { name: 'Show calories' }).click();
    await open(page, '/search?prep=1');
    await expect(page.getByTestId('recipe-card')).not.toContainText('kcal');
  });
});
