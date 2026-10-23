# Own Recipes, Assistant and Recipe Books Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let people add their own recipes (by assistant or a guided form) and subscribe to extra GitHub recipe books.

**Architecture:** Every stored recipe gets a `source` (`simmer`, `mine`, or a book key), and the recipe store is scoped by source so syncing one feed never touches another. Your recipes are built from a `RecipeDraft`. The guided editor, the free link importer (schema.org JSON-LD) and the optional AI assistant (Gemini or Claude key) all produce a draft, and `buildRecipe` turns a draft into a schema-valid `Recipe`.

**Tech Stack:** React 19, zustand, idb, zod 4, vitest + fake-indexeddb, Playwright, `@anthropic-ai/sdk` and `@tauri-apps/plugin-http` (new), Gemini REST API, Openverse REST API.

**Spec:** `docs/superpowers/specs/2026-10-23-own-recipes-and-books-design.md`

## Global Constraints

- Main library recipe IDs must not change; records stored without `source` read as `source: 'simmer'`.
- ID pattern becomes `^([a-z0-9]+(-[a-z0-9]+)*\.)?[a-z0-9]+(-[a-z0-9]+)*$`; feed recipes whose own ID contains `.` are skipped by sync.
- Claude: model `claude-opus-5-5`, `output_config.effort: 'medium'`, beta `server-side-fallback-2026-07-01` with `fallbacks: 'default'`, client created with `dangerouslyAllowBrowser: true` and `fetch: httpFetch`. No server tools.
- Gemini: `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent` with header `x-goog-api-key`. Send `generationConfig: { responseMimeType: 'application/json', responseJsonSchema: z.toJSONSchema(draftSchema) }`. Keep the model name in one constant, `GEMINI_MODEL`.
- Provider from key: `/^sk-ant-/` is `'claude'`, `/^AIza/` is `'gemini'`, anything else is rejected with "That does not look like a Gemini or Claude API key."
- The API key lives in IndexedDB kv under `assistant.apiKey`. It is never in `userData`, so it is never in backups.
- `httpFetch` is `@tauri-apps/plugin-http`'s `fetch` inside Tauri and `window.fetch` otherwise. Every request to a recipe site or an AI API uses it. Tauri needs `tauri-plugin-http = "2"`, `.plugin(tauri_plugin_http::init())` in `src-tauri/src/lib.rs`, and the capability `{ "identifier": "http:default", "allow": [{ "url": "https://*" }] }` in `default.json`.
- Page text sent to an AI is trimmed to 30,000 characters (scripts, styles, nav and footer stripped).
- Openverse: `https://api.openverse.org/v1/images/?q=<query>&license_type=all&page_size=10`, image bytes from `https://api.openverse.org/v1/images/<id>/thumb/`.
- CSP `connect-src` becomes `'self' ipc: http://ipc.localhost https:`.
- UI copy is British English, sentence case, no exclamation marks (match existing screens).

## Review Focus

- A book whose feed is down or malformed: the main library still syncs and the book shows "Could not reach" in Settings (Task 3 test `a failing book does not stop the main library`).
- Removing a book while its recipes are in the plan or the shopping list: the plan entry disappears quietly, as for removed feed recipes today (Task 3 test `removing a book deletes only its recipes`).
- An assistant reply that refuses, is cut off, or fails the schema: the person gets a plain message and keeps what they typed (Task 8 test `reports a refusal without throwing`).
- Recipe pages whose JSON-LD is wrapped in `@graph`, has `@type: ['Recipe', …]`, or uses `HowToSection` instructions (Task 7 tests in `recipePage.test.ts`).
- Ingredient lines with ranges, fractions and no quantity (`1-2 tbsp oil`, `½ tsp salt`, `salt to taste`) (Task 4 tests in `ingredientLine.test.ts`).
- Restoring an older backup that has no `recipes`: it restores without touching existing own recipes (Task 6 test `an older backup leaves your recipes alone`).

---

### Task 1: Recipe sources in the store

**Files:**
- Modify: `src/domain/schema.ts` (id regex; `source: z.string().default('simmer')`)
- Modify: `src/store/recipeStore.ts`
- Test: `src/store/recipeStore.test.ts`

