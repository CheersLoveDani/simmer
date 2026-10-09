import { MIRRORS } from './sync';

/**
 * Where to fetch the recipe feed from. `VITE_FEED_URL` points a build at
 * another feed (a fork, or the fixture server used by the end-to-end tests);
 * a `feed` value in localStorage does the same at runtime for testing.
 */
export function feedMirrors(): string[] {
  let override: string | null = null;
  try {
    override = localStorage.getItem('simmer.feed');
  } catch {
    // Storage can be unavailable; the defaults still apply.
  }
  const configured = override || import.meta.env.VITE_FEED_URL;
  if (!configured) return MIRRORS;
  return [configured.endsWith('/') ? configured : `${configured}/`];
}
