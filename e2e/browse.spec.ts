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

test.describe('photos', () => {
  test('shows a recipe photo with its credit, and generated art otherwise', async ({ page, feed }) => {
    const credit = { author: 'A. Baker', license: 'CC BY-SA 4.0', source: 'https://example.org/photo' };
    const withPhoto = seedRecipes.map((r) =>
      r.title === PASTA ? { ...r, hash: 'photo-1', image: `img/${r.id}.abc.webp`, imageCredit: credit } : { ...r, hash: `${r.hash}-plain`, image: undefined, imageCredit: undefined },
    );
    feed.publish(withPhoto, 'rev-photos');
    await open(page, '/settings');
    await page.getByRole('button', { name: 'Check now' }).click();
    await expect(page.getByTestId('sync-status')).toContainText('Checked');

    const pasta = withPhoto.find((r) => r.title === PASTA)!;
    await page.goto(`/#/recipe/${pasta.id}`);
    await expect(page.locator('.recipe-cover img')).toBeVisible();
    await expect(page.locator('.photo-credit')).toHaveText('Photo by A. Baker, CC BY-SA 4.0');
    await expect(page.locator('.photo-credit a')).toHaveAttribute('href', credit.source);

    // On a tablet-sized window the photo spans the page without swallowing it,
    // and the credit sits directly beneath.
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: 1004, height: 836 });
    const cover = (await page.locator('.recipe-cover').boundingBox())!;
    const creditBox = (await page.locator('.photo-credit').boundingBox())!;
    const heading = (await page.getByTestId('recipe-page').getByRole('heading', { level: 1 }).boundingBox())!;
    expect(cover.width).toBeGreaterThan(800);
    expect(cover.height).toBeLessThanOrEqual(440);
    expect(creditBox.y).toBeGreaterThanOrEqual(cover.y + cover.height);
    expect(heading.y).toBeGreaterThanOrEqual(creditBox.y + creditBox.height);
    await page.setViewportSize(size);

    // The photo is kept on the device, so it survives going offline.
    feed.goOffline();
    await page.reload();
    await expect(page.locator('.recipe-cover img')).toBeVisible();

    const other = withPhoto.find((r) => r.title !== PASTA)!;
    await page.goto(`/#/recipe/${other.id}`);
    await expect(page.locator('.recipe-cover svg')).toBeVisible();
    await expect(page.locator('.photo-credit')).toHaveCount(0);
  });
});

test.describe('going back', () => {
  test('the rail button returns to the previous page', async ({ page, wide }) => {
    test.skip(!wide, 'the rail is the wide layout');
    await open(page);
    const back = page.getByRole('button', { name: 'Back', exact: true });
    await expect(back).toBeDisabled();

    await goTo(page, 'Search');
    await cards(page).first().click();
    await expect(page.getByTestId('recipe-page')).toBeVisible();
    await back.click();
    await expect(page.getByRole('searchbox', { name: 'Search recipes' })).toBeVisible();
    await back.click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Good');
    await expect(back).toBeDisabled();
  });

  test('Alt+Left goes back', async ({ page, wide }) => {
    test.skip(!wide, 'keyboard shortcut is a desktop affordance');
    await open(page);
    await goTo(page, 'Plan');
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Good');
  });

  test('system back closes an open sheet before leaving the page', async ({ page }) => {
    await open(page);
    await goTo(page, 'Search');
    await cards(page).first().click();
    await expect(page.getByTestId('recipe-page')).toBeVisible();
    await page.getByRole('button', { name: 'Add to a collection' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();

    // What the Android shell calls when the system back gesture is used.
    const systemBack = () => page.evaluate(() => window.__simmerBack?.());
    expect(await systemBack()).toBe(true);
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId('recipe-page')).toBeVisible();

    expect(await systemBack()).toBe(true);
    await expect(page.getByRole('searchbox', { name: 'Search recipes' })).toBeVisible();
    expect(await systemBack()).toBe(true);
    // Nothing left: the shell is told to let the system handle it.
    expect(await systemBack()).toBe(false);
  });
});
