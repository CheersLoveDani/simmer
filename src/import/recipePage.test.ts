import { describe, expect, it } from 'vitest';
import { draftFromJsonLd, readRecipePage } from './recipePage';

const URL_ = 'https://recipes.test/lamb-hotpot';

const recipe = {
  '@type': 'Recipe',
  name: 'Lamb hotpot',
  description: '<p>Slow and <b>golden</b>.</p>',
  recipeYield: ['4', '4 servings'],
  prepTime: 'PT20M',
  cookTime: 'PT1H30M',
  recipeCategory: 'Main course',
  recipeCuisine: ['British'],
  keywords: 'stew, lamb, winter',
  image: 'https://recipes.test/photo.jpg',
  recipeIngredient: ['500 g lamb neck', '3 onions, sliced'],
  recipeInstructions: [
    { '@type': 'HowToStep', text: 'Brown the lamb.' },
    { '@type': 'HowToStep', text: 'Layer &amp; bake.' },
  ],
};

const page = (data: unknown, body = '<p>Hello</p>') =>
  `<!doctype html><html><head><title>Lamb</title><script type="application/ld+json">${JSON.stringify(data)}</script><style>.x{}</style></head><body><nav>Menu</nav>${body}<script>var tracking = 1;</script><footer>Copyright</footer></body></html>`;

