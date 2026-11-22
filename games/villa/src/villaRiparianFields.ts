import * as THREE from 'three';
import { VillaModelBuilder } from './villaModel.js';
import { VILLA_ESTATE_FIELDS, villaTerrainHeight } from './villaEstateLayout.js';
import { villaDistanceToRoad } from './villaDrivingCourse.js';
import { VILLA_SCENIC_ROAD } from './villaDriving.js';
import { addVillaFieldCorn, addVillaRosette } from './villaCropArt.js';
import { NaturePalette, add3, collar, margin, mix3, polar, type P3 } from './villaNatureGeometry.js';
import { RiparianMesh, addGrit, drift, earthFinish, mix, riparianSeed, smooth } from './villaRiparianGround.js';

type Field = typeof VILLA_ESTATE_FIELDS[number];
const clay = new THREE.Color('#766044'), compost = new THREE.Color('#584838'), crumble = new THREE.Color('#9b7e55');
const pitch = .98;
function rowAxis(field: Field, x: number, z: number) { return x + .080 * (drift(x * .58, (z - field.minZ) * .73) - .5); }

// Reuse the authored crop morphology at several stages of growth. Geometry
// runs enter the usual estate material batches; no extra mesh per crop or row.
export class FieldModelBuilder extends VillaModelBuilder {
  private growth = 1;
  plant(x: number, y: number, z: number, yaw: number, scale: number, build: () => void) {
    this.growth = scale; try { this.at(x, y, z, yaw, build); } finally { this.growth = 1; }
  }
  override geometry(g: THREE.BufferGeometry, m: THREE.Material, p?: P3, r?: P3) {
    if (this.growth !== 1) g.scale(this.growth, this.growth, this.growth); super.geometry(g, m, p, r);
  }
}
export function cultivatedSoil() {
  const m = earthFinish('cultivated-soil');
  // Fine porous crumbs, not a baked image of rows. One local metre tile retains
  // a mip-filtered fine scale below the physical clods; no painted shadows.
  const size = 64, bytes = new Uint8Array(size * size * 4), random = riparianSeed(53549);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const r = random(), v = Math.round(214 + 26 * r + (r < .16 ? -26 : r > .79 ? 14 : 0)), k = (j * size + i) * 4;
    bytes[k] = v; bytes[k + 1] = v; bytes[k + 2] = v - 3; bytes[k + 3] = 255;
  }
  const t = new THREE.DataTexture(bytes, size, size); t.name = 'field/crumb-grain'; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true; m.map = t; return m;
}

/** Single watertight slice from furrow base to irregular moist/dry crest.
 * Never spread soil or plants past their designated beds into a road lane. */
function tilth(model: VillaModelBuilder, field: Field, soil: THREE.Material) {
  const m = new RiparianMesh(), random = riparianSeed(3390 + field.minZ), dz = field.maxZ - field.minZ, n = Math.ceil(dz / .46), sections: number[][] = [];
  let prev: number[] = [];
  for (let i = 0; i <= n; i++) {
    const z = mix(field.minZ, field.maxZ, i / n), row: number[] = [], taper = smooth(Math.min(z - field.minZ, field.maxZ - z) / .47);
    const vertex = (x: number, crest: number) => {
      const damp = drift(x * .98, z * .59), grain = drift(x * 3.9, z * 4.6);
      const h = .037 + crest * taper * (.047 + .050 * grain);
      const color = clay.clone().lerp(compost, .18 + .50 * (1 - crest) * damp).lerp(crumble, (.12 + .64 * crest) * (.30 + .60 * grain)).multiplyScalar(.86 + .24 * grain);
      row.push(m.vertex(x, villaTerrainHeight(x, z) + h, z, color));
    };
    vertex(field.minX, 0);
    for (let x = field.minX + .55; x < field.maxX - .2; x += pitch) {
      const axis = rowAxis(field, x, z), w = .90 + .24 * drift(z * 1.12, x * 2.3);
      for (const [u, relief] of [[-.34, 0], [-.18, .21], [-.054, .88], [.068, 1], [.18, .27], [.31, 0]]) vertex(axis + u * w, relief);
    }
    vertex(field.maxX, 0);
    if (i) for (let k = 0; k + 1 < row.length; k++) {
      const a = prev[k], b = row[k], c = prev[k + 1]; m.tri(a, b, c); m.tri(c, b, row[k + 1]);
      // Cast clods onto their own triangular row shoulder, not into the aisle.
      if (k % 6 === 3 && random() < .44) {
        const u = random() * .48, v = random() * .49, p = m.positions;
        const at = (j: number) => p[a * 3 + j] + u * (p[b * 3 + j] - p[a * 3 + j]) + v * (p[c * 3 + j] - p[a * 3 + j]);
        addGrit(m, at(0), at(2), at(1), .023 + .043 * random(), random() * 6.28, clay.clone().lerp(crumble, random() * .75), random);
      }
    }
    sections.push(row); prev = row;
  }
  model.geometry(m.geometry(true), soil);
  return (x: number, z: number) => {
    const f = (z - field.minZ) / dz * n, i = Math.min(n - 1, Math.floor(f)), t = f - i, a = sections[i], b = sections[i + 1], p = m.positions;
    for (let k = 0; k + 1 < a.length; k++) {
      const left = a[k] * 3, right = a[k + 1] * 3, next = b[k] * 3, nr = b[k + 1] * 3;
      const xr = mix(p[right], p[nr], t); if (x > xr) continue;
      if (x <= mix(p[right], p[next], t)) return mix(p[left + 1], p[next + 1], t) + (x - mix(p[left], p[next], t)) * (p[right + 1] - p[left + 1]) / (p[right] - p[left]);
      return mix(p[right + 1], p[nr + 1], t) + (x - xr) * (p[nr + 1] - p[next + 1]) / (p[nr] - p[next]);
    }
    return villaTerrainHeight(x, z) + .037;
  };
}

