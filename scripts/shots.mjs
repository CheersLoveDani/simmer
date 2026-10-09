// Capture screenshots of the main screens at desktop and phone sizes.
//   node scripts/shots.mjs [outDir] [baseUrl]
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve(process.argv[2] ?? 'docs/screenshots');
const base = process.argv[3] ?? 'http://localhost:1420';
const only = process.argv[4];

const SIZES = {
  desktop: { width: 1360, height: 860 },
  phone: { width: 390, height: 844 },
};

const SCREENS = [
  ['home', '/#/'],
  ['search', '/#/search?q=garlic'],
  ['pantry', '/#/search?mode=pantry'],
  ['recipe', '/#/recipe/ginger-pork-noodles'],
  ['cook', '/#/recipe/ginger-pork-noodles/cook'],
  ['plan', '/#/plan'],
  ['shopping', '/#/shopping'],
  ['saved', '/#/saved'],
  ['settings', '/#/settings'],
];

/** Give the screens something to show: favourites, a plan and a shopping list. */
async function prime(page) {
  for (const [id, plan] of [
    ['ginger-pork-noodles', true],
    ['chickpea-spinach-curry', true],
    ['lemon-drizzle-cake', false],
    ['greek-salad', false],
    ['shakshuka', false],
  ]) {
    await page.goto(`${base}/#/recipe/${id}`);
    await page.getByRole('button', { name: 'Add to favourites' }).click();
    if (!plan) continue;
    await page.getByRole('button', { name: 'Add to shopping list' }).click();
    await page.getByRole('button', { name: 'Add to meal plan' }).click();
    await page.getByRole('button', { name: 'Add to plan' }).click();
  }
  await page.waitForTimeout(6500);
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
for (const [device, viewport] of Object.entries(SIZES)) {
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: device === 'phone' ? 2 : 1, hasTouch: device === 'phone' });
    const page = await context.newPage();
    page.on('pageerror', (error) => console.error(`[${device}] ${error.message}`));
    page.on('console', (message) => message.type() === 'error' && console.error(`[${device}] console: ${message.text()}`));
    await page.goto(`${base}/#/`);
    await page.waitForSelector('.shell');
    await prime(page);
    for (const [name, url] of SCREENS) {
      if (only && name !== only) continue;
      if (scheme === 'dark' && !['home', 'recipe'].includes(name)) continue;
      await page.goto(`${base}${url}`);
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(out, `${device}-${name}${scheme === 'dark' ? '-dark' : ''}.png`) });
    }
    await context.close();
  }
}
await browser.close();
console.log(`Screenshots written to ${out}`);
