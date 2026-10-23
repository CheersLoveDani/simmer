import { isTauri } from './env';

/**
 * `fetch` for the photo and AI services. Inside the app it goes through the
 * native HTTP plugin, whose scope allows only those hosts; in a browser (and
 * the end-to-end tests) it is plain fetch.
 */
export const httpFetch: typeof fetch = async (input, init) => {
  if (isTauri) {
    const { fetch: native } = await import('@tauri-apps/plugin-http');
    return native(input, init);
  }
  return fetch(input, init);
};

/**
 * `fetch` for a web page someone pasted. Inside the app it goes through the
 * app's own command, which refuses addresses on this device or the local
 * network (after resolving names, and on every redirect); the general HTTP
 * plugin is only allowed to reach the photo and AI services.
 */
export const pageFetch: typeof fetch = async (input, init) => {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    const html = await invoke<string>('fetch_page', { url: String(input instanceof Request ? input.url : input) });
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
  }
  return fetch(input, init);
};