**Interfaces:**
- Produces: `createRecipeStore(dbName?: string, source = 'simmer'): RecipeStore`. `all()`/`hashes()` return only that source. `apply()` stamps `source` on every put and removes only that source's IDs. `revision()`/`themes()` use kv keys `feed.revision`/`feed.themes` for `simmer` and `feed.revision:<source>`/`feed.themes:<source>` otherwise. New `clear(): Promise<void>` deletes that source's recipes, images, revision and themes.
- Produces: `allRecipes(dbName?: string): Promise<Recipe[]>`, every source, parsed.
- Produces: `MINE = 'mine'`, exported from `recipeStore.ts`.

- [ ] **Step 1: Write failing tests** `keeps sources apart` (apply to `simmer` and `book` stores, then `all()` of each returns only its own and `allRecipes` returns both), `a record without a source belongs to simmer`, `clear removes only that source`, `a namespaced id parses` (`parseRecipe({...pasta, id: 'mine.soup-x1'})` is not null, and `'a..b'` is null).
- [ ] **Step 2: Run** `npx vitest run src/store/recipeStore.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement** the schema changes and store scoping. Filter in JS after `getAll` (no new index, no DB version bump).
- [ ] **Step 4: Run** `npx vitest run`. Expect all PASS. `libraryStore.init` switches to `allRecipes()` for its view.
- [ ] **Step 5: Commit** `Recipes know which library they came from`

### Task 2: Sync a feed into its own source

**Files:**
- Modify: `src/sync/sync.ts`, `src/sync/sync.test.ts`

**Interfaces:**
- Consumes: Task 1 `createRecipeStore(db, source)`.
- Produces: `SyncDeps.prefix?: string`. When set, each feed recipe's ID becomes `${prefix}.${id}`, and a feed ID containing `.` is treated as skipped. Manifest entry IDs are prefixed the same way before comparing with `hashes()`.

- [ ] **Step 1: Write failing tests** `prefixes book recipe ids` and `skips feed ids that contain a dot`.
- [ ] **Step 2: Run** `npx vitest run src/sync/sync.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement** in `syncRecipes`.
- [ ] **Step 4: Run** `npx vitest run`. Expect PASS.
- [ ] **Step 5: Commit** `Sync can fill a library under its own prefix`

### Task 3: Recipe books

**Files:**
- Create: `src/sync/books.ts`, `src/sync/books.test.ts`
- Modify: `src/store/backup.ts` (`books` in `userDataSchema`), `src/store/userStore.ts`, `src/store/libraryStore.ts`, `src/features/Settings.tsx`, `src-tauri/tauri.conf.json` (CSP), `src/ui/hooks.ts` (`useRecipeImage` picks mirrors by `recipe.source`)
- Test: `src/store/libraryStore.test.ts` (new)

**Interfaces:**
- Produces: `type Book = { key: string; name: string; mirrors: string[] }` (zod `bookSchema` in `backup.ts`, `books: z.array(bookSchema).default([])`).
- Produces: `resolveBook(input: string): Book | null`. It accepts `owner/repo`, `https://github.com/owner/repo[...]`, `https://owner.github.io/repo[/v1/]`, or any `https://…/` feed root.
  - For GitHub, `mirrors` is `[https://<owner>.github.io/<repo>/v1/, https://raw.githubusercontent.com/<owner>/<repo>/gh-pages/v1/]` (owner lower-cased for the github.io host).
  - `key` is a slug of `<owner>-<repo>`, or of the host and path for plain URLs, trimmed to 40 characters.
  - `name` is `repo` with `-` turned into spaces.
  - It returns null for anything else, and for the main library's own repo.
- Produces: `useUser` actions `addBook(book: Book): boolean` (false if the key exists) and `removeBook(key: string): void`.
- Produces: `useLibrary` state `bookStatus: Record<string, 'ok' | 'failed'>`. `sync()` syncs the main feed, then each book with `createRecipeStore(undefined, book.key)` and `prefix: book.key`, then rebuilds the view from `allRecipes()`. New `useLibrary.removeBook(key)` clears that source and refreshes the view. Settings calls both it and `useUser.removeBook`.
- Produces: `mirrorsFor(source: string): string[]` in `books.ts`, used by `useRecipeImage` (`simmer` → `feedMirrors()`, `mine` → `[]`).

