import type { Page } from '@playwright/test';
import { expect, goTo, open, test } from './support';

/** A 1x1 WebP, standing in for any photo. */
const PIXEL = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');
const cors = { 'access-control-allow-origin': '*' };

/** A recipe site with schema.org data, and Openverse answering photo searches. */
async function mockWeb(page: Page) {
  const recipe = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: 'Shepherd’s pie',
    description: 'Lamb mince under mash.',
    recipeYield: '6',
    prepTime: 'PT25M',
    cookTime: 'PT40M',
    recipeIngredient: ['500 g lamb mince', '1 kg potatoes, peeled', '200 g spaghetti'],
    recipeInstructions: [{ '@type': 'HowToStep', text: 'Brown the mince.' }, { '@type': 'HowToStep', text: 'Top with mash and bake.' }],
  };
  await page.route('https://recipes.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', headers: cors, body: `<html><head><script type="application/ld+json">${JSON.stringify(recipe)}</script></head><body><h1>Shepherd’s pie</h1></body></html>` }),
  );
  await page.route('https://recipes.test/plain', (route) => route.fulfill({ contentType: 'text/html', headers: cors, body: '<html><body><p>Just words.</p></body></html>' }));
  await page.route('https://api.openverse.org/**', (route) => {
    if (route.request().url().includes('/thumb/')) return route.fulfill({ body: PIXEL, contentType: 'image/webp', headers: cors });
    return route.fulfill({
      headers: cors,
      json: { results: [{ id: 'p1', creator: 'Jo Cook', license: 'by', license_version: '4.0', license_url: 'https://creativecommons.org/licenses/by/4.0/', foreign_landing_url: 'https://photos.test/p1' }] },
    });
  });
}

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

  test('imports a recipe from a link', async ({ page }) => {
    await mockWeb(page);
    await open(page, '/add');
    await page.getByRole('textbox', { name: 'Link to a recipe' }).fill('https://recipes.test/shepherds-pie');
    await page.getByRole('button', { name: 'Import' }).click();

    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Shepherd’s pie');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('textbox', { name: 'Ingredient 2' })).toHaveValue('1 kg potatoes, peeled');
    await expect(page.getByRole('combobox', { name: 'Aisle for ingredient 3' })).toHaveValue('pantry');
    await page.getByRole('button', { name: 'Photo' }).click();
    await expect(page.getByText('Photo by Jo Cook, CC BY 4.0')).toBeVisible();
    await page.getByRole('button', { name: 'Save recipe' }).click();

    await expect(page.getByRole('heading', { name: 'Shepherd’s pie' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'From recipes.test' })).toBeVisible();
    await expect(page.getByText('Photo by Jo Cook')).toBeVisible();
  });

  test('says so when a page has no recipe it can read', async ({ page }) => {
    await mockWeb(page);
    await open(page, '/add');
    await page.getByRole('textbox', { name: 'Link to a recipe' }).fill('recipes.test/plain');
    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByText('That page has no recipe Simmer can read.')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Link to a recipe' })).toHaveValue('recipes.test/plain');
  });

  test('the assistant writes a recipe from a description', async ({ page }) => {
    await mockWeb(page);
    const draft = {
      title: 'Nan’s lamb hotpot',
      description: 'Slow and golden.',
      course: 'main',
      cuisine: 'british',
      serves: 4,
      difficulty: 'easy',
      diet: [],
      tags: [],
      time: { prep: 20, cook: 120, rest: 0 },
      ingredients: [{ section: null, items: [{ qty: 500, unit: 'g', item: 'lamb neck', aisle: 'meat-fish' }] }],
      prep: [],
      steps: [{ text: 'Layer and bake.', timer: { minutes: 120, label: 'Hotpot' } }],
      equipment: [],
      tips: [],
      photoQuery: 'lamb hotpot',
    };
    let asked = '';
    await page.route('https://generativelanguage.googleapis.com/**', (route) => {
      asked = route.request().postData() ?? '';
      return route.fulfill({ headers: cors, json: { candidates: [{ content: { parts: [{ text: JSON.stringify(draft) }] }, finishReason: 'STOP' }] } });
    });

    await open(page, '/add');
    await expect(page.getByText('Describing a recipe needs an AI key. A Google Gemini key is free.')).toBeVisible();
    await page.getByRole('link', { name: 'Add a key in Settings' }).click();
    await page.getByLabel('Gemini or Claude API key').fill('AIzaSyTestKey000000000000000000000000');
    await page.getByRole('button', { name: 'Save key' }).click();
    await expect(page.getByText('Using Google Gemini')).toBeVisible();

    await open(page, '/add');
    await page.getByRole('textbox', { name: 'Describe the recipe' }).fill('my nan’s lamb hotpot, lamb neck, potatoes, 2 hours in the oven');
    await page.getByRole('button', { name: 'Write it' }).click();
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Nan’s lamb hotpot');
    expect(asked).toContain('2 hours in the oven');
  });

  test('the assistant can read a page that has no recipe data', async ({ page }) => {
    await mockWeb(page);
    await page.route('https://generativelanguage.googleapis.com/**', (route) =>
      route.fulfill({ headers: cors, json: { candidates: [{ content: { parts: [{ text: JSON.stringify({ title: 'Just words', description: '', course: 'main', cuisine: '', serves: 2, difficulty: 'easy', diet: [], tags: [], time: { prep: 0, cook: 5, rest: 0 }, ingredients: [{ section: null, items: [{ qty: null, unit: null, item: 'words', aisle: 'other' }] }], prep: [], steps: [{ text: 'Read.' }], equipment: [], tips: [] }) }] } }] } }),
    );
    await open(page, '/settings');
    await page.getByLabel('Gemini or Claude API key').fill('AIzaSyTestKey000000000000000000000000');
    await page.getByRole('button', { name: 'Save key' }).click();

    await open(page, '/add');
    await page.getByRole('textbox', { name: 'Link to a recipe' }).fill('recipes.test/plain');
    await page.getByRole('button', { name: 'Import' }).click();
    await page.getByRole('button', { name: 'Ask the assistant to read it' }).click();
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Just words');
  });
});
