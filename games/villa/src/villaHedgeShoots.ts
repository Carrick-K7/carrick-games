import * as THREE from 'three';
import { NatureMesh, mix3, type P3 } from './villaNatureGeometry.js';

export type LeafKind = 'privet' | 'hornbeam';
const SIZE = 256, GUTTER = 16, CELL = 48, ROW = SIZE / 2;
const POT = GUTTER + 4 * CELL;
export const potLeafUV = (u: number, v: number, trailing: boolean): [number,number] => [2+(POT+.5+u*(SIZE-POT-1))/SIZE,(Number(trailing)*ROW+.5+v*(ROW-1))/SIZE];
const clamp = (x: number) => Math.max(0, Math.min(1, x));

/** One rank, NOT a picture of a branch or a crown. S runs from the actual
 * shoot axis to a leaf tip, T along the shoot. Opposite privet ranks alternate
 * by a half node; hornbeam has staggered, toothed, pleated leaves in two rows. */
function leafRanks(kind: LeafKind) {
  const data = new Uint8Array(SIZE * SIZE * 4), privet = kind === 'privet';
  for (let i = 0; i < data.length; i += 4) { data[i] = 191; data[i+1] = 219; data[i+2] = 187; }
  for (let y = 0; y < SIZE; y++) data.fill(255, y * SIZE * 4, (y * SIZE + GUTTER) * 4);
  for (let tile = 0; tile < 8; tile++) {
    const col = tile % 4, row = tile >> 2, count = privet ? 5 : 4;
    const ink = (x: number, y: number, r: number, g: number, b: number, a: number) => {
      const i = 4 * ((row * ROW + y) * SIZE + GUTTER + col * CELL + x);
      if (data[i+3] > 255 * a) return;
      data[i] = Math.round(r); data[i+1] = Math.round(g); data[i+2] = Math.round(b); data[i+3] = Math.round(255 * clamp(a));
    };
    // The sappy axis is continuous across the leaf sockets, but the ranks
    // contain no membrane between leaves. Old wood is a separate tapered mesh.
    for (let y = 0; y < ROW; y++) {
      const t = y / ROW;
      for (let x = 0; x < (t < .64 ? 2 : 1); x++) ink(x, y, 198, 180 + 39*t, 139, 1);
    }
    for (let j = 0; j < count; j++) {
      const wave = Math.sin(col * 5.4 + j * 2.9), young = j / (count - 1);
      const foot = .035 + j * (.81 / count) + row * (.405 / count) + .009 * wave;
      const reach = (.81 + .096 * wave) * (1 - .21 * young), rise = .087 + .025 * young + .019 * Math.cos(col + j);
      const span = (privet ? .061 : .081) * (1 - .25 * young) * (1 + .09 * Math.cos(col - j));
      for (let x = 1; x < CELL; x++) {
        const s = ((x + .5) / CELL) / reach; if (s > 1) break;
        const t = clamp((s - .075) / .925), arch = Math.sin(Math.PI * t);
        const mid = foot + rise * s + (.024 + .012 * wave) * arch;
        const tooth = privet ? 1 : 1 - .108 * ((t * 12.5) % 1);
        const belly = span * (1.17 - .36 * t) * arch ** (privet ? .66 : .79) * tooth;
        const w = s < .095 ? .0052 : Math.max(.0023, belly);
        for (let y = Math.max(0, Math.floor((mid-w)*ROW) - 1); y <= Math.min(ROW-1, Math.ceil((mid+w)*ROW)); y++) {
          const d = (y+.5) / ROW - mid, edge = (w - Math.abs(d)) * ROW + .5;
          if (edge <= 0) continue;
          const n = d / w, rib = Math.max(0, 1 - Math.abs(n) * (privet ? 8 : 10));
          const pleat = privet ? 0 : .048 * Math.cos(2 * Math.PI * (t * 8.5 - Math.abs(n) * .61));
          const shine = col * .026 + .055 * young + (n > 0 ? -.062 : .024) + rib * .10 + pleat + .019 * wave;
          // Colours multiply the existing olive/summer-green finishes. The
          // youngest blades warm at the tip; old shaded leaves have a blue cast.
          const tint = privet ? .74 : .85;
          ink(x, y, 255*clamp(tint + shine - .065 + .078*young), 255*clamp(tint + shine + .04), 255*clamp(tint + shine + .080 - .18*young), edge);
        }
      }
    }
  }
  if (privet) {
    // Last column: single geranium blades for the terracotta pots. A kidney-
    // shaped basal sinus, a palmate fan of veins and the dark horseshoe zone.
    for (let y = 0; y < SIZE; y++) for (let x = POT; x < SIZE; x++) {
      const trailing = y >= ROW, dx = ((x-POT+.5)/(SIZE-POT)-.5)*2, dz = ((y%ROW+.5)/ROW-.33);
      const z = dz/(dz < 0 ? .35 : .70), a = Math.atan2(dx,z), r = Math.hypot(dx,z);
      const sinus = Math.exp(-(((Math.PI-Math.abs(a))/.46)**2));
      const lobes = .835 + (trailing ? .130 : .085)*Math.cos(5*a) + .021*Math.cos(13*a);
      const edge = lobes*(1-.77*sinus), alpha = clamp((edge-r)*32+.5); if (!alpha) continue;
      const t = r/edge, veins = Math.max(0,Math.cos(5*a+.21*Math.sin(2.6*t)))**18;
      const zone = Math.exp(-(((t-.65)/.107)**2))*(.56+.44*Math.cos(a));
      const tint = .78 + .082*veins*(1-t) - .23*zone + .08*t + .040*Math.sin(5*a);
      const i = (y*SIZE+x)*4;
      data[i]=Math.round(255*clamp(tint-.10)); data[i+1]=Math.round(255*clamp(tint+.034)); data[i+2]=Math.round(255*clamp(tint+.02+(trailing?.092:0))); data[i+3]=Math.round(255*alpha);
    }
  }
  return data;
}

