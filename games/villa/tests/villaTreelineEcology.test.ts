import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SHOOT, createVillaTreelineAtlas } from '../src/villaTreelineAtlas.js';
import { addVillaDistantRidges } from '../src/villaDistantRidges.js';
import { villaTreelinePlots } from '../src/villaTreelineStands.js';
import { addVillaWoodlandTree } from '../src/villaWoodlandArt.js';
import { VillaModelBuilder, villaMaterial } from '../src/villaModel.js';
import { createVillaPeripheralLandscape } from '../src/villaStreamModel.js';

const meshes = (root: THREE.Object3D) => { const a: THREE.Mesh[] = []; root.traverse(m => { if (m instanceof THREE.Mesh) a.push(m); }); return a; };
function release(root: THREE.Object3D) {
  const geometry = new Set<THREE.BufferGeometry>(), paints = new Set<THREE.Material>(), maps = new Set<THREE.Texture>();
  for (const m of meshes(root)) { geometry.add(m.geometry); (Array.isArray(m.material) ? m.material : [m.material]).forEach(k => paints.add(k)); }
  for (const m of paints) { for (const v of Object.values(m)) if (v instanceof THREE.Texture) maps.add(v); m.dispose(); }
  for (const tex of maps) tex.dispose(); for (const g of geometry) g.dispose(); root.clear();
}

// Compute the same box average as a minified 16×16 shoot. Merely counting
// original transparent texels would pass for a large solid painted diamond
// with an empty rectangle around it, or for tiny holes erased by minification.
function mipMask(map: THREE.DataTexture, tile: number, side: number) {
  const {data,width} = map.image, span = width / 4, step = span / side, ox = tile % 4 * span, oy = Math.floor(tile / 4) * span;
  return Array.from({length:side},(_,y) => Array.from({length:side},(_,x) => {
    let a = 0;
    for (let dy = 0; dy < step; dy++) for (let dx = 0; dx < step; dx++) a += data[((oy + y * step + dy) * width + ox + x * step + dx) * 4 + 3];
    return a / (255 * step * step) >= .45;
  }));
}

