import type { Book } from '../store/backup';
import { MINE, SIMMER } from '../store/recipeStore';
import { useUser } from '../store/userStore';
import { feedMirrors } from './config';
import { MIRRORS } from './sync';

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');

function github(owner: string, repo: string): Book | null {
  repo = repo.replace(/\.git$/i, '');
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
  const pages = `https://${owner.toLowerCase()}.github.io/${repo}/v1/`;
  return {
    key: slug(`${owner}-${repo}`),
    name: repo.replace(/[-_]+/g, ' '),
    mirrors: [pages, `https://raw.githubusercontent.com/${owner}/${repo}/gh-pages/v1/`],
  };
}

/**
 * Work out where a recipe book is published from what someone typed:
 * `owner/repo`, a github.com link, a GitHub Pages address, or any https feed root.
 */
export function resolveBook(input: string): Book | null {
  const text = input.trim();
  let book: Book | null = null;
  const short = /^([\w.-]+)\/([\w.-]+)$/.exec(text);
  if (short) {
    book = github(short[1]!, short[2]!);
  } else {
    let url: URL;
    try {
      url = new URL(/^github\.com\//i.test(text) ? `https://${text}` : text);
    } catch {
      return null;
    }
    if (url.protocol !== 'https:') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    const pagesOwner = /^([\w-]+)\.github\.io$/i.exec(url.hostname)?.[1];
    if (url.hostname.toLowerCase() === 'github.com' && parts.length >= 2) {
      book = github(parts[0]!, parts[1]!);
    } else if (pagesOwner && parts.length >= 1) {
      book = github(pagesOwner, parts[0]!);
    } else {
      const root = `${url.origin}${url.pathname.replace(/\/?$/, '/')}`;
      const key = slug(`${url.hostname}${url.pathname}`);
      book = key ? { key, name: url.hostname, mirrors: [root] } : null;
    }
  }
  // The main library is already there.
  if (book && book.mirrors.some((m) => MIRRORS.includes(m.toLowerCase()) || MIRRORS.includes(m))) return null;
  if (book && (book.key === SIMMER || book.key === MINE)) return null;
  return book;
}

/** Where a recipe's photos live, by the library it came from. */
export function mirrorsFor(source: string): string[] {
  if (source === SIMMER) return feedMirrors();
  if (source === MINE) return [];
  return useUser.getState().books.find((b) => b.key === source)?.mirrors ?? [];
}