- [ ] **Step 1: Write failing tests** in `books.test.ts`:
  - `owner/repo` gives both mirrors and key `alice-family-recipes`.
  - A github.com tree URL resolves the same.
  - `https://cheerslovedani.github.io/simmer-recipes` is null.
  - `ftp://x` and `hello` are null.
- [ ] **Step 2: Write failing tests** in `libraryStore.test.ts`, with `fetch` stubbed by `vi.stubGlobal`:
  - `a failing book does not stop the main library`: the main feed updates, `bookStatus[key]` is `'failed'`.
  - `removing a book deletes only its recipes`.
- [ ] **Step 3: Run** both files. Expect FAIL.
- [ ] **Step 4: Implement.** In Settings, add a "Recipe books" group under Recipes:
  - one row per book: name, "N recipes" or "Could not reach", and a Remove button;
  - an add row: a text input labelled "GitHub repo or feed address", then an Add button that resolves the book, checks it with `fetchManifest(fetch, book.mirrors)`, then adds and syncs. Failures are reported by toast: "That is not a GitHub repo or feed address" or "No Simmer recipe book found there".
- [ ] **Step 5: Run** `npx vitest run && npm run typecheck`. Expect PASS.
- [ ] **Step 6: Commit** `Subscribe to other recipe books`

### Task 4: Drafts and building your own recipes

**Files:**
- Create: `src/domain/draft.ts`, `src/domain/draft.test.ts`, `src/domain/ingredientLine.ts`, `src/domain/ingredientLine.test.ts`
- Modify: `src/store/libraryStore.ts`, `src/store/recipeStore.ts` (`image()` is already keyed by id and hash, so no change is expected there)

**Interfaces:**
- Produces: `draftSchema` (zod) and `type RecipeDraft`:
  - from the recipe: `title, description, course, cuisine, serves, difficulty, diet[], tags[], time: {prep, cook, rest}`;
  - `ingredients: {section: string|null, items: DraftIngredient[]}[]`, where `DraftIngredient = Omit<Ingredient, 'key'>`;
  - `steps: {text, timer?: {minutes, label}}[]`;
  - `prep[], equipment[], tips[], storage?`;
  - `photoQuery?: string` (for the photo search);
  - `sourceUrl?: string`.

  Also add `sourceUrl: webUrl.optional().catch(undefined)` to `recipeSchema`. The recipe page shows it under the description as "From <hostname>", opened with `openExternal`.

  No `.min()` on strings, so structured outputs accept it. `emptyDraft(): RecipeDraft`.
- Produces: `buildRecipe(draft: RecipeDraft, opts: { id?: string; created?: string; image?: string; imageCredit?: Recipe['imageCredit']; now?: Date }): Recipe | null`.
  - `id` is `mine.<slug(title)>-<4 base36 chars>` when not given.
  - `key` is a slug of `item` with plural and descriptor words left alone.
  - `time.total = prep + cook + rest`.
  - `cover`: `hue` comes from a string hash of the title, mod 360. `motif` is the first `MOTIFS` entry whose name appears in the title or course, falling back to `MOTIFS[0]`.
  - `hash` is `mine-<Date.now() base36>`, `author: 'You'`, `source: 'mine'`.
  - It returns `parseRecipe(...)`, so null means incomplete.
- Produces: `draftFromRecipe(recipe: Recipe): RecipeDraft`.
- Produces: `parseIngredientLine(line: string): DraftIngredient` and `formatIngredientLine(i: DraftIngredient): string`. These handle a leading quantity (integer, decimal, `1/2`, unicode `½ ¼ ¾ ⅓ ⅔`, ranges `1-2` → `qty`/`qtyMax`), units from the set `quantity.ts` already knows, `item, prep` split on the first comma, and a trailing `(optional)`. With no quantity, `qty` and `unit` are null. `aisle` is `'other'`.
- Produces: `useLibrary.saveOwn(recipe: Recipe, photo?: Blob): Promise<void>`. It applies to the `mine` store, saves the photo with `saveImage(recipe.id, recipe.image!, blob)`, and refreshes the view. Also `useLibrary.deleteOwn(id: string): Promise<void>`. Local photos use `image: 'local:<hash>'`, and `useRecipeImage` never fetches a `local:` path.

