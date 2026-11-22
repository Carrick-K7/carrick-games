import * as THREE from 'three';
import type { FurnitureKit } from './villaFurnitureForms.js';
import { fleck, rugWeaves, rugWidth, weaveRugPixels, type RugWeave } from './villaUpholsteryLoom.js';

const bolts = ['flax', 'hide', 'velvet', 'ticking', 'quilt', 'facing', 'throw', 'twill'] as const;
export type ClothCut = typeof bolts[number] | RugWeave;
const width = rugWidth * 2, height = 1024, grainWidth = 256, grainHeight = 1024;
const family = [0, 1, 2, 0, 0, 0, 3, 3]; // linen/cotton, full-grain hide, short nap, spun wool
const grainsPerMetre = [185, 271, 139, 94]; // texels, not repeats per cushion

function dataMap(bytes: Uint8Array, w: number, h: number, name: string) {
  const t = new THREE.DataTexture(bytes, w, h); t.name = name;
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; return t;
}

/** One scene-owned textile batch takes the former cinema-leather slot. The RGB
 * sheet holds dye, NOT fake piping or lights. In the linear detail map R is
 * fibre height, G is roughness. No two scenes share/upload each other's maps. */
export function makeInteriorTextiles() {
  const dye = new Uint8Array(width * height * 4);
  rugWeaves.forEach((_, n) => weaveRugPixels(dye, width, (n % 2) * rugWidth, (n >> 1) * 256, n));
  for (let bolt = 0; bolt < bolts.length; bolt++) for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
    const k = ((512 + bolt * 64 + y) * width + x) * 4, yarn = family[bolt], row = y % 16;
    const fiber = fleck(x, row + 23 * bolt) - .5, slub = fleck(x >> 4, row + 83) - .5;
    let tone = yarn === 0 ? 241 + 11 * fiber + 12 * slub + ((x + row) % 3 ? 0 : -5) :
      yarn === 1 ? 242 + 11 * fiber + 7 * (fleck(x >> 3, row >> 2) - .5) :
      yarn === 2 ? 237 + 7 * fiber + 19 * (fleck(x >> 5, row >> 2) - .5) : 236 + 14 * fiber + 14 * slub;
    // Ticking is woven into the mattress bolt. The herringbone and dobby bars
    // are woven once across the scarf and the turned face, never across a seam.
    if (bolt === 3 && (x % 32 === 4 || x % 32 === 6)) tone -= 26;
    if (bolt === 5) tone -= y === 10 || y === 14 || y === 51 ? 41 : y > 44 && y < 49 ? 16 : 0;
    if (bolt === 6) {
      const pick = y < 10 || y > 53 ? 26 : 0, twill = ((x + ((x >> 4) % 2 ? y : -y)) & 7) < 2 ? 16 : 0;
      tone -= pick + twill + (y === 13 || y === 49 ? 45 : 0);
    }
    if (bolt === 7 && (y < 6 || y > 57 || (x % 64 > 46 && x % 64 < 52))) tone -= 24;
    const t = Math.max(0, Math.min(255, Math.round(tone))); dye[k] = dye[k + 1] = dye[k + 2] = t; dye[k + 3] = 255;
  }
  for (let y = 512; y < height; y++) {
    const from = 4 * y * width;
    for (let x = 128; x < width; x += 128) dye.copyWithin(from + 4 * x, from, from + 4 * 128);
  }
  const detail = new Uint8Array(grainWidth * grainHeight * 4);
  // Stamp one vertically periodic swatch per family into a gutter wide enough
  // to shift the chart origin by a whole repeat on either side of a triangle.
  for (let kind = 0; kind < 4; kind++) {
    for (let y = 0; y < 32; y++) for (let x = 0; x < grainWidth; x++) {
      const f = fleck(x, y) - .5, pick = (x >> 1) + (y >> 1), knot = pick % 2 ? (x & 1) : (y & 1);
      let relief: number, rough: number;
      if (kind === 1) { // Pebbled leather: irregular plates separated by narrow lower, matte grooves.
        const cx = x >> 2, cy = y >> 2; let a = 99, b = 99;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
          const gx = (cx + i + 64) % 64, gy = (cy + j + 8) % 8;
          const dx = (i + .16 + .68 * fleck(gx, gy)) * 4 - (x & 3), dy = (j + .16 + .68 * fleck(gx + 83, gy)) * 4 - (y & 3), d = dx * dx + dy * dy;
          if (d < a) { b = a; a = d; } else if (d < b) b = d;
        }
        const plate = Math.min(1, (b - a) / 6); relief = 77 + 76 * plate + f * 22; rough = 153 - 33 * plate + f * 15;
      } else if (kind === 2) {
        const brushed = fleck(x >> 3, y >> 1) - .5; relief = 127 + 25 * brushed + 12 * f; rough = 202 + 38 * brushed + f * 16;
      } else if (kind === 3) { relief = 94 + 45 * knot + 42 * f + 29 * fleck(x >> 2, y); rough = 233 + f * 26; }
      else { relief = 102 + 55 * knot + 22 * (fleck(x >> 3, y) - .5) + 14 * f; rough = 216 + knot * 14 + 14 * f; }
      for (let repeat = 0; repeat < 8; repeat++) {
        const k = ((256 * kind + 32 * repeat + y) * grainWidth + x) * 4;
        detail[k] = relief; detail[k + 1] = rough; detail[k + 2] = 0; detail[k + 3] = 255;
      }
    }
  }
  const map = dataMap(dye, width, height, 'interior/dyed-bolts-and-four-rugs'); map.colorSpace = THREE.SRGBColorSpace;
  const grain = dataMap(detail, grainWidth, grainHeight, 'interior/weave-grain-and-roughness'); grain.channel = 1;
  return new THREE.MeshStandardMaterial({ name: 'interior/sewn-textiles', color: 0xffffff, vertexColors: true, map,
    roughnessMap: grain, roughness: 1, bumpMap: grain, bumpScale: .0033, metalness: 0 });
}

