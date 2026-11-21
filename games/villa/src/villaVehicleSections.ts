import * as THREE from 'three';

/** Construction sections shared by the coach trimmer and the gaming hardware.
 * All coordinates are metres. No mirrored transforms, textures or cached GPU objects. */
export type P3 = [number, number, number];
export type P2 = [number, number];
const tau = Math.PI * 2;
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** One circuit of a rounded rectangular die, counterclockwise in the xy plane. */
export function roundedLoop(width: number, height: number, r: number, steps = 3): P2[] {
  r = Math.min(r, width * .49, height * .49);
  const pts: P2[] = [];
  for (let q = 0; q < 4; q++) for (let i = 0; i <= steps; i++) {
    const a = (q + i / steps) * Math.PI / 2;
    pts.push([(q === 0 || q === 3 ? 1 : -1) * (width / 2 - r) + r * Math.cos(a),
      (q < 2 ? 1 : -1) * (height / 2 - r) + r * Math.sin(a)]);
  }
  return pts;
}
export function ovalLoop(rx: number, ry: number, steps: number, exponent = 1): P2[] {
  return Array.from({ length: steps }, (_, i) => {
    const a = i * tau / steps, c = Math.cos(a), s = Math.sin(a);
    return [Math.sign(c) * Math.abs(c) ** exponent * rx, Math.sign(s) * Math.abs(s) ** exponent * ry];
  });
}

/** Connect matching closed sections. Rolled lips can turn back INTO the part;
 * only the two requested end faces are filled. Cap vertices are split at their
 * crease and triangulated in the actual section plane (also works for a C rail). */
export function sectionLoft(rings: P3[][], base = true, top = true, direction?: P3): THREE.BufferGeometry {
  const n = rings[0].length, positions = rings.flat(2), indices: number[] = [];
  const area = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = rings[0][i], b = rings[0][(i + 1) % n];
    area.x += (a[1] - b[1]) * (a[2] + b[2]); area.y += (a[2] - b[2]) * (a[0] + b[0]); area.z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const d = new THREE.Vector3();
  for (let j = 1; j < rings.length; j++) {
    d.set(0, 0, 0);
    for (let i = 0; i < n; i++) { const a = rings[0][i], b = rings[j][i]; d.x += b[0]-a[0]; d.y += b[1]-a[1]; d.z += b[2]-a[2]; }
    if (Math.abs(area.dot(d)) > 1e-15) break;
  }
  const reversed = area.dot(direction ? new THREE.Vector3(...direction) : d) < 0;
  for (let row = 1; row < rings.length; row++) for (let i = 0; i < n; i++) {
    const a = (row - 1) * n + i, b = (row - 1) * n + (i + 1) % n;
    indices.push(...(reversed ? [a, a+n, b, b, a+n, b+n] : [a, b, a+n, b, b+n, a+n]));
  }
  const cap = (row: P3[], end: boolean) => {
    const first = new THREE.Vector3(...row[0]);
    const tangent = new THREE.Vector3(...row[1]).sub(first).normalize(), normal = new THREE.Vector3();
    for (let i = 1; i < n-1; i++) normal.add(new THREE.Vector3(...row[i]).sub(first).cross(new THREE.Vector3(...row[i+1]).sub(first)));
    const across = normal.normalize().cross(tangent).normalize();
    const pts = row.map(p => { const v = new THREE.Vector3(...p).sub(first); return new THREE.Vector2(v.dot(tangent), v.dot(across)); });
    const offset = positions.length / 3;
    positions.push(...row.flat());
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(pts, [])) indices.push(...(end !== reversed ? [offset+a, offset+b, offset+c] : [offset+c, offset+b, offset+a]));
  };
  if (base) cap(rings[0], false); if (top) cap(rings[rings.length-1], true);
  // A rolled section sometimes turns back almost 180° at the mouth. Smooth
  // the bend, but do not average a broad outer face into its thin reverse: that
  // would put the reverse's vertex normal behind its own winding. Emit corner
  // normals directly (Villa's material batch already consumes triangle lists).
  const adjacent: number[][] = Array.from({ length: positions.length / 3 }, () => []);
  const faces = new Float32Array(indices.length);
  const a = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
  for (let i = 0; i < indices.length; i += 3) {
    a.fromArray(positions, indices[i] * 3);
    ab.fromArray(positions, indices[i+1] * 3).sub(a); ac.fromArray(positions, indices[i+2] * 3).sub(a);
    ab.cross(ac).normalize().toArray(faces,i);
    for (let k = 0; k < 3; k++) adjacent[indices[i+k]].push(i);
  }
  const vertices = new Float32Array(indices.length * 3), normals = new Float32Array(vertices.length);
  for (let i = 0; i < indices.length; i += 3) {
    a.fromArray(faces,i);
    for (let k = 0; k < 3; k++) {
      const v = indices[i+k]; ab.set(0,0,0);
      for (const j of adjacent[v]) { ac.fromArray(faces,j); if (ac.dot(a) > .36) ab.add(ac); }
      ac.fromArray(positions,3*v).toArray(vertices,3*(i+k)); ab.normalize().toArray(normals,3*(i+k));
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(vertices,3));
  g.setAttribute('normal',new THREE.BufferAttribute(normals,3)); return g;
}