describe('Villa fixed woodland growth and its ground', () => {
  it('retains gaps between terminal shoots even at the small landscape mip, plus an actually opaque bark texel', () => {
    const map = createVillaTreelineAtlas();
    try {
      expect(map.image.data.byteLength).toBe(512 * 256 * 4); expect(map.generateMipmaps).toBe(true);
      expect(map.minFilter).toBe(THREE.LinearMipmapLinearFilter);
      const signatures = new Set<string>();
      for (const tile of [SHOOT.oak,SHOOT.flush,SHOOT.birch,SHOOT.needle,SHOOT.hazel,SHOOT.scrub]) {
        const mask = mipMask(map,tile,16), solid = mask.flat().filter(Boolean).length;
        expect(solid).toBeGreaterThan(36); expect(solid).toBeLessThan(151);
        let windows = 0;
        for (const row of mask) { const end = row.lastIndexOf(true); windows += row.slice(row.indexOf(true),end).filter(p => !p).length; }
        expect(windows,`tile ${tile} is more than a solid wedge`).toBeGreaterThan(9); signatures.add(mask.flat().map(v => +v).join(''));
      }
      expect(signatures.size).toBe(6); expect(mipMask(map,SHOOT.solid,8).flat().every(Boolean)).toBe(true);
    } finally { map.dispose(); }
  });

  it('keeps the near specimens inside their actual crown envelopes from every azimuth, with many different branch planes', () => {
    for (const kind of ['oak','birch','pine'] as const) for (const phase of [.1,2.75,6.10]) {
      const root = new THREE.Group(), b = new VillaModelBuilder(root,kind), bark = villaMaterial('#806748'), leaves = villaMaterial('#78975e');
      try {
        leaves.side = THREE.DoubleSide;
        addVillaWoodlandTree(b,kind,1,phase,{bark,birch:bark,dark:leaves,pine:leaves,oak:leaves,lime:leaves}); b.finish();
        const leaf = meshes(root).find(m => m.material === leaves)!;
        const p = leaf.geometry.getAttribute('position'), headings = new Set<number>(); let radius = 0, cover = 0;
        const a = new THREE.Vector3(), e = new THREE.Vector3(), f = new THREE.Vector3();
        for (let i = 0; i < p.count; i += 3) {
          a.fromBufferAttribute(p,i); e.fromBufferAttribute(p,i+1).sub(a); f.fromBufferAttribute(p,i+2).sub(a); e.cross(f).normalize();
          if (Math.hypot(e.x,e.z) > .35) headings.add(Math.floor((Math.atan2(e.z,e.x) / (2 * Math.PI) + .5) * 12));
          cover += Math.abs(e.y);
        }
        for (const m of meshes(root)) { const pos = m.geometry.getAttribute('position'); for (let i=0;i<pos.count;i++) radius = Math.max(radius,Math.hypot(pos.getX(i),pos.getZ(i))); }
        expect(radius).toBeLessThanOrEqual(({oak:3.1,birch:2.1,pine:1.9})[kind] + .00001);
        expect(headings.size).toBeGreaterThanOrEqual(8); expect(cover / (p.count / 3)).toBeGreaterThan(.20);
      } finally { release(root); }
    }
  });

  it('roots every depth plane on the rendered folded hills or actual exterior floor, including a raised custom ground', () => {
    const root = new THREE.Group(), hill = addVillaDistantRidges(root,11,52), ray = new THREE.Raycaster(); root.updateMatrixWorld(true);
    const ground = (x:number,z:number) => -1.13 + .62 * Math.sin(x * .079) + .20 * Math.cos(z * .21);
    const {plots} = villaTreelinePlots(ground), sideElevations = new Map<string,number[]>();
    try {
      for (const t of plots) {
        ray.set(new THREE.Vector3(t.x,100,t.z),new THREE.Vector3(0,-1,0));
        const top = Math.max(ground(t.x,t.z),ray.intersectObject(hill)[0]?.point.y ?? -Infinity);
        expect(Math.abs(top - t.y),`${t.x},${t.z}`).toBeLessThan(.00005);
        const e = sideElevations.get(t.side) ?? []; e.push(t.y); sideElevations.set(t.side,e);
      }
      for (const side of ['west','north','east','south']) {
        const trees = plots.filter(t => t.side === side), elevations = sideElevations.get(side)!;
        expect(trees.filter(t => !t.fell).length).toBeGreaterThan(30); expect(trees.filter(t => t.fell).length).toBeGreaterThan(14);
        expect(Math.max(...elevations) - Math.min(...elevations)).toBeGreaterThan(6);
        expect(Math.max(...trees.map(t => t.h / t.r)) - Math.min(...trees.map(t => t.h / t.r))).toBeGreaterThan(1.2);
      }
    } finally { release(root); }
  });

  it('shares an alpha-tested static atlas across the four regions, never across separately disposable instances', () => {
    const a = new THREE.Group(), b = new THREE.Group(); createVillaPeripheralLandscape(a); createVillaPeripheralLandscape(b);
    try {
      const regions = meshes(a), mat = regions[0].material as THREE.MeshStandardMaterial;
      const other = meshes(b)[0].material as THREE.MeshStandardMaterial;
      expect(regions.every(m => m.material === mat && m.frustumCulled && !m.castShadow)).toBe(true);
      expect(mat.side).toBe(THREE.DoubleSide); expect(mat.alphaTest).toBe(.45); expect(mat.depthWrite).toBe(true); expect(mat.transparent).toBe(false);
      expect(mat.map).toBeInstanceOf(THREE.DataTexture); expect(mat.map === other.map).toBe(false);
      expect(mat.onBeforeCompile).toBe(THREE.Material.prototype.onBeforeCompile);
      let ours = 0, theirs = 0; mat.map!.addEventListener('dispose',() => ours++); other.map!.addEventListener('dispose',() => theirs++);
      release(a); expect(ours).toBe(1); expect(theirs).toBe(0);
    } finally { release(a); release(b); }
  });
});
