import * as THREE from 'three';
import type { VillaModelBuilder } from './villaModel.js';
import { NatureMesh, turn, type Collar, type P3 } from './villaNatureGeometry.js';

export type UV = readonly [number, number];
type Field<T> = (x: number, y: number, z: number, i: number) => T;
export type Pigment = number | Field<number>;
export const clamp = (v: number) => Math.max(0, Math.min(1, v));
export const fade = (v: number, lo: number, hi: number) => THREE.MathUtils.smoothstep(v, lo, hi);
export function tint(a: number, b: number, t: number) {
  t = clamp(t);
  const ch = (s: number) => Math.round((1 - t) * ((a >> s) & 255) + t * ((b >> s) & 255));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
export const noise = (i: number) => { const n = Math.sin(i * 17.133 + 5.783) * 4063.27; return n - Math.floor(n); };
const W = 256, H = 128;
export const fibreUV = (around: number, along: number): UV => [(4 + 118 * clamp(around)) / W, (4 + 119 * clamp(along)) / H];
export const vaneUV = (across: number, along: number): UV => [(135 + 116 * clamp(across)) / W, (3 + 104 * clamp(along)) / H];
const dry: UV = [146 / W, 120 / H], irisGlaze: UV = [181 / W, 120 / H], wet: UV = [227 / W, 120 / H];
export const wetKeratin = () => wet;

/** One local, mip-filtered multiplier for all six rigs, generated at construction. No
 * images, canvases, shader loops, per-frame writes or extra draws. The dry/wet swatches
 * also let the same standard material distinguish matte hair from the eye and nose. */
export function companionMaterial() {
  const data = new Uint8Array(W * H * 4).fill(255);
  const set = (x: number, y: number, value: number) => { const i = (y * W + x) * 4; data[i] = data[i + 1] = data[i + 2] = Math.max(0, Math.min(255, Math.round(value))); };
  const get = (x: number, y: number) => data[(y * W + x) * 4];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x < 128) set(x, y, 224 + 6 * Math.sin(.23 * x + .055 * y + Math.sin(.08 * y)) + 4 * Math.sin(x * .78 + y * .045));
    else if (y < 111) {
      // Barbs converge into an off-white rachis, not a rod laid over the vane.
      const u = (x - 193) / 58, s = Math.abs(u), wave = y * .87 - 15 * s - 2.1 * Math.sin(y * .073 + u * 2) + .7 * Math.sin(y * .19 + u * 6);
      const barb = (9 * Math.sin(wave) + 4 * Math.sin(wave * 2.13 + u)) * Math.min(1, s * 11);
      set(x, y, 227 - 10 * s + barb + 16 * Math.exp(-((u / .028) ** 2)) - (u < 0 ? 13 * Math.exp(-((u / .13) ** 2)) : 0));
    } else if (x > 201) set(x, y, 94); // polished pupil and nasal leather
    else if (x > 165) set(x, y, 175); // lighter iris remains legible beneath the lid
  }
  // Groups of differently pigmented, curved guard hairs. Fibre width is sub-texel
  // at the tips; this is correlated in the direction of growth, not pixel noise.
  for (let i = 0; i < 1420; i++) {
    const x0 = noise(i + 7) * 134 - 3, y0 = noise(i + 1513) * 146 - 15;
    const length = 3 + 10 * noise(i + 3133), width = .34 + noise(i + 4591) * .67;
    const lean = .12 + .18 * Math.sin(x0 * .079 + y0 * .032) + .12 * (noise(i + 6143) - .5);
    const pigment = i % 5 < 2 ? 166 + noise(i + 7211) * 37 : 238 + noise(i + 7211) * 17;
    for (let y = Math.max(0, Math.ceil(y0)); y <= Math.min(127, y0 + length); y++) {
      const t = (y - y0) / length, centre = x0 + t * length * lean + .55 * Math.sin(t * Math.PI);
      for (let x = Math.max(0, Math.floor(centre - 1)); x <= Math.min(127, centre + 1.5); x++) {
        const coverage = clamp(.70 + width * (1 - .82 * t) - Math.abs(x + .5 - centre)) * (.34 + .53 * Math.sin(Math.PI * t));
        set(x, y, get(x, y) + (pigment - get(x, y)) * coverage);
      }
    }
  }
  const map = new THREE.DataTexture(data, W, H, THREE.RGBAFormat); map.name = 'villa-companion/fibre-vane-keratin';
  map.colorSpace = THREE.NoColorSpace; map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter; map.magFilter = THREE.LinearFilter; map.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ name: 'villa-companion/coat', vertexColors: true, map, roughnessMap: map, roughness: .99, metalness: 0 });
}

