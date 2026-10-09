import { describe, expect, it } from 'vitest';
import { MOTIFS, coverSpec } from './cover';

describe('coverSpec', () => {
  it('is deterministic for a recipe', () => {
    expect(coverSpec('pasta', { hue: 38, motif: 'noodles' })).toEqual(coverSpec('pasta', { hue: 38, motif: 'noodles' }));
  });

  it('differs between recipes with the same hue and motif', () => {
    const a = coverSpec('pasta', { hue: 38, motif: 'noodles' });
    const b = coverSpec('ramen', { hue: 38, motif: 'noodles' });
    expect(a.food).not.toEqual(b.food);
    expect(a.cloth).toBe(b.cloth);
  });

  it.each(MOTIFS)('draws finite shapes for %s', (motif) => {
    const spec = coverSpec(`recipe-${motif}`, { hue: 200, motif });
    expect(spec.food.length).toBeGreaterThan(0);
    expect(JSON.stringify(spec)).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('falls back to a bowl for a motif it does not know', () => {
    const spec = coverSpec('x', { hue: 10, motif: 'hologram' });
    expect(spec.food[0]).toMatchObject({ t: 'circle', r: 0.8 });
  });

  it('keeps the plate inside the frame and wraps the hue', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      const { plate, cloth } = coverSpec(id, { hue: 359, motif: 'bowl' });
      expect(plate.cx - plate.r).toBeGreaterThan(0);
      expect(plate.cx + plate.r).toBeLessThan(400);
      expect(cloth).toContain('359');
    }
    expect(coverSpec('a', { hue: 350, motif: 'bowl' }).food[1]).toMatchObject({ stroke: 'oklch(0.8 0.12 20)' });
  });
});
