import * as T from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { makeWeapon } from '../src/csWeapons.js';
import { applyWeaponAnimation, placeWeaponView } from '../src/csWeaponMotion.js';

// Scope: real moving blade/free-handle geometry versus the closed, faceted
// cuff/forearm volumes. The retained handle/glove contact is deliberately not
// counted. Dense vertex samples plus whole triangles at critical poses are not
// a proof of continuous swept-volume clearance or of every interruption blend.
type Triangle = [T.Vector3, T.Vector3, T.Vector3];
type Plane = [number, number, number, number];
type State = Record<string, number | boolean>;
type Piece = { name: string; root: T.Object3D; vertices: T.Vector3[]; triangles: Triangle[] };
const models: T.Object3D[] = [];
const EPS = 1e-7;

afterEach(() => {
  for (const model of models.splice(0)) {
    const skeletons = new Set<T.Skeleton>(), ownedMaterials = new Set<T.Material>();
    model.traverse((object: any) => {
      if (object.geometry && !object.geometry.userData.sharedCharacter) object.geometry.dispose();
      if (object.skeleton) skeletons.add(object.skeleton);
      for (const material of [].concat(object.material || [])) {
        if (material.userData.ownedCsWeaponMaterial) ownedMaterials.add(material);
      }
    });
    for (const skeleton of skeletons) skeleton.dispose();
    for (const material of ownedMaterials) material.dispose();
  }
});

function piece(name: string, root: T.Object3D): Piece {
  const vertices = new Map<string, T.Vector3>(), triangles: Triangle[] = [];
  const inverse = root.matrixWorld.clone().invert();
  root.traverse(object => {
    if (!(object instanceof T.Mesh)) return;
    const matrix = inverse.clone().multiply(object.matrixWorld);
    const positions = object.geometry.attributes.position, index = object.geometry.index;
    const local = Array.from({ length: positions.count }, (_, i) => {
      const point = new T.Vector3().fromBufferAttribute(positions, i).applyMatrix4(matrix);
      // Collapse only duplicate vertices from batched/non-indexed faces. The
      // 0.1-nanometre key precision is far below the 0.1-micron interior tolerance.
      vertices.set(point.toArray().map(value => value.toFixed(10)).join(','), point);
      return point;
    });
    for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
      triangles.push([0, 1, 2].map(j => local[index ? index.getX(i + j) : i + j]) as Triangle);
    }
  });
  return { name, root, vertices: [...vertices.values()], triangles };
}

function fixture() {
  const model = makeWeapon('knife', true, 'butterfly'), rig = model.userData.rig;
  models.push(model); model.updateMatrixWorld(true);
  const pieces = [piece('bite', rig.butterflyHandle), piece('blade', rig.knifeBlade)];
  const sleeves: [string, T.Mesh<T.CylinderGeometry>][] = [['cuff', rig.knifeCuff], ['forearm', rig.knifeForearm]];
  for (const [, mesh] of sleeves) {
    expect(mesh.geometry.parameters.openEnded).toBe(false);
    expect(mesh.geometry.parameters.thetaLength).toBeCloseTo(Math.PI * 2, 12);
    expect(mesh.scale.x).toBe(1); expect(mesh.scale.z).toBe(1);
  }
  return { model, rig, pieces, sleeves };
}
type Fixture = ReturnType<typeof fixture>;

function sample(f: Fixture, state: State) {
  // Positive tests consume the actual production rest orientation, hinge
  // curves, grip, and arm solve. No assumed u0 or hinge override is applied.
  const motion = applyWeaponAnimation(f.model, state);
  placeWeaponView(f.model, motion); f.model.updateMatrixWorld(true);
  return motion;
}

