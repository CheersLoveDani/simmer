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
  ['recipe', '/#/recipe/brown-butter-miso-pasta'],
  ['cook', '/#/recipe/brown-butter-miso-pasta/cook'],
  ['plan', '/#/plan'],
  ['shopping', '/#/shopping'],
  ['saved', '/#/saved'],
  ['settings', '/#/settings'],
];

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
    // Give the screens something to show.
    await page.evaluate(() => localStorage.setItem('simmer.shots', '1'));
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