/** Gaps and different-sized shrubs on the field side of the headlands. These
 * are low soft bramble/herb runs, not a new solid hedge or a perimeter fence. */
function fieldHedges(model: VillaModelBuilder, field: Field, bark: THREE.Material, leaf: THREE.Material, young: THREE.Material) {
  const random = riparianSeed(field.minZ * 827), art = new NaturePalette(), gap = field.maxZ - field.minZ;
  const heads = [[field.minX - .49, field.minZ + gap * .29], [field.minX - .57, field.minZ + gap * .83], [field.maxX - 1.28, field.maxZ + .42]];
  for (const [i, [cx, cz]] of heads.entries()) for (let s = 0, count = 4 + Math.floor(random() * 6); s < count; s++) {
    const x = cx + (random() - .5) * (i === 2 ? 1.14 : .28), z = cz + (random() - .5) * (i === 2 ? .18 : 2.0);
    if (villaDistanceToRoad(x, z) < VILLA_SCENIC_ROAD.width / 2 + 1.04) continue;
    const h = .27 + .51 * random(), foot: P3 = [x, villaTerrainHeight(x, z) - .023, z], az = random() * 6.28;
    const fork = add3(foot, polar(az, h * .18, h * .44)); art.get(bark).stem([collar(foot, h * .034), collar(fork, h * .021)], 4, 0, 0, true);
    for (const d of [-1, 1]) {
      const a = az + d * 1.35, tip = add3(fork, polar(a, h * (.23 + .21 * random()), h * (.41 + .19 * random())));
      const shoot = art.get(bark); shoot.stem([collar(fork, .010), collar(tip, .003)], 3, 0, 0, true);
      for (let j = 0; j < 5; j++) {
        const side = a + (j % 2 ? -.94 : .94), m = art.get(j > 2 && random() > .54 ? young : leaf); m.tone = .71 + .36 * random();
        m.blade(mix3(fork, tip, .11 + j * .204), polar(side, h * (.23 + .11 * random()), h * (.10 - .20 * random())), h * .073, margin.ovate, h * .047, .42 * d);
      }
    }
  }
  art.finish(model);
}

export function plantRiparianField(model: FieldModelBuilder, field: Field, soil: THREE.Material, bark: THREE.Material, leaf: THREE.Material, cabbage: THREE.Material, lavender: THREE.Material, corn: THREE.Material) {
  const soilHeight = tilth(model, field, soil);
  const random = riparianSeed(91511 + field.minZ);
  for (let row = field.minX + .55; row < field.maxX - .2; row += pitch) {
    for (let station = field.minZ + .55; station < field.maxZ - .2; station += field.crop === 'corn' ? 1.1 : 1.3) {
      if (random() < .076) continue;
      const z = station + (random() - .5) * .22, x = rowAxis(field, row, z) + (random() - .5) * .074, phase = random() * Math.PI * 2;
      const size = .69 + .37 * random() + .22 * drift(x * .63, z * .54);
      model.plant(x, soilHeight(x, z) - (field.crop === 'lavender' ? 0 : .038 * size), z, phase, size, () => {
        if (field.crop === 'corn') { addVillaFieldCorn(model, leaf, corn, phase); return; }
        const art = new NaturePalette();
        if (field.crop === 'cabbage') addVillaRosette(art, [0, 0, 0], leaf, cabbage, phase, 1.48, true);
        else for (let j = 0; j < (size < .82 ? 3 : 5); j++) {
          const a = j * 2.399 + phase, foot = polar(a, .024, -.009), end = polar(a, .14 + .04 * Math.sin(a), .37 + .07 * Math.cos(a));
          art.get(leaf).stem([collar(foot, .008), collar(end, .003)], 4, 0, 0, true);
          for (let k = 0; k < 5; k++) art.get(leaf).blade(mix3(foot, end, .13 + .115 * k), polar(a + (k % 2 ? -.87 : .87), .107, .067), .015, margin.lance, .016);
          const flower = art.get(lavender); flower.tone = .72 + .41 * random();
          for (let k = 0; k < 4; k++) for (const side of [-1, 1]) flower.blade(mix3(foot, end, .67 + .097 * k), polar(a + k * 1.74 + side, .030 - .003 * k, .031), .016, margin.spur, .006, .14, .30);
        }
        art.finish(model);
      });
    }
  }
  fieldHedges(model, field, bark, leaf, cabbage);
}
