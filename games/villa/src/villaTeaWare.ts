import * as THREE from 'three';
import { FittingSkin, formedTube, vessel, type PathStation, type Section } from './villaFittingGeometry.js';

// Local y=0 is the ground foot, +X points down the spout. A single turned wall is
// branched at the belly: no solid pot wall or intersecting end cap inside the duct.
const belly: readonly [r: number, y: number][] = [[.059, .013], [.079, .021], [.096, .032], [.109, .046],
  [.121, .066], [.127, .086], [.127, .104], [.122, .122], [.111, .139], [.096, .151], [.082, .157], [.08, .163]];
const duct: readonly PathStation[] = [[.133, .084, 0, .031, .034], [.144, .087, 0, .027, .028],
  [.158, .096, 0, .022, .022], [.175, .113, 0, .0175, .0185], [.193, .135, 0, .0145, .016],
  [.213, .155, 0, .0127, .0145], [.234, .166, 0, .0123, .0144], [.250, .1695, 0, .0128, .0155],
  [.259, .1705, 0, .0144, .017], [.262, .171, 0, .0145, .0173]];
export const TEA_SPOUT_TIP = { x: .262, y: .171, z: 0 } as const;

export function teaPotBody(path: readonly PathStation[] = duct) {
  const s = new FittingSkin(), n = 32, lo = 3, hi = 7, half = 2;
  const circle = (r: number, y: number, ratio = .83) => Array.from({ length: n }, (_, j) => {
    const a = j * Math.PI * 2 / n; return s.point(r * Math.cos(a), y, r * Math.sin(a) * ratio);
  });
  const shell = (inside: boolean) => {
    const rings = belly.map(([r, y]) => circle(r - (inside ? .0055 : 0), y));
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < n; j++) {
      if (i >= lo && i < hi && (j < half || j >= n - half)) continue;
      const k = (j + 1) % n, a = rings[i], b = rings[i + 1];
      if (inside) { s.face(a[j], b[k], b[j]); s.face(a[j], a[k], b[k]); }
      else { s.face(a[j], b[j], b[k]); s.face(a[j], b[k], a[k]); }
    }
    const port: number[] = [], angles: number[] = [];
    const edge = (i: number, j: number) => {
      port.push(rings[i][(j + n) % n]);
      angles.push(Math.atan2((belly[i][1] - .084) / .038, Math.sin(j * Math.PI * 2 / n) / Math.sin(half * Math.PI * 2 / n)));
    };
    for (let j = -half; j <= half; j++) edge(lo, j);
    for (let i = lo + 1; i <= hi; i++) edge(i, half);
    for (let j = half - 1; j >= -half; j--) edge(hi, j);
    for (let i = hi - 1; i > lo; i--) edge(i, -half);
    let end = port;
    for (let i = 0; i < path.length; i++) {
      const [x, y, , r, breadth = r] = path[i], a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), t = inside ? .0033 : 0;
      const next = angles.map(angle => s.point(x - Math.sin(angle) * (r - t) * dy / l, y + Math.sin(angle) * (r - t) * dx / l, Math.cos(angle) * (breadth - t)));
      s.join(end, next, inside); end = next;
    }
    return { rings, end };
  };
  const outer = shell(false), inner = shell(true);
  s.join(outer.end, inner.end);
  // Recessed underside stamp bed, trimmed foot land, rounded ankle and interior floor.
  let foot = [s.point(0, .007, 0)];
  for (const [r, y] of [[.046, .007], [.049, .0055], [.050, .0008], [.052, 0], [.060, 0], [.062, .002], [.062, .008]]) {
    const next = circle(r, y); s.join(foot, next); foot = next;
  }
  s.join(foot, outer.rings[0]);
  let rim = outer.rings[outer.rings.length - 1];
  // The lid's skirt locates inside the mouth; its flange bears on this annular ledge.
  for (const [r, y] of [[.082, .1645], [.083, .167], [.0825, .170], [.080, .171], [.073, .171], [.071, .169], [.071, .164]]) {
    const next = circle(r, y); s.join(rim, next); rim = next;
  }
  s.join(rim, inner.rings[inner.rings.length - 1]);
  const floor = circle(.044, .012); s.join(inner.rings[0], floor); s.join(floor, [s.point(0, .012, 0)]);
  return s.geometry();
}

