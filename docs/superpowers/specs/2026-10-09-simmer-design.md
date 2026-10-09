# Simmer — design

Date: 2026-10-09

## Intent

An interactive cookbook that runs as a Tauri v2 app on desktop (Windows, macOS,
Linux) and Android, with a layout tuned for each. It should feel calm and
crafted: subtle, purposeful motion; nothing flashy. Finding a recipe must be
fast and forgiving (fuzzy search across titles, ingredients, tags). Recipes live
in a separate public repository and the app keeps itself current from it
without the user doing anything.

Stated by the owner: Tauri, Android + desktop, both layouts optimised, fuzzy
search including ingredients, rich feature set, every feature tested, two public
copyleft repos, automatic recipe/update pulling.

Assumptions made on the owner's behalf (they asked not to be consulted):

- Name: **Simmer**. Repos `CheersLoveDani/simmer` and `CheersLoveDani/simmer-recipes`.
- iOS is out of scope.
- No accounts, no server. All personal data stays on the device.
- Recipes are original text written for this project. No photographs ship in
  v1; each recipe gets generated cover art. The data format supports photos.
- English only.

## Licensing

| Repo | Scope | Licence |
| --- | --- | --- |
| simmer | all code | AGPL-3.0-or-later |
| simmer-recipes | recipe text, images, taxonomy | CC BY-SA 4.0 |
| simmer-recipes | schema, build scripts | AGPL-3.0-or-later |

Both are strong copyleft: derivatives must be released under the same terms.
CC BY-SA is used for content because the GPL family is a poor fit for prose.

## How the two repos interact

The recipes repo is the **source of truth**; the app never reads its git
history or source YAML. A CI build compiles the sources into a versioned,
static, content-addressed **feed** and publishes it to the `gh-pages` branch.

```
simmer-recipes (main)                 gh-pages branch
  recipes/<id>.yaml      --build-->     v1/manifest.json
  data/ingredients.yaml                 v1/recipes.<hash>.json   (full bundle)
  images/<id>.webp                      v1/r/<id>.<hash>.json    (one per recipe)
  schema/recipe.schema.json             v1/img/<id>.<hash>.webp
```

- `v1` is the feed schema major version. A breaking change publishes `v2/`
  alongside; old apps keep working against `v1/`.
- `manifest.json` is small and never cached: `{ schemaVersion, revision,
  generatedAt, bundle: {path, hash, bytes}, recipes: [{id, hash, path}],
  images: [{id, hash, path}] }`. Everything else has its hash in the filename
  and is immutable.
- Two mirrors serve the same branch: GitHub Pages
  (`cheerslovedani.github.io/simmer-recipes/v1/`) and
  `raw.githubusercontent.com/.../gh-pages/v1/`. The app tries them in order.

### Sync algorithm (app side)

1. On launch, then every 6 hours while open, and on manual refresh: fetch the
   manifest.
2. Same `revision` as stored → done.
3. `schemaVersion` greater than the app supports → keep local data, flag
   "update Simmer to get new recipes".
4. Diff per-recipe hashes against the local store. First sync or more than 20
   changes → fetch the bundle. Otherwise fetch only changed recipe files.
5. Validate every recipe at runtime; an invalid recipe is skipped and reported,
   never fatal.
6. Apply adds, updates and removals in a single IndexedDB transaction, then
   store the new revision. A failed sync leaves the previous data intact.
7. Cover images (when present) are fetched lazily and cached as blobs.

The app ships with a **seed snapshot** of the feed taken at build time, so the
first launch works offline.

### App updates

- Desktop: `tauri-plugin-updater` against signed GitHub Release artifacts of
  the app repo (`latest.json`). Checked on launch; the user is offered
  "restart to update".
- Android: no in-place updater exists. The app checks the latest GitHub
  Release and offers a link to the new APK.

## Recipe source format

One YAML file per recipe, `recipes/<id>.yaml`, validated by JSON Schema.

```yaml
title: Brown Butter Miso Pasta
description: One or two sentences.
course: main            # starter|main|side|dessert|breakfast|baking|drink|sauce|snack
cuisine: japanese-italian
tags: [weeknight, umami]
diet: [vegetarian]      # vegetarian|vegan|gluten-free|dairy-free|nut-free|pescatarian
difficulty: easy        # easy|medium|hard
serves: 2
yield: null             # optional free text, e.g. "12 cookies"
time: { prep: 5, cook: 15, rest: 0 }   # minutes
ingredients:
  - section: null
    items:
      - { qty: 200, unit: g, item: spaghetti }
      - { qty: 2, unit: tbsp, item: white miso, key: miso }
      - { qty: null, unit: null, item: black pepper, note: to taste }
steps:
  - text: Boil the spaghetti until just shy of al dente.
    timer: { minutes: 9, label: Pasta }
    tip: Save a mug of pasta water.
equipment: [large pot]
tips: []
substitutions: [{ for: white miso, use: red miso, note: use a little less }]
storage: Best eaten immediately.
nutrition: { kcal: 610, protein: 18, carbs: 78, fat: 24, fibre: 4 }  # per serving
cover: { hue: 38, motif: noodles }
author: Simmer
created: 2026-10-09
```

