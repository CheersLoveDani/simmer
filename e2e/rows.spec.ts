import { expect, open, test } from './support';

test.describe('sideways rows', () => {
  test('arrows page through a row and switch off at each end', async ({ page, wide }) => {
    test.skip(!wide, 'arrows are for mouse and trackpad');
    await open(page);
    const section = page.locator('.row-section', { hasText: 'On the table in 30 minutes' });
    const row = section.locator('.card-row');
    const back = section.getByRole('button', { name: /Scroll .* back/ });
    const forward = section.getByRole('button', { name: /Scroll .* forward/ });

    await expect(back).toBeDisabled();
    await expect(forward).toBeEnabled();
    await forward.click();
    await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
    await expect(back).toBeEnabled();

    await row.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    await expect(forward).toBeDisabled();
    await back.click();
    await expect(forward).toBeEnabled();
  });

  test('a row can be dragged with the mouse without opening a recipe', async ({ page, wide }) => {
    test.skip(!wide, 'dragging is for the mouse');
    await open(page);
    const row = page.locator('.row-section', { hasText: 'On the table in 30 minutes' }).locator('.card-row');
    await row.scrollIntoViewIfNeeded();
    const box = (await row.boundingBox())!;
    const y = box.y + box.height / 2;

    await page.mouse.move(box.x + box.width - 80, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 380, y, { steps: 8 });
    await page.mouse.up();

    expect(await row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(200);
    await expect(page.getByTestId('recipe-page')).toHaveCount(0);

    // A plain click still opens the card.
    await row.getByTestId('recipe-card').nth(2).click();
    await expect(page.getByTestId('recipe-page')).toBeVisible();
  });

  test('a row that fits shows no arrows', async ({ page, wide }) => {
    test.skip(!wide, 'arrows are for mouse and trackpad');
    await page.setViewportSize({ width: 2400, height: 900 });
    await open(page, '/recipe/brown-butter-miso-pasta');
    const section = page.locator('.row-section', { hasText: 'You might also like' });
    await section.scrollIntoViewIfNeeded();
    if (await section.locator('.card-row').evaluate((el) => el.scrollWidth <= el.clientWidth)) {
      await expect(section.locator('.row-arrow')).toHaveCount(0);
    }
  });
});
