import * as THREE from 'three';
import { sheet, type Point } from './villaFurnitureForms.js';
import { measuredSheet } from './villaUpholsteryFinish.js';

const sq = (v: number) => v * v;
const bump = (x: number, z: number, w: number, d: number) => Math.exp(-sq(x / w) - sq(z / d));
const cols = [-1, -.83, -.56, -.27, 0, .27, .56, .83, 1], rows = [-1, -.78, -.38, 0, .34, .71, 1];
export type PadUse = 'seat' | 'chaise' | 'back' | 'reclining';

/** The crown is cut on the straight grain, the boxing on the bias around the
 * perimeter. Under the sitter the field spreads laterally; no button tufts or
 * radial pinwheel vertices. The welt is an actual return in the same surface. */
export function tailoredPad(w: number, d: number, h: number, use: PadUse, wear: number, lean: number) {
  const back = use === 'back' || use === 'reclining', hide = use === 'reclining', front: Point[] = [];
  const pos: number[] = [], tex: number[] = [], chart: number[] = [], colors: number[] = [], ids: number[] = [];
  const add = (p: Point, u: number, v: number, value: number) => { const n = pos.length / 3; pos.push(...p); tex.push(u, v); chart.push(p[0] / w + .5, p[2] / d + .5); colors.push(value, value, value); return n; };
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < cols.length; i++) {
    const u = cols[i], v = rows[j], corner = Math.abs(u) ** 5 * Math.abs(v) ** 5;
    const field = (1 - u ** 4) * (1 - v ** 4), pressedZ = use === 'chaise' ? .42 : .08;
    const x = w * u * .5 * (1 - .099 * corner - (back ? .053 * Math.max(0, v) ** 2 : 0));
    const z = d * v * .5 * (1 - .118 * corner) + (back ? .037 * (1 - u * u) * Math.max(0, v) ** 2 + lean * .015 * u - .032 * Math.max(0, v) ** 3 * bump(u - lean * .37, 0, .29, 1) : 0);
    const hip = .68 * bump(u - lean * .19, v - pressedZ, .54, .54) + .32 * bump(u + .18, v - pressedZ + .18, .37, .54);
    const lumbar = .37 * bump(u + lean * .12, v + .42, .85, .39), shoulder = hide ? .22 * bump(u, v - .75, .73, .29) : 0;
    const tuck = back ? .10 * bump(Math.abs(u) - .58, v - (.25 + .21 * u), .18, .22) : .09 * bump(Math.abs(u) - .76, v - .53 + u * .28, .18, .21);
    let rise = back ? .24 + .29 * field + lumbar + shoulder - tuck - (hide ? .16 : .095) * bump(u - .10 * lean, v - .16, .52, .46) :
      .25 + .34 * field - (wear * hip + tuck) * field;
    rise += .034 * u * lean + .025 * v + (back ? .045 * u * v * lean : 0);
    const point: Point = [x, h * rise, z]; front.push(point);
    add(point, x, z, 1 - (back ? .072 * bump(u - lean * .17, v - .11, .57, .42) : .23 * hip * wear) - .15 * tuck);
    if (i && j) { const a = j * cols.length + i; ids.push(a - cols.length - 1, a - 1, a - cols.length, a - cols.length, a - 1, a); }
  }
  const nx = cols.length, nz = rows.length, rim: number[] = [];
  for (let i = 0; i < nx; i++) rim.push(i);
  for (let j = 1; j < nz; j++) rim.push(j * nx + nx - 1);
  for (let i = nx - 2; i >= 0; i--) rim.push((nz - 1) * nx + i);
  for (let j = nz - 2; j > 0; j--) rim.push(j * nx);
  let previous: number[] = [], run = 0; const distances = [0];
  for (let i = 1; i <= rim.length; i++) { const a = front[rim[i - 1]], b = front[rim[i % rim.length]]; run += Math.hypot(a[0] - b[0], a[2] - b[2]); distances.push(run); }
  // Proud cord, tucked stitch line, straight gusset and a rolled-under hem.
  for (let band = 0; band < 5; band++) {
    const line: number[] = [];
    for (let i = 0; i <= rim.length; i++) {
      const r = rim[i % rim.length], p = front[r], u = p[0] * 2 / w, v = p[2] * 2 / d;
      const outset = [0, .0047, -.0045, -.002, -.018][band];
      const by = band === 0 ? p[1] : band === 1 ? p[1] - .005 : band === 2 ? p[1] - .013 : band === 3 ? -.285 * h : -.45 * h;
      const q: Point = [p[0] + u * outset, by, p[2] + v * outset];
      line.push(add(q, distances[i], by, [1, 1.045, .75, .91, .78][band]));
      if (band && i) ids.push(previous[i - 1], previous[i], line[i], previous[i - 1], line[i], line[i - 1]);
    }
    previous = line;
  }
  // The chair back is visible from behind. Dish a broad panel inside its rolled
  // edge instead of closing it with a perfectly flat wall between headrests.
  const center = add([lean * .035, -(back ? .58 : .45) * h, back ? .06 * d : 0], 0, 0, .91);
  const bottom = previous.slice(0, -1).map(v => add([pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]], pos[v * 3], pos[v * 3 + 2], .9));
  for (let i = 0; i < bottom.length; i++) ids.push(center, bottom[i], bottom[(i + 1) % bottom.length]);
  const g = new THREE.BufferGeometry(); g.setIndex(ids); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(tex, 2)); g.setAttribute('uv1', new THREE.Float32BufferAttribute(chart, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.computeVertexNormals(); return g;
}

/** A separate ticking bag with a flattened bearing patch and a real pressed
 * knife edge. An envelope cuff consumes cloth on one end, the ears pull towards
 * the filling; the lower half doesn't mirror a floating, inflated upper half. */
export function casedPillow(w: number, d: number, h: number, use: 'bed' | 'lumbar' | 'floor', used: boolean) {
  const us = [-1, -.82, -.56, -.25, .06, .33, .62, .69, .76, 1], vs = [-1, -.79, -.45, -.11, .24, .58, .80, 1];
  const g = sheet(us, vs, (u, v, under) => {
    const a = Math.abs(u), b = Math.abs(v), brim = 1 - Math.max(a, b) ** 3;
    const crown = Math.sqrt(Math.max(0, (1 - u * u) * (1 - v * v)));
    const ear = a ** 3 * b ** 3, dart = bump(a - .74, b - (.65 + .18 * u), .103, .30);
    const cuff = bump(u - .69, 0, .04, 5) * brim;
    const nx = u * w * .5 * (1 - .083 * b * b + .090 * ear) + (used ? .008 * v * (1 - a) : 0);
    const nz = v * d * .5 * (1 - .118 * a * a + .052 * ear) + .014 * u * b * (used ? 1 : .38);
    const edge = (use === 'bed' ? -.22 : -.05) + .10 * u * v + (use === 'floor' ? .02 : .075) * ear;
    const land = use === 'bed' ? -.49 : -.47;
    const head = used ? .105 * bump(u - .22, v - .24, .31, .39) : .034 * bump(u, v, .5, .49);
    const ny = under ? Math.max(land, edge - .034 - .48 * crown) : edge + (use === 'bed' ? .78 : .62) * crown - .12 * dart - .039 * cuff - head;
    return [nx, h * ny, nz];
  });
  const color: number[] = [], uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i) * 2 - 1, v = uv.getY(i) * 2 - 1;
    const shade = Math.abs(u - .69) < .015 ? .86 : u > .7 ? .95 : Math.abs(u) === 1 || Math.abs(v) === 1 ? .89 : 1; color.push(shade, shade, shade); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3)); return measuredSheet(g, w, d);
}