export function teaPotLid() {
  // The button and domed cover are one ceramic turning with an actual 3.8mm steam vent.
  const profile: Section[] = [[.0019, .163], [.042, .1635], [.064, .163], [.0665, .1615], [.0665, .153], [.069, .152],
    [.070, .154], [.070, .1695], [.073, .171], [.081, .171], [.084, .1728], [.0845, .175], [.082, .1775],
    [.074, .179], [.067, .183], [.052, .187], [.031, .190], [.0125, .191], [.010, .194], [.011, .198],
    [.018, .201], [.020, .205], [.018, .210], [.012, .213], [.0038, .214], [.0019, .213], [.0019, .163]];
  return vessel(profile.map(([r, y]) => [r, y, r * (y > .191 ? 1 : .83)] as Section), 32);
}

export function teaPotHandle() {
  // Pull and thumb rest are drawn from wide slip-joined lugs into a narrower, oval grip.
  return formedTube([[-.086, .144, 0, .017, .030], [-.109, .151, 0, .017, .024], [-.131, .159, 0, .014, .021],
    [-.157, .163, 0, .0125, .018], [-.179, .159, 0, .0125, .0165], [-.194, .147, 0, .012, .016],
    [-.201, .128, 0, .0115, .0155], [-.200, .105, 0, .011, .015], [-.191, .081, 0, .0115, .016],
    [-.175, .062, 0, .012, .017], [-.155, .050, 0, .0125, .018], [-.136, .045, 0, .013, .019],
    [-.120, .045, 0, .014, .021], [-.101, .050, 0, .016, .024]], 14);
}

// These exact sections serve both the lip/floor mesh and the free-surface solver.
const cupInner = [[0, .009], [.019, .009], [.024, .0105], [.0265, .013], [.029, .017],
  [.0325, .025], [.0367, .037], [.0397, .049], [.042, .056]] as const;
const CUP_SIDES = 28;
export function teaCupShell() {
  return vessel([[0, .0035], [.019, .0035], [.020, 0], [.025, 0], [.026, .0015], [.0257, .005],
    [.028, .007], [.031, .013], [.036, .025], [.0405, .039], [.044, .050], [.046, .054],
    [.046, .056], [.044, .0572], ...[...cupInner].reverse()], CUP_SIDES);
}

/** Intersect a convex polygonal bowl with a gravity-horizontal plane. A tilted cup
 * can have liquid entirely to one side of its axis. Scaling/rotating a disk cannot do this.
 * Only updated when tilt or fill changes; scratch and render buffers are never replaced. */