- [ ] **Step 1: Write failing tests.**
  - `ingredientLine.test.ts`: `200 g spaghetti` → qty 200, unit g; `1-2 tbsp olive oil` → qty 1, qtyMax 2; `½ tsp salt`; `2 onions, finely sliced` → item onions, prep finely sliced; `salt to taste` → qty null; `1 egg (optional)` → optional true; and a format/parse round trip.
  - `draft.test.ts`: a filled draft builds a recipe that `parseRecipe` accepts, with an id matching `/^mine\.lamb-hotpot-[a-z0-9]{4}$/` and total = prep + cook + rest; an empty draft builds null; `draftFromRecipe` then `buildRecipe` keeps the id.
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run`. Expect PASS.
- [ ] **Step 5: Commit** `Build your own recipes from a draft`

### Task 5: Guided editor and where your recipes show up

**Files:**
- Create: `src/features/RecipeEditor.tsx`, `src/features/AddRecipe.tsx`, `e2e/own-recipes.spec.ts`
- Modify: `src/App.tsx` (routes `/add`, `/add/new`, `/recipe/:id/edit`), `src/features/Home.tsx` (an "Add a recipe" IconButton `icon="plus"` in the home tools on narrow screens, and a rail link on wide screens labelled "Add recipe"), `src/features/Recipe.tsx` (for `source === 'mine'`: Edit and Delete in `recipe-top-actions`; Delete asks for confirmation in a `Sheet`), `src/features/Saved.tsx` ("Your recipes" section), `src/ui/Icon.tsx` (`plus`, `sparkle` if missing), `src/styles/app.css`

**Interfaces:**
- Consumes: Task 4 `RecipeDraft`, `emptyDraft`, `buildRecipe`, `draftFromRecipe`, `parseIngredientLine`, `formatIngredientLine`, `saveOwn`, `deleteOwn`.
- Produces: `<RecipeEditor initial={RecipeDraft} recipe?={Recipe} photo?={{ blob: Blob; credit?: Recipe['imageCredit'] }} />`.
  - Five steps with a Segmented-style progress header: **Basics** (title, description, course select from `COURSES`, cuisine, serves Stepper, prep/cook/rest minutes, difficulty), **Ingredients** (one text line per ingredient with Enter adding the next, plus optional sections), **Method** (one textarea per step, optional timer minutes), **Extras** (tips, equipment, storage, diet chips from `DIETS`), **Photo** (device file input `accept="image/*"`, or the assistant photo with its credit).
  - Back and Next buttons; Save on the last step. Save is disabled until `buildRecipe` is non-null.
  - Saving navigates to `/recipe/<id>` and toasts "Recipe saved".
  - The draft is kept in `sessionStorage` under `simmer.draft` so an accidental back does not lose it. Wrap it in try/catch.
- `AddRecipe` (`/add`) offers two big choices: "From a link" (Task 7) and "Describe it" (Task 8), each shown disabled with "Coming soon" until its task lands, and "Fill it in yourself" (`/add/new`).

- [ ] **Step 1: Write the failing e2e test** `e2e/own-recipes.spec.ts` `adds, edits and deletes your own recipe`:
  - Go to `/add`, choose "Fill it in yourself", fill in title "Lamb hotpot", two ingredient lines and one step, click Next to the end, then Save.
  - Expect a heading "Lamb hotpot" and the text "500 g lamb neck".
  - Edit the title to "Nan’s lamb hotpot", save, and see it.
  - Find it on Saved under "Your recipes".
  - Delete it and confirm; it is gone from Saved.
- [ ] **Step 2: Run** `npx playwright test e2e/own-recipes.spec.ts`. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run e2e && npx vitest run && npm run typecheck`. Expect PASS.
- [ ] **Step 5: Commit** `Add, edit and delete your own recipes`

### Task 6: Your recipes in backups

**Files:**
- Modify: `src/store/backup.ts`, `src/features/Settings.tsx`, `src/store/userStore.test.ts`

**Interfaces:**
- Produces: `createBackup(data: UserData, recipes: Recipe[] = [], now?)` writes `recipes`. `parseBackup` returns `{ ok: true; data; recipes: Recipe[] }`, with each recipe parsed by `parseRecipe` and invalid ones dropped. `recipes` is optional in the file.
- Settings restores by calling `useLibrary.saveOwn` for each recipe. The "Your data" note gains "and your own recipes (photos are not included)".

