import { APP_VERSION, isAndroid, isDesktopApp, isTauri } from './env';

export interface AvailableUpdate {
  version: string;
  notes: string;
  /** Desktop: download, install and restart. */
  install?: () => Promise<void>;
  /** Android: page to download the new APK from. */
  url?: string;
}

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

/** Android has no in-place updater, so point at the newest release instead. */
export async function checkGithubRelease(fetcher: typeof fetch, current: string): Promise<AvailableUpdate | null> {
  const response = await fetcher(LATEST_RELEASE, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) return null;
  const release = (await response.json()) as { tag_name?: string; body?: string; html_url?: string };
  if (!release.tag_name || !release.html_url) return null;
  if (compareVersions(release.tag_name, current) <= 0) return null;
  return { version: release.tag_name.replace(/^v/i, ''), notes: release.body ?? '', url: release.html_url };
}

export async function checkForAppUpdate(): Promise<AvailableUpdate | null> {
  if (!isTauri) return null;
  try {
    if (isDesktopApp) {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (!update) return null;
      return {
        version: update.version,
        notes: update.body ?? '',
        install: async () => {
          await update.downloadAndInstall();
          const { relaunch } = await import('@tauri-apps/plugin-process');
          await relaunch();
        },
      };
    }
    if (isAndroid) return await checkGithubRelease((input, init) => fetch(input, init), APP_VERSION);
  } catch {
    // Offline or no release published yet: nothing to offer.
  }
  return null;
}