/** Closed annular lathe about X. The section is a list of (axial, radial)
 * stations, not a disk: both sides of tyres, rim barrels and ear pads exist.
 * Radial normals meet at section creases, never across the centre aperture. */
export function turnedSection(section: readonly P2[], sides = 40): THREE.BufferGeometry {
  const p: number[] = [], normals: number[] = [], ix: number[] = [];
  const clockwise = section.reduce((s, a, i) => { const b = section[(i + 1) % section.length]; return s + a[0]*b[1] - b[0]*a[1]; }, 0) < 0;
  const cross = section.map((a, i) => {
    const b = section[(i+1) % section.length]; return new THREE.Vector2(a[1]-b[1], b[0]-a[0]).normalize().multiplyScalar(clockwise ? 1 : -1);
  });
  for (let j = 0; j < section.length; j++) {
    const k = (j+1) % section.length, last = (j + section.length-1) % section.length;
    const blend = (a: THREE.Vector2, b: THREE.Vector2) => a.dot(b) > .68 ? a.clone().add(b).normalize() : a;
    const n0 = blend(cross[j], cross[last]), n1 = blend(cross[j], cross[k]), offset = p.length / 3;
    for (let i = 0; i < sides; i++) {
      const a = i * tau / sides, c = Math.cos(a), s = Math.sin(a);
      for (const [v, norm] of [[section[j], n0], [section[k], n1]] as const) {
        p.push(v[0], v[1]*c, v[1]*s); normals.push(norm.x, norm.y*c, norm.y*s);
      }
    }
    for (let i = 0; i < sides; i++) {
      const a=offset+i*2, b=offset+((i+1)%sides)*2;
      ix.push(...(clockwise ? [a,b,a+1, b,b+1,a+1] : [a,a+1,b, b,a+1,b+1]));
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3)); g.setIndex(ix); return g;
}

/** Continuous mandrel bend. Parallel-transported sections meet through turns;
 * no overlapping flat cylinder caps or cracks at the elbow. */
export function bentRail(points: P3[], r: number, sides = 8): THREE.BufferGeometry {
  const v = points.map(p => new THREE.Vector3(...p)); let previous: THREE.Vector3 | undefined;
  const rings = v.map((p, i) => {
    const tangent = v[Math.min(v.length-1, i+1)].clone().sub(v[Math.max(0,i-1)]).normalize();
    const ref = previous ?? (Math.abs(tangent.y) > .8 ? new THREE.Vector3(1,0,0) : new THREE.Vector3(0,1,0));
    const x = ref.clone().addScaledVector(tangent,-ref.dot(tangent)).normalize(); previous=x;
    const y = tangent.clone().cross(x);
    return ovalLoop(r,r,sides).map(([a,b])=>p.clone().addScaledVector(x,a).addScaledVector(y,b).toArray() as P3);
  });
  return sectionLoft(rings);
}

/** Profiled rectangular cap with a bevel return and a flatter land on top. */
export function keySections(width: number, z: number, sculpt: number): { skirt: THREE.BufferGeometry; face: THREE.BufferGeometry } {
  const nx=6, nz=4, w=width*.84, depth=.022, pos:number[]=[], uv:number[]=[], ix:number[]=[];
  const point=(u:number,v:number):P3=>[(u-.5)*w*(1-.025*(2*v-1)**4), .008+sculpt*((2*u-1)**2+.45*(2*v-1)**2)-.0012*(v-.5), (v-.5)*depth-.0015];
  for(let j=0;j<=nz;j++) for(let i=0;i<=nx;i++) { pos.push(...point(i/nx,j/nz)); uv.push(i/nx,1-j/nz); if(j&&i){const d=j*(nx+1)+i;ix.push(d-nx-2,d-1,d-nx-1,d-nx-1,d-1,d);} }
  const perimeter=(fn:(u:number,v:number)=>P3)=>[
    ...Array.from({length:nx},(_,i)=>fn(i/nx,0)),...Array.from({length:nz},(_,j)=>fn(1,j/nz)),
    ...Array.from({length:nx},(_,i)=>fn(1-i/nx,1)),...Array.from({length:nz},(_,j)=>fn(0,1-j/nz))];
  // The lower skirt and top meet the very same (slightly dished) front edge.
  const skirt=sectionLoft([perimeter((u,v)=>[(u-.5)*width,-.010,(v-.5)*z]),perimeter((u,v)=>[(u-.5)*width,-.006,(v-.5)*z]),perimeter(point)],false,false);
  const face=new THREE.BufferGeometry();face.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));face.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));face.setIndex(ix);face.computeVertexNormals();return {skirt,face};
}
