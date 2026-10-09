import { hashString } from './browse';

/**
 * Generated cover art: an enamel plate seen from above on a coloured cloth,
 * with food drawn from the recipe's motif. Deterministic per recipe id.
 * Food shapes use unit coordinates where the plate's well has radius 1.
 */
export type Shape =
  | { t: 'circle'; cx: number; cy: number; r: number; fill?: string; stroke?: string; sw?: number }
  | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rot?: number; fill?: string; stroke?: string; sw?: number }
  | { t: 'rect'; x: number; y: number; w: number; h: number; rx: number; rot?: number; fill: string }
  | { t: 'path'; d: string; tf?: string; fill?: string; stroke?: string; sw?: number };

export interface CoverSpec {
  cloth: string;
  clothShade: string;
  /** Tea-towel stripes across the cloth, as x positions in a 400-wide frame. */
  stripes: number[];
  plate: { cx: number; cy: number; r: number };
  food: Shape[];
}

export const MOTIFS = [
  'bowl',
  'noodles',
  'leaf',
  'loaf',
  'citrus',
  'flame',
  'drop',
  'grain',
  'fish',
  'egg',
  'berry',
  'pepper',
  'cup',
  'slice',
  'pot',
] as const;

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const between = (rng: Rng, min: number, max: number) => round(min + rng() * (max - min));
const oklch = (l: number, c: number, h: number) => `oklch(${l} ${c} ${((h % 360) + 360) % 360})`;

/** A point inside a disc of the given radius, evenly spread. */
function inDisc(rng: Rng, radius: number): [number, number] {
  const angle = rng() * Math.PI * 2;
  const distance = Math.sqrt(rng()) * radius;
  return [round(Math.cos(angle) * distance), round(Math.sin(angle) * distance)];
}

const CREAM = '#fff7e2';
const GREEN = oklch(0.62, 0.13, 142);
const YOLK = oklch(0.83, 0.16, 85);

