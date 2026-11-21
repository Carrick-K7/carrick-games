import * as THREE from 'three';
import type { VillaModelBuilder } from './villaModel.js';
import { NatureMesh, add3, collar, margin, polar, turn, type Collar, type P3 } from './villaNatureGeometry.js';
import type { VillaPetId } from './villaPets.js';

const oat = 0xf1dec1, ink = 0x362e2b, charcoal = 0x51483d, rose = 0xd99d9d, tabby = 0xc4b7a6, stripe = 0x756658;
const bred = (id: VillaPetId) => ({ bird: id === 'parrot' || id === 'parrot-blue', rabbit: id === 'rabbit' || id === 'rabbit-female',
  cat: id === 'cat', blue: id === 'parrot-blue', female: id === 'rabbit-female', fur: id === 'cat' ? tabby : id === 'dog' ? 0xba824f : id === 'rabbit-female' ? 0xd6d4cd : 0xf6e5c8 });
type Section = [z: number, centreY: number, halfWidth: number, halfHeight: number];
/** Sagittal cross sections: independent widths/heights and a moving spine let
 * the shoulders, waist, rump, throat and muzzle meet without a ball joint seam. */
function form(rings: Section[], sides = 14, offset?: (x: number, y: number, z: number) => P3) {
  const skin = new NatureMesh(), xyz = offset ?? ((x: number, y: number, z: number): P3 => [x, y, z]);
  skin.skin(rings.map(([z, y, rx, ry]) => !rx ? [xyz(0, y, z)] : Array.from({ length: sides }, (_, i) => {
    const a = turn * i / sides; return xyz(rx * Math.cos(a), y + ry * Math.sin(a), z);
  })));
  return skin.geometry();
}
class Coat {
  constructor(readonly b: VillaModelBuilder, readonly material: THREE.Material) {}
  paint(g: THREE.BufferGeometry, color: number, p: P3 = [0, 0, 0], rotation: P3 = [0, 0, 0], pattern?: (x: number, y: number, z: number) => number) {
    const pos = g.getAttribute('position'), shades = new Float32Array(pos.count * 3), rgb = new THREE.Color(color);
    for (let i = 0; i < pos.count; i++) {
      if (pattern) rgb.set(pattern(pos.getX(i), pos.getY(i), pos.getZ(i)));
      shades.set([rgb.r, rgb.g, rgb.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(shades, 3)); this.b.geometry(g, this.material, p, rotation);
  }
  oval(color: number, p: P3, size: P3, rotation: P3 = [0, 0, 0]) {
    const g = new THREE.SphereGeometry(1, 10, 6); g.scale(...size); this.paint(g, color, p, rotation);
  }
  cord(color: number, path: Collar[], sides = 6) { const m = new NatureMesh(); m.stem(path, sides); this.paint(m.geometry(), color); }
  feather(p: P3, ray: P3, width: number, color: number, face: P3, roll = .10) {
    const vane = new NatureMesh(); vane.blade(p, ray, width, margin.feather, width * .32, roll, -.22, width * .12, face);
    this.paint(vane.geometry(), color);
    const mid: P3 = [p[0] + ray[0] * .48 + face[0] * width * .33, p[1] + ray[1] * .48 + face[1] * width * .33, p[2] + ray[2] * .48 + face[2] * width * .33];
    this.cord(0x879681, [collar(p, .0018), collar(mid, .0012), collar(add3(p, ray), 0)], 4);
  }
}

export function companionBody(b: VillaModelBuilder, material: THREE.Material, id: VillaPetId) {
  const c = new Coat(b, material), { bird, rabbit, cat, blue, fur } = bred(id);
  if (cat) {
    // Keep the short-haired rib cage (and its tabby markings) one curved skin.
    // Outside the striped saddle, tuck the belly, lift the withers and broaden
    // the croup into the hind legs. No free-standing stripe meshes.
    const g = new THREE.SphereGeometry(1, 16, 28); g.rotateX(Math.PI / 2); g.scale(.105, .13, .195);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), front = Math.max(0, (z - .09) / .105), hip = Math.max(0, (-z - .14) / .055);
      const tuck = Math.max(0, Math.min(1, (-y - .03) / .10)) * Math.exp(-((z + .055) ** 2) / .0024);
      p.setXYZ(i, x * (1 - .24 * front + .18 * hip), y + .058 * front + .012 * hip + .027 * tuck, z);
    }
    g.computeVertexNormals(); c.paint(g, fur, [0, .235, -.035], [0, 0, 0], (_x, y, z) => y > -.025 && [-.115, -.025, .065].some(s => Math.abs(z - s) < .019) ? stripe : y < -.073 || z > .148 ? oat : fur);
  } else if (bird) {
    c.paint(form([[-.109, .211, 0, 0], [-.092, .200, .037, .054], [-.056, .212, .073, .100], [-.008, .239, .092, .143],
      [.042, .249, .087, .130], [.080, .253, .066, .084], [.102, .251, .032, .049], [.111, .249, 0, 0]], 16),
    0x439561, [0, 0, 0], [0, 0, 0], (_x, y, z) => z > .046 && y > .17 && y < .33 ? blue ? 0xb8cda2 : 0xd4be60 : blue ? 0x459bba : 0x48a763);
  } else {
    const sections: Section[] = rabbit ? [[-.234, .198, 0, 0], [-.216, .191, .064, .081], [-.172, .194, .124, .132], [-.111, .208, .144, .153],
      [-.035, .200, .130, .124], [.030, .189, .113, .101], [.087, .217, .098, .090], [.13, .252, .074, .077], [.158, .273, 0, 0]]
      : [[-.24, .247, 0, 0], [-.212, .236, .080, .078], [-.161, .236, .129, .113], [-.080, .247, .114, .105], [-.016, .257, .107, .097],
        [.050, .251, .13, .136], [.103, .258, .112, .134], [.143, .286, .086, .101], [.174, .308, .062, .071], [.194, .318, 0, 0]];
    c.paint(form(sections, 16), fur, [0, 0, 0], [0, 0, 0], (x, y, z) => (z > .08 && y < .276 && Math.abs(x) < .077 || rabbit && y < .094) ? oat : fur);
  }
}
function pinna(c: Coat, id: VillaPetId, side: number) {
  const { cat, rabbit, female, fur } = bred(id), m = new NatureMesh();
  if (cat || rabbit) {
    const stations = cat ? [[.056, .043, .027], [.092, .047, .032], [.125, .033, .026], [.157, .017, .014], [.179, .004, .004]]
      : [[.054, .023, .025], [.085, .031, .027], [.138, .040, .026], [.192, .035, .020], [.232, .022, .013], [.253, .006, .005]];
    const pos = (x: number, h: number, z: number): P3 => [side * (cat ? .064 + .14 * h : .040 + h * (female ? .28 : .08)) + x, h * (female ? .93 : 1), -.016 - .11 * h + z];
    m.skin([[pos(0, .048, 0)], ...stations.map(([h, w, d]) => [[-1, 0], [-.72, .76], [0, .26], [.72, .76], [1, 0], [.66, -.75], [0, -.97], [-.66, -.75]].map(([x, z]) => pos(x * w, h, z * d))), [pos(0, stations[stations.length - 1][0] + .004, 0)]]);
    const geo = m.geometry(), p = geo.getAttribute('position'), color: number[] = [], rgb = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const j = (i - 1) % 8, interior = i > 8 && i < p.count - 9 && (j === 1 || j === 2 || j === 3);
      rgb.set(interior ? j === 2 ? 0xd49b97 : 0xe6b7ac : fur); color.push(rgb.r, rgb.g, rgb.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(color, 3)); c.b.geometry(geo, c.material);
  } else {
    // The puppy's velvety ears fold at a wide root and narrow just above the jaw.
    m.round([[-.105, 0], [-.095, .032], [-.059, .058], [-.002, .068], [.049, .057], [.076, .031], [.080, 0]], 12,
      (x, y, z) => [side * (.111 - .17 * y) + x * .43, y, -.025 + z]);
    c.paint(m.geometry(), 0x8b5d40);
  }
}
export function companionHead(b: VillaModelBuilder, material: THREE.Material, id: VillaPetId) {
  const c = new Coat(b, material), { bird, rabbit, cat, blue, fur } = bred(id);
  if (bird) {
    c.paint(form([[-.078, -.004, 0, 0], [-.063, .005, .052, .067], [-.028, .010, .079, .082], [.017, .007, .085, .083],
      [.049, .006, .068, .065], [.072, -.001, .049, .042], [.082, -.007, 0, 0]]), blue ? 0x69b9dc : 0x51b66a);
    const beak = form([[.061, -.008, 0, 0], [.070, -.001, .035, .028], [.089, -.001, .038, .030], [.107, -.009, .026, .025], [.119, -.025, .014, .016], [.1198, -.046, 0, 0]], 12);
    c.paint(beak, 0xdca655); c.paint(form([[.070, -.038, 0, 0], [.081, -.038, .026, .016], [.099, -.035, .023, .014], [.109, -.031, 0, 0]], 10), charcoal);
    for (const side of [-1, 1]) {
      c.oval(oat, [side * .066, -.001, .031], [.024, .032, .036]);
      c.oval(0x939178, [side * .020, .006, .096], [.0036, .0027, .0024]);
      for (let k = 0; k < 3; k++) c.oval(blue ? 0x66869a : 0x739472, [side * (.085 - .002 * k), -.012 + k * .008, .024], [.0028, .0019, .012]);
    }
  } else {
    const rs: Section[] = [[-.104, .003, 0, 0], [-.092, .003, .067, .069], [-.054, .009, .108, .103], [-.013, .008, .12, .113],
      [.026, .003, .113, .105], [.057, -.004, .095, .086], [.078, -.010, .071, .065], [.094, -.026, .061, .044],
      [rabbit || cat ? .122 : .143, -.026, rabbit || cat ? .040 : .055, .030], [rabbit || cat ? .132 : .163, -.021, .023, .019], [rabbit || cat ? .136 : .168, -.022, 0, 0]];
    c.paint(form(rs, 16), fur, [0, 0, 0], [0, 0, 0], (x, y, z) => z > .077 || y < -.069 ? oat : cat && y > .074 && Math.abs(x) > .035 && Math.abs(x) < .080 && z > -.015 ? 0x88796b : fur);
    const tip = rabbit || cat ? .135 : .166;
    c.oval(cat || rabbit ? rose : ink, [0, -.017, tip - .006], [cat || rabbit ? .017 : .022, .013, .012]);
    for (const side of [-1, 1]) {
      pinna(c, id, side);
      c.cord(0x836f60, [[0, -.027, tip + .001, .0022], [side * .005, -.040, tip - .006, .0018], [side * .028, -.045, tip - .012, .0012]], 4);
      if (cat || rabbit) for (let i = 0; i < (cat ? 3 : 2); i++) {
        const h = -.033 + i * .009; c.cord(0xefe3d0, [[side * .036, h, .113, .00115], [side * .078, h + .003, .112 - .009 * i, .0010], [side * .125, h + .006 - .01 * i, .113 - .014 * i, 0]], 4);
      }
    }
  }
  for (const side of [-1, 1]) {
    const x = bird ? .078 : rabbit ? .103 : .084, z = bird ? .043 : rabbit ? .044 : .068;
    const angle: P3 = [0, side * (bird || rabbit ? .98 : .54), 0];
    c.oval(bird ? 0xe7d8a6 : 0x654e3d, [side * x, .021, z], [.016, .019, .008], angle);
    c.oval(ink, [side * (x + .003), .022, z + .0038], [.012, .014, .008], angle);
    c.oval(0xfff6de, [side * (x + .007), .027, z + .0088], [.0037, .0040, .003], angle);
  }
}
export function companionTail(b: VillaModelBuilder, material: THREE.Material, id: VillaPetId) {
  const c = new Coat(b, material), { bird, rabbit, cat, blue, fur } = bred(id);
  if (rabbit) c.paint(form([[-.091, .017, 0, 0], [-.079, .021, .039, .042], [-.054, .017, .056, .056], [-.023, .008, .059, .055], [.012, 0, .038, .041], [.033, 0, 0, 0]], 12), 0xfff3dd);
  else if (bird) for (let k = -2; k <= 2; k++) c.feather([k * .009, .004, .012], [k * .014, -.077 + .009 * Math.abs(k), -.160 + .015 * Math.abs(k)],
    .023, k === 0 ? 0xb5ac64 : blue ? 0x347eaa : 0x40887b, [0, 1, 0], k * .12);
  else {
    const m = new NatureMesh();
    m.stem(cat ? [[0, 0, .024, .030], [.003, .013, -.027, .029], [.018, .065, -.064, .027], [.041, .137, -.059, .023], [.057, .171, -.030, .021], [.055, .166, .001, .015], [.044, .156, .009, 0]]
      : [[0, 0, .023, .039], [0, .014, -.035, .045], [.008, .043, -.089, .033], [.015, .079, -.128, .019], [.017, .101, -.132, 0]], 10);
    c.paint(m.geometry(), fur, [0, 0, 0], [0, 0, 0], (_x, y, z) => cat ? y > .15 || y > .078 && y < .105 ? stripe : fur : z < -.10 ? oat : fur);
  }
}
export function companionWing(b: VillaModelBuilder, material: THREE.Material, id: VillaPetId, side: number) {
  const c = new Coat(b, material), { blue } = bred(id), face: P3 = [side, 0, 0];
  // Scapular volume extends inside the torso at the pivot; the overlapping
  // coverts remain rooted in flesh at full extension as well as when folded.
  c.paint(form([[-.076, -.048, 0, 0], [-.050, -.040, .027, .044], [-.018, -.027, .038, .053], [.017, -.012, .035, .043], [.040, -.006, .022, .030], [.052, -.009, 0, 0]], 12),
    blue ? 0x428db5 : 0x4b9966, [side * .020, 0, 0]);
  // Remiges overlap like roof tiles from the wing wrist; pale shafts continue
  // into the leading coverts and the primary tips separate when the wing opens.
  for (let j = 0; j < 5; j++) {
    const p: P3 = [side * (.021 + j * .004), -.047 - .005 * j, .026 - .014 * j];
    c.feather(p, [side * (.067 - .005 * j), -.113 + .007 * j, -.038 - .012 * j], .022, blue ? j % 2 ? 0x357da5 : 0x305f91 : j % 2 ? 0x43886f : 0x356d88, face, side * .20);
  }
  for (let j = 0; j < 4; j++) c.feather([side * .012, .012, .033 - .017 * j], [side * .057, -.091, -.043], .029,
    blue ? j % 2 ? 0x408bbd : 0x50a1ca : j % 2 ? 0x409765 : 0x66a563, face, side * .17);
}
export function companionFoot(b: VillaModelBuilder, material: THREE.Material, side: number) {
  const c = new Coat(b, material);
  c.cord(charcoal, [[0, .01, -.007, .011], [0, -.055, -.006, .009], [0, -.094, .001, .013]], 7);
  for (let toe = 0; toe < 4; toe++) {
    const front = toe < 2, z = front ? .046 : -.033, x = side * (toe % 2 ? .019 : -.012);
    c.cord(0x736456, [[0, -.091, .001, .009], [x * .51, -.101, z * .58, .007], [x, -.105, z, .0046]], 6);
    c.cord(ink, [[x, -.105, z, .005], [x, -.108, z * 1.17, .0033], [x, -.116, z * 1.20, 0]], 5);
  }
}
export function companionLegs(b: VillaModelBuilder, material: THREE.Material, id: VillaPetId, pair: number) {
  const c = new Coat(b, material), { rabbit, cat, fur } = bred(id);
  for (const side of [-1, 1]) {
    const fore = (pair === 0 ? side : -side) > 0, z = fore ? .102 : -.126, x = side * (cat ? .078 : .087);
    const joint: Collar[] = fore ? [[x, .224, z, .045], [x * 1.04, .169, z - .013, .033], [x, .107, z + .001, .023], [x, .051, z + .011, .018], [x, .030, z + .026, .022]]
      : [[x, .231, z, rabbit ? .065 : .057], [x * 1.08, .155, z + .036, rabbit ? .059 : .041], [x * 1.06, .099, z - .006, .033], [x, .070, z - .032, .023], [x, .033, z - .023, .020]];
    c.cord(fur, joint, 10);
    const last = joint[joint.length - 1], pawZ = last[2] + (rabbit && !fore ? .030 : .013), len = rabbit && !fore ? .080 : .045;
    c.paint(form([[-len, .020, 0, 0], [-len * .72, .023, .023, .018], [0, .024, rabbit ? .035 : .032, .022], [len * .58, .020, .031, .017], [len, .017, 0, 0]], 12),
      cat ? 0xe4d6c2 : oat, [x, 0, pawZ]);
    for (let toe = -1; toe <= 1; toe++) c.oval(rabbit ? oat : 0xe0caac, [x + toe * .016, .017, pawZ + len * .68 - Math.abs(toe) * .005], [.012, .011, len * .34]);
  }
}

