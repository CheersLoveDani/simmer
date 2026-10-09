import { cards, expect, open, seedRecipes, test } from './support';

const ARCADE = {
  id: 'arcade',
  name: 'Arcade Nights',
  accent: '#1e88f7',
  art: 'img/t/arcade/logo.abc.svg',
  styles: { scout: { label: 'Scout', accent: '#0a8f4c', art: 'img/t/arcade/scout.abc.svg' } },
};
const PASTA_ID = 'brown-butter-miso-pasta';

test.describe('themes', () => {
  test('a themed recipe takes its colour, art and badge from the theme', async ({ page, feed }) => {
    const themed = seedRecipes.map((r) => (r.id === PASTA_ID ? { ...r, hash: 'themed1', theme: { id: 'arcade', style: 'scout' } } : r));
    feed.publish(themed, 'themed-revision', [ARCADE]);
    await open(page, `/recipe/${PASTA_ID}`);

    const recipe = page.getByTestId('recipe-page');
    await expect(recipe.getByTestId('theme-badge')).toHaveText(/Arcade Nights\s*Scout/);
    await expect(recipe.getByTestId('theme-art')).toBeVisible();
    await expect(recipe.getByRole('link', { name: 'Start cooking' })).toHaveCSS('background-color', 'rgb(10, 143, 76)');

    await recipe.getByRole('link', { name: 'Start cooking' }).click();
    await expect(page.getByTestId('cook-mode').getByTestId('theme-art')).toBeVisible();
  });

  test('themed recipes are marked in lists and found by theme name; others are untouched', async ({ page, feed }) => {
    const themed = seedRecipes.map((r) => (r.id === PASTA_ID ? { ...r, hash: 'themed2', theme: { id: 'arcade' } } : r));
    feed.publish(themed, 'themed-revision-2', [ARCADE]);
    await open(page, `/recipe/${PASTA_ID}`);
    await expect(page.getByTestId('recipe-page').getByTestId('theme-badge')).toHaveText('Arcade Nights');

    await open(page, '/search?q=arcade');
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first().getByTestId('theme-badge')).toHaveText('Arcade Nights');

    await open(page, '/recipe/banana-bread');
    await expect(page.getByTestId('recipe-page')).toBeVisible();
    await expect(page.getByTestId('theme-badge')).toHaveCount(0);
    await expect(page.getByTestId('theme-art')).toHaveCount(0);
  });
});
