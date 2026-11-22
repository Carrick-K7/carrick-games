import type { VillaFruitSpecies } from './villaGarden.js';
import { NatureMesh, type P3 } from './villaNatureGeometry.js';

/** Actual mature garden cultivars, dimensions in metres (not symbols sized
 * for recognition across the lawn). Zero-radius tips are single vertices. */
const sections = {
  cherry: [[-.0105, 0], [-.0122, .0048], [-.0077, .0109], [.0006, .0132], [.0084, .0105], [.0105, .005], [.0081, 0]],
  orange: [[-.038, 0], [-.036, .015], [-.025, .032], [-.007, .041], [.012, .040], [.028, .031], [.038, .014], [.036, 0]],
  apple: [[-.031, 0], [-.036, .014], [-.030, .026], [-.014, .037], [.003, .041], [.020, .039], [.032, .029], [.036, .015], [.026, 0]],
  pear: [[-.045, 0], [-.042, .018], [-.031, .033], [-.013, .038], [.009, .032], [.029, .019], [.048, .010], [.058, .0062], [.056, 0]],
  lemon: [[-.046, 0], [-.0435, .005], [-.037, .009], [-.021, .024], [.000, .0305], [.024, .025], [.038, .013], [.044, .006], [.0445, 0]],
  mango: [[-.084, 0], [-.080, .011], [-.066, .026], [-.045, .037], [-.014, .044], [.016, .047], [.045, .045], [.068, .032], [.080, .016], [.082, 0]],
} as const;
const offset = (kind: VillaFruitSpecies, h: number) => kind === 'mango' ? .016 * (1 - (h / .084) ** 2) - .009 * h / .084 :
  kind === 'pear' ? -.006 * (h + .045) / .103 : kind === 'lemon' ? -.16 * h : kind === 'cherry' ? -.0019 * h / .012 : 0;
export const fruitTop = (kind: VillaFruitSpecies) => sections[kind][sections[kind].length - 1][0];
export const fruitRadius = (kind: VillaFruitSpecies) => Math.max(...sections[kind].map(p => p[1]));
export function fruitSeat(kind: VillaFruitSpecies, pos: P3, yaw: number, size: number): P3 {
  const y = fruitTop(kind), x = offset(kind, y) * size;
  return [pos[0] + Math.cos(yaw) * x, pos[1] + y * size, pos[2] - Math.sin(yaw) * x];
}
/** One connected skin with different stem wells, beak/neck, exposed cheek &
 * shaded shoulder. Append to the tree's fruit batch, not a geometry per fruit. */
export function bearFruit(mesh: NatureMesh, kind: VillaFruitSpecies, pos: P3, yaw: number, size: number, ripe: number) {
  const profile = sections[kind], top = fruitTop(kind), sides = kind === 'mango' || kind === 'apple' ? 11 : kind === 'cherry' ? 7 : 9;
  const co = Math.cos(yaw), si = Math.sin(yaw); let prev: number[] = [], min = Infinity, max = -Infinity;
  for (const [y, r] of profile) {
    const ring: number[] = [], py = pos[1] + y * size; min = Math.min(min, py); max = Math.max(max, py);
    for (let j = 0; j < (r ? sides : 1); j++) {
      const a = -j * Math.PI * 2 / sides, h = y / top;
      const lobe = kind === 'apple' ? 1 + (.024 + .052 * Math.min(1, h * h)) * Math.cos(5 * a) : 1;
      const cheek = kind === 'cherry' || kind === 'mango' ? 1 - .12 * Math.max(0, Math.cos(a)) ** 8 : 1;
      const x = offset(kind, y) + r * lobe * cheek * Math.cos(a), z = r * lobe * (kind === 'mango' ? .81 : kind === 'pear' ? .93 : 1) * Math.sin(a);
      const light = .66 + .22 * ripe + .10 * Math.cos(a + yaw * .8) + .045 * h;
      const blush = (.5 + .5 * Math.sin(a + yaw)) * (.54 + .28 * h) * ripe;
      const green = kind === 'mango' || kind === 'pear' ? .93 + .34 * (1 - ripe) - .18 * blush : (kind === 'apple' ? .84 + (1 - ripe) * 1.58 : 1.02) - .19 * blush;
      ring.push(mesh.point([pos[0] + size * (co * x + si * z), py, pos[2] + size * (-si * x + co * z)], 1, undefined,
        [light * (kind === 'mango' ? .73 + .29 * ripe : 1), light * green, light * (.96 - .24 * blush)]));
    }
    if (prev.length === 1) for (let j = 0; j < sides; j++) mesh.tri(prev[0], ring[(j + 1) % sides], ring[j]);
    else if (prev.length && ring.length === 1) for (let j = 0; j < sides; j++) mesh.tri(prev[j], prev[(j + 1) % sides], ring[0]);
    else if (prev.length) for (let j = 0; j < sides; j++) { const k = (j + 1) % sides; mesh.tri(prev[j], prev[k], ring[j]); mesh.tri(prev[k], ring[k], ring[j]); }
    prev = ring;
  }
  return [min, max] as const;
}
export function orchardFruitSkin(kind: VillaFruitSpecies, azimuth: number) {
  const mesh = new NatureMesh(); bearFruit(mesh, kind, [0, 0, 0], azimuth, 1, .80); return mesh.geometry(true);
}
