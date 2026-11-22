import * as THREE from 'three';

// Metre-space coherent variation, sampled ONCE when laying down the geometry.
export const saturate = (v: number) => Math.min(1, Math.max(0, v));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (x: number) => { const t = saturate(x); return t * t * (3 - 2 * t); };
export function riparianSeed(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function grain(x: number, z: number) {
  let h = Math.imul(x, 0x1f1f1f1f) ^ Math.imul(z, 0x343fd) ^ 0x3c6ef35f;
  h = Math.imul(h ^ h >>> 15, 0x85ebca6b); return ((h ^ h >>> 13) >>> 0) / 4294967296;
}
export function drift(x: number, z: number) {
  const a = Math.floor(x), b = Math.floor(z), u = smooth(x - a), v = smooth(z - b);
  return mix(mix(grain(a, b), grain(a + 1, b), u), mix(grain(a, b + 1), grain(a + 1, b + 1), u), v);
}
export type GroundHeight = (x: number, z: number) => number;
export type XZ = { x: number; z: number };

/** Static indexed RGB geometry. metre UVs are shared across separately batched
 * deposits and path sections; a finish can never restart at a bend in the walk. */
export class RiparianMesh {
  readonly positions: number[] = [];
  readonly colors: number[] = [];
  readonly indices: number[] = [];
  vertex(x: number, y: number, z: number, c: THREE.Color, shade = 1) {
    this.colors.push(c.r * shade, c.g * shade, c.b * shade); return this.positions.push(x, y, z) / 3 - 1;
  }
  tri(a: number, b: number, c: number) { this.indices.push(a, b, c); }
  geometry(metreUV = false) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3)); g.setIndex(this.indices);
    if (metreUV) {
      const uv: number[] = []; for (let i = 0; i < this.positions.length; i += 3) uv.push(this.positions[i], this.positions[i + 2]);
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    }
    g.computeVertexNormals(); return g;
  }
}
export function earthFinish(name: string, roughness = .96) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness, vertexColors: true }); m.name = name; return m;
}

const sand = new THREE.Color('#b09672'), shingle = new THREE.Color('#8d8270'), loam = new THREE.Color('#655444');
const moss = new THREE.Color('#667949'), humus = new THREE.Color('#4c5937'), mud = new THREE.Color('#463d33'), silt = new THREE.Color('#606651');
/** Compare the actual soil elevation to the level water. Exposed scour fans
 * retain sandy tongues while the higher, rooted side of a bank greens over. */
export function sediment(x: number, y: number, z: number, level: number, turf: number, deposit = 0) {
  const bars = drift(x * .40, z * .54), grit = drift(x * 2.2 + 11, z * 1.7), h = y - level;
  const soil = sand.clone().lerp(shingle, saturate(grit * .65 + .34 - bars * .44)).lerp(loam, smooth(1 - bars * 1.35) * .48);
  const waterlogged = mud.clone().lerp(sand, saturate(.03 + bars * .40 + deposit * .34));
  if (h < 0) soil.copy(waterlogged).lerp(silt, smooth(-h * 3)).lerp(shingle, bars * grit * .38 + deposit * .23);
  else soil.lerp(waterlogged, 1 - smooth((h - .013 - .018 * bars) / (.026 + .047 * grit)));
  // Wet soil runs up a scour rather than forming a painted tide stripe.
  return soil.lerp(humus, turf * smooth(.91 - bars)).lerp(moss, turf * (.48 + .50 * grit)).multiplyScalar(.91 + .14 * grit);
}

/** A few angular pieces rise out of the fines. The uneven rim intersects the
 * ground on every side, leaving no dark gap under the chip. Four or five lit
 * faces are enough for a 10–35mm piece, even at a crouch. */
export function addGrit(m: RiparianMesh, x: number, z: number, y: number, radius: number, yaw: number, c: THREE.Color, random: () => number) {
  const n = random() < .72 ? 4 : 5, aspect = .48 + random() * .44, cx = Math.cos(yaw), cz = Math.sin(yaw);
  const top = m.vertex(x + cx * radius * .19, y + radius * (.23 + random() * .35), z + cz * radius * .19, c, 1.09);
  let first = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const a = (i + .24 * (random() - .5)) / n * Math.PI * 2, u = Math.cos(a) * radius * (.82 + .19 * random()), v = Math.sin(a) * radius * aspect;
    const k = m.vertex(x + cx * u - cz * v, y - radius * .067, z + cz * u + cx * v, c, .85 + .14 * random());
    if (i) m.tri(top, k, last); else first = k; last = k;
  }
  m.tri(top, first, last);
}
