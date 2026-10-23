import { describe, expect, it } from 'vitest';
import { emptyDraft, type RecipeDraft } from '../domain/draft';
import { draftRecipe, getApiKey, providerFor, setApiKey } from './assistant';

const GEMINI_KEY = 'AIzaSyTestKey000000000000000000000000';
const CLAUDE_KEY = 'sk-ant-api03-test';

const hotpot: RecipeDraft = {
  ...emptyDraft(),
  title: 'Lamb hotpot',
  description: 'Slow and golden.',
  cuisine: 'british',
  time: { prep: 20, cook: 120, rest: 0 },
  ingredients: [{ section: null, items: [{ qty: 500, unit: 'g', item: 'lamb neck', aisle: 'meat-fish' }] }],
  steps: [{ text: 'Bake.', timer: { minutes: 120, label: 'Hotpot' } }],
  photoQuery: 'lamb hotpot',
};

/** Answer every request with one response, and remember what was asked. */
function answer(status: number, body: unknown) {
  const asked: { url: string; body: Record<string, unknown>; headers: Headers }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    asked.push({ url: request.url, body: (await request.json()) as Record<string, unknown>, headers: request.headers });
    return Response.json(body, { status });
  }) as typeof fetch;
  return { fetcher, asked };
}

const geminiReply = (text: string, finishReason = 'STOP') => ({ candidates: [{ content: { parts: [{ text }] }, finishReason }] });
const claudeReply = (text: string, stop_reason = 'end_turn') => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content: [{ type: 'text', text }],
  stop_reason,
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 10 },
});

describe('providerFor', () => {
  it('tells keys apart', () => {
    expect(providerFor(GEMINI_KEY)).toBe('gemini');
    expect(providerFor(` ${CLAUDE_KEY} `)).toBe('claude');
    expect(providerFor('sk-proj-openai')).toBeNull();
    expect(providerFor('')).toBeNull();
  });
});

describe('the stored key', () => {
  it('is kept and removed', async () => {
    await setApiKey(GEMINI_KEY);
    expect(await getApiKey()).toBe(GEMINI_KEY);
    await setApiKey(null);
    expect(await getApiKey()).toBeNull();
  });
});

describe('draftRecipe with Gemini', () => {
  it('turns a reply into a draft', async () => {
    const { fetcher, asked } = answer(200, geminiReply(JSON.stringify(hotpot)));
    const result = await draftRecipe({ notes: 'my nan’s hotpot', url: 'https://recipes.test/x' }, { apiKey: GEMINI_KEY, fetch: fetcher });
    expect(result).toEqual({ ok: true, draft: { ...hotpot, sourceUrl: 'https://recipes.test/x' } });
    expect(asked[0]!.url).toContain('generativelanguage.googleapis.com');
    expect(asked[0]!.headers.get('x-goog-api-key')).toBe(GEMINI_KEY);
    expect(JSON.stringify(asked[0]!.body)).toContain('my nan’s hotpot');
    expect(asked[0]!.body).toMatchObject({ generationConfig: { responseMimeType: 'application/json' } });
  });

  it('accepts null where a field is simply absent', async () => {
    const withNulls = {
      ...hotpot,
      storage: null,
      photoQuery: null,
      steps: [{ text: 'Bake.', timer: null, tip: null }],
      ingredients: [{ section: null, items: [{ qty: 500, unit: 'g', item: 'lamb neck', aisle: 'meat-fish', prep: null, note: null, optional: null, qtyMax: null }] }],
    };
    const { fetcher } = answer(200, geminiReply(JSON.stringify(withNulls)));
    const result = await draftRecipe({ notes: 'x' }, { apiKey: GEMINI_KEY, fetch: fetcher });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.steps).toEqual([{ text: 'Bake.' }]);
      expect(result.draft.ingredients[0]!.items[0]).toEqual({ qty: 500, unit: 'g', item: 'lamb neck', aisle: 'meat-fish' });
      expect(result.draft.ingredients[0]!.section).toBeNull();
    }
  });

  it('a reply in the wrong shape is reported as incomplete', async () => {
    const { fetcher } = answer(200, geminiReply(JSON.stringify({ title: 'Lamb', steps: 'bake it' })));
    expect(await draftRecipe({ notes: 'x' }, { apiKey: GEMINI_KEY, fetch: fetcher })).toEqual({ ok: false, error: 'The assistant’s answer was incomplete. Try again.' });
  });

  it('a rejected key is reported plainly', async () => {
    const { fetcher } = answer(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } });
    expect(await draftRecipe({ notes: 'x' }, { apiKey: GEMINI_KEY, fetch: fetcher })).toEqual({ ok: false, error: 'That API key was not accepted.' });
  });

  it('a used-up free allowance is reported plainly', async () => {
    const { fetcher } = answer(429, { error: { code: 429, message: 'Quota exceeded' } });
    expect(await draftRecipe({ notes: 'x' }, { apiKey: GEMINI_KEY, fetch: fetcher })).toEqual({ ok: false, error: 'The assistant is busy or the free limit is used up. Try again later.' });
  });

  it('reports a refusal without throwing', async () => {
    const { fetcher } = answer(200, { candidates: [{ finishReason: 'SAFETY' }] });
    expect(await draftRecipe({ notes: 'x' }, { apiKey: GEMINI_KEY, fetch: fetcher })).toEqual({ ok: false, error: 'The assistant could not help with that one.' });
  });

  it('an incomplete reply is reported', async () => {
    const { fetcher } = answer(200, geminiReply('{"title": "Lamb', 'MAX_TOKENS'));
    expect(await draftRecipe({ notes: 'x' }, { apiKey: GEMINI_KEY, fetch: fetcher })).toEqual({ ok: false, error: 'The assistant’s answer was incomplete. Try again.' });
  });
});

