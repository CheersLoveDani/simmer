import { PASTA, cards, expect, goTo, open, seedRecipes, test } from './support';

test.describe('home', () => {
  test('shows a pick of the day and opens it', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good|Still up/);
    const pick = page.getByTestId('todays-pick');
    const title = await pick.getByRole('heading').innerText();
    await pick.click();
    await expect(page.getByTestId('recipe-page').getByRole('heading', { level: 1 })).toHaveText(title);
  });

  test('browsing a course filters the search', async ({ page }) => {
    await open(page);
    await page.getByRole('link', { name: /^Dessert/ }).click();
    const desserts = seedRecipes.filter((r) => r.course === 'dessert').length;
    await expect(page.getByTestId('result-count')).toHaveText(`${desserts} recipes`);
    await expect(cards(page)).toHaveCount(desserts);
  });

  test('remembers recently viewed recipes', async ({ page }) => {
    await open(page, '/recipe/fudgy-brownies');
    await expect(page.getByTestId('recipe-page')).toBeVisible();
    await goTo(page, 'Home');
    const recent = page.locator('section', { has: page.getByRole('heading', { name: 'Pick up where you left off' }) });
    await expect(recent.getByRole('link', { name: /Fudgy Brownies/ })).toBeVisible();
  });
});

test.describe('search', () => {
  test('lists the whole library before anything is typed', async ({ page }) => {
    await open(page, '/search');
    await expect(page.getByTestId('result-count')).toHaveText(`${seedRecipes.length} recipes`);
  });

  test('finds a recipe despite a typo', async ({ page }) => {
    await open(page, '/search');
    await page.getByRole('searchbox', { name: 'Search recipes' }).fill('brown buter pasta');
    await expect(cards(page).first()).toContainText(PASTA);
  });

  test('finds recipes by ingredient and says which one matched', async ({ page }) => {
    await open(page, '/search');
    await page.getByRole('searchbox', { name: 'Search recipes' }).fill('miso');
    await expect(cards(page).filter({ hasText: PASTA })).toContainText('With white miso');
    await expect(cards(page).filter({ hasText: 'Miso Soup' })).toBeVisible();
    await expect(page.locator('mark').first()).toHaveText(/miso/i);
  });

  test('says so when nothing matches, and recovers', async ({ page }) => {
    await open(page, '/search');
    const box = page.getByRole('searchbox', { name: 'Search recipes' });
    await box.fill('zzzzqqqq');
    await expect(page.getByRole('heading', { name: 'Nothing matches that' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(page.getByTestId('result-count')).toHaveText(`${seedRecipes.length} recipes`);
  });

  test('survives punctuation-only input', async ({ page }) => {
    await open(page, '/search');
    await page.getByRole('searchbox', { name: 'Search recipes' }).fill('?!"(');
    await expect(page.getByTestId('result-count')).toBeVisible();
  });

  test('filters by diet and time, and clears', async ({ page }) => {
    await open(page, '/search');
    await page.getByRole('button', { name: /Filters/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    await sheet.getByRole('button', { name: 'Vegan' }).click();
    await sheet.getByRole('button', { name: '30 min or less' }).click();
    const expected = seedRecipes.filter((r) => (r.diet as string[]).includes('vegan') && (r.time as { total: number }).total <= 30).length;
    await sheet.getByRole('button', { name: /^Show/ }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId('result-count')).toHaveText(`${expected} ${expected === 1 ? 'recipe' : 'recipes'}`);
    await expect(page.getByRole('button', { name: /Filters/ })).toContainText('2');

    await page.getByRole('button', { name: /Filters/ }).click();
    await sheet.getByRole('button', { name: 'Clear all' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('result-count')).toHaveText(`${seedRecipes.length} recipes`);
  });

  test('sorts by quickest', async ({ page }) => {
    await open(page, '/search');
    await page.getByRole('combobox').selectOption('quickest');
    const quickest = [...seedRecipes].sort((a, b) => (a.time as { total: number }).total - (b.time as { total: number }).total || a.title.localeCompare(b.title))[0]!;
    await expect(cards(page).first()).toContainText(quickest.title);
  });

  test('keeps the query in the address so back returns to the results', async ({ page }) => {
    await open(page, '/search');
    await page.getByRole('searchbox', { name: 'Search recipes' }).fill('brownies');
    await cards(page).first().click();
    await expect(page.getByTestId('recipe-page')).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('searchbox', { name: 'Search recipes' })).toHaveValue('brownies');
  });
});

test.describe('what I have', () => {
  test('ranks recipes by the ingredients ticked', async ({ page }) => {
    await open(page, '/search');
    await page.getByRole('radio', { name: 'What I have' }).click();
    await expect(page.getByRole('heading', { name: 'Tick what is in your kitchen' })).toBeVisible();

    const picker = page.getByRole('region', { name: 'Your ingredients' });
    for (const name of ['Spaghetti', 'Butter', 'Miso', 'Garlic', 'Parmesan', 'Spring onion']) {
      await picker.getByRole('searchbox').fill(name);
      await picker.getByRole('button', { name, exact: true }).click();
    }
    const results = page.getByRole('region', { name: 'Recipes you can make' });
    await expect(results.getByTestId('recipe-card').first()).toContainText(PASTA);
    await expect(results.getByTestId('recipe-card').first()).toContainText('You have everything');
    await expect(page.getByTestId('pantry-count')).toContainText('what you have');
  });

  test('adds what is missing to the shopping list, and remembers the pantry', async ({ page }) => {
    await open(page, '/search?mode=pantry');
    const picker = page.getByRole('region', { name: 'Your ingredients' });
    await picker.getByRole('searchbox').fill('spaghetti');
    await picker.getByRole('button', { name: 'Spaghetti', exact: true }).click();
    await page.getByRole('button', { name: 'Add missing to shopping list' }).first().click();
    await expect(page.locator('.toasts')).toContainText('to your shopping list');

    await page.reload();
    await expect(page.getByRole('button', { name: /^Clear 1$/ })).toBeVisible();
    await goTo(page, 'Shopping');
    await expect(page.getByTestId('shopping-item').first()).toBeVisible();
  });
});

test.describe('command palette', () => {
  test('jumps to a recipe from the keyboard', async ({ page, wide }) => {
    test.skip(!wide, 'keyboard shortcut is a desktop affordance');
    await open(page);
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Go to' });
    await palette.getByRole('combobox').fill('brownees');
    await expect(palette.getByRole('option').first()).toContainText('Fudgy Brownies');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('recipe-page').getByRole('heading', { level: 1 })).toHaveText('Fudgy Brownies');
  });

  test('goes to a screen and closes on Escape', async ({ page, wide }) => {
    test.skip(!wide, 'keyboard shortcut is a desktop affordance');
    await open(page);
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Go to' });
    await palette.getByRole('combobox').fill('shopping');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Shopping list' })).toBeVisible();
    await page.keyboard.press('Control+k');
    await expect(palette).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
  });
});
