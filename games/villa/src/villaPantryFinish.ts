import * as THREE from 'three';
import type { FurnitureKit } from './villaFurnitureForms.js';

// One replacement for the kitchen-only backsplash batch. Glaze, stone and brushed
// alloy have separate roughness/metal values in the same UV cells; the house's
// shared white/wood/metal palette (including outdoor furniture) is never mutated.
const swatches = {
  chalk: [218, 211, 191, 174, 0], tile: [184, 197, 181, 106, 0],
  lacquer: [151, 160, 144, 158, 0], nickel: [196, 191, 177, 121, 115],
  celadon: [153, 179, 164, 112, 0], oatmeal: [219, 209, 180, 111, 0],
  iron: [97, 96, 83, 172, 49], brass: [184, 161, 118, 123, 115],
  biscuit: [166, 134, 102, 211, 0], ochre: [158, 102, 70, 164, 0],
  linen: [212, 202, 177, 235, 0], indigo: [86, 109, 112, 224, 0],
  pear: [187, 172, 87, 151, 0], russet: [191, 120, 76, 163, 0],
  tenmoku: [82, 64, 49, 116, 0], oil: [103, 113, 66, 91, 0],
} as const;
export type PantrySwatch = keyof typeof swatches;
const cells = Object.keys(swatches) as PantrySwatch[], size = 256, cell = size / 4;
interface PantryFinish { surface: THREE.MeshStandardMaterial; glass: THREE.Material }
const instance = new WeakMap<FurnitureKit, PantryFinish>();
function noise(x: number, y: number, seed: number) {
  let n = Math.imul(x + seed * 101, 0x343fd) ^ Math.imul(y + 57, 0x27d4eb2d);
  n = Math.imul(n ^ (n >>> 15), 0x85ebca6b); return ((n ^ (n >>> 13)) >>> 0) / 4294967295;
}
function surfaceMap(bytes: Uint8Array, color: boolean) {
  const t = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat); t.name = `pantry/${color ? 'finish' : 'brushing-and-glaze'}`;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 2; t.needsUpdate = true; return t;
}
export function registerPantryFinish(k: FurnitureKit, material: THREE.Material, glass: THREE.Material) {
  if (!(material instanceof THREE.MeshStandardMaterial) || instance.has(k)) return;
  const rgb = new Uint8Array(size * size * 4), rm = new Uint8Array(rgb.length);
  cells.forEach((name, page) => {
    const [r, g, b, rough, metal] = swatches[name];
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      const u = x / (cell - 1), v = y / (cell - 1), grit = noise(x, y, page), wave = Math.sin(15 * u + 4 * v + Math.sin(9 * v));
      let tint: number, wear = 0;
      if (name === 'chalk') { // sawn shell-limestone; sparse inclusions, not dark marble stripes
        const bedding = Math.sin(v * 18 + .75 * Math.sin(7 * u + v * 2)) + .45 * wave;
        tint = bedding * 2.7 + (grit - .52) * 11 - (grit > .957 ? 13 : 0); wear = (grit - .42) * 18;
      } else if (name === 'nickel' || name === 'brass' || name === 'iron') {
        const brush = noise(x >> 4, y, page + 6); tint = (brush - .5) * 15 + (grit - .5) * 5; wear = (brush - .5) * 90;
      } else if (name === 'linen' || name === 'indigo') {
        tint = ((x + (y >> 1)) % 3 ? 2 : -4) + (y % 3 ? 1 : -3) + (grit - .5) * 10;
      } else if (name === 'pear' || name === 'russet') {
        tint = 10 * wave + 6 * Math.sin(13 * v - 7 * u) + (grit > .95 ? -19 : (grit - .5) * 6);
      } else {
        const breakAtRim = Math.max(0, (v - .83) * 5), pooling = Math.sin(v * 30 + .16 * Math.sin(u * 8));
        tint = wave * 3.5 + pooling * (name === 'tile' ? 1.4 : 2.4) + breakAtRim * 7 + (grit - .5) * 6 - (grit > .986 ? 14 : 0);
        wear = (grit - .4) * 16 - breakAtRim * 13;
      }
      const at = ((Math.floor(page / 4) * cell + y) * size + (page % 4) * cell + x) * 4;
      rgb.set([r + tint, g + tint, b + tint * .88, 255], at); rm.set([255, Math.max(0, Math.min(255, rough + wear)), metal, 255], at);
    }
  });
  material.color.setHex(0xffffff); material.name = 'pantry/honed-fired-and-brushed'; material.roughness = material.metalness = 1;
  material.map = surfaceMap(rgb, true); material.roughnessMap = material.metalnessMap = surfaceMap(rm, false);
  material.needsUpdate = true; instance.set(k, { surface: material, glass });
}
export const pantryGlass = (k: FurnitureKit) => instance.get(k)?.glass ?? k.m.white;
const fallback: Record<PantrySwatch, keyof FurnitureKit['m']> = { chalk: 'white', tile: 'cream', lacquer: 'sage', nickel: 'steel', celadon: 'sage', oatmeal: 'cream', iron: 'black', brass: 'brass', biscuit: 'stone', ochre: 'terra', linen: 'linen', indigo: 'blue', pear: 'leafLight', russet: 'coral', tenmoku: 'dark', oil: 'leaf' };
/** Chart each part before its local transform. Don't run an entire tile from a
 * cylindrical seam to a pole: real deck/field faces have planar cut directions. */
export function pantryPart(k: FurnitureKit, g: THREE.BufferGeometry, name: PantrySwatch,
  x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, projection: 'horizontal' | 'face' | 'turned' = 'horizontal', variation = 0) {
  const palette = instance.get(k);
  if (palette) {
    const page = cells.indexOf(name), p = g.getAttribute('position'); g.computeBoundingBox(); const b = g.boundingBox!, span = b.getSize(new THREE.Vector3());
    if (!g.hasAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.count * 2), 2));
    const uv = g.getAttribute('uv'), half = Math.floor(Math.abs(variation)) % 2, inset = 3;
    for (let i = 0; i < p.count; i++) {
      let u = (p.getX(i) - b.min.x) / (span.x || 1), v = projection === 'horizontal' ? (p.getZ(i) - b.min.z) / (span.z || 1) : (p.getY(i) - b.min.y) / (span.y || 1);
      if (projection === 'turned') u = Math.atan2(p.getZ(i), p.getX(i)) / (2 * Math.PI) + .5;
      if (half) u = 1 - u;
      u = u * .76 + .20 * (.5 + .5 * Math.sin(variation * 2.39)); v = v * .86 + .105 * (.5 + .5 * Math.sin(variation * 1.12));
      uv.setXY(i, ((page % 4) * cell + inset + u * (cell - 2 * inset)) / size, (Math.floor(page / 4) * cell + inset + v * (cell - 2 * inset)) / size);
    }
  }
  k.put(g, palette?.surface ?? k.m[fallback[name]], x, y, z, rx, ry, rz);
}
