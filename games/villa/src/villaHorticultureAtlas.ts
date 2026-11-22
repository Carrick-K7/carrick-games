import * as THREE from 'three';
import { clamp01, finishTexture, sample01 } from './villaWeatheredFinish.js';

type UV = [number, number];
type RGB = [number, number, number];
export const LEAF = { wrapper: 0, butter: 1, heart: 2, spent: 3, tomato: 4, eggplant: 5, strap: 6, herb: 7 } as const;
const leafColors: readonly RGB[] = [[94,137,83], [124,162,83], [159,186,96], [126,146,73], [85,132,72], [103,142,100], [109,145,113], [84,127,79]];
const frac = (x: number) => x - Math.floor(x);
const near = (x: number, scale: number) => Math.max(0, 1 - Math.abs(x) / scale);
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Individual chart per tissue, with the entire chart (not one linear strip)
 * following its own blade as it rolls. Two-texel margins protect the mip edge. */
export function leafUV(kind: number, side: number, growth: number): UV {
  return [((kind % 4) * 64 + 2 + (side * .5 + .5) * 59) / 256, (Math.floor(kind / 4) * 128 + 2 + growth * 123) / 256];
}
export function createKitchenLeafMap() {
  const bytes = new Uint8Array(256 * 256 * 4);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const tile = (x >> 6) + 4 * (y >> 7), s = 2 * clamp01(((x % 64) - 1.5) / 59) - 1, t = clamp01(((y % 128) - 1.5) / 123);
    const u = Math.abs(s), palette = leafColors[tile], tissue = sample01(x, y + 125);
    // Lateral veins leave the pale petiole in pairs and fork towards the
    // margin. Blade width is already encoded by the silhouette of the mesh.
    const lean = (s < 0 ? .19 : .215) * (1.07 - .28*t), bend = lean*u*(.73 + .27*u) + .018*u*Math.sin(13*t+tile+s);
    const branchPhase = 6.65*(t-bend) + (s<0?.10:-.08) + .11*Math.sin(t*9+tile), forkPhase = branchPhase - 1.61*Math.max(0,u-.34);
    const midrib = near(s, .035 + (tile<4?.12:.062)*(1-t)**1.65)*(1-.40*t);
    const secondary = near(frac(branchPhase+.5)-.5, .105-.041*u)*(1-.45*u);
    const tertiary = near(frac(forkPhase+.5)-.5,.055)*smooth(.28,.60,u)*.43;
    const parallel = .40*Math.cos(s*37+.40*Math.sin(t*4.6)) + .24*Math.cos(s*77-1.2*t);
    const vein = tile===LEAF.strap ? .30*midrib+.29*parallel : midrib+.60*secondary+tertiary;
    const pockets = (tile<4?7.9:4.3)*Math.cos(branchPhase*Math.PI*2)*Math.sin(u*Math.PI) + 3.4*Math.sin(16*u-branchPhase*3.8)*Math.sin(12*t+2.4*s);
    // Loss of chlorophyll progresses inward from exposed tips/lobes, not a
    // monochrome noise layer sprinkled evenly over a still-green leaf.
    const margin = smooth(.81, 1, u) * (.35 + .65 * t), old = tile === LEAF.spent ? 1 : tile === LEAF.wrapper ? .26 : .06;
    const scorch = old * smooth(.30, .96, margin + smooth(.70, 1, t) * .65 + .16 * Math.sin(23 * t + 4 * s));
    const speck = old * (tissue > .981 && (u > .54 || t > .62) ? .55 : 0);
    const pulp = pockets + (tissue - .5) * (tile === LEAF.eggplant ? 8 : 4) + 4.5 * t - 3 * Math.cos(s * 5.1 - 1.5 * t);
    const egg = tile === LEAF.eggplant ? midrib : 0, i = 4 * (y * 256 + x);
    bytes[i] = palette[0] + pulp + vein * (tile < 4 ? 55 : 41) + scorch * 31 - speck * 23 + egg * 12;
    bytes[i + 1] = palette[1] + pulp + vein * (tile < 4 ? 39 : 28) - scorch * 42 - speck * 43 - egg * 11;
    bytes[i + 2] = palette[2] + pulp + vein * 27 - scorch * 21 - speck * 13 + egg * 14;
    // Only nip the already modelled margin, never cut a complete plant out of
    // a card. Old wrapper leaves have one small slug notch; healthy inner
    // tissue has a fine limbus; the clean strap of a tulip is unbitten.
    const bite = tile===LEAF.spent ? .105*near(t,.06)**2 + .12*near(t-.71,.029) : 0;
    const tooth = tile===LEAF.strap ? 0 : .010+.024*(.5+.5*Math.sin(t*(tile<4?78:48)+s*3+tile)) + bite;
    bytes[i + 3] = Math.round(255*clamp01((1.014-u-tooth)*70));
  }
  const map = finishTexture('kitchen-garden/leaf-lamina', 256, 256, bytes); map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping; return map;
}

