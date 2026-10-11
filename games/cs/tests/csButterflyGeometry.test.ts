import * as T from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { buildWeapon } from '../src/csWeaponModels.js';
import { applyWeaponAnimation, sampleWeaponMotion } from '../src/csWeaponMotion.js';
import { BUTTERFLY_DEPLOY_DURATION, BUTTERFLY_INSPECT_DURATION, BUTTERFLY_VARIANTS } from '../src/csButterflyKnife.js';

type Point = [number, number];
type Segment = { a: Point; b: Point; minY: number; maxY: number; minZ: number; maxZ: number };
type Section = { edges: Segment[]; minY: number; maxY: number; minZ: number; maxZ: number };
const models: T.Object3D[] = [];
const make = () => { const model = buildWeapon('knife', {}, false, 'butterfly'); models.push(model); return model; };
afterEach(() => { for (const model of models.splice(0)) model.traverse((o: any) => o.geometry?.dispose()); });
const segment = (a: Point, b: Point): Segment => ({ a, b, minY: Math.min(a[0], b[0]), maxY: Math.max(a[0], b[0]), minZ: Math.min(a[1], b[1]), maxZ: Math.max(a[1], b[1]) });
const section = (edges: Segment[]): Section => ({ edges, minY: Math.min(...edges.map(e => e.minY)), maxY: Math.max(...edges.map(e => e.maxY)), minZ: Math.min(...edges.map(e => e.minZ)), maxZ: Math.max(...edges.map(e => e.maxZ)) });

// Cut actual mesh triangles, including profile bevels, bores, screws, scales,
// spacers and the released latch. Bounds only reject work; they never prove a
// collision. No hinge region is exempted from the solid section comparisons.
function cut(root: T.Object3D, x: number): Section {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert(), edges: Segment[] = [];
  root.traverse((object: any) => {
    if (!object.isMesh) return;
    const matrix = inverse.clone().multiply(object.matrixWorld), geometry = object.geometry;
    const positions = geometry.attributes.position, index = geometry.index;
    for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
      const vertices = [0, 1, 2].map(k => new T.Vector3().fromBufferAttribute(positions, index ? index.getX(i + k) : i + k).applyMatrix4(matrix));
      const points: Point[] = [];
      for (const [j, k] of [[0, 1], [1, 2], [2, 0]]) {
        const a = vertices[j], b = vertices[k];
        if ((a.x - x) * (b.x - x) < 0) {
          const t = (x - a.x) / (b.x - a.x);
          points.push([a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t]);
        }
      }
      if (points.length === 2) edges.push(segment(points[0], points[1]));
    }
  });
  return section(edges);
}
function transformed(source: Section, matrix: T.Matrix4, x: number): Section {
  const transform = (p: Point): Point => { const v = new T.Vector3(x, ...p).applyMatrix4(matrix); return [v.y, v.z]; };
  return section(source.edges.map(e => segment(transform(e.a), transform(e.b))));
}
function inside(shape: Section, p: Point): boolean {
  let parity = false;
  for (const { a, b } of shape.edges) if ((a[0] > p[0]) !== (b[0] > p[0]) && p[1] < a[1] + (b[1] - a[1]) * (p[0] - a[0]) / (b[0] - a[0])) parity = !parity;
  return parity;
}
function overlap(a: Section, b: Section): Point | null {
  if (a.maxY < b.minY || b.maxY < a.minY || a.maxZ < b.minZ || b.maxZ < a.minZ) return null;
  for (const u of a.edges) for (const v of b.edges) {
    if (u.maxY < v.minY || v.maxY < u.minY || u.maxZ < v.minZ || v.maxZ < u.minZ) continue;
    const ay = u.b[0] - u.a[0], az = u.b[1] - u.a[1], by = v.b[0] - v.a[0], bz = v.b[1] - v.a[1];
    const cy = v.a[0] - u.a[0], cz = v.a[1] - u.a[1], denominator = ay * bz - az * by;
    if (Math.abs(denominator) < 1e-15) continue;
    const t = (cy * bz - cz * by) / denominator, s = (cy * az - cz * ay) / denominator;
    if (t > 1e-6 && t < 1 - 1e-6 && s > 1e-6 && s < 1 - 1e-6) return [u.a[0] + ay * t, u.a[1] + az * t];
  }
  // Also catch one solid entirely inside another, with no boundary crossings.
  for (const e of a.edges) { const p: Point = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]; if (inside(b, p)) return p; }
  for (const e of b.edges) { const p: Point = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]; if (inside(a, p)) return p; }
  return null;
}
const actions = [
  ...Array.from({ length: 2 }, (_, variant) => ({ key: 'deployProgress', variantKey: 'butterflyDrawVariant', variant })),
  ...Array.from({ length: 3 }, (_, variant) => ({ key: 'inspectProgress', variantKey: 'butterflyInspectVariant', variant })),
];
const progress = [...new Set([...Array.from({ length: 241 }, (_, i) => i / 240),
  ...[.04, .06, .09, .10, .12, .18, .20, .24, .27, .30, .32, .36, .37, .46, .49, .59, .60, .65, .67, .68, .70, .72, .80, .81, .83, .84, .85, .88, 1]
    .flatMap(t => [Math.max(0, t - 1e-5), t, Math.min(1, t + 1e-5)])])].sort((a, b) => a - b);

