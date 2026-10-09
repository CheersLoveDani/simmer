import MiniSearch from 'minisearch';
import { allIngredients, type Recipe } from './schema';

export interface SearchHit {
  id: string;
  score: number;
  /** Query terms as they matched in the document, for highlighting. */
  terms: string[];
  /** Ingredient names that matched, so a result can say why it is there. */
  ingredients: string[];
}

export interface SearchIndex {
  search(query: string, limit?: number): SearchHit[];
  suggest(query: string, limit?: number): string[];
}

interface Doc {
  id: string;
  title: string;
  ingredients: string;
  tags: string;
  cuisine: string;
  course: string;
  description: string;
}

/** Lowercase and strip accents so "creme" finds "crème". */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

const TOKEN = /[^\p{L}\p{N}]+/u;

function tokenize(text: string): string[] {
  return fold(text).split(TOKEN).filter(Boolean);
}

function toDoc(recipe: Recipe): Doc {
  const items = allIngredients(recipe);
  return {
    id: recipe.id,
    title: recipe.title,
    // Both the written name and the canonical key: "scallions" and "spring onion".
    ingredients: [...new Set(items.flatMap((i) => [i.item, i.key]))].join(' | '),
    tags: [...recipe.tags, ...recipe.diet].join(' '),
    cuisine: recipe.cuisine,
    course: recipe.course,
    description: recipe.description,
  };
}

export function createSearchIndex(recipes: Recipe[]): SearchIndex {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const mini = new MiniSearch<Doc>({
    fields: ['title', 'ingredients', 'tags', 'cuisine', 'course', 'description'],
    tokenize,
    processTerm: (term) => term,
    searchOptions: {
      boost: { title: 4, ingredients: 2.5, tags: 2, cuisine: 2, course: 1.5 },
      prefix: true,
      // Short words are matched exactly: fuzzing "egg" drags in too much.
      fuzzy: (term) => (term.length <= 3 ? false : term.length <= 5 ? 1 : 2),
      combineWith: 'AND',
    },
  });
  mini.addAll(recipes.map(toDoc));

  return {
    search(query, limit = 50) {
      if (tokenize(query).length === 0) return [];
      let results = mini.search(query);
      // Every word must match for a tight result; if nothing does, loosen up
      // rather than show an empty page for "chicken rice xyz".
      if (results.length === 0) results = mini.search(query, { combineWith: 'OR' });
      return results.slice(0, limit).map((result) => {
        const terms = Object.keys(result.match);
        const recipe = byId.get(result.id as string);
        const matched = recipe
          ? allIngredients(recipe)
              .filter((i) => tokenize(`${i.item} ${i.key}`).some((t) => terms.includes(t)))
              .map((i) => i.item)
          : [];
        return { id: result.id as string, score: result.score, terms, ingredients: [...new Set(matched)] };
      });
    },
    suggest(query, limit = 5) {
      if (tokenize(query).length === 0) return [];
      return mini
        .autoSuggest(query, { fuzzy: 0.2, prefix: true })
        .slice(0, limit)
        .map((s) => s.suggestion);
    },
  };
}

export interface Segment {
  text: string;
  hit: boolean;
}

/** Split text into segments, marking words that match any of the terms. */
export function highlight(text: string, terms: string[]): Segment[] {
  if (terms.length === 0 || text === '') return [{ text, hit: false }];
  const wanted = new Set(terms.map(fold));
  const segments: Segment[] = [];
  const push = (chunk: string, hit: boolean) => {
    if (chunk === '') return;
    const last = segments[segments.length - 1];
    if (last && last.hit === hit) last.text += chunk;
    else segments.push({ text: chunk, hit });
  };
  for (const part of text.split(/([^\p{L}\p{N}]+)/u)) {
    push(part, wanted.has(fold(part)));
  }
  return segments;
}