describe('draftRecipe with Claude', () => {
  it('turns a reply into a draft', async () => {
    const { fetcher, asked } = answer(200, claudeReply(JSON.stringify(hotpot)));
    const result = await draftRecipe({ notes: 'my nan’s hotpot', pageText: 'Lamb, onions' }, { apiKey: CLAUDE_KEY, fetch: fetcher });
    expect(result).toEqual({ ok: true, draft: hotpot });
    expect(asked[0]!.url).toContain('api.anthropic.com/v1/messages');
    expect(asked[0]!.body).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', output_config: { effort: 'medium' } });
    expect(asked[0]!.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(JSON.stringify(asked[0]!.body)).toContain('Lamb, onions');
  });

  it('reports a refusal without throwing', async () => {
    const { fetcher } = answer(200, { ...claudeReply(''), content: [], stop_reason: 'refusal' });
    expect(await draftRecipe({ notes: 'x' }, { apiKey: CLAUDE_KEY, fetch: fetcher })).toEqual({ ok: false, error: 'The assistant could not help with that one.' });
  });

  it('a rejected key is reported plainly', async () => {
    const { fetcher } = answer(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
    expect(await draftRecipe({ notes: 'x' }, { apiKey: CLAUDE_KEY, fetch: fetcher })).toEqual({ ok: false, error: 'That API key was not accepted.' });
  });

  it('an incomplete reply is reported', async () => {
    const { fetcher } = answer(200, claudeReply('{"title": "La', 'max_tokens'));
    expect(await draftRecipe({ notes: 'x' }, { apiKey: CLAUDE_KEY, fetch: fetcher })).toEqual({ ok: false, error: 'The assistant’s answer was incomplete. Try again.' });
  });
});

describe('draftRecipe', () => {
  it('needs a key it recognises', async () => {
    expect(await draftRecipe({ notes: 'x' }, { apiKey: 'nope' })).toEqual({ ok: false, error: 'That does not look like a Gemini or Claude API key.' });
  });

  it('reports a dropped connection', async () => {
    const down = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await draftRecipe({ notes: 'x' }, { apiKey: GEMINI_KEY, fetch: down })).toEqual({ ok: false, error: 'Could not reach the assistant. Check your connection.' });
  });
});