/** Two precomputed jointed poses per diagonal batch: shoulder/hip pivots and a
 * separate carpus/hock flex. At runtime two scalar morph weights reproduce the
 * gait, with no per-frame vertex uploads and no extra GPU skeletons or draws. */
export function jointedGait(group: THREE.Group, pair: number, rabbit: boolean) {
  const mesh = group.children[0] as THREE.Mesh, g = mesh.geometry, p = g.getAttribute('position'), n = g.getAttribute('normal');
  const positions: THREE.Float32BufferAttribute[] = [], normals: THREE.Float32BufferAttribute[] = [];
  for (const stroke of [-1, 1]) {
    const dv: number[] = [], dn: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), z = p.getZ(i), side = Math.sign(p.getX(i)), fore = (pair === 0 ? side : -side) > 0;
      const rootY = .202, rootZ = fore ? .101 : -.126, kneeY = fore ? .126 : .145, kneeZ = rootZ + (fore ? -.010 : .03);
      const hip = stroke * (fore ? .26 : rabbit ? .35 : .28), blend = THREE.MathUtils.smoothstep(kneeY - y, -.022, .036),
        knee = Math.max(0, stroke) * (fore ? -.23 : rabbit ? -.51 : -.35) * blend;
      const dy = y - kneeY, dz = z - kneeZ, y1 = kneeY + dy * Math.cos(knee) - dz * Math.sin(knee), z1 = kneeZ + dy * Math.sin(knee) + dz * Math.cos(knee);
      const y2 = rootY + (y1 - rootY) * Math.cos(hip) - (z1 - rootZ) * Math.sin(hip), z2 = rootZ + (y1 - rootY) * Math.sin(hip) + (z1 - rootZ) * Math.cos(hip);
      dv.push(0, y2 - y, z2 - z);
      const ay = n.getY(i), az = n.getZ(i), a = knee + hip; dn.push(0, ay * Math.cos(a) - az * Math.sin(a) - ay, ay * Math.sin(a) + az * Math.cos(a) - az);
    }
    positions.push(new THREE.Float32BufferAttribute(dv, 3)); normals.push(new THREE.Float32BufferAttribute(dn, 3));
  }
  g.morphTargetsRelative = true; g.morphAttributes.position = positions; g.morphAttributes.normal = normals; mesh.updateMorphTargets(); return mesh.morphTargetInfluences!;
}

