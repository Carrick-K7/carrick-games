import * as THREE from 'three';
import type { P3 } from './villaNatureGeometry.js';

// Different watersheds for the exposed pale ridge and the lower wooded spur.
// A cleft on the near rise can expose a crest of the far watershed behind it.
const NEAR = [10, 13, 18, 13, 8, 7, 12, 15, 10, 8, 14, 20, 24, 14, 9, 15, 17, 7, 6, 9];
const FAR = [21, 29, 23, 16, 12, 17, 25, 30, 22, 19, 27, 39, 33, 20, 23, 30, 24, 18, 15, 16];
const N = 144, ROWS = 10, TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function skyline(heights: number[], t: number) {
  const n = heights.length, u = (t % 1 + 1) % 1 * n, i = Math.floor(u), f = u - i;
  const sample = (k: number) => heights[(i + k + n) % n];
  const a = sample(-1), b = sample(0), c = sample(1), d = sample(2);
  return .5 * (2 * b + (c - a) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (3 * b - a - 3 * c + d) * f * f * f);
}

/** Both the visible land and the planted ridge belts use these exact vertices
 * and the same triangle diagonal. A continuous analytic approximation lets
 * roots float metres above a steep, interpolated gully. */
export class VillaRidgeField {
  readonly points: P3[] = []; readonly stone: number[] = [];
  constructor(private readonly cx: number, private readonly cz: number) {
    for (let i = 0; i < N; i++) {
      const t = i / N, a = t * TAU, spine = Math.sin(a * 11 + .59 * Math.cos(a * 4));
      const fold = Math.sin(19 * a + 1.62 * Math.sin(a * 5 - .71));
      const flute = (1 - Math.abs(Math.sin(a * 13 + .82 * Math.sin(3 * a)))) ** 3;
      const spur = 6 * spine + 5 * Math.cos(a * 7) + 2.2 * fold, saddle = 4 * Math.cos(a * 9 + .6);
      const near = skyline(NEAR, t) + 1.28 * fold - 1.32 * flute;
      const far = skyline(FAR, t + .026) + 2.56 * Math.cos(15 * a + Math.sin(7 * a)) + 1.06 * fold;
      const sections = [ // setback; actual elevation; exposure of wood/grass/stone
        [-18 + spur, -1.77, -.78], [-6 + spur * 1.20, near * .32 - 1.45 * flute, -.62],
        [4 + spur, near * .73 - 2.30 * flute, -.30], [12 + spur * .70, near, -.22],
        [25 + saddle, near * .46 + fold, -.58], [36 + saddle, Math.min(near,far) * .21, -.66],
        [47 + saddle, far * .54 + .95 * fold, -.02], [60 + saddle * .5, far * .76 + 2.3 * spine, .34],
        [72 + saddle, far, .64], [96, -2.10, .04],
      ];
      for (const [j,[offset,y,rock]] of sections.entries()) {
        this.points.push([cx + Math.cos(a) * (151 + offset), y, cz + Math.sin(a) * (190 + offset)]);
        this.stone.push(rock + .19 * Math.sin(a * 7 + j * .74 + spine) + .10 * fold - .13 * flute);
      }
    }
  }
  /** t goes around the watershed; row runs outward across its first and second
   * ridgelines. Paths need not follow an equal-height/equal-distance ring. */
  plot(t: number, row: number): P3 {
    const angle = ((t % 1 + 1) % 1) * N, i = Math.floor(angle), u = angle - i;
    const z = Math.max(0, Math.min(ROWS - 1.00001, row)), j = Math.floor(z), v = z - j;
    const p = this.points[i * ROWS + j], q = this.points[((i + 1) % N) * ROWS + j], r = this.points[i * ROWS + j + 1], s = this.points[((i + 1) % N) * ROWS + j + 1];
    return [0,1,2].map(k => u + v <= 1 ? p[k] + u * (q[k] - p[k]) + v * (r[k] - p[k]) : s[k] + (1 - u) * (r[k] - s[k]) + (1 - v) * (q[k] - s[k])) as P3;
  }
  heightAt(x: number, z: number): number | undefined {
    // Changing the ellipse offset changes the azimuth by less than two columns.
    const turn = Math.atan2((z - this.cz) / 190, (x - this.cx) / 151) / TAU;
    const guess = Math.floor(((turn + 1) % 1) * N);
    const height = (a: P3, b: P3, c: P3) => {
      const ex = b[0] - a[0], ez = b[2] - a[2], fx = c[0] - a[0], fz = c[2] - a[2], d = ex * fz - ez * fx;
      const u = ((x - a[0]) * fz - (z - a[2]) * fx) / d, v = (ex * (z - a[2]) - ez * (x - a[0])) / d;
      if (u >= -1e-8 && v >= -1e-8 && u + v <= 1 + 1e-8) return a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]);
    };
    for (let k = -2; k <= 2; k++) for (let j = 0; j < ROWS - 1; j++) {
      const p = ((guess + k + N) % N) * ROWS + j, q = ((guess + k + 1 + N) % N) * ROWS + j;
      const h = height(this.points[p], this.points[q], this.points[p+1]) ?? height(this.points[q], this.points[q+1], this.points[p+1]);
      if (h !== undefined) return h;
    }
  }
}