const serve = (html: string, status = 200) => (async () => new Response(html, { status, headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch;

describe('draftFromJsonLd', () => {
  it('reads a plain Recipe', () => {
    const draft = draftFromJsonLd(recipe, URL_)!;
    expect(draft).toMatchObject({
      title: 'Lamb hotpot',
      description: 'Slow and golden.',
      serves: 4,
      time: { prep: 20, cook: 90, rest: 0 },
      course: 'main',
      cuisine: 'british',
      tags: ['stew', 'lamb', 'winter'],
      sourceUrl: URL_,
      photoQuery: 'Lamb hotpot',
    });
    expect(draft.ingredients[0]!.items.map((i) => i.item)).toEqual(['lamb neck', 'onions']);
    expect(draft.steps.map((s) => s.text)).toEqual(['Brown the lamb.', 'Layer & bake.']);
  });

  it('flattens HowToSection instructions', () => {
    const draft = draftFromJsonLd(
      {
        ...recipe,
        recipeInstructions: [
          { '@type': 'HowToSection', name: 'Lamb', itemListElement: [{ '@type': 'HowToStep', text: 'One.' }, { '@type': 'HowToStep', text: 'Two.' }] },
          { '@type': 'HowToSection', name: 'Finish', itemListElement: [{ '@type': 'HowToStep', text: 'Three.' }] },
        ],
      },
      URL_,
    )!;
    expect(draft.steps.map((s) => s.text)).toEqual(['One.', 'Two.', 'Three.']);
  });

  it('splits instructions written as one block of text', () => {
    const draft = draftFromJsonLd({ ...recipe, recipeInstructions: 'Brown the lamb.\nBake it.\n' }, URL_)!;
    expect(draft.steps.map((s) => s.text)).toEqual(['Brown the lamb.', 'Bake it.']);
  });

  it('PT1H30M is 90 minutes, and a total alone counts as cooking', () => {
    const draft = draftFromJsonLd({ ...recipe, prepTime: undefined, cookTime: undefined, totalTime: 'PT1H30M' }, URL_)!;
    expect(draft.time).toEqual({ prep: 0, cook: 90, rest: 0 });
  });

  it('falls back sensibly when fields are missing', () => {
    const draft = draftFromJsonLd({ '@type': 'Recipe', name: 'Toast', recipeIngredient: ['bread'], recipeInstructions: 'Toast it.' }, URL_)!;
    expect(draft).toMatchObject({ serves: 4, course: 'main', cuisine: '', tags: [] });
  });

  it('is not a recipe without a name', () => {
    expect(draftFromJsonLd({ '@type': 'Recipe' }, URL_)).toBeNull();
  });
});

describe('readRecipePage', () => {
  it('finds a Recipe inside @graph', async () => {
    const result = await readRecipePage(URL_, { fetch: serve(page({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }, recipe] })) });
    expect(result.ok && result.draft?.title).toBe('Lamb hotpot');
  });

  it('accepts @type as an array, and a list of nodes', async () => {
    const result = await readRecipePage(URL_, { fetch: serve(page([{ '@type': 'Organization' }, { ...recipe, '@type': ['Recipe', 'NewsArticle'] }])) });
    expect(result.ok && result.draft?.title).toBe('Lamb hotpot');
  });

  it('no recipe data gives a null draft and the page text', async () => {
    const result = await readRecipePage(URL_, { fetch: serve(page({ '@type': 'WebPage' }, '<h1>Nan’s hotpot</h1><p>Lamb, onions, potatoes.</p>')) });
    expect(result).toMatchObject({ ok: true, draft: null });
    expect(result.ok && result.text).toContain('Nan’s hotpot');
    expect(result.ok && result.text).toContain('Lamb, onions, potatoes.');
  });

  it('strips scripts, styles, navigation and footers from the page text', async () => {
    const result = await readRecipePage(URL_, { fetch: serve(page({}, '<p>Body text</p>')) });
    const text = result.ok ? result.text : '';
    expect(text).toContain('Body text');
    expect(text).not.toContain('tracking');
    expect(text).not.toContain('Menu');
    expect(text).not.toContain('Copyright');
    expect(text).not.toContain('.x{}');
  });

  it('keeps the page text short', async () => {
    const result = await readRecipePage(URL_, { fetch: serve(page({}, `<p>${'word '.repeat(20_000)}</p>`)) });
    expect(result.ok && result.text.length).toBeLessThanOrEqual(30_000);
  });

  it('survives broken JSON-LD', async () => {
    const html = '<html><head><script type="application/ld+json">{ not json</script></head><body><p>Hi</p></body></html>';
    const result = await readRecipePage(URL_, { fetch: serve(html) });
    expect(result).toMatchObject({ ok: true, draft: null });
  });

  it('reports pages it cannot open', async () => {
    expect(await readRecipePage(URL_, { fetch: serve('', 404) })).toEqual({ ok: false, error: 'Could not open that page.' });
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await readRecipePage(URL_, { fetch: offline })).toEqual({ ok: false, error: 'Could not open that page.' });
  });

  it('only opens web addresses', async () => {
    expect(await readRecipePage('javascript:alert(1)', { fetch: serve('') })).toEqual({ ok: false, error: 'That is not a web address.' });
    expect(await readRecipePage('hello', { fetch: serve('') })).toEqual({ ok: false, error: 'That is not a web address.' });
  });

  it('will not open addresses on this device or the local network', async () => {
    for (const address of ['https://localhost./x', 'https://router.local./', 'https://[::ffff:7f00:1]/', 'https://localhost/x', 'http://127.0.0.1:8080/', 'https://192.168.1.1/', 'https://10.0.0.2/', 'https://172.16.4.4/', 'https://169.254.169.254/latest', 'https://[::1]/', 'https://router.local/', 'https://printer.lan/']) {
      expect(await readRecipePage(address, { fetch: serve('') })).toEqual({ ok: false, error: 'That is not a web address.' });
    }
    expect((await readRecipePage('https://172.32.0.1.example.com/', { fetch: serve(page(recipe)) })).ok).toBe(true);
  });

  it('adds https to a bare address', async () => {
    let asked = '';
    const fetcher = (async (input: RequestInfo | URL) => {
      asked = String(input);
      return new Response(page(recipe));
    }) as typeof fetch;
    await readRecipePage('recipes.test/lamb-hotpot', { fetch: fetcher });
    expect(asked).toBe('https://recipes.test/lamb-hotpot');
  });
});
