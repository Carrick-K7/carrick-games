import * as THREE from 'three';

/** Metre-scale sections used by the furniture maker. Rings are wound looking down
 * on the workpiece; a section may turn back inside to describe a real cavity. */
export type Point = [number, number, number];
export type Profile = [radius: number, elevation: number][];
export type Ring = Point[];
export type PutSurface = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, rx?: number, ry?: number, rz?: number) => void;
export interface FurnitureKit {
  put: PutSurface;
  at(x: number, y: number, z: number, yaw: number, make: () => void): void;
  box(x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material, radius?: number, yaw?: number): void;
  hit(x: number, bottom: number, z: number, w: number, h: number, d: number, id?: string): void;
  m: Record<'oak' | 'walnut' | 'linen' | 'sage' | 'terra' | 'cream' | 'brass' | 'black' | 'steel' | 'white' | 'stone' | 'dark' | 'leaf' | 'leafLight' | 'soil' | 'blue' | 'coral' | 'lampGlow', THREE.MeshStandardMaterial>;
}

function geometry(xyz: number[], uv: number[], elements: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(elements); g.computeVertexNormals(); return g;
}

/** Skin a series of convex sections. The end-grain/face caps have independent
 * normals and planar grain coordinates; they never distort the perimeter normals. */
export function loft(rings: Ring[], capStart = true, capEnd = true) {
  const n = rings[0].length, xyz: number[] = [], uv: number[] = [], elements: number[] = [];
  rings.forEach((ring, j) => ring.forEach((p, i) => {
    xyz.push(...p); uv.push(i / n, j / (rings.length - 1));
    if (!j) return;
    const a = (j - 1) * n + i, b = (j - 1) * n + (i + 1) % n;
    elements.push(a, b, b + n, a, b + n, a + n);
  }));
  function cap(ring: Ring, reverse: boolean) {
    const c = new THREE.Vector3(); for (const p of ring) c.add(new THREE.Vector3(...p)); c.divideScalar(n);
    const u = new THREE.Vector3(...ring[0]).sub(c).normalize();
    const axis = u.clone().cross(new THREE.Vector3(...ring[1]).sub(c)).normalize();
    const v = axis.cross(u), base = xyz.length / 3;
    xyz.push(c.x, c.y, c.z); uv.push(.5, .5);
    for (const p of ring) {
      const offset = new THREE.Vector3(...p).sub(c); xyz.push(...p); uv.push(.5 + offset.dot(u), .5 + offset.dot(v));
    }
    for (let i = 0; i < n; i++) {
      const a = base + 1 + i, b = base + 1 + (i + 1) % n;
      elements.push(base, reverse ? b : a, reverse ? a : b);
    }
  }
  if (capStart) cap(rings[0], true);
  if (capEnd) cap(rings[rings.length - 1], false);
  return geometry(xyz, uv, elements);
}

