import * as THREE from 'three';

/** Section coordinates in metres. A horizontal X member takes [depth Z, height Y];
 * a vertical Y member [width X, depth Z]; a Z member [width X, height Y].
 * A measured profile is swept without rounding the arrises of a rebate or filling a drip groove. */
export type Section = readonly (readonly [number, number])[];
export function millSection(axis: 'x' | 'y' | 'z', length: number, section: Section, faces: 'closed'|'socketed'|'bedded' = 'closed'): THREE.BufferGeometry {
  const ring = section.map(([a, b]) => new THREE.Vector2(axis === 'x' ? -a : a, axis === 'y' ? -b : b));
  if (THREE.ShapeUtils.isClockWise(ring)) ring.reverse();
  const p: number[] = [], uv: number[] = [], half = length / 2;
  const vertex = (i: number, end: number, u: number, v: number) => {
    const s = ring[i]!;
    if (axis === 'x') p.push(end, s.y, -s.x);
    else if (axis === 'y') p.push(s.x, end, -s.y);
    else p.push(s.x, s.y, end);
    uv.push(u / 2.5, v / 2.5);
  };
  let around = 0;
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length, next = around + ring[i]!.distanceTo(ring[j]!);
    // A bedded, wall-backed X section starts at the (Z=0, Y=0) contact corner.
    // The floor and wall already enclose these two faces, including at its ends.
    if(faces==='bedded'&&axis==='x'&&((ring[i].x===0&&ring[j].x===0)||(ring[i].y===0&&ring[j].y===0))){around=next;continue;}
    vertex(i, -half, 0, around); vertex(j, -half, 0, next); vertex(j, half, length, next);
    vertex(i, -half, 0, around); vertex(j, half, length, next); vertex(i, half, length, around);
    around = next;
  }
  // Socketed members must terminate INSIDE an opaque bearing at both ends.
  if(faces!=='socketed') for (const tri of THREE.ShapeUtils.triangulateShape(ring, [])) {
    for (const i of tri) vertex(i, half, ring[i]!.x, ring[i]!.y);
    for (const i of [...tri].reverse()) vertex(i, -half, ring[i]!.x, ring[i]!.y);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}

/** Closed lathed shell following an actual section, including its throat/return where present. */
export function turnSection(profile: Section, segments = 32) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

/** One non-overlapping face set, for a floor with a different ceiling underside.
 * Project finish grain in world metres; adjacent slabs never restart their texture. */
export function slabFaces(x: number, y: number, z: number, w: number, h: number, d: number, bottomOnly = false, omitBottom = false) {
  const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z);
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    const a = Math.abs(n.getX(i)) > .5 ? p.getZ(i) : p.getX(i);
    const b = Math.abs(n.getY(i)) > .5 ? p.getZ(i) : p.getY(i);
    uv.setXY(i, a / 2.5, b / 2.5);
  }
  if (bottomOnly || omitBottom) {
    const index = Array.from(g.index!.array).filter(i => bottomOnly ? n.getY(i) < -.5 : n.getY(i) > -.5);
    g.clearGroups(); g.setIndex(index);
  }
  return g;
}