export function teaFreeSurface(material: THREE.Material) {
  const max = CUP_SIDES * cupInner.length * 2, skin = new THREE.BufferGeometry();
  const xyz = new THREE.BufferAttribute(new Float32Array((1 + max * 2) * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const normals = new THREE.BufferAttribute(new Float32Array(xyz.array.length), 3).setUsage(THREE.DynamicDrawUsage);
  const index = new THREE.BufferAttribute(new Uint16Array(max * 9), 1).setUsage(THREE.DynamicDrawUsage);
  skin.setAttribute('position', xyz); skin.setAttribute('normal', normals); skin.setIndex(index); skin.setDrawRange(0, 0);
  skin.boundingSphere = new THREE.Sphere(new THREE.Vector3(), .1);
  const mesh = new THREE.Mesh(skin, material); mesh.name = 'tea-bar/liquid'; mesh.frustumCulled = false;
  // Sides are planar trapezoids. Only their real perimeter/longitudinal edges need clipping.
  const rings = cupInner.map(([r, y]) => Array.from({ length: CUP_SIDES }, (_, i) => {
    const a = i * Math.PI * 2 / CUP_SIDES; return new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a));
  }));
  const cuts = Array.from({ length: max }, () => new THREE.Vector3()), order: number[] = [];
  let lastFill = -1, lastTilt = -1;
  function update(fill: number, tilt: number) {
    if (lastFill === fill && lastTilt === tilt) return;
    lastTilt = tilt; lastFill = fill; mesh.visible = fill > .001;
    if (!mesh.visible) { skin.setDrawRange(0, 0); return; }
    const c = Math.cos(tilt), s = Math.sin(tilt);
    const low = Math.min(...cupInner.map(([r, y]) => y * c - r * s));
    const level = THREE.MathUtils.lerp(low + .00007, .056 * c - .042 * s - .0035, Math.min(1, fill) * .84);
    const originY = .009 + fill * .033; mesh.position.y = originY;
    let n = 0, cx = 0, cy = 0, cz = 0;
    const cut = (a: THREE.Vector3, b: THREE.Vector3) => {
      const u = a.y * c - a.z * s - level, v = b.y * c - b.z * s - level;
      if ((u < 0) === (v < 0)) return;
      const p = cuts[n].lerpVectors(a, b, u / (u - v));
      cx += p.x; cy += p.y; cz += p.z; order[n] = n; n++;
    };
    for (let r = 1; r < rings.length; r++) for (let i = 0; i < CUP_SIDES; i++) {
      cut(rings[r - 1][i], rings[r][i]); cut(rings[r][i], rings[r][(i + 1) % CUP_SIDES]);
    }
    order.length = n;
    if (n < 3) { skin.setDrawRange(0, 0); return; }
    cx /= n; cy /= n; cz /= n;
    const angle = (p: THREE.Vector3) => Math.atan2((p.y - cy) * s + (p.z - cz) * c, p.x - cx);
    order.sort((a, b) => angle(cuts[b]) - angle(cuts[a]));
    xyz.setXYZ(0, cx, cy - originY, cz); normals.setXYZ(0, 0, c, -s);
    for (let j = 0; j < n; j++) {
      const p = cuts[order[j]], a = 1 + j, b = 1 + (j + 1) % n;
      xyz.setXYZ(a, cx + (p.x - cx) * .96, cy - originY + (p.y - cy) * .96, cz + (p.z - cz) * .96);
      // Contact sits on the actual inside wall, not outside it: recess the body of
      // the free surface a fraction of a millimetre below the capillary edge.
      xyz.setXYZ(a + n, p.x, p.y - originY + .00025 * c, p.z - .00025 * s);
      normals.setXYZ(a, 0, c, -s); normals.setXYZ(a + n, 0, c, -s);
      index.array.set([0, a, b, a, a + n, b + n, a, b + n, b], j * 9);
    }
    xyz.needsUpdate = normals.needsUpdate = index.needsUpdate = true; skin.setDrawRange(0, n * 9);
  }
  return { mesh, update, uprightLevel: () => .00907 + ( .0525 - .00907) * Math.min(1, lastFill) * .84 };
}

/** A ballistic pour with a tangent at the lip and a narrowing stream; one reusable draw. */
export function teaPourStream(material: THREE.Material) {
  const slices = 12, sides = 8, geo = new THREE.BufferGeometry(), indices: number[] = [];
  const p = new THREE.BufferAttribute(new Float32Array((slices + 1) * sides * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const n = new THREE.BufferAttribute(new Float32Array(p.array.length), 3).setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < slices; i++) for (let j = 0; j < sides; j++) {
    const a = i * sides + j, b = i * sides + (j + 1) % sides; indices.push(a, a + sides, b + sides, a, b + sides, b);
  }
  geo.setAttribute('position', p); geo.setAttribute('normal', n); geo.setIndex(indices);
  const mesh = new THREE.Mesh(geo, material); mesh.name = 'tea-bar/pour'; mesh.frustumCulled = false;
  const update = (tip: THREE.Vector3, cx: number, cy: number, cz: number, pitch: number) => {
    mesh.position.copy(tip);
    const dx = cx - tip.x, dz = cz - tip.z, dy = cy - tip.y, d = Math.max(.0001, Math.hypot(dx, dz));
    const rise = Math.tan(.16 - pitch) * d;
    for (let i = 0; i <= slices; i++) {
      const t = i / slices, y = t * (rise + (dy - rise) * t), speedY = rise + 2 * (dy - rise) * t;
      const speed = Math.hypot(d, speedY), radius = .0041 / Math.sqrt(Math.max(1, speed / d));
      for (let j = 0; j < sides; j++) {
        const a = j * Math.PI * 2 / sides, c = Math.cos(a), s = Math.sin(a);
        const nx = -dz / d * c - dx / d * speedY / speed * s, ny = d / speed * s, nz = dx / d * c - dz / d * speedY / speed * s;
        p.setXYZ(i * sides + j, dx * t + radius * nx, y + radius * ny, dz * t + radius * nz);
        n.setXYZ(i * sides + j, nx, ny, nz);
      }
    }
    p.needsUpdate = n.needsUpdate = true; geo.boundingSphere = null; geo.boundingBox = null;
  };
  return { mesh, update };
}
