import * as THREE from 'three';
import type { VillaModelBuilder } from './villaModel.js';

export type P3 = [number, number, number];
export type Collar = [number, number, number, number]; // centre and physical radius
export const turn = Math.PI * 2;
export const add3 = (a: P3, b: P3): P3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mix3 = (a: P3, b: P3, t: number): P3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export function stemAtHeight(path: readonly P3[], y: number): P3 {
  const i = path.findIndex(p => p[1] >= y);
  if (i <= 0) return path[i === 0 ? 0 : path.length - 1];
  return mix3(path[i - 1], path[i], (y - path[i - 1][1]) / (path[i][1] - path[i - 1][1]));
}
export const polar = (angle: number, distance: number, y: number): P3 => [Math.cos(angle) * distance, y, Math.sin(angle) * distance];
const unit = (v: P3): P3 => { const n = Math.hypot(...v) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const centre = (ring: P3[]): P3 => ring.reduce<P3>((p, v) => [p[0] + v[0] / ring.length, p[1] + v[1] / ring.length, p[2] + v[2] / ring.length], [0, 0, 0]);
export const collar = (p: P3, r: number): Collar => [...p, r];

type Outline = readonly (readonly [distance: number, halfWidth: number])[];
/** Half-widths along the midrib. The small changes of direction are in the actual margin. */
export const margin = {
  oval: [[.26, .76], [.62, 1], [.85, .57]], lance: [[.30, .85], [.64, 1]],
  ovate: [[.18, .88], [.47, 1], [.74, .59]], cherry: [[.22, .8], [.34, .73], [.45, 1], [.56, .78], [.69, .82]],
  petal: [[.22, .4], [.64, .94], [.86, 1], [.97, .62]], strap: [[.29, .92], [.64, 1], [.86, .62]],
  ruffle: [[.14, .58], [.29, .98], [.41, .73], [.58, 1], [.74, .84], [.88, .97]],
  spur: [[.39, 1]], feather: [[.17, .69], [.40, 1], [.7, .83], [.88, .45]],
} as const satisfies Record<string, Outline>;

/** Metre-scale indexed shells. A run of leaves, buds or fibres can be authored
 * in one array rather than allocating and merging a Three geometry per leaflet. */
export class NatureMesh {
  readonly positions: number[] = [];
  readonly indices: number[] = [];
  private readonly shades: number[] = [];
  tone = 1;
  membrane = false; // faces on both sides of a thin leaf, using its material's DoubleSide

  point(p: P3, tone = this.tone): number { this.shades.push(tone); return this.positions.push(...p) / 3 - 1; }
  tri(a: number, b: number, c: number) { this.indices.push(a, b, c); }
  /** Rings counterclockwise looking back along the growth axis. A pole is one
   * vertex, not a ring of coincident vertices and zero-area triangles. */
  skin(rings: P3[][], color?: (ring: number, around: number) => number) {
    let prev: number[] = [];
    rings.forEach((ring, ri) => {
      const next = ring.map((p, j) => this.point(p, color ? this.tone * color(ri, j) : this.tone));
      if (prev.length === 1) for (let j = 0; j < next.length; j++) this.tri(prev[0], next[(j + 1) % next.length], next[j]);
      else if (next.length === 1) for (let j = 0; j < prev.length; j++) this.tri(prev[j], prev[(j + 1) % prev.length], next[0]);
      else for (let j = 0; j < prev.length; j++) {
        const k = (j + 1) % prev.length; this.tri(prev[j], prev[k], next[j]); this.tri(prev[k], next[k], next[j]);
      }
      prev = next;
    });
  }
  /** Tapered, bent branch/rod with collars in the local normal planes. */
  stem(path: Collar[], sides = 6, flute = 0, phase = 0, rooted = false) {
    const start = path[0], end = path[path.length - 1];
    const axis = unit([end[0] - start[0], end[1] - start[1], end[2] - start[2]]);
    const ref: P3 = Math.abs(axis[2]) > .85 ? [1, 0, 0] : [0, 0, 1];
    const rings = path.map((p, i) => {
      if (p[3] === 0) return [[p[0], p[1], p[2]] as P3];
      const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      const tangent = unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      const u = unit(cross(ref, tangent)), v = cross(tangent, u);
      return Array.from({ length: sides }, (_, j): P3 => {
        const t = j * turn / sides + phase, r = p[3] * (1 + flute * Math.cos(3 * t + i * .24) + flute * .51 * Math.sin(5 * t - i * .19));
        const x = Math.cos(t) * r, y = Math.sin(t) * r;
        return [p[0] + u[0] * x + v[0] * y, p[1] + u[1] * x + v[1] * y, p[2] + u[2] * x + v[2] * y];
      });
    });
    this.skin([...(rooted ? [] : [[centre(rings[0])]]), ...rings, ...(end[3] === 0 ? [] : [[centre(rings[rings.length - 1])]])]);
  }
  /** An actual closed blade: the upper keel rises, margins roll and twist, the
   * underside returns through a shallower second rib. No cards, alpha or sprites. */
  blade(base: P3, vector: P3, halfWidth: number, outline: Outline = margin.lance, bow = 0, roll = 0, cup = .18, sweep = 0, facing?: P3) {
    const axis = unit(vector), ux = unit(facing ? cross(facing, axis) : Math.abs(axis[1]) < .999 ? [axis[2], 0, -axis[0]] : [1, 0, 0]);
    const uy = cross(axis, ux);
    const rings = outline.map(([t, w]) => {
      const a = roll * (.38 + .62 * t), co = Math.cos(a), si = Math.sin(a), arc = Math.sin(t * Math.PI);
      const row = (side: number, height: number): P3 => {
        const x = side * halfWidth * w + sweep * arc, y = height * halfWidth * w + bow * arc;
        return [base[0] + vector[0] * t + ux[0] * (x * co - y * si) + uy[0] * (x * si + y * co),
          base[1] + vector[1] * t + ux[1] * (x * co - y * si) + uy[1] * (x * si + y * co),
          base[2] + vector[2] * t + ux[2] * (x * co - y * si) + uy[2] * (x * si + y * co)];
      };
      return [row(1, cup), row(0, .09), row(-1, cup), row(0, -.10)];
    });
    if (this.membrane) {
      // Thin plant tissue has two lit sides but only one skin. Keep the raised
      // midrib, longitudinal bend and rolled margins; do not double its fill.
      const rib = this.point(rings[(rings.length - 1) >> 1][1], this.tone * 1.055);
      const boundary = [this.point(base), ...rings.map(r => this.point(r[2])), this.point(add3(base, vector)), ...rings.map(r => this.point(r[0])).reverse()];
      for (let i = 0; i < boundary.length; i++) this.tri(rib, boundary[i], boundary[(i + 1) % boundary.length]);
      return;
    }
    this.skin([[base], ...rings, [add3(base, vector)]], (_r, j) => j === 1 ? 1.055 : j === 3 ? .88 : 1);
  }
  /** Around +Y; sections can have different local axes, lobes or slit lips. */
  round(profile: readonly (readonly [height: number, radius: number])[], sides: number,
    place: (x: number, y: number, z: number, angle: number, row: number) => P3 = (x, y, z) => [x, y, z]) {
    this.skin(profile.map(([y, r], i) => r === 0 ? [place(0, y, 0, 0, i)] : Array.from({ length: sides }, (_, j) => {
      const a = -turn * j / sides; return place(r * Math.cos(a), y, r * Math.sin(a), a, i);
    })));
  }
  geometry(shaded = false) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3)); g.setIndex(this.indices);
    if (shaded) g.setAttribute('color', new THREE.Float32BufferAttribute(this.shades.flatMap(s => [s, s, s]), 3));
    g.computeVertexNormals(); return g;
  }
}

