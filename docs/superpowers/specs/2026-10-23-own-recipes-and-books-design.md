# Your own recipes, an assistant, and extra recipe books

## Intent

People want to cook from more than the Simmer library: a recipe from a website, one from a family card, one they made up, or a whole recipe book someone else publishes on GitHub. Adding one should be quick, either by handing a link or a rough description to an assistant that fills everything in (photo included), or by a guided form for people who want to type it themselves.

## Goals

- **Add a recipe two ways**, both ending in the same editor so the result is always reviewed before saving:
  - **From a link (free, no key):** most recipe sites embed schema.org `Recipe` data. Simmer reads it and fills the editor.
  - **Assistant (optional key):** a rough description ("my nan's lamb hotpot, lamb neck, potatoes, onions, stock, 2 hours in the oven"), or a link whose page has no recipe data. An AI writes a complete recipe in Simmer's format. It works with either a free Google Gemini key or a Claude API key.
  - Either way, a photo is found on Openverse (openly licensed, credited). The site's own photo is never copied.
  - **Guided:** a step-by-step form: basics, ingredients, method, extras, photo.
- **Your recipes behave like any other**: search, plan, shopping list, cook mode, favourites and collections all work. They can be edited and deleted. They show up in their own list on the Saved page.
- **Extra recipe books**: add a GitHub repo (`owner/repo`, a github.com link) or a feed URL that publishes the same feed format as simmer-recipes. Its recipes sync like the main library and can be removed again.
- Your recipes are part of the backup file.

## Non-goals

- Publishing your recipes to a GitHub repo, or syncing them between devices (the backup covers moving devices).
- Editing recipes that come from a feed.
- A Simmer-run server or a bundled API key.

## Anti-goals

- An assistant result saved without the person seeing it.
- An API key that leaves the device in a backup file.
- A broken extra book that stops the main library from syncing.

## Decisions (made by Claude; the user opted out of questions)

- **Links:** pages are fetched by the Tauri HTTP plugin (the webview's CORS rules would block them), falling back to `fetch` in the browser. `sourceUrl` is kept on the recipe and shown as "From example.com".
- **AI:** optional, with the person's own key pasted into Settings. Claude cannot use a Claude.ai subscription, so the choices are:
  - a free Google Gemini key (AI Studio free tier, rate-limited; Google may use free-tier prompts for training, and the Settings hint says so);
  - a Claude API key (`claude-opus-5-5`, `fallbacks: "default"`), paid per use.

  The provider is detected from the key (`sk-ant-` means Claude, `AIza` means Gemini). The app fetches the page itself and passes its text to the model, so both providers take the same input.
- **Photos:** Openverse image search (no key), using its thumbnail endpoint, with the credit stored in `imageCredit`. The guided form can also pick a photo from the device.
- **Storage:** everything stays on the device in IndexedDB, in the existing `recipes` store, with a `source` on each record.
- **IDs:** main library IDs stay as they are, so existing favourites keep working. Your recipes are `mine.<slug>-<random>` and book recipes are `<book>.<id>`.

## Constraints

- Works on Windows, macOS, Linux and Android (Tauri webview) and in the browser used by the e2e tests.
- The CSP `connect-src` must allow the AI APIs, Openverse and any https feed.
- With no key at all, link import still works. The assistant panel then explains what a free key adds.
- Existing stored data (0.1.x) keeps working without a migration step.