// Four 2.7 m flitches. A cut end has its OWN face chart, not the longitudinal
// fibres of a long board sprayed over all six sides. Loam/clay also live in this
// one opaque, mipmapped finish so bed carpentry and ground still batch together.
const swatches = {
  face0: [0, 0, 512, 32], face1: [0, 32, 512, 32], face2: [0, 64, 512, 32], face3: [0, 96, 512, 32],
  end: [0, 128, 128, 128], loam: [128, 128, 256, 128], clay: [384, 128, 128, 128],
} as const;
export type StockChart = keyof typeof swatches;
export function stockUV(chart: StockChart, u: number, v: number): UV {
  const [x, y, w, h] = swatches[chart]; return [(x + 1.5 + (w - 3) * u) / 512, (y + 1.5 + (h - 3) * v) / 256];
}
function timberPixel(x: number, y: number): RGB {
  const board = y >> 5, across = (y % 32) / 32, run = x / 512;
  // The annual bands skirt two knots; ring spacing grows at the torn outer
  // part of the knot and converges into straight fibres elsewhere on the plank.
  const dx = run - [.31, .67, .42, .81][board], dy = across - [.64, .20, .44, .68][board];
  const oval = Math.sqrt((dx * 19) ** 2 + (dy * 2.5) ** 2), knot = Math.exp(-oval * oval * 1.9);
  const growth = across * 12 + .83 * Math.sin(run * 7.3 + board) + .77 * Math.cos(run * 3.7 - across * 1.15) + knot * (dy < 0 ? -1 : 1) * 1.7;
  const late = Math.pow(.5 + .5 * Math.cos(2 * Math.PI * growth), 4.5), pitch = Math.exp(-9.8 * oval * oval);
  const saw = 3.4 * Math.sin(x * .46 + across * 4.6) * near(across - .52, .54), weather = 6.5 * Math.cos(2.0 * growth + .38 * board);
  const split = near(dy - .034 * Math.sin(dx * 42), .040) * smooth(.24, .02, Math.abs(dx)) * .65;
  const grain = weather + (sample01(x / 2, y + 68) - .5) * 8 + saw - late * 16 - pitch * 47 - split * 23;
  return [158 + grain + board * 2.6, 125 + grain + board * 2.7, 92 + grain + board * 3.3];
}
function cutPixel(x: number, y: number): RGB {
  const u = (x - 42) / 128, v = (y - 176) / 128, phi = Math.atan2(v, u);
  const r = Math.hypot(u * .97, v) * (1 + .043 * Math.cos(phi * 3 + .27));
  const rings = (r * 29 + .31 * Math.sin(r * 22)) * 2 * Math.PI;
  const check = near(Math.sin(phi * 2.5 - .26 * r), .026) * smooth(.12, .46, r);
  const f = -23 * (.5 + .5 * Math.cos(rings)) ** 3.7 - check * 48 + 4 * Math.sin(rings * .41) + 8 * (sample01(x, y) - .5);
  return [166 + f, 137 + f, 104 + f];
}
function loamPixel(x: number, y: number): RGB {
  const grit = sample01(x, y), crumble = sample01(x / 3, y / 3) - .5, humus = sample01(x / 11, y / 9) - .5;
  const chip = grit > .915 && crumble > .19 ? 14 : grit < .09 ? -15 : 0;
  const f = 15 * crumble + 10 * humus + 25 * (grit - .5) + chip;
  return [88 + f + 7 * humus, 67 + f * .88, 49 + f * .72];
}
export function createKitchenStockMap() {
  const bytes = new Uint8Array(512 * 256 * 4);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 512; x++) {
    let col: RGB;
    if (y < 128) col = timberPixel(x, y);
    else if (x < 128) col = cutPixel(x, y);
    else if (x < 384) col = loamPixel(x, y);
    else {
      const u = (x - 384) / 128, v = (y - 128) / 128;
      const wash = 2.3 * Math.sin(19 * u + 7 * v) + 2.8 * Math.cos(9 * u - 11 * v) + 6 * (sample01(x, y) - .5);
      const lime = smooth(.68, .95, v) * (3.4 + 4 * Math.sin(u * 29)) + .95 * Math.sin(85 * v + .45 * Math.cos(6 * u));
      col = [177 + wash + lime, 122 + wash + lime * 1.8, 95 + wash + lime * 1.9];
    }
    const i = 4 * (y * 512 + x); bytes[i] = col[0]; bytes[i + 1] = col[1]; bytes[i + 2] = col[2]; bytes[i + 3] = 255;
  }
  const map = finishTexture('kitchen-garden/stock-and-loam', 512, 256, bytes); map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping; return map;
}