- [ ] **Step 1: Write failing tests**: `a backup carries your recipes` and `an older backup leaves your recipes alone` (no `recipes` key gives `recipes: []`).
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run`. Expect PASS.
- [ ] **Step 5: Commit** `Back up your own recipes`

### Task 7: Import from a link (free)

**Files:**
- Create: `src/platform/http.ts`, `src/import/recipePage.ts`, `src/import/recipePage.test.ts`, `src/import/photos.ts`, `src/import/photos.test.ts`
- Modify: `package.json` (`npm install @tauri-apps/plugin-http`), `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `src/features/AddRecipe.tsx`

**Interfaces:**
- Produces: `httpFetch: typeof fetch` in `src/platform/http.ts`. It lazy-imports the plugin when `isTauri`.
- Produces: `readRecipePage(url: string, deps?: { fetch?: typeof fetch }): Promise<{ ok: true; draft: RecipeDraft | null; text: string } | { ok: false; error: string }>`.
  - `draft` is built from the first schema.org Recipe found in `script[type="application/ld+json"]`. It looks inside arrays and `@graph`, and accepts `@type` as a string or an array.
  - `text` is the readable page text for an AI, as set in Global Constraints.
  - `error` is "Could not open that page." for a network failure or non-2xx response, and "That is not a web address." for a non-https URL.
- Produces: `draftFromJsonLd(node: unknown, url: string): RecipeDraft | null`, exported for tests. It maps:
  - `name`, `description` (HTML stripped);
  - `recipeYield` to the first integer, else 4;
  - `prepTime`/`cookTime`/`totalTime` ISO 8601 durations to minutes. When only the total is known, it goes in `cook`;
  - `recipeIngredient` through `parseIngredientLine`;
  - `recipeInstructions` (a string split on newlines, `HowToStep.text`, or `HowToSection.itemListElement` with the section name ignored);
  - `recipeCategory` to the first matching `COURSES` value, else `'main'`;
  - `recipeCuisine` (first value, lower-cased, else `'other'`);
  - `keywords` to `tags` (at most 6);
  - `sourceUrl: url`, and `photoQuery: name`.

  The site's `image` is ignored.
- Produces: `findPhoto(query: string, deps?: { fetch?: typeof fetch }): Promise<{ blob: Blob; credit: NonNullable<Recipe['imageCredit']> } | null>`.
  - Use the first Openverse result with an https `foreign_landing_url` and a `license`.
  - The credit is `author: creator ?? 'Unknown'`, `license: 'CC ' + license.toUpperCase() + ' ' + license_version` (`'CC0'`/`'Public domain'` for `cc0`/`pdm`), `licenseUrl: license_url`, `source: foreign_landing_url`.
- `AddRecipe` gains a "From a link" panel:
  - a field "Link to a recipe" and an Import button;
  - while working, the status "Reading the page…";
  - with a draft: `findPhoto(draft.photoQuery ?? draft.title)` runs, then `<RecipeEditor initial={draft} photo={...}>` opens at Basics;
  - without a draft: the message "That page has no recipe Simmer can read.", plus "Ask the assistant to read it" when a key is set (that hands `text` to Task 8), or "Add a free AI key in Settings to read pages like this" when not.

- [ ] **Step 1: Write failing tests** in `recipePage.test.ts`, using HTML fixtures as template strings:
  - `reads a plain Recipe`;
  - `finds a Recipe inside @graph`;
  - `accepts @type as an array`;
  - `flattens HowToSection instructions`;
  - `PT1H30M is 90 minutes`;
  - `no recipe data gives a null draft and the page text`;
  - `strips scripts and styles from the page text`.
- [ ] **Step 2: Write failing tests** in `photos.test.ts`: `credits the first usable result` and `no results gives null`.
- [ ] **Step 3: Run** both files. Expect FAIL.
- [ ] **Step 4: Implement**, including the Rust plugin registration and the capability.
- [ ] **Step 5: Extend** `e2e/own-recipes.spec.ts` with `imports a recipe from a link`. Route `https://recipes.test/**` to an HTML page with Recipe JSON-LD, and `https://api.openverse.org/**` to a canned result plus the `PIXEL` image. Import, then expect the editor's title field to hold the recipe name, save, and expect "From recipes.test" on the recipe page.
- [ ] **Step 6: Run** `npm run e2e && npx vitest run && npm run typecheck && cargo check --manifest-path src-tauri/Cargo.toml`. Expect PASS.
- [ ] **Step 7: Commit** `Import recipes from a link`

