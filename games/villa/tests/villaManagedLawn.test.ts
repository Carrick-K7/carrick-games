import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createVillaTerrainGeometry } from '../src/villaTerrainModel.js';
import { createVillaFenceBankGeometry } from '../src/villaFenceBank.js';
import { createCultivatedGround, kitchenCourtDistance, tintManagedLawn } from '../src/villaGardenFloor.js';
import { lawnPatch } from '../src/villaLawnFinish.js';
import { VILLA_ESTATE_BOUNDS as B } from '../src/villaEstateLayout.js';
import { VILLA_GARDEN_TREES } from '../src/villaGarden.js';

const mean = (v: number[]) => v.reduce((sum, a) => sum + a, 0) / v.length;
const median = (v: number[]) => v.sort((a, b) => a - b)[v.length >> 1]!;
const bytes = (v: ArrayBufferView) => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
const uvAt = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) => new THREE.Vector2(a.getX(i), a.getY(i));
function dispose(root: THREE.Object3D) {
  root.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); o.material.dispose(); } });
}

describe('maintained estate sward', () => {
  it('changes the phase of the actual 1.25 m swatch while keeping its scale and clipped shoulder seam', () => {
    const lawn = createVillaTerrainGeometry('shared'), bank = createVillaFenceBankGeometry();
    try {
      const physical = [lawn.index!, lawn.getAttribute('position'), lawn.getAttribute('normal')];
      const original = physical.map(a => Buffer.from(bytes(a.array)));
      tintManagedLawn(lawn); tintManagedLawn(bank);
      expect(physical.every((a, i) => bytes(a.array).equals(original[i]!))).toBe(true);
      const p = lawn.getAttribute('position'), uv = lawn.getAttribute('uv'), grid = new Map<string, number>();
      for (let i = 0; i < p.count; i++) grid.set(`${p.getX(i)},${p.getZ(i)}`, i);
      const offsets: [number[], number[]] = [[], []], scales: number[] = [];
      for (let x = B.minX; x < B.maxX - 1; x += 3) for (let z = B.minZ; z < B.maxZ - 1; z += 3) {
        const ids = [[x,z],[x+1,z],[x+2,z],[x,z+1],[x,z+2]].map(q => grid.get(q.join(',')));
        if (ids.some(i => i === undefined)) continue;
        const [o, a, b, c, d] = ids.map(i => uvAt(uv, i!));
        const right = a!.clone().sub(o!).multiplyScalar(2.5), up = c!.clone().sub(o!).multiplyScalar(2.5);
        scales.push(right.length(), up.length());
        if (right.cross(up) < .64) throw Error(`collapsed/flipped turf chart at ${x},${z}`);
        // Interpolate each baked chart edge at one original repeat, then remove its unit phase.
        offsets[0].push(a!.lerp(b!, .25).sub(o!).multiplyScalar(2).sub(new THREE.Vector2(1, 0)).length());
        offsets[1].push(c!.lerp(d!, .25).sub(o!).multiplyScalar(2).sub(new THREE.Vector2(0, 1)).length());
      }
      expect(scales.length).toBeGreaterThan(3500); expect(Math.min(...scales)).toBeGreaterThan(.78); expect(Math.max(...scales)).toBeLessThan(1.22);
      for (const axis of offsets) expect(median(axis)).toBeGreaterThan(.035); // >18 px on the owned 512px study
      const bp = bank.getAttribute('position'), buv = bank.getAttribute('uv'); let splits = 0;
      for (const edgeZ of [B.minZ, B.maxZ]) {
        const edge = new Map<number, THREE.Vector2>();
        for (let i = 0; i < bp.count; i++) if (bp.getZ(i) === edgeZ) edge.set(bp.getX(i), uvAt(buv, i));
        // The villa/pool add fractional X cuts that the fence shoulder does not have.
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i); if (p.getZ(i) !== edgeZ || Number.isInteger(x)) continue;
          const k = Math.floor(x), onBank = edge.get(k)!.clone().lerp(edge.get(k + 1)!, x - k);
          expect(onBank.distanceTo(uvAt(uv, i))).toBeLessThan(1e-5); splits++;
        }
      }
      expect(splits).toBeGreaterThan(5);
    } finally { lawn.dispose(); bank.dispose(); }
  });

  it('neighbouring blades share two scales of growth without erasing the mower passes', () => {
    const near: number[] = [], apart: number[] = [], short: number[] = [], long: number[] = [];
    const lightPass: number[] = [], darkPass: number[] = [];
    for (let x = -36; x < 60; x += 1.7) for (let z = -56; z < 158; z += 1.9) {
      const f = lawnPatch(x, z), close = lawnPatch(x + .12, z), metre = lawnPatch(x + 1, z);
      near.push(Math.abs(f.fresh - close.fresh)); apart.push(Math.abs(f.fresh - lawnPatch(x + 6, z + 1).fresh));
      short.push(Math.abs(f.fleck - metre.fleck)); long.push(Math.abs(f.reach - metre.reach));
      if (z < 29) {
        const pass = Math.sin((x + .08 * z) * 1.79);
        if (pass > .8) lightPass.push(f.value); else if (pass < -.8) darkPass.push(f.value);
      }
    }
    expect(mean(apart)).toBeGreaterThan(.08); expect(mean(near)).toBeLessThan(.12 * mean(apart));
    expect(mean(long)).toBeGreaterThan(.015); expect(mean(short)).toBeGreaterThan(2.4 * mean(long));
    const contrast = mean(lightPass) - mean(darkPass);
    expect(contrast).toBeGreaterThan(.04); expect(contrast).toBeLessThan(.11);
  });

  it('puts short, quiet-coloured blades in the real expanse and rebuilds the same single receiver', () => {
    const make = () => createCultivatedGround(new THREE.Group(), new THREE.MeshStandardMaterial());
    const a = make(), b = make(), name = 'garden-substrate/grass-tillers';
    try {
      const grass = a.getObjectByName(name) as THREE.Mesh, g = grass.geometry, replay = (b.getObjectByName(name) as THREE.Mesh).geometry;
      expect(grass.receiveShadow && !grass.castShadow).toBe(true); expect(a.children).toHaveLength(5);
      for (const key of ['position','color','normal']) expect(bytes(g.getAttribute(key).array).equals(bytes(replay.getAttribute(key).array))).toBe(true);
      expect(bytes(g.index!.array).equals(bytes(replay.index!.array))).toBe(true);
      expect(g.index!.count / 3).toBeLessThanOrEqual(57_705); // previous single tiller batch
      const p = g.getAttribute('position'), c = g.getAttribute('color'), cells = new Set<string>(), cut: number[] = [], meadow: number[] = [];
      const freshRG: number[] = [], wornRG: number[] = [], withPass: number[] = [], againstPass: number[] = [];
      let interior = 0, maxHueShift = 0, minGreenLead = Infinity, cutEdge = Infinity, footHits = 0;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i), distance = kitchenCourtDistance(x, z); cutEdge = Math.min(cutEdge, distance);
        if (VILLA_GARDEN_TREES.some(t => Math.max(Math.abs(x-t.x), Math.abs(z-t.z)) < .25*t.scale) ||
          (Math.abs(x+10.5)<.25 && Math.abs(z-16)<.25) || (Math.abs(x+9.7)<.163 && Math.abs(z-16.3)<.163)) footHits++;
        const root = i - (i % 5), rg = c.getX(i) / c.getY(i), bg = c.getZ(i) / c.getY(i);
        minGreenLead = Math.min(minGreenLead, 1 - Math.max(rg, bg));
        maxHueShift = Math.max(maxHueShift, Math.abs(rg-c.getX(root)/c.getY(root)), Math.abs(bg-c.getZ(root)/c.getY(root)));
        if (i !== root || distance <= 1 || Math.min(x-B.minX, B.maxX-x, z-B.minZ, B.maxZ-z) <= 3) continue;
        cells.add(`${Math.floor((x-B.minX)/8)},${Math.floor((z-B.minZ)/8)}`); interior++;
        const h = Math.max(p.getY(i+2),p.getY(i+3),p.getY(i+4)) - p.getY(i);
        if (z < 35) cut.push(h); else if (z > 60) meadow.push(h);
        if (z < 29) {
          const f = lawnPatch(x, z), dx = p.getX(i+4) - x, dz = p.getZ(i+4) - z;
          if (f.fresh > .63) freshRG.push(rg); else if (f.fresh < .37) wornRG.push(rg);
          if (f.swath > .8) withPass.push(dz / Math.hypot(dx, dz)); else if (f.swath < -.8) againstPass.push(dz / Math.hypot(dx, dz));
        }
      }
      const pigmentChange = mean(wornRG) - mean(freshRG), layChange = mean(withPass) - mean(againstPass);
      expect(pigmentChange).toBeGreaterThan(.02); expect(pigmentChange).toBeLessThan(.11);
      expect(layChange).toBeGreaterThan(.12); expect(layChange).toBeLessThan(.45); // fans, not a field of identical leaning needles
      expect(interior / (p.count / 5)).toBeGreaterThan(.55); expect(cells.size).toBeGreaterThan(235);
      expect(mean(cut)).toBeGreaterThan(.035); expect(mean(cut)).toBeLessThan(.08);
      expect(mean(meadow)).toBeGreaterThan(1.35 * mean(cut)); expect(Math.max(...meadow)).toBeLessThan(.18);
      expect(cutEdge).toBeGreaterThan(0); expect(footHits).toBe(0);
      expect(minGreenLead).toBeGreaterThan(.08); expect(maxHueShift).toBeLessThan(.001);
    } finally { dispose(a); dispose(b); }
  });
});
