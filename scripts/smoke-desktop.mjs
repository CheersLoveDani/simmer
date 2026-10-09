// Launch the built desktop app and check it from the inside over the WebView's
// debugging port (Windows / WebView2).
//   node scripts/smoke-desktop.mjs [path-to-exe] [screenshot.png]
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import path from 'node:path';

const exe = path.resolve(process.argv[2] ?? 'src-tauri/target/release/simmer.exe');
const shot = process.argv[3];
const PORT = 9333;

const app = spawn(exe, [], {
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` },
  stdio: 'ignore',
});

let failed = false;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failed = true;
};

try {
  let browser;
  for (let attempt = 0; attempt < 40 && !browser; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`).catch(() => undefined);
  }
  if (!browser) throw new Error('Could not connect to the app');
  const page = browser.contexts()[0].pages()[0];
  const errors = [];
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(error.message));

  await page.waitForSelector('nav[aria-label="Main"]', { timeout: 20_000 });
  check('app shell rendered', true, page.url());
  check('running inside Tauri', await page.evaluate(() => '__TAURI_INTERNALS__' in window));

  await page.locator('nav[aria-label="Main"] a', { hasText: 'Search' }).click();
  await page.getByRole('searchbox', { name: 'Search recipes' }).fill('brown buter pasta');
  await page.getByTestId('recipe-card').first().waitFor();
  check('fuzzy search finds a recipe', (await page.getByTestId('recipe-card').first().innerText()).includes('Brown Butter Miso Pasta'));

  await page.goto(page.url().replace(/#.*/, '#/settings'));
  await page.getByRole('button', { name: 'Check now' }).click();
  await page.locator('.toasts').getByText(/up to date|Recipes updated/).waitFor({ timeout: 20_000 });
  const status = await page.getByTestId('sync-status').innerText();
  check('synced with the live recipe feed', /Checked/.test(status), status);

  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  const windowTheme = () => page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|theme', { label: 'main' }));
  const systemDark = await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);
  check('theme follows the system by default', (await theme()) === (systemDark ? 'dark' : 'light'), `system is ${systemDark ? 'dark' : 'light'}`);
  const opposite = systemDark ? 'Light' : 'Dark';
  await page.getByRole('radio', { name: opposite, exact: true }).click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, opposite.toLowerCase());
  await page.waitForTimeout(500);
  check('title bar follows the chosen theme', (await windowTheme()) === opposite.toLowerCase(), await windowTheme());
  await page.getByRole('radio', { name: 'Auto', exact: true }).click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, systemDark ? 'dark' : 'light');
  check('Auto returns to the system theme', true);

  const fonts = await page.evaluate(() => document.fonts.ready.then(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family)));
  check('bundled fonts loaded', fonts.some((f) => f.includes('Fraunces')) && fonts.some((f) => f.includes('Figtree')));

  await page.goto(page.url().replace(/#.*/, '#/recipe/brown-butter-miso-pasta'));
  await page.getByTestId('recipe-page').waitFor();
  if (shot) await page.screenshot({ path: shot });
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
} catch (error) {
  check('smoke run', false, error.message);
} finally {
  app.kill();
}
process.exit(failed ? 1 : 0);