/** All additions go through the existing single rigid/morphed part batch. */
export class Surface {
  constructor(readonly b: VillaModelBuilder, readonly material: THREE.Material) {}
  put(g: THREE.BufferGeometry, pigment: Pigment, projection?: Field<UV>, offset: P3 = [0, 0, 0], rotation: P3 = [0, 0, 0]) {
    const p = g.getAttribute('position'), color = new Float32Array(p.count * 3), uv = new Float32Array(p.count * 2), rgb = new THREE.Color();
    if (typeof pigment === 'number') rgb.setHex(pigment);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (typeof pigment !== 'number') rgb.setHex(pigment(x, y, z, i));
      rgb.toArray(color, i * 3); uv.set(projection ? projection(x, y, z, i) : dry, i * 2);
    }
    g.setAttribute('color', new THREE.BufferAttribute(color, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.b.geometry(g, this.material, offset, rotation);
  }
  cord(color: Pigment, path: Collar[], sides = 5, uv?: Field<UV>) {
    const mesh = new NatureMesh(); mesh.stem(path, sides); this.put(mesh.geometry(), color, uv);
  }
}

export type Section = readonly [z: number, centreY: number, halfWidth: number, halfHeight: number];
export type Sections = readonly Section[];
export function section(rows: Sections, z: number): Section {
  let j = 1; while (j < rows.length - 1 && z > rows[j][0]) j++;
  const a = rows[j - 1], b = rows[j], t = clamp((z - a[0]) / (b[0] - a[0]));
  return [z, a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2]), a[3] + t * (b[3] - a[3])];
}
export type PointOnHide = (z: number, angleFromSpine: number) => P3;
export const hide = (rows: Sections): PointOnHide => (z, a) => {
  const [, y, w, h] = section(rows, z); return [w * Math.sin(a), y + h * Math.cos(a), z];
};
export function form(rows: Sections, sides = 14, deform: (x: number, y: number, z: number) => P3 = (x, y, z) => [x, y, z]) {
  const skin = new NatureMesh(); skin.skin(rows.map(([z, y, rx, ry]) => !rx ? [deform(0, y, z)] : Array.from({ length: sides }, (_, i) => {
    const a = turn * i / sides; return deform(rx * Math.cos(a), y + ry * Math.sin(a), z);
  })));
  return skin.geometry();
}
/** Anatomical sections can sweep forward at the brow and back at the jaw. A
 * lock samples the submitted triangle on that loft, not an ellipsoid outside
 * it. Rings start at the spine and wind toward -X looking back from the nose. */
export function drapedHide(stations: readonly number[], rings: P3[][]) {
  const mesh = new NatureMesh(); mesh.skin(rings);
  const sides = rings[1].length;
  const at: PointOnHide = (z, angle) => {
    let i = 1; while (i < stations.length - 1 && z > stations[i]) i++;
    const v = clamp((z - stations[i - 1]) / (stations[i] - stations[i - 1]));
    const a = ((-angle / turn) % 1 + 1) % 1 * sides, j = Math.floor(a), k = (j + 1) % sides, u = a - j;
    const back = rings[i-1], front = rings[i];
    const p = back[j % back.length], q = back[k % back.length], r = front[j % front.length], s = front[k % front.length];
    const axis = (n: number) => u + v <= 1 ? p[n] + u*(q[n]-p[n]) + v*(r[n]-p[n]) : s[n] + (1-u)*(r[n]-s[n]) + (1-v)*(q[n]-s[n]);
    return [axis(0), axis(1), axis(2)];
  };
  return { geometry: mesh.geometry(), at };
}