/** Narrow adapter for a model that contains both a timber frame and one sewn
 * skin (the dining chairs/recliner). Its other kit materials pass unchanged. */
export function textileSeatKit(kit: FurnitureKit, cloth: THREE.Material, cut: ClothCut, dye: THREE.ColorRepresentation): FurnitureKit {
  return { ...kit, put(g, material, ...pose) { kit.put(material === cloth ? dress(g, cut, dye) : g, material, ...pose); } };
}

/** Used by the maker and the assembled-world contact tests to identify the
 * actual piece of dyed cloth at a hit, independent of house paint/materials. */
export function clothCutAt(u: number, v: number): ClothCut {
  return v < .5 ? rugWeaves[(v < .25 ? 0 : 2) + (u < .5 ? 0 : 1)] : bolts[Math.min(7, Math.floor((v - .5) * 16))];
}

/** Preserve the original cut pattern on uv1 for the dyer. The working UVs
 * physically measure the woven panel, including the cloth spent on its drop. */
export function measuredSheet(g: THREE.BufferGeometry, w: number, length: number) {
  const uv = g.getAttribute('uv'); g.setAttribute('uv1', uv.clone());
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * length);
  return g;
}

export function dress(source: THREE.BufferGeometry, cut: ClothCut, dye: THREE.ColorRepresentation = 0xffffff) {
  const g = source.index ? source.toNonIndexed() : source; if (source !== g) source.dispose();
  const uv = g.getAttribute('uv'), shape = g.getAttribute('uv1'), shade = g.getAttribute('color');
  const micro = new Float32Array(uv.count * 2), rgb = new Float32Array(uv.count * 3), tint = new THREE.Color(dye);
  const rug = rugWeaves.indexOf(cut as RugWeave), bolt = bolts.indexOf(cut as typeof bolts[number]), yarn = rug >= 0 ? 3 : family[bolt];
  // Choose a period-equivalent chart for each triangle. High-frequency detail
  // crosses the boundary identically on both sides. Only very broad unbroken
  // panels (e.g. rug centres) need a lower gauge to fit the available strip.
  let widest = .001;
  for (let t = 0; t < uv.count; t += 3) widest = Math.max(widest, Math.max(uv.getY(t), uv.getY(t + 1), uv.getY(t + 2)) - Math.min(uv.getY(t), uv.getY(t + 1), uv.getY(t + 2)));
  const fine = Math.min(rug >= 0 ? 54 : grainsPerMetre[yarn], 215 / widest), coarse = Math.min([107, 134, 82, 69][yarn], 39 / widest);
  for (let t = 0; t < uv.count; t += 3) {
    const mid = (Math.min(uv.getY(t), uv.getY(t + 1), uv.getY(t + 2)) + Math.max(uv.getY(t), uv.getY(t + 1), uv.getY(t + 2))) * .5;
    const fineBase = 256 * yarn + 128 - 32 * Math.round(mid * fine / 32), dyeBase = 512 + bolt * 64 + 32 - 16 * Math.round(mid * coarse / 16);
    for (let i = t; i < t + 3; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      micro[2 * i] = u * fine / grainWidth; micro[2 * i + 1] = (fineBase + v * fine) / grainHeight;
      if (rug >= 0) uv.setXY(i, ((rug % 2) * rugWidth + 3 + (rugWidth - 6) * shape.getX(i)) / width, ((rug >> 1) * 256 + 3 + 250 * shape.getY(i)) / height);
      else if (shape && (cut === 'facing' || cut === 'throw' || cut === 'twill')) uv.setXY(i, u * coarse / width, (512 + bolt * 64 + 2 + 60 * shape.getY(i)) / height);
      else uv.setXY(i, u * coarse / width, (dyeBase + v * coarse) / height);
      rgb[i * 3] = tint.r * (shade?.getX(i) ?? 1); rgb[i * 3 + 1] = tint.g * (shade?.getY(i) ?? 1); rgb[i * 3 + 2] = tint.b * (shade?.getZ(i) ?? 1);
    }
  }
  g.setAttribute('uv1', new THREE.Float32BufferAttribute(micro, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3)); return g;
}
