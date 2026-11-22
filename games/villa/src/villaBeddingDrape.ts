import * as THREE from 'three';
import { sheet, type Point } from './villaFurnitureForms.js';
import { measuredSheet } from './villaUpholsteryFinish.js';

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const bell = (x: number) => Math.exp(-x * x);

/** Same shoulder and corner radii as the mattress sections, in bed metres. */
function tickingAt(x: number, z: number, w: number) {
  const dist = (scale: number) => {
    const dx = Math.abs(x) - w * scale / 2 + .18, dz = Math.abs(z) - 3.55 * scale / 2 + .18;
    return Math.hypot(Math.max(0, dx), Math.max(0, dz)) + Math.min(0, Math.max(dx, dz)) - .18;
  };
  let d0 = dist(.70), y0 = .807;
  for (const [scale, y] of [[.949, .791], [.989, .769], [.994, .745], [1, .732]]) {
    if (d0 <= 0) return y0;
    const d1 = dist(scale); if (d1 <= 0) return THREE.MathUtils.lerp(y0, y, d0 / (d0 - d1));
    d0 = d1; y0 = y;
  }
  return y0;
}
function normal(u: number, v: number): Point {
  const a = clamp((Math.abs(u) - .90) / .071) * Math.PI / 2, b = clamp((-v - .88) / .092) * Math.PI / 2;
  const nx = Math.sign(u) * Math.sin(a), ny = Math.cos(a) * Math.cos(b), nz = -Math.sin(b), length = Math.hypot(nx, ny, nz);
  return [nx / length, ny / length, nz / length];
}
function clothPoint(w: number, u: number, v: number, under: boolean, guest: boolean): Point {
  const e = Math.abs(u), side = clamp((e - .948) / .052), foot = clamp((-v - .948) / .052), s = Math.sign(u);
  const half = w / 2, toe = 3.55 / 2, end = Math.max(side, foot);
  let x = s * half * (e <= .89 ? e / .89 * .94 : .94 + .054 * Math.min(1, (e - .89) / .058));
  // The turn-down was pulled back for one person in the master. The spare bed
  // retains its long, relatively straight foot fold; it isn't a scaled clone.
  const swept = guest ? .038 * u - .034 * bell((u + .48) / .37) : .079 * u - .288 * bell((u + .59) / .40);
  const head = clamp((v + .04) / 1.04), pull = swept * head + (guest ? .027 : .105) * (u + .23) * bell((v + .50) / .255)
    + (guest ? .018 : .106) * bell((v - .54) / .22) * bell((u - .49) / .33);
  let z = v >= -.86 ? -.595 + 1.22 * v + pull : -1.6442 - (toe * .994 - 1.6442) * clamp((-v - .86) / .088);
  let base = tickingAt(x, z, w) + .0013;
  if (end > 0) {
    const drape = guest ? .143 : .203, longPoint = bell((v + .44) / .24) * (u < 0 ? .068 : -.022);
    const hitch = (guest ? .039 : .078) * bell((u + .85) / .105), low = (guest ? .031 : .076) * bell((u + .58) / .29);
    base = Math.min(.746 - (drape + .021 * v + longPoint - .044 * bell((v + .76) / .12)) * side, .746 - (drape + low + .031 * u - hitch) * foot);
    const scale = base >= .732 ? 1 - .006 * (base - .732) / .014 : 1 - .007 * clamp((.732 - base) / .023);
    // Under the upper bead the fall bears on the mattress. Only the free hem
    // loosens and flares: not a second slab, nor a gap all along the bed.
    const heel = clamp((.657 - base) / .095), corner = bell((v + .79 + .13 * side) / .079) + bell((u + .81 - .095 * foot) / .095);
    const pleat = .0014 + heel * (.008 + (guest ? .046 : .090) * corner);
    if (side) x = s * (half * scale + pleat);
    if (foot) z = -(toe * scale + pleat);
    const cx = Math.max(0, Math.abs(x) - (half * scale - .18)), cz = Math.max(0, -z - (toe * scale - .18)), radial = Math.hypot(cx, cz);
    if (cx && cz && radial > .18 + pleat) { const pull = 1 - (.18 + pleat) / radial; x -= s * cx * pull; z += cz * pull; }
  }
  // Ridges originate at the displaced corner/turnover; their troughs die out
  // into flatter batting. No sine wave of identical peaks on the sleeping area.
  const field = .030 + .011 * bell((u + .1) / .7);
  const ridge = .073 * bell((u - (.31 + .39 * v - .20 * v * v)) / .145) * bell((v - .34) / .75) +
    .054 * bell((u + .39 + .22 * v) / .135) * bell((v + .12) / .67) + .039 * bell((u + .68 - .39 * v) / .11) * bell((v + .58) / .36);
  const dart = .030 * bell((v + .76 - .28 * u) / .103) * bell((u - .52) / .54);
  const stitched = .014 * bell((u + .39 + .073 * v) / .071) * bell((v + .09) / .80) + .013 * bell((u - .30 + .12 * v) / .059) * bell((v - .14) / .74);
  const t = under ? 0 : .017 + (1 - .47 * end) * (field + (guest ? .58 : 1.37) * ridge + dart - stitched) + .008 * bell((end - .89) / .082);
  const n = normal(u, v); return [x + n[0] * t, base + n[1] * t, z + n[2] * t];
}

const columns = [-1, -.975, -.948, -.923, -.89, -.76, -.63, -.51, -.40, -.26, -.12, .03, .17, .31, .44, .57, .70, .80, .89, .923, .948, .975, 1];
const scarf = [-.72, -.69, -.58, -.47, -.35, -.31];
const facing = [.56, .60, .73, .85, .93, .974, 1];
const whole = [-1, -.975, -.948, -.919, -.86, ...scarf, -.09, .12, .35, ...facing];
export type BedLayer = 'quilt' | 'throw' | 'facing';
export function bedLayer(w: number, layer: BedLayer, guest: boolean) {
  const rows = layer === 'quilt' ? whole : layer === 'throw' ? scarf : facing, start = rows[0], end = rows[rows.length - 1];
  const g = sheet(columns, rows, (u, v, under) => {
    const p = clothPoint(w, u, v, layer === 'quilt' && under, guest); if (layer === 'quilt') return p;
    const n = normal(u, v), t = (v - start) / (end - start);
    // Identical triangles underneath both attached pieces, even on the eased
    // corners. Thickness is along the local normal (horizontal on the sides).
    const loft = layer === 'throw' ? .014 + .009 * bell((t - .12) / .10) + .007 * bell((u + .32 - .24 * t) / .19) :
      .010 + .047 * bell((t - .84) / .21) + .018 * (1 + u) * bell((t - .36) / .33);
    const offset = under ? .00085 : loft;
    for (let i = 0; i < 3; i++) p[i] += n[i] * offset; return p;
  });
  const uv = g.getAttribute('uv'), col: number[] = [];
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i) * 2 - 1, v = uv.getY(i) * 2 - 1, t = (v - start) / (end - start);
    const hem = t < .023 || t > .97, valley = layer === 'quilt' ? .13 * bell((u + .39 + .073 * v) / .075) * bell((v + .09) / .80)
      + .095 * bell((u - .30 + .12 * v) / .069) * bell((v - .14) / .74) : 0;
    const tone = (hem ? .88 : 1) - valley; col.push(tone, tone, tone); uv.setXY(i, (u + 1) / 2, t);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return measuredSheet(g, w + .38, (end - start) * 1.42);
}