function food(motif: string, hue: number, rng: Rng): Shape[] {
  const a = oklch(0.64, 0.15, hue);
  const b = oklch(0.8, 0.12, hue + 30);
  const c = oklch(0.46, 0.1, hue - 20);
  const pick = (...options: string[]) => options[Math.floor(rng() * options.length)] ?? a;
  const shapes: Shape[] = [];

  switch (motif) {
    case 'noodles': {
      for (let i = 0; i < 7; i++) {
        shapes.push({
          t: 'ellipse',
          cx: between(rng, -0.14, 0.14),
          cy: between(rng, -0.14, 0.14),
          rx: between(rng, 0.3, 0.72),
          ry: between(rng, 0.22, 0.56),
          rot: between(rng, 0, 180),
          stroke: i % 3 === 0 ? b : a,
          sw: 0.075,
        });
      }
      for (let i = 0; i < 5; i++) {
        const [cx, cy] = inDisc(rng, 0.5);
        shapes.push({ t: 'circle', cx, cy, r: 0.05, fill: GREEN });
      }
      break;
    }
    case 'leaf': {
      for (let i = 0; i < 9; i++) {
        const [x, y] = inDisc(rng, 0.58);
        shapes.push({
          t: 'path',
          d: 'M0,-0.3 C0.17,-0.1 0.17,0.1 0,0.3 C-0.17,0.1 -0.17,-0.1 0,-0.3Z',
          tf: `translate(${x} ${y}) rotate(${between(rng, 0, 360)}) scale(${between(rng, 0.7, 1.1)})`,
          fill: pick(GREEN, oklch(0.72, 0.14, 128), oklch(0.5, 0.1, 150), a),
        });
      }
      break;
    }
    case 'loaf': {
      const rot = between(rng, -35, 35);
      shapes.push({ t: 'ellipse', cx: 0, cy: 0, rx: 0.78, ry: 0.48, rot, fill: a });
      for (const x of [-0.32, 0, 0.32]) {
        shapes.push({ t: 'path', d: `M${x - 0.1},-0.2 L${x + 0.1},0.2`, tf: `rotate(${rot})`, stroke: CREAM, sw: 0.06 });
      }
      break;
    }
    case 'citrus': {
      const centres: [number, number][] = [
        [-0.34, -0.2],
        [0.36, -0.1],
        [-0.02, 0.4],
      ];
      for (const [cx, cy] of centres) {
        const r = between(rng, 0.27, 0.34);
        shapes.push({ t: 'circle', cx, cy, r, fill: b, stroke: a, sw: 0.06 });
        const turn = between(rng, 0, 60);
        for (let k = 0; k < 3; k++) {
          const angle = ((turn + k * 60) * Math.PI) / 180;
          const dx = round(Math.cos(angle) * r * 0.8);
          const dy = round(Math.sin(angle) * r * 0.8);
          shapes.push({ t: 'path', d: `M${round(cx - dx)},${round(cy - dy)} L${round(cx + dx)},${round(cy + dy)}`, stroke: CREAM, sw: 0.035 });
        }
      }
      break;
    }
    case 'flame':
    case 'pepper': {
      for (let i = 0; i < 4; i++) {
        const [x, y] = inDisc(rng, 0.42);
        const tf = `translate(${x} ${y}) rotate(${between(rng, 0, 360)}) scale(${between(rng, 0.9, 1.3)})`;
        shapes.push({ t: 'path', d: 'M-0.34,0.02 Q-0.02,-0.24 0.34,-0.04 Q0,0.12 -0.34,0.02Z', tf, fill: pick(a, c) });
        shapes.push({ t: 'path', d: 'M-0.34,0.02 L-0.44,-0.04', tf, stroke: GREEN, sw: 0.06 });
      }
      break;
    }
    case 'drop': {
      shapes.push({ t: 'circle', cx: between(rng, -0.1, 0.1), cy: between(rng, -0.1, 0.1), r: 0.58, fill: a });
      shapes.push({ t: 'path', d: 'M-0.3,0.05 C-0.1,-0.3 0.2,0.3 0.34,-0.08', stroke: b, sw: 0.07 });
      for (let i = 0; i < 5; i++) {
        const [cx, cy] = inDisc(rng, 0.85);
        shapes.push({ t: 'circle', cx, cy, r: between(rng, 0.04, 0.09), fill: pick(a, c) });
      }
      break;
    }
    case 'grain': {
      for (let i = 0; i < 46; i++) {
        const [x, y] = inDisc(rng, 0.74);
        const angle = rng() * Math.PI;
        const dx = round(Math.cos(angle) * 0.07);
        const dy = round(Math.sin(angle) * 0.07);
        shapes.push({ t: 'path', d: `M${x},${y} l${dx},${dy}`, stroke: pick(a, a, b, c), sw: 0.06 });
      }
      break;
    }
    case 'fish': {
      const tf = `rotate(${between(rng, -30, 30)})`;
      shapes.push({ t: 'path', d: 'M-0.62,0 C-0.3,-0.36 0.3,-0.32 0.5,0 C0.3,0.32 -0.3,0.36 -0.62,0Z', tf, fill: a });
      shapes.push({ t: 'path', d: 'M0.44,0 L0.78,-0.24 L0.7,0 L0.78,0.24Z', tf, fill: a });
      shapes.push({ t: 'path', d: 'M-0.2,-0.2 L-0.1,0.2 M0.02,-0.22 L0.1,0.2', tf, stroke: c, sw: 0.035 });
      shapes.push({ t: 'circle', cx: 0.1, cy: 0.56, r: 0.16, fill: YOLK, stroke: CREAM, sw: 0.04 });
      break;
    }
    case 'egg': {
      const eggs: [number, number][] = rng() > 0.5 ? [[-0.26, -0.08], [0.32, 0.16]] : [[0, 0]];
      for (const [cx, cy] of eggs) {
        shapes.push({ t: 'ellipse', cx, cy, rx: 0.44, ry: 0.38, rot: between(rng, 0, 180), fill: CREAM, stroke: oklch(0.9, 0.04, 85), sw: 0.025 });
        shapes.push({ t: 'circle', cx: round(cx + between(rng, -0.06, 0.06)), cy: round(cy + between(rng, -0.06, 0.06)), r: 0.17, fill: YOLK });
      }
      for (let i = 0; i < 6; i++) {
        const [cx, cy] = inDisc(rng, 0.7);
        shapes.push({ t: 'circle', cx, cy, r: 0.022, fill: c });
      }
      break;
    }
    case 'berry': {
      for (let i = 0; i < 11; i++) {
        const [cx, cy] = inDisc(rng, 0.52);
        const r = between(rng, 0.11, 0.17);
        shapes.push({ t: 'circle', cx, cy, r, fill: pick(a, a, c) });
        shapes.push({ t: 'circle', cx: round(cx - r * 0.3), cy: round(cy - r * 0.3), r: round(r * 0.22), fill: b });
      }
      break;
    }
    case 'cup': {
      shapes.push({ t: 'path', d: 'M0.5,-0.2 C0.98,-0.3 0.98,0.34 0.5,0.22', stroke: CREAM, sw: 0.13 });
      shapes.push({ t: 'circle', cx: 0, cy: 0, r: 0.64, fill: CREAM, stroke: oklch(0.88, 0.03, 85), sw: 0.025 });
      shapes.push({ t: 'circle', cx: 0, cy: 0, r: 0.52, fill: a });
      shapes.push({ t: 'path', d: 'M-0.24,0.04 C-0.1,-0.2 0.1,0.2 0.24,-0.06', stroke: b, sw: 0.05 });
      break;
    }
    case 'slice': {
      const rot = between(rng, -14, 14);
      for (const [x, y] of [[-0.5, -0.5], [0.04, -0.5], [-0.5, 0.04], [0.04, 0.04]] as const) {
        shapes.push({ t: 'rect', x, y, w: 0.46, h: 0.46, rx: 0.06, rot, fill: rng() > 0.25 ? a : c });
      }
      break;
    }
    default: {
      // bowl, pot, and any motif added to the feed after this build.
      shapes.push({ t: 'circle', cx: 0, cy: 0, r: 0.8, fill: a });
      shapes.push({ t: 'path', d: 'M-0.4,0.1 C-0.3,-0.4 0.3,-0.4 0.38,0.02 C0.4,0.3 0.1,0.4 -0.06,0.24', stroke: b, sw: 0.07 });
      for (let i = 0; i < 7; i++) {
        const [cx, cy] = inDisc(rng, 0.62);
        shapes.push({ t: 'circle', cx, cy, r: between(rng, 0.035, 0.07), fill: pick(GREEN, c, CREAM) });
      }
    }
  }
  return shapes;
}

export function coverSpec(id: string, cover: { hue: number; motif: string }): CoverSpec {
  const rng = mulberry32(hashString(id));
  const stripeCount = rng() > 0.45 ? 2 : 0;
  const stripeX = between(rng, 30, 330);
  return {
    cloth: oklch(0.87, 0.055, cover.hue),
    clothShade: oklch(0.74, 0.07, cover.hue),
    stripes: Array.from({ length: stripeCount }, (_, i) => round(stripeX + i * 14)),
    plate: { cx: between(rng, 170, 230), cy: between(rng, 138, 166), r: between(rng, 112, 128) },
    food: food(cover.motif, cover.hue, rng),
  };
}
