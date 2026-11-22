import * as THREE from 'three';

/** All samples are local, bounded and mipmapped. Data maps are never sRGB decoded. */
export function finishTexture(name: string, w: number, h: number, data: Uint8Array<ArrayBuffer>, color = true) {
  const t = new THREE.DataTexture(data, w, h);
  t.name = name; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = true; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4; t.needsUpdate = true; return t;
}
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export function sample01(x: number, y: number) {
  let v = Math.imul(x | 0, 0x2c1b3c6d) ^ Math.imul(y | 0, 0x297a2d39);
  v = Math.imul(v ^ v >>> 15, 0x85ebca6b); return ((v ^ v >>> 13) >>> 0) / 4294967296;
}

/** One measured timber stamp per workpiece. Sections need not run along their
 * extrusion axis: a birdsmouthed rafter is *cut* across Z, but its fibres run in X. */
export function dressTimber(g: THREE.BufferGeometry, along: 'x' | 'y' | 'z', piece: number,
  finish: (x: number, y: number, z: number, ny: number) => number = () => 1) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = g.getAttribute('uv');
  const color = new Float32Array(3 * p.count), u0 = sample01(piece, 49), v0 = sample01(piece, 407);
  const board = .78 + sample01(piece, 75) * .21, warm = .94 + sample01(piece, 33) * .10;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
    const s = along === 'x' ? x : along === 'y' ? y : z;
    const a = along === 'x' ? z : x, b = along === 'y' ? z : y;
    const end = Math.abs(along === 'x' ? nx : along === 'y' ? ny : nz) > .78;
    // The two broad faces register around an arris instead of stretching an entire
    // plank image across a 25 mm edge. Darker cross cuts do not claim continuous long grain.
    uv.setXY(i, u0 + (end ? a * 1.8 + b * .8 : s / 2.5), v0 + (end ? b * 3.8 - a : (a + b) / .35));
    const f = board * finish(x, y, z, ny) * (end ? .78 : 1);
    color.set([f * warm, f, f / warm], 3 * i);
  }
  g.setAttribute('color', new THREE.BufferAttribute(color, 3)); return g;
}

/** Outdoor render material is separate from indoor stained oak. All its workpieces
 * have a finish attribute. The supplied swatch may resolve in-place after construction. */
export function exteriorTimber(m: {oak: THREE.MeshStandardMaterial; exteriorTimber?: THREE.MeshStandardMaterial}) {
  if (!m.exteriorTimber) {
    m.exteriorTimber = m.oak.clone(); m.exteriorTimber.color.set('#e8ddcb');
    m.exteriorTimber.roughness = .91; m.exteriorTimber.name = 'air-dried exterior timber';
  }
  m.exteriorTimber.vertexColors = true; return m.exteriorTimber;
}

export function stoneTint(g: THREE.BufferGeometry, piece: number, exposure: (i: number) => number = () => 1) {
  const p = g.getAttribute('position'), color = new Float32Array(3 * p.count);
  const bed = .77 + .21 * sample01(piece, 191), ochre = .945 + .07 * sample01(piece, 203);
  for (let i = 0; i < p.count; i++) {
    const f = bed * exposure(i); color.set([f * ochre, f, f / ochre], 3 * i);
  }
  g.setAttribute('color', new THREE.BufferAttribute(color, 3)); return g;
}

/** The flagstone border and roof terrace use cut courses, not white concrete.
 * Recover their world bond from each triangle centre, so a tile divided by a
 * slab cut still has the very same stone and no new seam or material slot. */
export function dressedCourses(g:THREE.BufferGeometry,length:number,pitch:number,top:number,edge?:(x:number,z:number)=>number) {
  const p=g.getAttribute('position'), color=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i+=3){
    const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;
    const row=Math.floor(z/pitch),col=Math.floor(x/length-((row%3+3)%3)/3), bed=.75+.22*sample01(col,row+202), warm=.95+.077*sample01(row,col+61);
    for(let j=i;j<i+3;j++){
      const f=bed*(p.getY(j)<top-.001?.87:1)*(1-.13*(edge?.(p.getX(j),p.getZ(j))??0));
      color.set([f*warm,f,f/warm],3*j);
    }
  }
  g.setAttribute('color',new THREE.BufferAttribute(color,3));return g;
}

