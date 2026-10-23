import { describe, expect, it } from 'vitest';
import { findPhoto } from './photos';

const result = (over: Record<string, unknown> = {}) => ({
  id: 'abc-123',
  creator: 'Jo Cook',
  license: 'by-sa',
  license_version: '2.0',
  license_url: 'https://creativecommons.org/licenses/by-sa/2.0/',
  foreign_landing_url: 'https://www.flickr.com/photos/jo/1',
  ...over,
});

function openverse(results: unknown[]) {
  const asked: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(url);
    if (url.includes('/thumb/')) return new Response(new Blob(['img'], { type: 'image/jpeg' }));
    return Response.json({ results });
  }) as typeof fetch;
  return { fetcher, asked };
}

describe('findPhoto', () => {
  it('credits the first usable result', async () => {
    const { fetcher, asked } = openverse([result({ foreign_landing_url: 'http://insecure.test/', id: 'skip' }), result()]);
    const photo = await findPhoto('lamb hotpot', { fetch: fetcher });
    expect(photo?.credit).toEqual({
      author: 'Jo Cook',
      license: 'CC BY-SA 2.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/',
      source: 'https://www.flickr.com/photos/jo/1',
    });
    expect(photo?.blob.size).toBeGreaterThan(0);
    expect(asked[0]).toContain('q=lamb%20hotpot');
    expect(asked[1]).toBe('https://api.openverse.org/v1/images/abc-123/thumb/');
  });

  it('names public domain and CC0 photos plainly', async () => {
    expect((await findPhoto('x', { fetch: openverse([result({ license: 'cc0', license_version: '1.0' })]).fetcher }))?.credit.license).toBe('CC0');
    expect((await findPhoto('x', { fetch: openverse([result({ license: 'pdm', creator: null })]).fetcher }))?.credit).toMatchObject({ license: 'Public domain', author: 'Unknown' });
  });

  it('no results gives null', async () => {
    expect(await findPhoto('nothing', { fetch: openverse([]).fetcher })).toBeNull();
  });

  it('a failed search gives null rather than an error', async () => {
    const down = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await findPhoto('lamb', { fetch: down })).toBeNull();
  });
});