function sleeveVolume(mesh: T.Mesh<T.CylinderGeometry>) {
  const g = mesh.geometry.parameters, height = g.height * mesh.scale.y;
  const slope = (g.radiusTop - g.radiusBottom) / height;
  const middle = (g.radiusTop + g.radiusBottom) / 2, c = Math.cos(Math.PI / g.radialSegments);
  const planes: Plane[] = [];
  for (let i = 0; i < g.radialSegments; i++) {
    const theta = g.thetaStart + (i + .5) * g.thetaLength / g.radialSegments;
    const x = Math.sin(theta), y = -slope * c, z = Math.cos(theta), length = Math.hypot(x, y, z);
    // Supporting planes of the actual polygonal frustum, not an inflated
    // circular cylinder. Their normals are unit length in physical metres.
    planes.push([x / length, y / length, z / length, middle * c / length]);
  }
  planes.push([0, 1, 0, height / 2], [0, -1, 0, height / 2]);
  const inverse = new T.Matrix4().makeScale(1, mesh.scale.y, 1).multiply(mesh.matrixWorld.clone().invert());
  return { planes, inverse };
}
function signed(plane: Plane, point: T.Vector3) {
  const [x, y, z, d] = plane;
  return d - x * point.x - y * point.y - z * point.z;
}
function vertexPenetrations(f: Fixture) {
  const hits: { piece: string; sleeve: string; depth: number }[] = [], point = new T.Vector3();
  for (const [sleeve, mesh] of f.sleeves) {
    const { planes, inverse } = sleeveVolume(mesh);
    for (const p of f.pieces) {
      const matrix = inverse.clone().multiply(p.root.matrixWorld);
      let deepest = 0;
      for (const vertex of p.vertices) {
        point.copy(vertex).applyMatrix4(matrix);
        let depth = Infinity;
        for (const plane of planes) {
          depth = Math.min(depth, signed(plane, point));
          if (depth <= EPS) break;
        }
        if (depth > EPS) deepest = Math.max(deepest, depth);
      }
      if (deepest > EPS) hits.push({ piece: p.name, sleeve, depth: deepest });
    }
  }
  return hits;
}

function clipTriangle(triangle: Triangle, planes: Plane[]) {
  let polygon: T.Vector3[] = triangle.map(point => point.clone());
  for (const plane of planes) {
    const clipped: T.Vector3[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const da = signed(plane, a), db = signed(plane, b);
      if (da >= 0) clipped.push(a);
      if ((da > 0 && db < 0) || (da < 0 && db > 0)) clipped.push(a.clone().lerp(b, da / (da - db)));
    }
    polygon = clipped;
    if (polygon.length < 3) return 0;
  }
  const interior = polygon.reduce((sum, point) => sum.add(point), new T.Vector3()).multiplyScalar(1 / polygon.length);
  return Math.min(...planes.map(plane => signed(plane, interior)));
}
function triangleClearance(f: Fixture) {
  const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
  let lowerBound = Infinity, intersections = 0, deepest = 0;
  for (const [, mesh] of f.sleeves) {
    const { planes, inverse } = sleeveVolume(mesh);
    for (const p of f.pieces) {
      const matrix = inverse.clone().multiply(p.root.matrixWorld);
      for (const triangle of p.triangles) {
        a.copy(triangle[0]).applyMatrix4(matrix); b.copy(triangle[1]).applyMatrix4(matrix); c.copy(triangle[2]).applyMatrix4(matrix);
        let gap = -Infinity;
        for (const plane of planes) gap = Math.max(gap, Math.min(-signed(plane, a), -signed(plane, b), -signed(plane, c)));
        // If all three vertices are outside one supporting plane, the entire
        // triangle is outside by at least this distance, including its edges.
        lowerBound = Math.min(lowerBound, Math.max(0, gap));
        if (gap > 0) continue;
        // A triangle with no inside vertices can still slice through the
        // sleeve. Clip it against every face instead of accepting vertex-only QA.
        const depth = clipTriangle([a, b, c], planes);
        if (depth > EPS) { intersections++; deepest = Math.max(deepest, depth); }
      }
    }
  }
  return { lowerBound, intersections, deepest };
}

