import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { draftSchema, type RecipeDraft } from '../domain/draft';
import { AISLES, COURSES } from '../domain/schema';
import { httpFetch } from '../platform/http';
import { kvDelete, kvGet, kvSet } from '../store/db';

// The key stays in the device's own storage, outside the user data that goes into backups.
const KEY = 'assistant.apiKey';
export const CLAUDE_MODEL = 'claude-opus-5-5';
export const GEMINI_MODEL = 'gemini-flash-latest';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TIMEOUT_MS = 120_000;

export type Provider = 'claude' | 'gemini';
export type DraftResult = { ok: true; draft: RecipeDraft } | { ok: false; error: string };

export async function getApiKey(): Promise<string | null> {
  return (await kvGet<string>(KEY)) ?? null;
}

export async function setApiKey(key: string | null): Promise<void> {
  if (key && key.trim()) await kvSet(KEY, key.trim());
  else await kvDelete(KEY);
}

/** Which service a key belongs to, by the way each one writes its keys. */
export function providerFor(key: string): Provider | null {
  const trimmed = key.trim();
  if (trimmed.startsWith('sk-ant-')) return 'claude';
  if (trimmed.startsWith('AIza')) return 'gemini';
  return null;
}

const ERRORS = {
  key: 'That does not look like a Gemini or Claude API key.',
  rejected: 'That API key was not accepted.',
  busy: 'The assistant is busy or the free limit is used up. Try again later.',
  refused: 'The assistant could not help with that one.',
  incomplete: 'The assistant’s answer was incomplete. Try again.',
  offline: 'Could not reach the assistant. Check your connection.',
};

export const SYSTEM_PROMPT = `You write recipes for Simmer, a home cookbook app. From what the person gives you (a rough description, a list of ingredients, or the text of a web page) write one complete recipe they can cook from.

House style: British English, metric measures (g, kg, ml, l, tsp, tbsp), short imperative steps that each do one thing. Keep the person's own wording and quantities where they gave them. Where they left gaps, fill them the way an experienced home cook would, but do not invent a source, an author or a story.

Fields:
- course: one of ${COURSES.join(', ')}.
- cuisine: one plain lower-case word, such as british or italian.
- serves: a whole number of people.
- time: minutes of prep, cook and rest.
- ingredients: group them under a section name only when the recipe has clear parts (for example "For the sauce"); otherwise use one group with section null. Each ingredient has qty (a number, or null for "to taste"), unit (null for whole things like eggs), item (the ingredient itself, lower case), optional prep (how it is cut or prepared) and aisle, one of ${AISLES.join(', ')}.
- steps: give a step a timer when it involves waiting (simmering, baking, resting), with minutes and a short label such as "Simmer the sauce".
- prep: tasks worth doing before starting or while waiting, if any; "during" is the step number (from 1) whose wait suits the task.
- photoQuery: two or three plain words to search for a photo of the finished dish.
- Leave tips, equipment, tags and diet empty unless the source supports them.`;

function message(input: { notes?: string; pageText?: string; url?: string }): string {
  const parts: string[] = [];
  if (input.notes?.trim()) parts.push(`What the person wrote:\n${input.notes.trim()}`);
  if (input.url) parts.push(`The recipe's web address: ${input.url}`);
  if (input.pageText?.trim()) parts.push(`The text of that page:\n<page>\n${input.pageText.trim()}\n</page>`);
  return parts.join('\n\n');
}

// Fields where null means something; anywhere else a model's null just means "not given".
const MEANINGFUL_NULLS = new Set(['qty', 'unit', 'section']);

function withoutNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutNulls);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, v]) => v !== null || MEANINGFUL_NULLS.has(key))
      .map(([key, v]) => [key, withoutNulls(v)]),
  );
}

function finish(text: string | undefined, url?: string): DraftResult {
  let json: unknown;
  try {
    json = JSON.parse(text ?? '');
  } catch {
    return { ok: false, error: ERRORS.incomplete };
  }
  const parsed = draftSchema.safeParse(withoutNulls(json));
  if (!parsed.success || !parsed.data.title.trim()) return { ok: false, error: ERRORS.incomplete };
  return { ok: true, draft: url ? { ...parsed.data, sourceUrl: url } : parsed.data };
}

async function withClaude(prompt: string, apiKey: string, fetcher: typeof fetch, url?: string): Promise<DraftResult> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, fetch: fetcher, timeout: TIMEOUT_MS, maxRetries: 1 });
  try {
    const response = await client.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      output_config: { effort: 'medium', format: betaZodOutputFormat(draftSchema) },
      messages: [{ role: 'user', content: prompt }],
    });
    if (response.stop_reason === 'refusal') return { ok: false, error: ERRORS.refused };
    if (response.stop_reason === 'max_tokens') return { ok: false, error: ERRORS.incomplete };
    const text = response.content.find((block) => block.type === 'text');
    return finish(text?.type === 'text' ? text.text : undefined, url);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return { ok: false, error: ERRORS.rejected };
    if (error instanceof Anthropic.RateLimitError) return { ok: false, error: ERRORS.busy };
    return { ok: false, error: ERRORS.offline };
  }
}

/** JSON Schema for Gemini's structured output, without the meta keyword it does not take. */
function geminiSchema(): unknown {
  const { $schema: _meta, ...schema } = z.toJSONSchema(draftSchema) as Record<string, unknown>;
  return schema;
}

async function withGemini(prompt: string, apiKey: string, fetcher: typeof fetch, url?: string): Promise<DraftResult> {
  let response: Response;
  try {
    response = await fetcher(GEMINI_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseJsonSchema: geminiSchema() },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: ERRORS.offline };
  }
  const body = (await response.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
    error?: { message?: string; status?: string };
  } | null;
  if (!response.ok) {
    // Gemini answers a bad key with 400 rather than 401.
    const bad = response.status === 401 || response.status === 403 || /api key/i.test(body?.error?.message ?? '');
    if (bad) return { ok: false, error: ERRORS.rejected };
    if (response.status === 429) return { ok: false, error: ERRORS.busy };
    return { ok: false, error: ERRORS.offline };
  }
  const candidate = body?.candidates?.[0];
  if (body?.promptFeedback?.blockReason || ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'RECITATION'].includes(candidate?.finishReason ?? '')) {
    return { ok: false, error: ERRORS.refused };
  }
  if (candidate?.finishReason === 'MAX_TOKENS') return { ok: false, error: ERRORS.incomplete };
  return finish(candidate?.content?.parts?.map((p) => p.text ?? '').join(''), url);
}

/** Ask the person's chosen AI to write a recipe from their notes and/or a page's text. */
export async function draftRecipe(
  input: { notes?: string; pageText?: string; url?: string },
  deps: { apiKey: string; fetch?: typeof fetch },
): Promise<DraftResult> {
  const provider = providerFor(deps.apiKey);
  if (!provider) return { ok: false, error: ERRORS.key };
  const fetcher = deps.fetch ?? httpFetch;
  const prompt = message(input);
  return provider === 'claude' ? withClaude(prompt, deps.apiKey.trim(), fetcher, input.url) : withGemini(prompt, deps.apiKey.trim(), fetcher, input.url);
}