### Task 8: The assistant (Gemini free key or Claude key)

**Files:**
- Create: `src/import/assistant.ts`, `src/import/assistant.test.ts`
- Modify: `package.json` (`npm install @anthropic-ai/sdk`), `src/features/AddRecipe.tsx`, `src/features/Settings.tsx` ("Assistant" group)

**Interfaces:**
- Consumes: Task 7 `httpFetch`, `readRecipePage`, `findPhoto`. Task 4 `draftSchema`.
- Produces: `getApiKey(): Promise<string | null>`, `setApiKey(key: string | null): Promise<void>` (kv `assistant.apiKey`), and `providerFor(key: string): 'claude' | 'gemini' | null`.
- Produces: `draftRecipe(input: { notes?: string; pageText?: string; url?: string }, deps: { apiKey: string; fetch?: typeof fetch }): Promise<{ ok: true; draft: RecipeDraft } | { ok: false; error: string }>`.
  - Both providers share one system prompt (`SYSTEM_PROMPT`) and one user message built from notes, page text and URL. The prompt tells the model to:
    - write in Simmer's house style (British English, metric, short imperative steps);
    - fill in sensible gaps from the notes and never invent a source;
    - choose an aisle for each ingredient from `AISLES`;
    - put timers on steps that wait;
    - set `photoQuery` to two or three plain words for a photo search.
  - Claude: one `client.beta.messages.create` with the Global Constraints settings and `output_config.format` from `zodOutputFormat(draftSchema)`.
  - Gemini: one REST call as in Global Constraints, reading `candidates[0].content.parts[0].text`.
  - Both results are parsed with `draftSchema.safeParse`, and `sourceUrl` is set from `input.url`.
  - Errors map to plain messages:
    - 401/403: "That API key was not accepted."
    - 429: "The assistant is busy or the free limit is used up. Try again later."
    - Claude `stop_reason: 'refusal'`, or Gemini `finishReason: 'SAFETY'`: "The assistant could not help with that one."
    - truncated output or a schema failure: "The assistant's answer was incomplete. Try again."
    - anything else: "Could not reach the assistant. Check your connection."

    For Claude, check the SDK's typed errors in the order `AuthenticationError`, `PermissionDeniedError`, `RateLimitError`, `APIError`.
- `AddRecipe` "Describe it" panel:
  - a textarea "Describe the recipe", an optional "Link" field, and a Write it button;
  - while working, the status "Writing your recipe…";
  - a link is read with `readRecipePage` first. If it has a JSON-LD draft, that is used without the AI; otherwise its text goes to `draftRecipe`;
  - then `findPhoto` runs and the editor opens at Basics;
  - without a key, the panel says "Describing a recipe needs an AI key. A Google Gemini key is free." and links to Settings.
- Settings "Assistant" group:
  - a password input "Gemini or Claude API key" with Save and Remove. Once saved it shows "Using Google Gemini" or "Using Claude";
  - hint: "Gemini keys are free from Google AI Studio; Google may use free-tier requests to improve its models. Claude keys are paid per use from your Anthropic account. Your key stays on this device and is not part of backups.";
  - buttons "Get a free Gemini key" (`https://aistudio.google.com/apikey`) and "Get a Claude key" (`https://console.anthropic.com/settings/keys`), opened with `openExternal`.

- [ ] **Step 1: Write failing tests** in `assistant.test.ts`, with an injected `fetch` returning canned JSON:
  - `providerFor tells keys apart`;
  - `Gemini reply becomes a draft`;
  - `Claude reply becomes a draft` (passed through the SDK's `fetch` client option);
  - `reports a refusal without throwing`;
  - `a rejected key is reported plainly` (401, both providers);
  - `an incomplete reply is reported` (invalid JSON).
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Extend** `e2e/own-recipes.spec.ts` with `the assistant writes a recipe from a description`. Route `https://generativelanguage.googleapis.com/**` to a canned reply and Openverse as in Task 7, save a key that starts with `AIza` in Settings, describe a recipe, then expect the editor's title field to be filled in.
- [ ] **Step 5: Run** `npm run e2e && npx vitest run && npm run typecheck && npm run build`. Expect PASS.
- [ ] **Step 6: Commit** `An assistant that writes recipes from a few notes`
