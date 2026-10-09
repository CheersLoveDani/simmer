// Refresh the recipe snapshot bundled with the app (src/seed), so a first
// launch with no network still has a full cookbook.
//
//   node scripts/seed.mjs            from the published feed
//   node scripts/seed.mjs <dir>      from a local feed build, e.g. ../simmer-recipes/dist/v1
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FEED = 'https://cheerslovedani.github.io/simmer-recipes/v1/';
const FALLBACK = 'https://raw.githubusercontent.com/CheersLoveDani/simmer-recipes/gh-pages/v1/';
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/seed');
const local = process.argv[2];

async function read(name) {
  if (local) return JSON.parse(await readFile(path.join(local, name), 'utf8'));
  for (const base of [FEED, FALLBACK]) {
    try {
      const response = await fetch(base + name);
      if (response.ok) return await response.json();
    } catch {
      // try the next mirror
    }
  }
  throw new Error(`Could not fetch ${name} from the recipe feed`);
}

const manifest = await read('manifest.json');
const bundle = await read(manifest.bundle.path);

await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'manifest.json'), `${JSON.stringify({ revision: manifest.revision, generatedAt: manifest.generatedAt })}\n`);
await writeFile(path.join(out, 'bundle.json'), `${JSON.stringify(bundle)}\n`);
console.log(`Seeded ${bundle.recipes.length} recipes at revision ${manifest.revision}`);
