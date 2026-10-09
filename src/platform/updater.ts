import { create } from 'zustand';
import { APP_VERSION, isAndroid, isDesktopApp, isTauri, openExternal } from './env';

/** -1, 0 or 1 comparing dotted versions; a leading "v" and pre-release tags are ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v
      .replace(/^v/i, '')
      .split(/[-+]/)[0]!
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

const LATEST_RELEASE = 'https://api.github.com/repos/CheersLoveDani/simmer/releases/latest';
/** Installers are only ever taken from this project's own releases. */
export const RELEASE_DOWNLOADS = 'https://github.com/CheersLoveDani/simmer/releases/download/';

export interface GithubRelease {
  version: string;
  notes: string;
  /** The release page, for people to read or download from by hand. */
  url: string;
  /** The Android package attached to the release, when there is one. */
  apkUrl?: string;
}

/** The newest GitHub release, if it is newer than `current`. */
export async function checkGithubRelease(fetcher: typeof fetch, current: string): Promise<GithubRelease | null> {
  const response = await fetcher(LATEST_RELEASE, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) return null;
  const release = (await response.json()) as {
    tag_name?: string;
    body?: string;
    html_url?: string;
    assets?: { name?: string; browser_download_url?: string }[];
  };
  if (!release.tag_name || !release.html_url) return null;
  if (compareVersions(release.tag_name, current) <= 0) return null;
  const apkUrl = release.assets?.find((a) => a.name?.endsWith('.apk') && a.browser_download_url?.startsWith(RELEASE_DOWNLOADS))?.browser_download_url;
  return { version: release.tag_name.replace(/^v/i, ''), notes: release.body ?? '', url: release.html_url, ...(apkUrl ? { apkUrl } : {}) };
}

/** How one platform finds, fetches and installs a new version. */
export interface UpdateDriver {
  find(): Promise<{ version: string } | null>;
  /** Fetch the update so that installing it is quick. */
  download(): Promise<void>;
  /** Install what was downloaded. On desktop this restarts the app. */
  apply(): Promise<void>;
  /** True when `apply` needs nothing from the person using the app. */
  unattended: boolean;
}

export type UpdateStatus = 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'installing' | 'failed';

export interface UpdateState {
  status: UpdateStatus;
  version: string | null;
}

export interface CheckOptions {
  /** Download without being asked, and install too where that needs no one's attention. */
  auto: boolean;
  /** Asked just before an unattended install: false keeps the update waiting. */
  mayRestart?: () => boolean;
}

export interface Updater {
  getState(): UpdateState;
  subscribe(listener: (state: UpdateState) => void): () => void;
  check(options: CheckOptions): Promise<void>;
  /** Install the update that is available or ready. */
  install(): Promise<void>;
}

export function createUpdater(driver: UpdateDriver | null): Updater {
  const store = create<UpdateState>(() => ({ status: 'idle', version: null }));
  const set = (status: UpdateStatus, version = store.getState().version) => store.setState({ status, version });
  const busy = () => ['checking', 'downloading', 'installing'].includes(store.getState().status);

  const download = async () => {
    set('downloading');
    await driver!.download();
    set('ready');
  };
  const apply = async () => {
    set('installing');
    await driver!.apply();
    // Still here: the system took over (Android's installer), so the update stays on offer.
    set('ready');
  };

  return {
    getState: store.getState,
    subscribe: (listener) => store.subscribe(listener),
    async check({ auto, mayRestart = () => true }) {
      if (!driver || busy()) return;
      // An update already fetched stays ready; looking again would only download it twice.
      if (store.getState().status === 'ready') return;
      try {
        set('checking');
        const found = await driver.find();
        if (!found) return set('none', null);
        set('available', found.version);
        if (!auto) return;
        await download();
        if (driver.unattended && mayRestart()) await apply();
      } catch {
        set(store.getState().version ? 'failed' : 'none');
      }
    },
    async install() {
      if (!driver || busy()) return;
      const { status } = store.getState();
      if (status !== 'available' && status !== 'ready' && status !== 'failed') return;
      try {
        if (status !== 'ready') await download();
        await apply();
      } catch {
        set('failed');
      }
    },
  };
}

/** Desktop: signed updates from the release's latest.json, installed in place. */
function desktopDriver(): UpdateDriver {
  let pending: import('@tauri-apps/plugin-updater').Update | null = null;
  return {
    unattended: true,
    async find() {
      const { check } = await import('@tauri-apps/plugin-updater');
      pending = await check();
      return pending ? { version: pending.version } : null;
    },
    async download() {
      await pending!.download();
    },
    async apply() {
      await pending!.install();
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    },
  };
}

declare global {
  interface Window {
    /** Called by the Android shell when a download finishes. */
    __simmerUpdate?: (ok: boolean) => void;
  }
}

/**
 * Android: the APK attached to the release is fetched by the shell, then
 * handed to the system installer, which asks before replacing the app.
 */
function androidDriver(): UpdateDriver {
  let release: GithubRelease | null = null;
  const native = () => window.SimmerNative;
  const inApp = () => Boolean(release?.apkUrl && native()?.downloadUpdate && native()?.installUpdate);
  return {
    unattended: false,
    async find() {
      release = await checkGithubRelease((input, init) => fetch(input, init), APP_VERSION);
      return release;
    },
    download() {
      if (!inApp()) return Promise.resolve();
      return new Promise((resolve, reject) => {
        window.__simmerUpdate = (ok) => (ok ? resolve() : reject(new Error('download failed')));
        native()!.downloadUpdate!(release!.apkUrl!);
      });
    },
    async apply() {
      if (inApp()) native()!.installUpdate!();
      else if (release) await openExternal(release.url);
    },
  };
}

export const appUpdater = createUpdater(!isTauri ? null : isDesktopApp ? desktopDriver() : isAndroid ? androidDriver() : null);