/** Fit eyelids and lips to the actual sculpted side of the face. Project onto
 * the outermost triangle in the YZ section; offset along its interpolated skin
 * normal, including the forward-facing component of a brow or muzzle. */
export function faceOf(g: THREE.BufferGeometry) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), index = g.index!;
  type Facet = Record<'ia'|'ib'|'ic'|'y'|'z'|'by'|'bz'|'cy'|'cz'|'det', number>;
  const facets: Facet[] = [];
  for (let i=0; i<index.count; i+=3) {
    const ia=index.getX(i), ib=index.getX(i+1), ic=index.getX(i+2);
    if (p.getX(ia)+p.getX(ib)+p.getX(ic) <= 0) continue;
    const y=p.getY(ia), z=p.getZ(ia), by=p.getY(ib)-y, bz=p.getZ(ib)-z, cy=p.getY(ic)-y, cz=p.getZ(ic)-z, det=by*cz-bz*cy;
    if (det > 1e-10) facets.push({ia,ib,ic,y,z,by,bz,cy,cz,det});
  }
  return (side: number, z: number, y: number, lift: number): P3 => {
    let x=0, nx=1, ny=0, nz=0;
    for (const f of facets) {
      const dy=y-f.y, dz=z-f.z, b=(dy*f.cz-dz*f.cy)/f.det, c=(f.by*dz-f.bz*dy)/f.det, a=1-b-c;
      if (a < -1e-6 || b < -1e-6 || c < -1e-6) continue;
      const depth=a*p.getX(f.ia)+b*p.getX(f.ib)+c*p.getX(f.ic);
      if (depth < x) continue;
      x=depth; nx=a*n.getX(f.ia)+b*n.getX(f.ib)+c*n.getX(f.ic);
      ny=a*n.getY(f.ia)+b*n.getY(f.ib)+c*n.getY(f.ic); nz=a*n.getZ(f.ia)+b*n.getZ(f.ib)+c*n.getZ(f.ic);
    }
    const d=lift/(Math.hypot(nx,ny,nz)||1);
    return [side*(x+nx*d), y+ny*d, z+nz*d];
  };
}

export function axialFur(rows: Sections): Field<UV> {
  return (x, y, z) => {
    const [, cy, w, h] = section(rows, z), a = Math.atan2(Math.abs(x) / (w || 1), (y - cy) / (h || 1)) / Math.PI;
    const v = (rows[rows.length - 1][0] - z) / (rows[rows.length - 1][0] - rows[0][0]);
    return fibreUV(.06 + .86 * a - .11 * Math.sin(v * Math.PI), .06 + .86 * v + .035 * Math.sin(a * 4 + Math.sign(x)));
  };
}

/** One almond of skin/lid/iris/pupil fitted directly to the sloping face. z and y
 * trace the real hide, so a sideways rabbit eye isn't a sphere glued to a cheek. */