- `unit` is from a closed set (g, kg, ml, l, tsp, tbsp, cup, oz, lb, plus count
  units such as clove, sprig, pinch, or null for "each").
- Every ingredient resolves to a canonical `key` (explicit, or derived from
  `item`). `data/ingredients.yaml` maps each key to an aisle and synonyms; the
  build fails on an unknown key. Keys drive pantry matching and shopping-list
  merging, which is why they are enforced at the source.

## App architecture

React 19 + TypeScript + Vite, Motion for animation, MiniSearch for search,
Zustand for state, `idb` for storage, Zod for runtime validation. Rust side is
thin: plugins (updater, process, notification, opener) and window setup.

```
src/
  domain/     pure logic, no DOM, no storage — fully unit tested
    schema      feed + recipe types and validators
    quantity    scaling, fraction formatting, metric/US conversion
    search      index build, fuzzy query, highlight ranges
    pantry      "what can I make" ranking
    shopping    build + merge + group list
    planner     week plan operations
    timers      timer reducer
    cover       deterministic generated cover art
  sync/       manifest diffing, fetching with mirrors, apply
  store/      IndexedDB repositories; Zustand stores for library + user data
  platform/   Tauri wrappers with browser fallbacks (notify, updater, wake lock, share)
  ui/         design-system primitives
  features/   screens: home, search, recipe, cook, pantry, shopping, planner,
              favourites/collections, settings
```

Everything in `platform/` degrades to a web fallback, so the whole app runs in
a plain browser. That is what makes Playwright end-to-end testing possible.

## Features

- **Browse**: home with featured, quick picks, by course, by cuisine, recently
  viewed; filter by course, cuisine, diet, difficulty, max time; sort.
- **Search**: fuzzy + prefix across title, ingredients, tags, cuisine with
  match highlighting; command palette (Ctrl/Cmd+K) on desktop.
- **Pantry**: pick ingredients you have; recipes ranked by coverage with the
  missing items listed.
- **Recipe**: servings scaler, metric/US toggle, ingredient check-off, step
  list with inline timers, tips, substitutions, nutrition, storage, related
  recipes, share/copy, print.
- **Cook mode**: full-screen one step at a time, large type, swipe/arrow keys,
  screen kept awake, per-step ingredients, timers.
- **Timers**: several at once, persistent dock, sound + system notification.
- **Personal**: favourites, collections, private notes, rating, cooked log.
- **Shopping list**: add scaled recipe ingredients, merge duplicates, group by
  aisle, manual items, check off, copy/share.
- **Meal planner**: week grid, assign recipes to days/meals, send the week to
  the shopping list.
- **Settings**: theme (system/light/dark), units, text size, reduced motion,
  sync status + refresh, backup export/import, licences.

## Layouts

- **Desktop / wide** (≥ 900px): left navigation rail, content area, recipe
  page in two columns (sticky ingredients beside steps), keyboard shortcuts,
  hover affordances.
- **Android / narrow**: bottom tab bar, single column, bottom sheets for
  filters and timers, safe-area insets, large touch targets, swipe in cook
  mode. The Pixel Fold's unfolded width gets the wide layout.

## Error handling

- Offline or failing sync: silent on auto-sync, visible in Settings and on
  manual refresh; local data always usable.
- Corrupt local store: rebuild from the seed snapshot.
- Unknown feed version, invalid recipe: described above.
- Backup import validates before replacing anything.

## Testing

- **Unit** (Vitest): every `domain/` and `sync/` module; stores against
  `fake-indexeddb`.
- **Component** (Testing Library): scaler, timers, shopping list, filters.
- **End-to-end** (Playwright, desktop and phone viewports) against the web
  build with a local fixture feed: each feature above has at least one flow,
  including a sync that adds, changes and removes recipes.
- **Recipes repo**: schema validation of every recipe, unknown-ingredient
  check, build determinism, manifest shape.
- **Real builds**: Windows desktop bundle and Android APK built locally; APK
  smoke-run on the emulator. CI runs tests on every push and builds release
  artifacts on tags.
