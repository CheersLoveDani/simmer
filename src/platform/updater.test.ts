import { describe, expect, it, vi } from 'vitest';
import { RELEASE_DOWNLOADS, checkGithubRelease, compareVersions, createUpdater, type UpdateDriver } from './updater';

describe('compareVersions', () => {
  it.each([
    ['1.0.0', '1.0.0', 0],
    ['v1.2.0', '1.1.9', 1],
    ['0.9.9', '1.0.0', -1],
    ['1.10.0', '1.9.0', 1],
    ['1.0', '1.0.0', 0],
    ['2.0.0-beta.1', '1.9.9', 1],
    ['garbage', '0.0.1', -1],
  ])('%s vs %s -> %i', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });
});

describe('checkGithubRelease', () => {
  const respond = (body: unknown, status = 200) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('offers a newer release', async () => {
    const update = await checkGithubRelease(respond({ tag_name: 'v0.2.0', body: 'Notes', html_url: 'https://example.test/r' }), '0.1.0');
    expect(update).toEqual({ version: '0.2.0', notes: 'Notes', url: 'https://example.test/r' });
  });

  it('finds the Android package among the release files', async () => {
    const apk = `${RELEASE_DOWNLOADS}v0.2.0/Simmer_0.2.0_android.apk`;
    const assets = [
      { name: 'Simmer_0.2.0_x64-setup.exe', browser_download_url: `${RELEASE_DOWNLOADS}v0.2.0/Simmer_0.2.0_x64-setup.exe` },
      { name: 'Simmer_0.2.0_android.apk', browser_download_url: apk },
    ];
    const update = await checkGithubRelease(respond({ tag_name: 'v0.2.0', html_url: 'https://example.test/r', assets }), '0.1.0');
    expect(update?.apkUrl).toBe(apk);
  });

  it('ignores a package hosted anywhere but this project', async () => {
    const assets = [{ name: 'Simmer.apk', browser_download_url: 'https://evil.test/Simmer.apk' }];
    const update = await checkGithubRelease(respond({ tag_name: 'v0.2.0', html_url: 'https://example.test/r', assets }), '0.1.0');
    expect(update).not.toBeNull();
    expect(update?.apkUrl).toBeUndefined();
  });

  it('offers nothing for the same or an older release', async () => {
    expect(await checkGithubRelease(respond({ tag_name: 'v0.1.0', html_url: 'x' }), '0.1.0')).toBeNull();
    expect(await checkGithubRelease(respond({ tag_name: 'v0.0.9', html_url: 'x' }), '0.1.0')).toBeNull();
  });

  it('offers nothing when there is no release or the reply is odd', async () => {
    expect(await checkGithubRelease(respond({ message: 'Not Found' }, 404), '0.1.0')).toBeNull();
    expect(await checkGithubRelease(respond({}), '0.1.0')).toBeNull();
  });
});

describe('createUpdater', () => {
  function fakeDriver(overrides: Partial<UpdateDriver> = {}) {
    const driver = {
      unattended: true,
      find: vi.fn(async () => ({ version: '0.2.0' }) as { version: string } | null),
      download: vi.fn(async () => {}),
      apply: vi.fn(async () => {}),
      ...overrides,
    };
    const updater = createUpdater(driver);
    const seen: string[] = [];
    updater.subscribe((state) => seen.push(state.status));
    return { driver, updater, seen };
  }

  it('downloads and installs a new version without being asked', async () => {
    const { driver, updater, seen } = fakeDriver();
    await updater.check({ auto: true });
    expect(seen).toEqual(['checking', 'available', 'downloading', 'ready', 'installing', 'ready']);
    expect(driver.download).toHaveBeenCalledOnce();
    expect(driver.apply).toHaveBeenCalledOnce();
    expect(updater.getState().version).toBe('0.2.0');
  });

  it('waits with the restart while someone is cooking', async () => {
    const { driver, updater } = fakeDriver();
    await updater.check({ auto: true, mayRestart: () => false });
    expect(updater.getState()).toEqual({ status: 'ready', version: '0.2.0' });
    expect(driver.apply).not.toHaveBeenCalled();

    // Checking again later neither downloads twice nor restarts by surprise.
    await updater.check({ auto: true });
    expect(driver.find).toHaveBeenCalledOnce();
    expect(driver.download).toHaveBeenCalledOnce();
    expect(driver.apply).not.toHaveBeenCalled();

    await updater.install();
    expect(driver.apply).toHaveBeenCalledOnce();
  });

  it('never opens an installer that needs attention by itself', async () => {
    const { driver, updater } = fakeDriver({ unattended: false });
    await updater.check({ auto: true });
    expect(updater.getState().status).toBe('ready');
    expect(driver.download).toHaveBeenCalledOnce();
    expect(driver.apply).not.toHaveBeenCalled();
  });

  it('only announces the version when automatic updates are off', async () => {
    const { driver, updater } = fakeDriver();
    await updater.check({ auto: false });
    expect(updater.getState()).toEqual({ status: 'available', version: '0.2.0' });
    expect(driver.download).not.toHaveBeenCalled();

    await updater.install();
    expect(driver.download).toHaveBeenCalledOnce();
    expect(driver.apply).toHaveBeenCalledOnce();
  });

  it('says so when there is nothing newer', async () => {
    const { updater } = fakeDriver({ find: vi.fn(async () => null) });
    await updater.check({ auto: true });
    expect(updater.getState()).toEqual({ status: 'none', version: null });
  });

  it('stays quiet when the check itself fails, as when offline', async () => {
    const { updater } = fakeDriver({
      find: vi.fn(async () => {
        throw new Error('offline');
      }),
    });
    await updater.check({ auto: true });
    expect(updater.getState().status).toBe('none');
  });

  it('reports a failed download and lets it be tried again', async () => {
    const download = vi.fn().mockRejectedValueOnce(new Error('dropped')).mockResolvedValue(undefined);
    const { driver, updater } = fakeDriver({ download });
    await updater.check({ auto: true });
    expect(updater.getState()).toEqual({ status: 'failed', version: '0.2.0' });
    expect(driver.apply).not.toHaveBeenCalled();

    await updater.install();
    expect(download).toHaveBeenCalledTimes(2);
    expect(driver.apply).toHaveBeenCalledOnce();
  });

  it('does not start a second check while one is running', async () => {
    let release!: (value: { version: string }) => void;
    const find = vi.fn(() => new Promise<{ version: string }>((resolve) => (release = resolve)));
    const { updater } = fakeDriver({ find });
    const first = updater.check({ auto: false });
    await updater.check({ auto: false });
    expect(find).toHaveBeenCalledOnce();
    release({ version: '0.2.0' });
    await first;
  });

  it('does nothing where the app cannot update itself', async () => {
    const updater = createUpdater(null);
    await updater.check({ auto: true });
    await updater.install();
    expect(updater.getState().status).toBe('idle');
  });
});