/** Heath, tree-covered gullies and small exposures on the distant slopes. A
 * periodic pigment field in metres, not a camera-relative skyline decal. */
function fellPigment() {
  const size = 128, rgba = new Uint8Array(size * size * 4);
  const noise = (x: number, y: number, n: number, seed: number) => {
    const hash = (u: number,v: number) => { const k = Math.imul((u % n + n) % n + 1,0x27d4eb2d) ^ Math.imul((v % n + n) % n + seed,0x85ebca6b); const v2 = Math.imul(k ^ (k >>> 16),0x45d9f3b); return ((v2 ^ v2 >>> 15) >>> 0) / 4294967296; };
    const u = x * n, v = y * n, i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j;
    return lerp(lerp(hash(i,j),hash(i+1,j),a*a*(3-2*a)),lerp(hash(i,j+1),hash(i+1,j+1),a*a*(3-2*a)),b*b*(3-2*b));
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, drift = noise(u,v,4,16) * .12, patch = noise(u + drift,v - drift,7,29);
    const leaves = noise(u,v,36,71), fine = noise(u,v,72,9), scar = Math.max(0, .18 - Math.abs(noise(u + drift,v,3,52) - .55)) * (1 - patch);
    const cover = patch * .57 + noise(u,v,13,84) * .30 + leaves * .13;
    const n = 157 + cover * 82 + leaves * 18 + fine * 10 + scar * 76, i = (y * size + x) * 4;
    rgba[i] = n + cover * 4; rgba[i + 1] = n + 5 - scar * 17; rgba[i + 2] = n - 13 + scar * 103; rgba[i + 3] = 255;
  }
  const map = new THREE.DataTexture(rgba,size,size,THREE.RGBAFormat); map.name = 'villa/ridge-heath-and-scree';
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter; map.colorSpace = THREE.SRGBColorSpace; map.needsUpdate = true; return map;
}

export function addVillaDistantRidges(parent: THREE.Object3D, cx: number, cz: number): THREE.Mesh {
  const field = new VillaRidgeField(cx,cz), colors: number[] = [], uv: number[] = [], indices: number[] = [];
  const meadow = new THREE.Color('#91a07d'), wood = new THREE.Color('#647e6c'), high = new THREE.Color('#a4b3b0'), shade = new THREE.Color();
  for (let i = 0; i < N; i++) for (let j = 0; j < ROWS; j++) {
    const k = i * ROWS + j, p = field.points[k], exposed = field.stone[k];
    shade.copy(wood).lerp(exposed < 0 ? meadow : high, Math.min(1,Math.abs(exposed)));
    colors.push(shade.r,shade.g,shade.b); uv.push((p[0] + .32 * p[1]) / 74,(p[2] - .58 * p[1]) / 74);
    if (j + 1 < ROWS) { const q = ((i + 1) % N) * ROWS + j; indices.push(k,q,k+1,q,q+1,k+1); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(field.points.flat(),3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.setIndex(indices); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,map:fellPigment()});
  const mesh = new THREE.Mesh(g,material); mesh.name = 'villa-distant-ridges'; parent.add(mesh); return mesh;
}