/** Collect by physical finish. BufferGeometry is made only at the object's final
 * scale; the game's existing per-material batches still own all final meshes. */
export class NaturePalette {
  private surfaces = new Map<THREE.Material, NatureMesh>();
  get(material: THREE.Material): NatureMesh {
    let mesh = this.surfaces.get(material); if (!mesh) { mesh = new NatureMesh(); mesh.membrane = material.side === THREE.DoubleSide; this.surfaces.set(material, mesh); } return mesh;
  }
  finish(b: VillaModelBuilder, scale = 1) {
    for (const [material, mesh] of this.surfaces) {
      if (!mesh.indices.length) continue;
      const g = mesh.geometry((material as THREE.MeshStandardMaterial).vertexColors); g.scale(scale, scale, scale); b.geometry(g, material);
    }
  }
}

/** Broken bedding planes/shoulders and off-centre crowns, not scaled copies of
 * a regular polyhedron. Facets retain the cut faces of weathered stone. */
export function fieldStone(seed: number, sx: number, sy: number, sz: number) {
  const m = new NatureMesh(), variant = Math.floor(Math.abs(seed * 3));
  const sides = Math.max(sx, sz) < .16 ? 5 + variant % 2 : 6 + variant % 3;
  const rim = Array.from({ length: sides }, (_, i) => {
    const a = turn * (i + .12 * Math.sin(i * 3.2 + seed)) / sides;
    return polar(a, .86 + .15 * Math.sin(i * 4.8 + seed * 1.7), 0);
  });
  const rings = [[-.55, .68, -.09], [-.18, 1, -.02], [.49, .88, .06], [.84, .51, .17]];
  m.skin([[[-sx * .08, -sy * .58, 0]], ...rings.map(([y, size, shift], k) => rim.map(([x, , z], i): P3 => [sx * (x * size + shift),
    sy * (y + .15 * x + .12 * Math.sin(seed + i * 2.3 + k * .69)), sz * (z * size + shift * .42)]).reverse()), [[sx * .21, sy * .94, sz * .05]]]);
  const g = m.geometry(), faceted = g.toNonIndexed(); g.dispose(); faceted.computeVertexNormals(); return faceted;
}
