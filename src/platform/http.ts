import { isTauri } from './env';

/**
 * `fetch` for other people's servers: recipe sites, AI and photo APIs. Inside
 * the app it goes through the native HTTP plugin, since a web page may not
 * read most sites; in a browser (and the end-to-end tests) it is plain fetch.
 */
export const httpFetch: typeof fetch = async (input, init) => {
  if (isTauri) {
    const { fetch: native } = await import('@tauri-apps/plugin-http');
    return native(input, init);
  }
  return fetch(input, init);
};