export function eyelids(c: Surface, side: number, face: (z: number, y: number, lift: number) => P3, z0: number, y0: number,
  halfZ: number, halfY: number, coat: number, iris: number, pupilWidth: number, slope = 0, lowerIris?: number) {
  const m = new NatureMesh(), colors: number[] = [], glaze: UV[] = [], n = 14;
  const rim = (w: number, h: number, depth: number, kind: 'skin' | 'lid' | 'iris' | 'pupil') => Array.from({ length: n }, (_, j) => {
    const a = -side * turn * j / n, u = Math.cos(a), v = Math.sin(a), almond = kind === 'pupil' ? 1 : .71 + .29 * Math.abs(v);
    // Warmer iris visible below a mammal's upper lid, not a fixed white
    // catchlight. The actual corneal dome still responds to the scene light.
    const lower=lowerIris===undefined ? iris : tint(iris,lowerIris,.88*fade(-v,.08,.85));
    const color = kind === 'skin' ? coat : kind === 'lid' ? tint(0x443d38, 0x9b8974, Math.max(0,-v)*.66) : kind === 'iris' ? tint(lower, 0x464238, .32*Math.max(0,v)) : 0x312e2b;
    colors.push(color); glaze.push(kind === 'pupil' ? wet : kind === 'iris' ? irisGlaze : dry);
    const pupilY=kind==='pupil' && lowerIris!==undefined ? .105 : 0;
    return face(z0 + halfZ * w * u, y0 + halfY * (h * v * almond - slope * u * w + pupilY), depth);
  });
  const rings = [rim(1.18, 1.28, -.0023, 'skin'), rim(1, 1, .0008, 'lid'), rim(.89, .81, .0022, 'iris'), rim(pupilWidth, .54, .0037, 'pupil')];
  colors.push(0x2a2928); glaze.push(wet); m.skin([...rings, [face(z0, y0+(lowerIris===undefined?0:.105*halfY), .0046)]]);
  c.put(m.geometry(), (_x, _y, _z, i) => colors[i], (_x, _y, _z, i) => glaze[i]);
}

/** Short undercut locks, confined to the specified coat tract. Roots and both
 * tips sample the same moving hide; normals follow the hide, not a flat spike. */
export type Tract = readonly [fromZ: number, toZ: number, angle: number, fall: number, count: number, length: number];
export function coatLocks(c: Surface, sample: PointOnHide, pigment: Field<number>, tracts: readonly Tract[], seed: number) {
  const m = new NatureMesh(), tones: number[] = [], normals: number[] = [], uvs: UV[] = [];
  let item = seed;
  for (const side of [-1, 1]) for (const [from, to, a0, fall, count, length] of tracts) for (let j = 0; j < count; j++, item++) {
    const t = (j + .22 + .55 * noise(item)) / count, z = from + (to - from) * t;
    const a = side * (a0 + .21 * (noise(item + 13) - .5)), l = length * (.71 + .58 * noise(item + 29));
    const width = .025 + .032 * noise(item + 41), lift = .0022 + .0021 * noise(item + 997);
    const point = (along: number, across: number, height: number) => {
      const s = z - l * along, ang = a + side * (.112 * along * fall + across * width), p = sample(s, ang);
      const dz = new THREE.Vector3(...sample(s + .0002, ang)).sub(new THREE.Vector3(...sample(s - .0002, ang)));
      const da = new THREE.Vector3(...sample(s, ang + .004)).sub(new THREE.Vector3(...sample(s, ang - .004)));
      const normal = dz.cross(da).normalize(); normals.push(normal.x, normal.y, normal.z);
      const base = pigment(...p, 0); tones.push(tint(base, along > .65 ? 0xc2b29b : 0x53483f, along > .65 ? .07 : .04));
      uvs.push(fibreUV(.26 + across * .015, .35 + along * .06));
      return m.point([p[0] + height * normal.x, p[1] + height * normal.y, p[2] + height * normal.z]);
    };
    const a1 = point(0, -1, -.0038), a2 = point(.03, 1, -.0038), b1 = point(.54, -.85, .0015), b2 = point(.52, .67, .0016),
      t1 = point(1, -.40, lift), t2 = point(.82 + .14 * noise(item + 71), .46, .75 * lift);
    for (const [i, k, h] of [[a1, a2, b1], [b1, a2, b2], [b1, b2, t1], [t1, b2, t2]]) { if (side > 0) m.tri(i, k, h); else m.tri(h, k, i); }
  }
  const g = m.geometry(); g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  c.put(g, (_x, _y, _z, i) => tones[i], (_x, _y, _z, i) => uvs[i]);
}