export function rectRing(w: number, d: number, r: number, y: number, cx = 0, cz = 0, steps = 3): Ring {
  const ring: Ring = []; r = Math.min(r, w * .49, d * .49);
  for (let q = 0; q < 4; q++) {
    const x = (q === 0 || q === 3 ? 1 : -1) * (w / 2 - r), z = (q < 2 ? -1 : 1) * (d / 2 - r);
    for (let j = 0; j <= steps; j++) {
      const a = -(q + j / steps) * Math.PI / 2;
      ring.push([cx + x + Math.cos(a) * r, y, cz + z + Math.sin(a) * r]);
    }
  }
  return ring;
}
export function oval(w: number, d: number, y: number, n = 24, power = 1): Ring {
  return Array.from({ length: n }, (_, i) => {
    const a = -i * Math.PI * 2 / n, c = Math.cos(a), s = Math.sin(a);
    return [Math.sign(c) * Math.abs(c) ** power * w / 2, y, Math.sign(s) * Math.abs(s) ** power * d / 2];
  });
}
export function turn(profile: Profile, segments = 16) {
  // A pole is ONE vertex. A rectangular lathe grid emits an invisible zero-area
  // triangle for every radial segment at a foot, lid, bulb or bowl centre.
  const xyz: number[] = [], uv: number[] = [], normal: number[] = [], index: number[] = [], rows: number[][] = [];
  for (let j = 0; j < profile.length; j++) {
    const [r, y] = profile[j], prev = profile[Math.max(0, j - 1)], next = profile[Math.min(j + 1, profile.length - 1)];
    const t0 = new THREE.Vector2(r - prev[0], y - prev[1]).normalize(), t1 = new THREE.Vector2(next[0] - r, next[1] - y).normalize();
    const t = t0.add(t1).normalize(), ring: number[] = [];
    for (let i = 0; i <= (r > 0 ? segments : 0); i++) {
      const a = -i * Math.PI * 2 / segments, c = Math.cos(a), s = Math.sin(a);
      ring.push(xyz.length / 3); xyz.push(r * c, y, r * s); uv.push(i / segments, j / (profile.length - 1));
      normal.push(r > 0 ? t.y * c : 0, r > 0 ? -t.x : -Math.sign(t.x), r > 0 ? t.y * s : 0);
    }
    rows.push(ring);
    if (!j) continue;
    const a = rows[j - 1], b = ring;
    for (let i = 0; i < segments; i++) {
      if (a.length === 1) index.push(a[0], b[i + 1], b[i]);
      else if (b.length === 1) index.push(a[i], a[i + 1], b[0]);
      else index.push(a[i], a[i + 1], b[i + 1], a[i], b[i + 1], b[i]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(index); return g;
}

/** A sawn outline in the XY drawing plane, including actual through-apertures. */
export function casting(outline: number[][], depth: number, apertures: number[][][] = []) {
  const path = (p: number[][]) => p.map(([x, y]) => new THREE.Vector2(x, y));
  const shape = new THREE.Shape(path(outline));
  for (const hole of apertures) shape.holes.push(new THREE.Path(path(hole)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
  return g.translate(0, 0, -depth / 2);
}
export function circleXY(x: number, y: number, r: number, n = 24) {
  return Array.from({ length: n }, (_, i) => [x + r * Math.cos(i * Math.PI * 2 / n), y + r * Math.sin(i * Math.PI * 2 / n)]);
}
export function rectXY(w: number, h: number, r: number, x = 0, y = 0) {
  return rectRing(w, h, r, 0).map(p => [x + p[0], y - p[2]]);
}

/** Turned, tapered or bent stock. Parallel-transport the section rather than
 * intersecting separate cylinders; radii and feet can change along the spine. */
export function stock(stations: [x: number, y: number, z: number, radius: number][], sides = 9, wall = 0) {
  const centers = stations.map(p => new THREE.Vector3(p[0], p[1], p[2]));
  let right = new THREE.Vector3(1, 0, 0);
  const rings = stations.map((p, i) => {
    const axis = centers[Math.min(i + 1, centers.length - 1)].clone().sub(centers[Math.max(0, i - 1)]).normalize();
    if (Math.abs(right.dot(axis)) > .98) right = new THREE.Vector3(0, Math.abs(axis.y) < .9 ? 1 : 0, Math.abs(axis.y) < .9 ? 0 : 1);
    right.addScaledVector(axis, -right.dot(axis)).normalize();
    const across = axis.clone().cross(right);
    return Array.from({ length: sides }, (_, j): Point => {
      const a = j * Math.PI * 2 / sides;
      const v = centers[i].clone().addScaledVector(right, p[3] * Math.cos(a)).addScaledVector(across, p[3] * Math.sin(a));
      return [v.x, v.y, v.z];
    });
  });
  if (wall > 0) {
    const inside = rings.map((ring, i) => ring.map((p): Point => {
      const c = centers[i], scale = Math.max(.1, 1 - wall / stations[i][3]);
      return [c.x + (p[0] - c.x) * scale, c.y + (p[1] - c.y) * scale, c.z + (p[2] - c.z) * scale];
    })).reverse();
    return loft([...rings, ...inside, rings[0]], false, false);
  }
  return loft(rings);
}
export function bent(k: FurnitureKit, m: THREE.Material, stations: [number, number, number, number][], sides = 9) {
  k.put(stock(stations, sides), m, 0, 0, 0);
}
export function rail(k: FurnitureKit, a: Point, b: Point, r: number, m: THREE.Material, sides = 8) {
  bent(k, m, [[...a, r], [...b, r]], sides);
}

/** Closed cloth or pressed sheet. Columns run left to right, rows from -Z to
 * +Z. The hem is stitched between the two faces, not a double-sided material. */
export function sheet(columns: number[], rows: number[], point: (u: number, v: number, underside: boolean) => Point, lamina = false) {
  const nx = columns.length, nz = rows.length, count = nx * nz;
  const xyz: number[] = [], uv: number[] = [], indices: number[] = [];
  for (const under of (lamina ? [false] : [false, true])) rows.forEach((v, j) => columns.forEach((u, i) => {
    xyz.push(...point(u, v, under)); uv.push((u + 1) / 2, (v + 1) / 2);
    if (i === nx - 1 || j === nz - 1) return;
    const a = j * nx + i + (under ? count : 0), b = a + nx;
    if (under) indices.push(a, a + 1, b, a + 1, b + 1, b);
    else indices.push(a, b, a + 1, a + 1, b, b + 1);
  }));
  if (lamina) return geometry(xyz, uv, indices);
  const boundary: number[] = [];
  for (let i = 0; i < nx; i++) boundary.push(i);
  for (let j = 1; j < nz; j++) boundary.push(j * nx + nx - 1);
  for (let i = nx - 2; i >= 0; i--) boundary.push((nz - 1) * nx + i);
  for (let j = nz - 2; j > 0; j--) boundary.push(j * nx);
  boundary.forEach((a, i) => { const b = boundary[(i + 1) % boundary.length]; indices.push(a, b, b + count, a, b + count, a + count); });
  return geometry(xyz, uv, indices);
}

/** Cabinet/door in the XY plane, with a field visibly recessed into the rails.
 * The final field can instead be left open for a grille, glass or cubby. */
export function fieldFrame(w: number, h: number, depth: number, railWidth: number, open = false) {
  const innerW = w - 2 * railWidth, innerH = h - 2 * railWidth;
  const g = loft([
    rectRing(w - .012, h - .012, .012, -depth / 2), rectRing(w, h, .014, depth * .23), rectRing(w - .009, h - .009, .012, depth / 2),
    rectRing(innerW + .018, innerH + .018, .009, depth / 2), rectRing(innerW, innerH, .009, -depth * .16),
  ], !open, !open);
  return g.rotateX(Math.PI / 2);
}
export function board(w: number, d: number, h: number, radius: number, undercut = .025) {
  const cut = Math.min(undercut, w * .16, d * .16);
  // A millimetre corner on an instrument fascia does not need the arc stations
  // of a large table corner. Keep the spend in the undercut and the big silhouettes.
  const n = radius < .035 ? 1 : radius < .085 ? 2 : 3;
  const sections = [rectRing(w - 2 * cut, d - 2 * cut, radius * .8, -h / 2, 0, 0, n), rectRing(w, d, radius, h * .16, 0, 0, n),
    rectRing(w, d, radius, h * .38, 0, 0, n), rectRing(w - .005, d - .005, radius, h / 2, 0, 0, n)];
  const g = loft(sections), uv = g.getAttribute('uv'), pos = g.getAttribute('position');
  for (let i = 4 * sections[0].length; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    uv.setXY(i, (w >= d ? x : z) * .71 + .5, (w >= d ? z : x) * 1.12 + .5);
  }
  return g;
}
