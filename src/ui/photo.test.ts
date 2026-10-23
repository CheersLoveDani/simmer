import { describe, expect, it } from 'vitest';
import { fitWithin, shrinkPhoto } from './photo';

describe('fitWithin', () => {
  it('scales the longer side down to the limit, keeping the shape', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('leaves small photos alone', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});

describe('shrinkPhoto', () => {
  it('gives back the original when the image cannot be read', async () => {
    const notAnImage = new Blob(['hello'], { type: 'text/plain' });
    expect(await shrinkPhoto(notAnImage)).toBe(notAnImage);
  });
});