export function companionDish(b: VillaModelBuilder, material: THREE.Material, id: VillaPetId) {
  const c = new Coat(b, material), { rabbit, bird, cat } = bred(id), clay = rabbit ? 0xc6a16c : cat ? 0xc88768 : bird ? 0xe7dac1 : 0x89acaa;
  const h = bird ? .027 : rabbit ? .033 : cat ? .038 : .047, dish = new NatureMesh();
  dish.round([[.002, 0], [.002, .080], [.007, .092], [.012, .093], [h * .68, .104], [h - .005, .106], [h, .102], [h, .097], [h - .005, .093], [.020, .082], [.013, .056], [.011, 0]], 22);
  c.paint(dish.geometry(), clay, [0, 0, 0], [0, 0, 0], (_x, y) => y === 0 ? clay : y < .009 ? 0x8b7b68 : y > h - .004 ? 0xe8d6ba : clay);
  if (rabbit) {
    for (let i = 0; i < 10; i++) {
      const a = i * 2.399, p = polar(a, .054, .018 + i % 3 * .002), mid: P3 = [p[0] * .1, .023, p[2] * .25];
      c.cord(i % 2 ? 0xd8b86d : 0xbca263, [collar(p, .0022), collar(mid, .0022), collar(polar(a + 2.73, .060, .021), .0018)], 4);
    }
    for (let j = 0; j < 4; j++) { const greens = new NatureMesh(), a = j * 2.399; greens.blade(polar(a + Math.PI, .019, .023), polar(a, .073, .014), .020, margin.cherry, .012, .27); c.paint(greens.geometry(), j % 2 ? 0x759057 : 0x55804a); }
  } else for (let i = 0; i < (bird ? 17 : 10); i++) {
    const a = i * 2.399, r = .068 * Math.sqrt((i + .5) / (bird ? 17 : 10)), p = polar(a, r, .014 + r * .082);
    if (bird) {
      const seed = form([[-.010, 0, 0, 0], [-.005, .002, .0043, .003], [.002, .003, .005, .004], [.008, .002, .003, .002], [.012, 0, 0, 0]], 7);
      c.paint(seed, i % 3 ? 0xd9bd84 : 0x83623e, p, [0, a, 0]);
    } else {
      const pellet = new NatureMesh(); pellet.round([[0, 0], [.002, .010], [.013, .014], [.018, .010], [.019, 0]], cat ? 6 : 9,
        (x, y, z, t) => [x * (1 + .17 * Math.cos(t * 3)), y, z * (1 + .17 * Math.cos(t * 3))]);
      c.paint(pellet.geometry(), i % 2 ? 0x926544 : 0xab8052, p, [0, a, 0]);
    }
  }
}
