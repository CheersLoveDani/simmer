import { expect, goTo, open, test } from './support';

test.describe('your own recipes', () => {
  test('adds, edits and deletes your own recipe', async ({ page }) => {
    await open(page, '/add');
    await page.getByRole('link', { name: /Fill it in yourself/ }).click();

    await page.getByRole('textbox', { name: 'Title' }).fill('Lamb hotpot');
    await page.getByRole('textbox', { name: 'Description' }).fill('Slow and golden.');
    await page.getByRole('button', { name: 'Next' }).click();

    const first = page.getByRole('textbox', { name: 'Ingredient 1' });
    await first.fill('500 g lamb neck');
    await first.press('Enter');
    await page.getByRole('textbox', { name: 'Ingredient 2' }).fill('3 onions, sliced');
    await page.getByRole('button', { name: 'Next' }).click();

    await page.getByRole('textbox', { name: 'Step 1' }).fill('Layer everything in a deep dish and bake.');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Save recipe' }).click();

    await expect(page.getByRole('heading', { name: 'Lamb hotpot' })).toBeVisible();
    const ingredients = page.getByRole('region', { name: 'Ingredients' });
    await expect(ingredients).toContainText('500 g lamb neck');
    await expect(ingredients).toContainText('onions');

    await page.getByRole('button', { name: 'Edit recipe' }).click();
    await page.getByRole('textbox', { name: 'Title' }).fill('Nan’s lamb hotpot');
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Nan’s lamb hotpot' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Nan’s lamb hotpot' })).toBeVisible();

    await goTo(page, 'Saved');
    const yours = page.getByRole('region', { name: 'Your recipes' });
    await yours.getByRole('link', { name: /Nan’s lamb hotpot/ }).click();
    await page.getByRole('button', { name: 'Delete recipe' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

    await goTo(page, 'Saved');
    await expect(page.getByRole('region', { name: 'Your recipes' })).toHaveCount(0);
  });

  test('will not save a recipe without the essentials', async ({ page }) => {
    await open(page, '/add/new');
    await page.getByRole('textbox', { name: 'Title' }).fill('Toast');
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('button', { name: 'Save recipe' })).toBeDisabled();
    await expect(page.getByText('Add at least one ingredient and one step.')).toBeVisible();
  });

  test('files a familiar ingredient in the aisle the library uses', async ({ page }) => {
    await open(page, '/add/new');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('textbox', { name: 'Ingredient 1' }).fill('200 g spaghetti');
    await expect(page.getByRole('combobox', { name: 'Aisle for ingredient 1' })).toHaveValue('pantry');
  });
});