/** A thick, folded lap blanket hooked over the long cushion, away from the
 * seated eye. Follow the real toe and return inwards, with an uneven folded end. */
export function chaiseThrow(w: number, pad: THREE.BufferGeometry) {
  const top = pad.getAttribute('position'), index = pad.index!;
  const heightAt = (x: number, z: number) => {
    // Only the small, upward crown grid is needed (not a ray against the room).
    for (let t = 0; t < (cols.length - 1) * (rows.length - 1) * 6; t += 3) {
      const a = index.getX(t), b = index.getX(t + 1), c = index.getX(t + 2);
      const ax = top.getX(a), az = top.getZ(a), bx = top.getX(b) - ax, bz = top.getZ(b) - az;
      const cx = top.getX(c) - ax, cz = top.getZ(c) - az, det = bx * cz - bz * cx;
      const wb = ((x - ax) * cz - (z - az) * cx) / det, wc = (bx * (z - az) - bz * (x - ax)) / det;
      if (wb >= -.00001 && wc >= -.00001 && wb + wc < 1.00001) return top.getY(a) * (1 - wb - wc) + top.getY(b) * wb + top.getY(c) * wc;
    }
    return .055;
  };
  const us = [-1, -.82, -.53, -.26, .03, .32, .57, .83, 1], vs = [-1, -.83, -.54, -.40, -.33, -.12, .2, .52, .82, 1];
  return measuredSheet(sheet(us, vs, (u, v, under) => {
    const s = (v + 1) / 2, x = (u - .05) * w * .45, hem = .044 * u + .024 * Math.sin(4.7 * u);
    // Local origin is the chaise centre. At the toe the bound fringe hangs
    // vertically against the upholstered nose; it does not intersect the floor.
    const along = Math.max(0, (s - .30) / .70), drop = Math.max(0, (.30 - s) / .30);
    let j = 0; while (j + 2 < cols.length && top.getX(j + 1) < x) j++;
    const cut = (x - top.getX(j)) / (top.getX(j + 1) - top.getX(j));
    const toe = top.getZ(j) + cut * (top.getZ(j + 1) - top.getZ(j));
    const z = toe + (.55 + hem) * along;
    const fold = .017 * bump(u + .42, v - .36 * u, .24, .86) + .013 * bump(u - .37, v - .22, .12, .87);
    return [x, heightAt(x, z) + .0017 + (under ? 0 : .008 + fold) - (.142 + .021 * u) * drop,
      z - .010 * Math.min(1, drop * 5) - .009 * Math.sin(Math.PI * drop)];
  }), w * .90, .76);
}
