import type { Recipe } from '../domain/schema';
import { httpFetch } from '../platform/http';

const OPENVERSE = 'https://api.openverse.org/v1/images/';
const TIMEOUT_MS = 15_000;

export interface FoundPhoto {
  blob: Blob;
  credit: NonNullable<Recipe['imageCredit']>;
}

interface OpenverseImage {
  id: string;
  creator?: string | null;
  license?: string;
  license_version?: string | null;
  license_url?: string | null;
  foreign_landing_url?: string | null;
}

function licenceName(image: OpenverseImage): string {
  const code = (image.license ?? '').toLowerCase();
  if (code === 'cc0') return 'CC0';
  if (code === 'pdm') return 'Public domain';
  return `CC ${code.toUpperCase()}${image.license_version ? ` ${image.license_version}` : ''}`;
}

const https = (url: string | null | undefined): url is string => typeof url === 'string' && url.startsWith('https://');

/**
 * An openly licensed photo for a recipe, from Openverse, with the credit its
 * licence asks for. Null when nothing suitable turns up or the search fails.
 */
export async function findPhoto(query: string, deps: { fetch?: typeof fetch } = {}): Promise<FoundPhoto | null> {
  const fetcher = deps.fetch ?? httpFetch;
  try {
    const search = await fetcher(`${OPENVERSE}?q=${encodeURIComponent(query.trim())}&license_type=all&page_size=10`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!search.ok) return null;
    const { results } = (await search.json()) as { results?: OpenverseImage[] };
    const image = (results ?? []).find((r) => r.id && r.license && https(r.foreign_landing_url));
    if (!image) return null;
    const file = await fetcher(`${OPENVERSE}${encodeURIComponent(image.id)}/thumb/`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!file.ok) return null;
    const blob = await file.blob();
    if (blob.size === 0) return null;
    return {
      blob,
      credit: {
        author: image.creator?.trim() || 'Unknown',
        license: licenceName(image),
        ...(https(image.license_url) ? { licenseUrl: image.license_url } : {}),
        source: image.foreign_landing_url!,
      },
    };
  } catch {
    return null;
  }
}
