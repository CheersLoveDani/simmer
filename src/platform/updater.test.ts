import { describe, expect, it } from 'vitest';
import { checkGithubRelease, compareVersions } from './updater';

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

  it('offers nothing for the same or an older release', async () => {
    expect(await checkGithubRelease(respond({ tag_name: 'v0.1.0', html_url: 'x' }), '0.1.0')).toBeNull();
    expect(await checkGithubRelease(respond({ tag_name: 'v0.0.9', html_url: 'x' }), '0.1.0')).toBeNull();
  });

  it('offers nothing when there is no release or the reply is odd', async () => {
    expect(await checkGithubRelease(respond({ message: 'Not Found' }, 404), '0.1.0')).toBeNull();
    expect(await checkGithubRelease(respond({}), '0.1.0')).toBeNull();
  });
});
