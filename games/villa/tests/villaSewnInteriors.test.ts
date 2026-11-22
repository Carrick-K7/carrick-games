import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { woolRug } from '../src/villaFurnitureAccents.js';
import { curtain } from '../src/villaFurnitureTextiles.js';
import { bedLayer } from '../src/villaBeddingDrape.js';
import { chaiseThrow, tailoredPad } from '../src/villaUpholsterySeats.js';
import { clothCutAt, dress, makeInteriorTextiles, measuredSheet, type ClothCut } from '../src/villaUpholsteryFinish.js';

const owned: THREE.BufferGeometry[] = [], own = (g: THREE.BufferGeometry) => { owned.push(g); return g; };
let material: THREE.MeshStandardMaterial;
beforeAll(() => { material = makeInteriorTextiles(); });
afterAll(() => { owned.forEach(g => g.dispose()); material.map!.dispose(); material.bumpMap!.dispose(); material.dispose(); });
const ray = new THREE.Raycaster();
function on(mesh: THREE.Mesh, x: number, y: number, z: number, dx = 0, dy = -1, dz = 0) {
  ray.set(new THREE.Vector3(x, y, z), new THREE.Vector3(dx, dy, dz)); return ray.intersectObject(mesh)[0];
}
const piece = (g: THREE.BufferGeometry) => new THREE.Mesh(own(g), material);