/** Reuse a scene-owned foliage finish (including its static draw). Ordinary
 * plant UVs, 0..1, clamp to a white opaque selvedge; only the rank UVs, 2..3,
 * access the drawing. Preserve that selvedge at EVERY mip, including 1×1.
 * Weight reduced RGB by leaf coverage so transparent borders never turn black. */
export function prepareShootFinish(material: THREE.MeshStandardMaterial, kind: LeafKind) {
  if (material.map) return;
  const data = leafRanks(kind), texture = new THREE.DataTexture(data, SIZE, SIZE);
  texture.name = `estate-leaves/${kind}-ranks`; texture.colorSpace = THREE.SRGBColorSpace;
  texture.offset.x = -2; texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  const mips = [{ data, width: SIZE, height: SIZE }];
  for (let n = SIZE / 2; n >= 1; n /= 2) {
    const prev = mips[mips.length-1].data, bytes = new Uint8Array(n*n*4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = (y*n+x)*4;
      if (!x) { bytes.fill(255, i, i+4); continue; }
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const j = ((2*y+dy)*2*n + 2*x+dx)*4, weight = prev[j+3];
        r += prev[j]*weight; g += prev[j+1]*weight; b += prev[j+2]*weight; a += weight;
      }
      bytes[i] = a ? r/a : 191; bytes[i+1] = a ? g/a : 219; bytes[i+2] = a ? b/a : 187; bytes[i+3] = Math.round(a/4);
    }
    mips.push({ data: bytes, width: n, height: n });
  }
  texture.mipmaps = mips; texture.generateMipmaps = false; texture.anisotropy = 2; texture.needsUpdate = true;
  material.map = texture; material.alphaTest = .31; material.side = THREE.DoubleSide; material.needsUpdate = true;
}

export const HORNBEAM_TWIG_BOW = .044;
const diff = (p: P3, q: P3): P3 => [p[0]-q[0], p[1]-q[1], p[2]-q[2]];
const cross = (a: P3, b: P3): P3 => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const unit = (a: P3): P3 => { const d = Math.hypot(...a); return [a[0]/d, a[1]/d, a[2]/d]; };
export function plantSeed(seed: number) {
  let s = (Math.round(seed * 31337) ^ 0x576e2d65) >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export class LeafSurface {
  readonly mesh = new NatureMesh();
  private readonly uv: number[] = [];
  point(p: P3, u: number, v: number) { this.uv.push(u,v); return this.mesh.point(p); }
  geometry() { const g = this.mesh.geometry(); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); return g; }
}

/** Fixed local ranks. Each is socketed along its stem, not oriented toward the
 * viewer. The unequal roll at the two ends gives the laminae a changing normal
 * along the twig; an opposite pair and its decussate pair share the same spine. */
export class ShootRanks extends LeafSurface {
  constructor(private readonly kind: LeafKind) { super(); }
  shoot(base: P3, end: P3, span: number, roll: number, tile: number) {
    const dir = unit(diff(end, base)), ax = unit(cross(Math.abs(dir[2]) > .90 ? [0,1,0] : [0,0,1], dir)), ay = cross(dir, ax);
    const privet = this.kind === 'privet', n = privet ? 4 : 2;
    for (let j = 0; j < n; j++) {
      const side = j % 2, pair = j >> 1, angle = roll + side*Math.PI + pair*1.43;
      const wing = (p: P3, a: number, w: number): P3 => [p[0]+w*(ax[0]*Math.cos(a)+ay[0]*Math.sin(a)), p[1]+w*(ax[1]*Math.cos(a)+ay[1]*Math.sin(a)), p[2]+w*(ax[2]*Math.cos(a)+ay[2]*Math.sin(a))];
      const col = (tile + pair + side) % 4, row = privet ? pair : side;
      const u = 2 + (GUTTER + col*CELL + .5) / SIZE, v = (row*ROW + .5) / SIZE;
      const rows = privet ? [0, 1] : [0, .50, 1];
      let a = -1, b = -1;
      for (const t of rows) {
        const p = mix3(base, end, t);
        if (t === .5) p[1] += HORNBEAM_TWIG_BOW; // bent twig with drooping outer leaves
        const tv = v+t*(ROW-1)/SIZE;
        const c = this.point(p, u, tv), d = this.point(wing(p, angle+(.40+.15*side)*t, span*(1-.15*t)), u+(CELL-1)/SIZE, tv);
        if (a >= 0) { this.mesh.tri(a,c,b); this.mesh.tri(c,d,b); }
        a = c; b = d;
      }
    }
  }
}

/** Bark grain follows the long stock, not a constant UV at the origin. The
 * small geometric tip blades use the same neutral finish as ordinary leaves. */
export function plantSurface(mesh: NatureMesh, wood: boolean) {
  const g = mesh.geometry(), p = g.getAttribute('position'), uv: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    uv.push(wood ? y*1.6 + z*.31 : .5 + .15*x, wood ? x*3.4 + z*2.1 + y*.19 : .5 + .12*z);
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return g;
}

const ovalTip = [[.31,.91],[.62,.96]] as const;
const toothedTip = [[.22,.89],[.34,.72],[.47,1],[.63,.68],[.72,.73]] as const;
export function newTip(mesh: NatureMesh, base: P3, direction: P3, width: number, roll: number, toothed = false) {
  mesh.membrane = true;
  mesh.blade(base, direction, width, toothed ? toothedTip : ovalTip, width*.32, roll, -.17, width*.11);
}