// Frozen historical closed-entry phase, only for a negative control. This
// deliberately restores the removed unsafe path without changing live source.
function oldClosedPhase(t: number) {
  const keys = [[0, 0], [.10, 0], [.36, .55], [.67, 1], [1, 1]];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
    const [a, x] = keys[i - 1], [b, y] = keys[i], u = (t - a) / (b - a);
    return x + (y - x) * u * u * (3 - 2 * u);
  }
  return 1;
}

describe('butterfly blade and free-handle sleeve clearance', () => {
  it('detects a triangle crossing a volume even when all its vertices are outside', () => {
    const planes: Plane[] = [[1, 0, 0, 1], [-1, 0, 0, 1], [0, 1, 0, 1], [0, -1, 0, 1], [0, 0, 1, 1], [0, 0, -1, 1]];
    const triangle: Triangle = [new T.Vector3(-3, 0, 0), new T.Vector3(3, 0, 0), new T.Vector3(0, 0, 3)];
    expect(triangle.every(point => planes.some(plane => signed(plane, point) < 0))).toBe(true);
    expect(clipTriangle(triangle, planes)).toBeGreaterThan(.1);
  });

  it('keeps actual surface vertices outside the cuff/forearm throughout sampled runtime actions', () => {
    const f = fixture(), states: State[] = [{}];
    for (let i = 0; i <= 200; i++) for (let variant = 0; variant < 2; variant++) {
      states.push({ deployProgress: i / 200, butterflyDrawVariant: variant });
    }
    for (let i = 0; i <= 100; i++) {
      for (let variant = 0; variant < 3; variant++) states.push({ inspectProgress: i / 100, butterflyInspectVariant: variant });
      states.push({ shotAge: i / 100 * .48 }, { shotAge: i / 100 * .85, knifeHeavy: true });
    }
    expect(f.pieces.every(p => p.vertices.length > 100 && p.triangles.length > 100)).toBe(true);
    for (const state of states) {
      sample(f, state);
      expect(vertexPenetrations(f), JSON.stringify(state)).toEqual([]);
    }
  });

  it('separates whole triangles at entry, former collision, closest-clearance and fanned poses', () => {
    const f = fixture(), states: State[] = [{}];
    for (const variant of [0, 1]) for (const t of [0, .075, .15, .17, .40, .55, .67, .81, 1]) {
      states.push({ deployProgress: t, butterflyDrawVariant: variant });
    }
    for (const variant of [0, 1, 2]) for (const t of [.27, .50, .60]) states.push({ inspectProgress: t, butterflyInspectVariant: variant });
    for (const state of states) {
      sample(f, state);
      const result = triangleClearance(f);
      expect(result.intersections, JSON.stringify(state)).toBe(0);
      expect(result.lowerBound, JSON.stringify(state)).toBeGreaterThan(.005);
    }
  });

  it('detects the historical identity-rest inspect through the sleeve', () => {
    const f = fixture();
    f.rig.knifeRest.identity();
    sample(f, { inspectProgress: .50, butterflyInspectVariant: 1 });
    expect(vertexPenetrations(f).some(hit => hit.piece === 'bite' && hit.sleeve === 'forearm' && hit.depth > .020)).toBe(true);
    const triangles = triangleClearance(f);
    expect(triangles.intersections).toBeGreaterThan(100);
    expect(triangles.deepest).toBeGreaterThan(.020);
  });

  it('detects the historical closed-entry draw even with the corrected runtime rest', () => {
    const f = fixture(), t = .17;
    sample(f, { deployProgress: t, butterflyDrawVariant: 0 });
    const u = oldClosedPhase(t);
    f.rig.butterflyBlade.rotation.x = -Math.PI * (1 - u);
    f.rig.butterflyHandle.rotation.x = Math.PI * (1 + u);
    f.model.updateMatrixWorld(true);
    expect(vertexPenetrations(f).some(hit => hit.piece === 'bite' && hit.sleeve === 'forearm' && hit.depth > .010)).toBe(true);
    const triangles = triangleClearance(f);
    expect(triangles.intersections).toBeGreaterThan(100);
    expect(triangles.deepest).toBeGreaterThan(.010);
  });
});
