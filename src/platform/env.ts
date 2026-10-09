/** Bridge added by the Android shell (see MainActivity.kt). */
interface SimmerNative {
  setKeepAwake(on: boolean): void;
  share(title: string, text: string): void;
  setDarkChrome?(dark: boolean): void;
  /** Fetch a release APK; `window.__simmerUpdate(ok)` is called when done. */
  downloadUpdate?(url: string): void;
  /** Hand the downloaded APK to the system installer. */
  installUpdate?(): void;
  insets?(): string;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    SimmerNative?: SimmerNative;
  }
}

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.userAgent);
export const isDesktopApp = isTauri && !isAndroid;

export const REPO_URL = 'https://github.com/CheersLoveDani/simmer';
export const RECIPES_REPO_URL = 'https://github.com/CheersLoveDani/simmer-recipes';
export const APP_VERSION: string = __APP_VERSION__;

/** Open a link in the system browser rather than inside the app window. */
export async function openExternal(url: string): Promise<void> {
  if (isTauri) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
      return;
    } catch {
      // fall through to the browser behaviour
    }
  }
  window.open(url, '_blank', 'noopener');
}