describe('butterfly physical model and held-handle motion', () => {
  it('keeps the two real world anchors and parallel axes fixed, with no scale tricks or floating index rolls', () => {
    const model = make(), rig = model.userData.rig, safe = model.getObjectByName('butterfly-safe-handle')!;
    const scales = new Map<T.Object3D, T.Vector3>(); model.traverse(o => scales.set(o, o.scale.clone()));
    const attachment = rig.butterflyHandle.position.clone();
    const idle = applyWeaponAnimation(model);
    for (const action of actions) for (const t of progress) {
      const motion = applyWeaponAnimation(model, { [action.key]: t, [action.variantKey]: action.variant });
      model.updateMatrixWorld(true);
      expect(safe.getWorldPosition(new T.Vector3()).distanceTo(rig.butterflyBlade.getWorldPosition(new T.Vector3()))).toBeLessThan(1e-10);
      expect(rig.butterflyBlade.localToWorld(attachment.clone()).distanceTo(rig.butterflyHandle.getWorldPosition(new T.Vector3()))).toBeLessThan(1e-10);
      const axes = [safe, rig.butterflyBlade, rig.butterflyHandle].map(o => new T.Vector3(1, 0, 0).transformDirection(o.matrixWorld));
      expect(axes[0].distanceTo(axes[1])).toBeLessThan(1e-10); expect(axes[1].distanceTo(axes[2])).toBeLessThan(1e-10);
      model.traverse(o => { expect(o.scale.distanceTo(scales.get(o)!)).toBe(0); expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true); });
      expect(motion.knifeSpin).toBe(0); expect(motion.knifeOpen).toBeLessThanOrEqual(.25); expect(motion.knifeThumb).toBeLessThanOrEqual(.12);
    }
    expect(applyWeaponAnimation(model)).toEqual(idle);
    expect(BUTTERFLY_VARIANTS).toEqual({ draw: 2, inspect: 3 });
    expect(BUTTERFLY_DEPLOY_DURATION).toBe(1.05); expect(BUTTERFLY_INSPECT_DURATION).toBe(3.4);
  });

  it('keeps all rigid pieces disjoint through dense real mesh sections, including hinge shoulders and hardware', () => {
    const model = make(), rig = model.userData.rig, safe = model.getObjectByName('butterfly-safe-handle')!;
    const pieces = [safe, rig.butterflyHandle, rig.knifeBlade];
    // Mid-channel, blade relief, both steel plates, outer scales and pivot heads.
    const xs = [-.006, -.0046, -.00162, -.0012, -.0005, .0005, .0012, .00162, .0046, .006];
    const sections = xs.map(x => pieces.map(piece => cut(piece, x)));
    for (const action of actions) for (const t of progress) {
      applyWeaponAnimation(model, { [action.key]: t, [action.variantKey]: action.variant }); model.updateMatrixWorld(true);
      const inverse = safe.matrixWorld.clone().invert(), matrices = pieces.map(piece => inverse.clone().multiply(piece.matrixWorld));
      for (let s = 0; s < xs.length; s++) {
        const current = sections[s].map((slice, i) => transformed(slice, matrices[i], xs[s]));
        for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) {
          const witness = overlap(current[a], current[b]);
          if (witness) throw new Error(`${action.key} variant=${action.variant} t=${t} x=${xs[s]} ${pieces[a].name}/${pieces[b].name} overlap at safe-local ${witness}`);
        }
      }
    }
  }, 60_000);

  it('detects inward handle fans and liner-penetrating blade detail instead of merely accepting the sampler', () => {
    const model = make(), rig = model.userData.rig, safe = model.getObjectByName('butterfly-safe-handle')!;
    applyWeaponAnimation(model); rig.butterflyHandle.rotation.x = .65; model.updateMatrixWorld(true);
    const safePlate = cut(safe, .0046), bitePlate = cut(rig.butterflyHandle, .0046);
    let inverse = safe.matrixWorld.clone().invert();
    expect(overlap(safePlate, transformed(bitePlate, inverse.clone().multiply(rig.butterflyHandle.matrixWorld), .0046))).not.toBeNull();
    // Physical closed configuration is independent of the partially-open draw entry.
    applyWeaponAnimation(model); rig.butterflyBlade.rotation.x = -Math.PI; rig.butterflyHandle.rotation.x = Math.PI;
    const etch = rig.knifeBlade.children.find((o: T.Object3D) => o.name === 'butterfly-blade-etch' && o.position.x > 0);
    etch.position.x = .0046; model.updateMatrixWorld(true); inverse = safe.matrixWorld.clone().invert();
    expect(overlap(safePlate, transformed(cut(rig.knifeBlade, .0046), inverse.multiply(rig.knifeBlade.matrixWorld), .0046))).not.toBeNull();
  });

  it('has a genuinely thin edge, bored manifold blade and no hidden liner-penetrating fuller', () => {
    const model = make(), rig = model.userData.rig, blade = model.getObjectByName('butterfly-ground-blade') as T.Mesh;
    const geometry = blade.geometry, positions = geometry.attributes.position, normals = geometry.attributes.normal;
    const edges = new Map<string, { count: number; direction: number }>();
    const key = (i: number) => [positions.getX(i), positions.getY(i), positions.getZ(i)].map(v => Math.round(v / 1e-7)).join(',');
    for (let i = 0; i < positions.count; i += 3) {
      const vertices = [0, 1, 2].map(k => new T.Vector3().fromBufferAttribute(positions, i + k));
      const face = new T.Vector3().crossVectors(vertices[1].clone().sub(vertices[0]), vertices[2].clone().sub(vertices[0]));
      expect(face.length()).toBeGreaterThan(1e-14); face.normalize();
      for (let j = 0; j < 3; j++) expect(face.dot(new T.Vector3().fromBufferAttribute(normals, i + j))).toBeGreaterThan(.99);
      for (const [a, b] of [[i, i + 1], [i + 1, i + 2], [i + 2, i]]) {
        const ka = key(a), kb = key(b), id = [ka, kb].sort().join(':');
        const edge = edges.get(id) ?? { count: 0, direction: 0 }; edge.count++; edge.direction += ka < kb ? 1 : -1; edges.set(id, edge);
      }
    }
    for (const edge of edges.values()) expect(edge).toEqual({ count: 2, direction: 0 });
    geometry.computeBoundingBox(); expect(geometry.boundingBox!.max.x).toBeCloseTo(.0016, 8);
    const tipVertices = Array.from({ length: positions.count }, (_, i) => i).filter(i => positions.getY(i) > .127999);
    expect(tipVertices.length).toBeGreaterThan(0);
    for (const i of tipVertices) expect(Math.abs(positions.getX(i))).toBeCloseTo(.00012, 8);
    expect(rig.knifeTip.y).toBeCloseTo(geometry.boundingBox!.max.y, 7);
    expect(inside(cut(blade, .0005), [0, 0])).toBe(false);
    expect(inside(cut(blade, .0005), [0, rig.butterflyHandle.position.z])).toBe(false);
    for (const child of rig.knifeBlade.children) if (child.name === 'butterfly-blade-etch') {
      child.geometry.computeBoundingBox(); const bounds = child.geometry.boundingBox.clone().translate(child.position);
      expect(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x))).toBeLessThan(.0017);
    }
    // Even the visible blade relief is narrower than the liners' inner faces.
    const plate = cut(model.getObjectByName('butterfly-safe-handle')!, .0035);
    expect(inside(plate, [-.070, .003])).toBe(false);
  });

  it('shelters the folded cutting edge and tip between plates without mistaking the channel bbox for a collision', () => {
    const model = make(), rig = model.userData.rig, safe = model.getObjectByName('butterfly-safe-handle')!;
    const blade = model.getObjectByName('butterfly-ground-blade') as T.Mesh;
    const safePlate = cut(safe, .0046), bitePlate = cut(rig.butterflyHandle, .0046);
    applyWeaponAnimation(model); rig.butterflyBlade.rotation.x = -Math.PI; rig.butterflyHandle.rotation.x = Math.PI; model.updateMatrixWorld(true);
    const inverse = safe.matrixWorld.clone().invert();
    const bladeMatrix = inverse.clone().multiply(blade.matrixWorld);
    const closedBite = transformed(bitePlate, inverse.clone().multiply(rig.butterflyHandle.matrixWorld), .0046);
    const positions = blade.geometry.attributes.position;
    let checked = 0, minY = Infinity;
    for (let i = 0; i < positions.count; i++) {
      const point = new T.Vector3().fromBufferAttribute(positions, i);
      if (Math.abs(Math.abs(point.x) - .00012) > 1e-8 || point.y < .025 || point.z > .007) continue;
      point.applyMatrix4(bladeMatrix); minY = Math.min(minY, point.y); checked++;
      expect(inside(safePlate, [point.y, point.z]) || inside(closedBite, [point.y, point.z])).toBe(true);
    }
    expect(checked).toBeGreaterThan(30);
    expect(minY).toBeGreaterThan(-.13075); // actual end spacer's near face
    expect(new T.Box3().setFromObject(safe).intersectsBox(new T.Box3().setFromObject(rig.knifeBlade))).toBe(true);
  });

  it('finishes both draws and all inspections at the same physical idle transforms', () => {
    const model = make(), rig = model.userData.rig;
    applyWeaponAnimation(model); model.updateMatrixWorld(true);
    const idle = [rig.knifeFrame, rig.knifePivot, rig.butterflyBlade, rig.butterflyHandle].map(o => o.matrixWorld.clone());
    for (const action of actions) {
      applyWeaponAnimation(model, { [action.key]: 1 - 1e-8, [action.variantKey]: action.variant }); model.updateMatrixWorld(true);
      for (const [i, object] of [rig.knifeFrame, rig.knifePivot, rig.butterflyBlade, rig.butterflyHandle].entries())
        object.matrixWorld.elements.forEach((v: number, k: number) => expect(v).toBeCloseTo(idle[i].elements[k], 7));
      const pose = sampleWeaponMotion('knife', { knifeModel: 'butterfly', [action.key]: .5, [action.variantKey]: action.variant });
      expect(pose.knifeSpin).toBe(0);
    }
  });
});