describe('sewn cut, bearing and dye studies', () => {
  it('fills the ENTIRE dyed sheet, including repeating linen columns, and reserves separate physical height/roughness ranges', () => {
    const map = material.map as THREE.DataTexture, grain = material.bumpMap as THREE.DataTexture;
    expect(grain).toBe(material.roughnessMap); expect(grain.colorSpace).toBe(THREE.NoColorSpace); expect(map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(map.generateMipmaps && grain.generateMipmaps && grain.channel === 1).toBe(true);
    const a = map.image.data as Uint8Array, b = grain.image.data as Uint8Array;
    expect(a.byteLength + b.byteLength).toBeLessThanOrEqual(4 * 1024 * 1024);
    let min = 255, holes = 0;
    for (let i = 0; i < a.length; i += 4) { min = Math.min(min, a[i], a[i + 1], a[i + 2]); holes += Number(a[i + 3] !== 255); }
    expect(holes).toBe(0); expect(min).toBeGreaterThan(39);
    // Leather plates are shinier than linen or short nap; they should not be
    // the same crossed weave sent through three different tints.
    const profiles = Array.from({ length: 4 }, (_, k) => {
      let height0 = 255, height1 = 0, rough = 0, across = 0;
      for (let i = 0; i < 256 * 32; i++) { const j = 4 * (k * 256 * grain.image.width + i);
        rough += b[j + 1]; height0 = Math.min(b[j], height0); height1 = Math.max(b[j], height1);
        if (i % 256) across += Math.abs(b[j] - b[j - 4]); }
      return { rough: rough / 8192, relief: height1 - height0, across: across / 8192 };
    });
    expect(profiles[0].rough - profiles[1].rough).toBeGreaterThan(65);
    expect(profiles[2].relief).toBeLessThan(profiles[1].relief * .55);
    expect(profiles[2].across).toBeLessThan(profiles[0].across * .48);
  });
  it('maps every triangle of the tea rug to ONE oat cartoon, including both sides of its border and field', () => {
    const mesh = piece(dress(measuredSheet(woolRug(6.2, 4.388, .028, 1), 6.2, 4.388), 'oat'));
    const a = (material.map as THREE.DataTexture).image, bytes = a.data as Uint8Array, uv = mesh.geometry.getAttribute('uv');
    let valid = true;
    for (let i = 0; i < uv.count; i++) if (clothCutAt(uv.getX(i), uv.getY(i)) !== 'oat') valid = false;
    expect(valid).toBe(true);
    // This spies on actual sampled yarn, not a metadata label. A 256px stride
    // into 384px cartoons used to show half of the neighbouring blue rug.
    for (const x of [-2.90, -2.54, -1.65, -.71, .12, 1.84, 2.44, 2.94]) for (const z of [-2.08, -1.95, -.94, .27, 1.93]) {
      const hit = on(mesh, x, .05, z)!, u = hit.uv!; const i = (Math.floor(u.y * a.height) * a.width + Math.floor(u.x * a.width)) * 4;
      expect(bytes[i] - bytes[i + 2]).toBeGreaterThan(20);
    }
  });
  it('retains the material gauge on the chaise rather than stretching one texture per cushion', () => {
    for (const [cut, d, gauge] of [['flax', .98, 185], ['flax', 2.06, 185], ['hide', .98, 271], ['velvet', .98, 139]] as const) {
      const mesh = piece(dress(tailoredPad(.91, d, .235, d > 1 ? 'chaise' : 'seat', .28, .35), cut as ClothCut, '#b7a58e'));
      const a = on(mesh, .06, .3, -.04)!.uv1!, b = on(mesh, .19, .3, -.04)!.uv1!;
      expect((b.x - a.x) * 256 / .13).toBeCloseTo(gauge, 2); expect(b.y).toBeCloseTo(a.y, 6);
    }
  });
  it('sculpts a displaced seat well, undercut cord and lumbar rise; the folded wool rests on the actual long cushion', () => {
    const fresh = piece(tailoredPad(.91, .98, .235, 'seat', .15, .65)), used = piece(tailoredPad(.91, .98, .235, 'seat', .34, .65));
    expect(on(fresh, .05, .28, .05)!.point.y - on(used, .05, .28, .05)!.point.y).toBeGreaterThan(.032);
    const nose = (h: number) => on(used, 0, h, -.6, 0, 0, 1)!.point.z;
    expect(nose(.235 * .225 - .013) - nose(.235 * .225 - .005)).toBeGreaterThan(.007);
    const back = piece(tailoredPad(.91, .647, .219, 'back', .28, .45));
    expect(on(back, 0, .4, -.13)!.point.y - on(back, 0, .4, .06)!.point.y).toBeGreaterThan(.044);
    const long = piece(tailoredPad(.91, 2.06, .235, 'chaise', .21, .65)), scarf = piece(chaiseThrow(.927, long.geometry));
    for (const x of [-.28, -.11, .16, .31]) for (const z of [-.92, -.80, -.68]) {
      const contact = on(scarf, x, 0, z, 0, 1, 0)!.point.y - on(long, x, .30, z)!.point.y;
      expect(contact).toBeGreaterThan(-.003); expect(contact).toBeLessThan(.008);
    }
  });
  it('draws back one end of the master facing, leaving a longer free foot hem than the guest bed', () => {
    const measure = (guest: boolean) => {
      const cuff = own(bedLayer(2.55, 'facing', guest)), g = own(bedLayer(2.55, 'quilt', guest));
      const p = cuff.getAttribute('position'), uv = cuff.getAttribute('uv1'), qc = g.getAttribute('position');
      let lo = 10, hi = -10, lowest = 10;
      for (let i = 0; i < p.count; i++) if (uv.getY(i) > .999) { lo = Math.min(lo, p.getZ(i)); hi = Math.max(hi, p.getZ(i)); }
      for (let i = 0; i < qc.count; i++) if (qc.getZ(i) < -1.71) lowest = Math.min(lowest, qc.getY(i));
      return { sweep: hi - lo, lowest };
    };
    const m = measure(false), g = measure(true);
    expect(m.sweep).toBeGreaterThan(.30); expect(m.sweep - g.sweep).toBeGreaterThan(.19); expect(g.lowest - m.lowest).toBeGreaterThan(.084);
  });
  it('pins an unevenly spaced header while allowing the hem to widen and slip out of vertical register', () => {
    const g = own(curtain(.47, 2.77, 5, -14.5)), p = g.getAttribute('position'), chart = g.getAttribute('uv1');
    const section = (t: number) => { const points = []; for (let i = 0; i < p.count / 2; i++) if (Math.abs(chart.getY(i) - t) < .0001) points.push(new THREE.Vector3().fromBufferAttribute(p, i)); return points; };
    const head = section(1), hem = section(0), width = (q: THREE.Vector3[]) => Math.max(...q.map(v => v.x)) - Math.min(...q.map(v => v.x));
    expect(width(hem)).toBeGreaterThan(width(head) * 1.26);
    const pitch = head.filter((_, i) => i % 4 === 0).map((v, i, a) => i ? v.x - a[i - 1].x : 0).slice(1);
    expect(Math.max(...pitch) / Math.min(...pitch)).toBeGreaterThan(1.30);
    expect(Math.max(...hem.map(v => v.y)) - Math.min(...hem.map(v => v.y))).toBeGreaterThan(.046);
    expect(Math.max(...hem.map((v, i) => Math.abs(v.x - head[i].x)))).toBeGreaterThan(.065);
  });
});
