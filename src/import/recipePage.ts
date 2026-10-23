import { emptyDraft, type RecipeDraft } from '../domain/draft';
import { parseIngredientLine } from '../domain/ingredientLine';
import { COURSES } from '../domain/schema';
import { httpFetch } from '../platform/http';

/** As much of a page as is worth handing to an AI. */
export const PAGE_TEXT_LIMIT = 30_000;
const TIMEOUT_MS = 20_000;

export type PageResult = { ok: true; draft: RecipeDraft | null; text: string } | { ok: false; error: string };

type Node = Record<string, unknown>;
const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : value == null ? [] : [value]);

/** Text with any HTML and entities taken out, as sites often leave them in JSON-LD. */
function plain(value: unknown): string {
  if (typeof value !== 'string') return '';
  const doc = new DOMParser().parseFromString(value, 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function hasType(node: Node, type: string): boolean {
  return list(node['@type']).some((t) => typeof t === 'string' && t.toLowerCase() === type.toLowerCase());
}

/** The first schema.org Recipe anywhere in a JSON-LD document. */
function findRecipe(data: unknown): Node | null {
  for (const item of list(data)) {
    if (!isNode(item)) continue;
    if (hasType(item, 'Recipe')) return item;
    const inner = findRecipe(item['@graph']) ?? findRecipe(item.mainEntity);
    if (inner) return inner;
  }
  return null;
}

/** ISO 8601 durations as recipe sites write them: PT1H30M, P0DT45M. */
function minutes(value: unknown): number {
  if (typeof value !== 'string') return 0;
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(value.trim());
  if (!match) return 0;
  const [, d, h, m] = match;
  return Number(d ?? 0) * 1440 + Number(h ?? 0) * 60 + Number(m ?? 0);
}

function steps(value: unknown): string[] {
  if (typeof value === 'string') return value.split(/\n+/).map(plain).filter(Boolean);
  return list(value).flatMap((item): string[] => {
    if (typeof item === 'string') return steps(item);
    if (!isNode(item)) return [];
    // A section's own name is a heading, not a step.
    if (hasType(item, 'HowToSection') || Array.isArray(item.itemListElement)) return steps(item.itemListElement);
    const text = plain(item.text) || plain(item.name);
    return text ? [text] : [];
  });
}

function course(value: unknown): string {
  const words = list(value).filter((v): v is string => typeof v === 'string').join(' ').toLowerCase();
  return COURSES.find((c) => words.includes(c)) ?? 'main';
}

/** Turn a schema.org Recipe node into a draft for the editor; the site's photo is never taken. */
export function draftFromJsonLd(node: unknown, url: string): RecipeDraft | null {
  if (!isNode(node)) return null;
  const title = plain(node.name);
  if (!title) return null;
  const serves = list(node.recipeYield)
    .map((y) => /\d+/.exec(String(y))?.[0])
    .find(Boolean);
  const prep = minutes(node.prepTime);
  const cook = minutes(node.cookTime);
  const total = minutes(node.totalTime);
  const keywords = list(node.keywords).flatMap((k) => (typeof k === 'string' ? k.split(',') : []));
  const cuisine = list(node.recipeCuisine).find((c): c is string => typeof c === 'string');

  return {
    ...emptyDraft(),
    title,
    description: plain(node.description),
    course: course(node.recipeCategory),
    cuisine: cuisine ? cuisine.trim().toLowerCase() : '',
    serves: serves ? Math.min(48, Math.max(1, Number(serves))) : 4,
    time: { prep, cook: cook || (prep ? Math.max(0, total - prep) : total), rest: 0 },
    tags: keywords.map((k) => k.trim().toLowerCase()).filter(Boolean).slice(0, 6),
    ingredients: [{ section: null, items: list(node.recipeIngredient).map(plain).filter(Boolean).map(parseIngredientLine) }],
    steps: steps(node.recipeInstructions).map((text) => ({ text })),
    photoQuery: title,
    sourceUrl: url,
  };
}

/** The words a person would read on the page, without menus, scripts and footers. */
function pageText(doc: Document): string {
  doc.querySelectorAll('script, style, noscript, template, svg, nav, header, footer, aside, form, iframe').forEach((el) => el.remove());
  const title = doc.title.trim();
  const body = (doc.body?.innerText ?? doc.body?.textContent ?? '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  return (title ? `${title}\n\n${body}` : body).slice(0, PAGE_TEXT_LIMIT);
}

/**
 * Hosts on this device or the local network. A link someone pastes must not
 * reach a router or another app's local server; the HTTP plugin's scope
 * (src-tauri/capabilities/default.json) refuses the same ranges natively.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.internal')) return true;
  if (host.includes(':')) return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80') || host.startsWith('::ffff:');
  const ip = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host)?.slice(1).map(Number);
  if (!ip) return false;
  const [a, b] = ip as [number, number];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** Fetch a recipe page and read what it says: structured recipe data when the site has it, its text either way. */
export async function readRecipePage(address: string, deps: { fetch?: typeof fetch } = {}): Promise<PageResult> {
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(address.trim()) ? address.trim() : `https://${address.trim()}`);
  } catch {
    return { ok: false, error: 'That is not a web address.' };
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !/[.:]/.test(url.hostname) || isPrivateHost(url.hostname)) return { ok: false, error: 'That is not a web address.' };

  let html: string;
  try {
    const response = await (deps.fetch ?? httpFetch)(url.href, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return { ok: false, error: 'Could not open that page.' };
    html = await response.text();
  } catch {
    return { ok: false, error: 'Could not open that page.' };
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  let draft: RecipeDraft | null = null;
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      draft = draftFromJsonLd(findRecipe(JSON.parse(script.textContent ?? '')), url.href);
    } catch {
      // A broken block on the page; try the next one.
    }
    if (draft) break;
  }
  return { ok: true, draft, text: pageText(doc) };
}
