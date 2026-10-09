import { PASTA, expect, goTo, openRecipe, test } from './support';

test.describe('recipe', () => {
  test('scales ingredients with servings and remembers the choice', async ({ page }) => {
    await openRecipe(page);
    const ingredients = page.getByRole('region', { name: 'Ingredients' });
    await expect(ingredients).toContainText('200 g spaghetti');
    await ingredients.getByRole('button', { name: 'More servings' }).click();
    await ingredients.getByRole('button', { name: 'More servings' }).click();
    await expect(ingredients).toContainText('400 g spaghetti');
    await expect(ingredients).toContainText('4 tbsp white miso');
    await expect(ingredients).toContainText('black pepper, lots');

    await page.reload();
    await expect(ingredients).toContainText('400 g spaghetti');
    await ingredients.getByRole('button', { name: 'Reset to 2' }).click();
    await expect(ingredients).toContainText('200 g spaghetti');
  });

  test('converts to US measures', async ({ page }) => {
    await openRecipe(page);
    const ingredients = page.getByRole('region', { name: 'Ingredients' });
    await ingredients.getByRole('radio', { name: 'US' }).click();
    await expect(ingredients).toContainText('7.1 oz spaghetti');
    await expect(ingredients).toContainText('2 tbsp white miso');
    await ingredients.getByRole('radio', { name: 'Metric' }).click();
    await expect(ingredients).toContainText('200 g spaghetti');
  });

  test('ticks off ingredients', async ({ page }) => {
    await openRecipe(page);
    const item = page.getByRole('checkbox', { name: /spaghetti/ });
    await page.getByText('200 g spaghetti').click();
    await expect(item).toBeChecked();
    await page.getByText('200 g spaghetti').click();
    await expect(item).not.toBeChecked();
  });

  test('favourites, rates, takes a note and keeps them after a restart', async ({ page }) => {
    await openRecipe(page);
    await page.getByRole('button', { name: 'Add to favourites' }).click();
    await page.getByRole('button', { name: '4 stars' }).click();
    await page.getByRole('textbox', { name: 'Your notes on this recipe' }).fill('More garlic next time');
    await page.getByRole('button', { name: 'I cooked this' }).click();
    await expect(page.getByTestId('cooked-count')).toContainText('Cooked 1 time');

    await page.reload();
    await expect(page.getByRole('button', { name: 'Remove from favourites' })).toBeVisible();
    await expect(page.getByRole('button', { name: '4 stars' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('textbox', { name: 'Your notes on this recipe' })).toHaveValue('More garlic next time');
    await expect(page.getByRole('button', { name: 'Cooked today' })).toBeDisabled();

    await goTo(page, 'Saved');
    await expect(page.getByTestId('recipe-card')).toContainText(PASTA);
    await page.getByRole('radio', { name: 'Cooked' }).click();
    await expect(page.getByRole('link', { name: PASTA })).toBeVisible();
  });

  test('files a recipe in a new collection', async ({ page }) => {
    await openRecipe(page);
    await page.getByRole('button', { name: 'Add to a collection' }).click();
    const sheet = page.getByRole('dialog', { name: 'Collections' });
    await sheet.getByRole('textbox', { name: 'New collection name' }).fill('Weeknights');
    await sheet.getByRole('button', { name: 'Create' }).click();
    await expect(sheet.getByRole('checkbox', { name: 'Weeknights' })).toBeChecked();
    await sheet.getByRole('button', { name: 'Close' }).click();

    await goTo(page, 'Saved');
    await page.getByRole('radio', { name: 'Collections' }).click();
    await page.getByRole('link', { name: /Weeknights/ }).click();
    await expect(page.getByTestId('recipe-card')).toContainText(PASTA);

    await page.getByRole('button', { name: 'Delete collection' }).click();
    await expect(page.getByRole('heading', { name: 'No collections yet' })).toBeVisible();
  });

  test('explains a recipe that no longer exists', async ({ page }) => {
    await page.goto('/#/recipe/not-a-real-recipe');
    await expect(page.getByRole('heading', { name: 'That recipe is no longer in the library' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to the cookbook' }).click();
    await expect(page.getByTestId('todays-pick')).toBeVisible();
  });

  test('suggests related recipes', async ({ page }) => {
    await openRecipe(page);
    const related = page.locator('section', { has: page.getByRole('heading', { name: 'You might also like' }) });
    await expect(related.getByTestId('recipe-card').first()).toBeVisible();
    await expect(related).not.toContainText(PASTA);
  });
});

test.describe('timers', () => {
  test('runs a step timer through to the alert', async ({ page }) => {
    await page.clock.install();
    await openRecipe(page);
    await page.getByRole('button', { name: 'Start 9 min timer' }).click();
    const dock = page.getByTestId('timer-dock');
    await expect(dock).toContainText(/[89]:\d\d/);

    await page.clock.fastForward('04:00');
    await expect(dock).toContainText(/[45]:\d\d/);
    await page.clock.fastForward('05:05');
    await expect(page.locator('.toasts')).toContainText('Spaghetti is done');
    await expect(dock).toContainText('Spaghetti done');
    await page.getByRole('button', { name: 'Spaghetti done. Dismiss' }).click();
    await expect(page.getByRole('button', { name: 'Start 9 min timer' })).toBeVisible();
  });

  test('pauses, resumes, extends and removes from the timer list', async ({ page }) => {
    await page.clock.install();
    await openRecipe(page);
    await page.getByRole('button', { name: 'Start 9 min timer' }).click();
    await page.getByRole('button', { name: 'Start 4 min timer' }).click();
    const dock = page.getByTestId('timer-dock');
    await expect(dock).toContainText('2');
    await dock.click();

    const sheet = page.getByRole('dialog', { name: 'Timers' });
    await sheet.getByRole('button', { name: 'Pause Brown butter' }).click();
    await page.clock.fastForward('02:00');
    await expect(sheet.getByRole('listitem').filter({ hasText: /Brown butter,/ })).toContainText(/[34]:\d\d/);
    await sheet.getByRole('button', { name: 'Resume Brown butter' }).click();
    await sheet.getByRole('button', { name: 'Add a minute to Brown butter' }).click();
    await expect(sheet.getByRole('listitem').filter({ hasText: /Brown butter,/ })).toContainText(/[45]:\d\d/);
    await sheet.getByRole('button', { name: 'Remove Brown butter' }).click();
    await sheet.getByRole('button', { name: 'Remove Spaghetti' }).click();
    await expect(sheet).toContainText('No timers running');
  });

  test('a timer keeps counting across a restart', async ({ page }) => {
    await page.clock.install();
    await openRecipe(page);
    await page.getByRole('button', { name: 'Start 9 min timer' }).click();
    await page.clock.fastForward('03:00');
    await page.reload();
    await expect(page.getByTestId('timer-dock')).toContainText(/[56]:\d\d/);
  });

  test('alerts for a timer that ended while the app was closed, then clears', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      const timer = { id: 'brown-butter-miso-pasta:0', label: 'Spaghetti', recipeId: 'brown-butter-miso-pasta', durationMs: 60000, status: 'running', endsAt: Date.now() - 5000, remainingMs: 60000 };
      localStorage.setItem('simmer.timers', JSON.stringify({ state: { timers: [timer] }, version: 0 }));
    });
    await openRecipe(page);
    const dock = page.getByTestId('timer-dock');
    await expect(dock).toContainText('Spaghetti done');
    await expect(page.locator('.toasts')).toContainText('Spaghetti is done');
    await page.getByRole('button', { name: 'Spaghetti done. Dismiss' }).click();
    await expect(dock).toBeHidden();
  });

  test('starts a free-standing kitchen timer', async ({ page, wide }) => {
    await page.clock.install();
    await openRecipe(page);
    if (!wide) await goTo(page, 'Home');
    await page.getByRole('button', { name: 'Timers' }).click();
    await page.getByRole('dialog', { name: 'Timers' }).getByRole('button', { name: '5 min', exact: true }).click();
    await expect(page.getByTestId('timer-dock')).toContainText(/[45]:\d\d/);
  });
});

test.describe('cook mode', () => {
  test('walks through the method and logs the cook', async ({ page }) => {
    await openRecipe(page);
    await page.getByRole('link', { name: 'Start cooking' }).click();
    const cook = page.getByTestId('cook-mode');
    await expect(cook).toContainText('Step 1 of 5');
    await expect(cook.getByRole('list', { name: 'Ingredients for this step' })).toContainText('200 g spaghetti');
    await expect(cook.getByRole('button', { name: 'Back' })).toBeDisabled();

    for (let step = 2; step <= 5; step++) {
      await cook.getByRole('button', { name: 'Next step' }).click();
      await expect(cook).toContainText(`Step ${step} of 5`);
    }
    await cook.getByRole('button', { name: 'Back' }).click();
    await expect(cook).toContainText('Step 4 of 5');
    await cook.getByRole('button', { name: 'Next step' }).click();
    await cook.getByRole('button', { name: 'Finish' }).click();

    await expect(page.getByTestId('recipe-page')).toBeVisible();
    await expect(page.getByTestId('cooked-count')).toContainText('Cooked 1 time');
  });

  test('uses the scaled quantities and resumes where you left off', async ({ page }) => {
    await openRecipe(page);
    await page.getByRole('region', { name: 'Ingredients' }).getByRole('button', { name: 'More servings' }).click();
    await page.getByRole('link', { name: 'Start cooking' }).click();
    const cook = page.getByTestId('cook-mode');
    await expect(cook).toContainText('300 g spaghetti');
    await cook.getByRole('button', { name: 'Next step' }).click();
    await cook.getByRole('button', { name: 'Leave cook mode' }).click();
    await page.getByRole('link', { name: 'Start cooking' }).click();
    await expect(cook).toContainText('Step 2 of 5');
  });

  test('responds to the arrow keys and Escape', async ({ page, wide }) => {
    test.skip(!wide, 'keyboard navigation is a desktop affordance');
    await openRecipe(page);
    await page.getByRole('link', { name: 'Start cooking' }).click();
    const cook = page.getByTestId('cook-mode');
    await page.keyboard.press('ArrowRight');
    await expect(cook).toContainText('Step 2 of 5');
    await page.keyboard.press('ArrowLeft');
    await expect(cook).toContainText('Step 1 of 5');
    await page.keyboard.press('Escape');
    await expect(cook).toBeHidden();
  });

  test('starts a timer from a step', async ({ page }) => {
    await page.clock.install();
    await openRecipe(page);
    await page.getByRole('link', { name: 'Start cooking' }).click();
    await page.getByTestId('cook-mode').getByRole('button', { name: 'Start 9 min timer' }).click();
    await expect(page.getByTestId('cook-mode').getByRole('button', { name: /Spaghetti timer/ })).toBeVisible();
  });
});