/** A soft outdoor reflection field, NOT a picture on each pane. One low-resolution
 * angular swatch for the whole scene: open sky, distant ridge, uneven coppice and
 * lawn. It is sampled by reflected ray, so it continues across an entire window
 * bank and breaks up on water normals. Day/night illumination remains dynamic. */
const reflectionFields = new WeakMap<THREE.Object3D, THREE.DataTexture>();
export function gardenReflection(root: THREE.Object3D) {
  const cached = reflectionFields.get(root); if (cached) return cached;
  const w = 384, h = 96, data = new Uint8Array(4 * w * h), tau = 2 * Math.PI;
  const crowns = Array.from({length: 52}, (_, i) => ({a: sample01(i, 61) * tau, radius: .018 + .08 * sample01(i, 302),
    height: .042 + .18 * sample01(i, 46), lift: .023 + .055 * sample01(i, 188)}));
  for (let x = 0; x < w; x++) {
    const a = (x + .5) / w * tau, ridge = .054 + .037 * Math.cos(3 * a + .6) + .023 * Math.sin(7 * a);
    let crown = -.1, crownBottom = 1;
    for (const c of crowns) {
      let dx = Math.abs(a - c.a); dx = Math.min(dx, tau - dx) / c.radius;
      if (dx >= 1) continue;
      const lobe = Math.sqrt(1 - dx * dx) * (.92 + .075 * Math.cos(62 * a + c.a));
      crown = Math.max(crown, c.lift + c.height * lobe); crownBottom = Math.min(crownBottom, c.lift * (1 - .77 * lobe));
    }
    for (let y = 0; y < h; y++) {
      // More samples around the horizon where changes in elevation matter. The
      // shader passes world ray y directly, not a latitude painted onto the mesh.
      const slope = (y + .5) / h * 1.30 - .53, sky = 1-Math.exp(-3.7*Math.max(0,slope)), i = 4 * (y * w + x);
      let r = 190 - 70 * sky, g = 206 - 42 * sky, b = 214 - 21 * sky;
      if (slope <= ridge) { r = 120; g = 133; b = 117; }
      if (slope < -.012) { const near = clamp01(-slope * 3); r = 93 + 14 * near; g = 106 + 8 * near; b = 77 + 8 * near; }
      const foliage = clamp01((crown - slope) * 74) * clamp01((slope - crownBottom) * 93);
      const leaf = 9 * Math.sin(19 * a + slope * 21) + 5 * Math.sin(36 * a - 18 * slope);
      data[i] = r + foliage * (53 + leaf - r); data[i+1] = g + foliage * (72 + leaf - g);
      data[i+2] = b + foliage * (59 + leaf - b); data[i+3] = 255;
    }
  }
  const map = finishTexture('exterior/sky-ridge-coppice', w, h, data); map.wrapT = THREE.ClampToEdgeWrapping;
  reflectionFields.set(root, map); return map;
}

// Both the clear laminated facade and water use the same dimmable field. No
// second scene pass, PMREM upload, camera readback, or reflection texture per pane.
export const reflectedFieldGLSL = `
  vec3 viewer = normalize(vViewPosition);
  vec3 ray = transformDirectionByInverseViewMatrix(reflect(-viewer, normal), viewMatrix);
  vec2 gardenUV = vec2(atan(ray.z, ray.x) * RECIPROCAL_PI2 + .5, (ray.y + .53) / 1.30);
  vec3 gardenLight = texture2D(map, gardenUV).rgb;
  #if NUM_HEMI_LIGHTS > 0
    gardenLight *= .68 * hemisphereLights[0].skyColor + .12 * ambientLightColor;
  #endif
  float grazing = 1.0 - clamp(dot(viewer, normal), 0.0, 1.0);
  float glancing = grazing * grazing * grazing;
`;
