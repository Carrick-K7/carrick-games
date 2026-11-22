import * as THREE from 'three';
import type { VillaModelBuilder } from './villaModel.js';
import { villaTerrainGroundHeight } from './villaEstateLayout.js';
import { RiparianMesh, addGrit, drift, earthFinish, mix, riparianSeed, smooth, type XZ } from './villaRiparianGround.js';

const fines = new THREE.Color('#b7aa91'), crushed = new THREE.Color('#a29989'), earth = new THREE.Color('#817761');
const quartz = new THREE.Color('#ccc2aa'), flint = new THREE.Color('#817d74');
const across = [-1, -.78, -.24, .29, .79, 1];
/** Metre-UV walking surface plus separate, partially buried crushed mineral.
 * The skin fits BELOW the driving ribbon's shoulder where a path meets a road.
 * The linked centre stations, bridge footprint and traversable ground stay put. */
export class RiparianTrail {
  private readonly surface = new RiparianMesh(); private readonly chips = new RiparianMesh();
  private readonly random: () => number;
  constructor(private readonly name: string, seed: number, private readonly density: number) { this.random = riparianSeed(seed); }
  private corner(x: number, z: number, edge: number, lift: number) {
    const wear = drift(x * .68, z * .45), n = drift(x * 2.9, z * 2.63), verge = smooth((edge - .56) / .44);
    // Relative reflectance, not a second buff pigment on top of a buff scan.
    const c = fines.clone().lerp(crushed, .12 + .65 * wear).lerp(earth, verge * (.51 + .40 * n));
    c.setRGB(c.r / fines.r, c.g / fines.g, c.b / fines.b).multiplyScalar(.99 + .14 * n);
    return this.surface.vertex(x, villaTerrainGroundHeight(x, z) + lift, z, c);
  }
  // Sample the actual triangular walking surface, including bedded edges on
  // slopes. No grit centre can wander onto a ramp beyond its end station.
  private face(a: number, b: number, c: number, edge: boolean, landing?: XZ & { radius: number }) {
    const p = this.surface.positions, x = p[a * 3], y = p[a * 3 + 1], z = p[a * 3 + 2], bx = p[b * 3] - x, bz = p[b * 3 + 2] - z, cx = p[c * 3] - x, cz = p[c * 3 + 2] - z;
    // Stop under the landing's perimeter, not on a second surface extending
    // through its centre. The landing covers the original end/link station.
    if (landing && [a,b,c].every(k => Math.hypot(p[k * 3] - landing.x, p[k * 3 + 2] - landing.z) < landing.radius - .20)) return;
    this.surface.tri(a, b, c);
    const count = this.density * Math.abs(bx * cz - bz * cx) * .5 * (edge ? 1.7 : .83), n = Math.floor(count + this.random());
    for (let i = 0; i < n; i++) {
      let u = this.random(), v = this.random(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const px = x + u * bx + v * cx, pz = z + u * bz + v * cz;
      if (landing && Math.hypot(px - landing.x, pz - landing.z) < landing.radius + .17) continue;
      const radius = (.005 + .013 * this.random() ** 1.4) * (edge ? 1.10 : .91), g = quartz.clone().lerp(flint, this.random() * .94);
      addGrit(this.chips, px, pz, y + u * (p[b * 3 + 1] - y) + v * (p[c * 3 + 1] - y), radius, this.random() * Math.PI * 2, g, this.random);
    }
  }
  path(knots: readonly XZ[], width: number | ((p: XZ) => number), pinEnds = false, landing?: XZ & { radius: number }) {
    const first = knots[0], last = knots[knots.length - 1], closed = Math.hypot(first.x - last.x, first.z - last.z) < .001;
    const centres: XZ[] = [first];
    for (let i = 1; i < knots.length; i++) {
      const a = knots[i - 1], b = knots[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .52));
      for (let j = 1; j <= n; j++) centres.push({ x: mix(a.x, b.x, j / n), z: mix(a.z, b.z, j / n) });
    }
    let prev: number[] = [];
    centres.forEach((p, i) => {
      const a = centres[i ? i - 1 : closed ? centres.length - 2 : 0], b = centres[i + 1] ?? (closed ? centres[1] : p);
      const dx = b.x - a.x, dz = b.z - a.z, run = Math.hypot(dx, dz) || 1, half = (typeof width === 'number' ? width : width(p)) / 2;
      const r = pinEnds ? Math.min(1, i / 3, (centres.length - 1 - i) / 3) : 1, row = across.map(s => {
        const fray = (drift(p.x * .92 + s * 7, p.z * 1.27) - .46) * .24 + (drift(p.x * 3.1, p.z * 4.1 + s * 13) - .5) * .11;
        const edge = Math.abs(s), offset = s * half + Math.sign(s) * edge ** 3 * fray * r, x = p.x + dz / run * offset, z = p.z - dx / run * offset;
        return this.corner(x, z, edge, .013 - edge ** 4 * .023 - (1 - r) * .004);
      });
      if (i) for (let k = 0; k + 1 < row.length; k++) {
        const edge = k === 0 || k === row.length - 2;
        this.face(prev[k], row[k], prev[k + 1], edge, landing); this.face(prev[k + 1], row[k], row[k + 1], edge, landing);
      }
      prev = row;
    });
  }
  landing(p: XZ, radius: number) {
    const n = 54, mid = this.corner(p.x, p.z, 0, .019); let prev: number[] = [];
    for (const t of [.22, .46, .70, .87, 1]) {
      const row = Array.from({ length: n }, (_, j) => {
        const a = j / n * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a), d = t * radius + t ** 4 * .32 * (drift(p.x + dx * radius, p.z + dz * radius) - .5);
        return this.corner(p.x + dx * d, p.z + dz * d, t, .019 - t ** 8 * .026);
      });
      for (let j = 0; j < n; j++) {
        const k = (j + 1) % n;
        if (!prev.length) this.face(mid, row[k], row[j], false);
        else { this.face(prev[j], prev[k], row[j], t === 1); this.face(row[j], prev[k], row[k], t === 1); }
      }
      prev = row;
    }
  }
  finish(model: VillaModelBuilder) {
    const compacted = earthFinish(this.name); compacted.color.copy(fines);
    model.geometry(this.surface.geometry(true), compacted);
    model.geometry(this.chips.geometry(), earthFinish(`${this.name}/loose-stone`, .89));
  }
}
