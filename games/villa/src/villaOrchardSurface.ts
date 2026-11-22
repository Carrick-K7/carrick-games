import * as THREE from 'three';
import type { VillaFruitSpecies } from './villaGarden.js';

/** Blade / blade width / current year's extension, in metres. The same measurements
 * set both the drawing scale on the sheet and its scale on the living branch. */
export const lamina = {
  cherry: { length: .106, width: .047, shoot: .355, span: .242, nodes: 13, tooth: .075, shoulder: .30 },
  orange: { length: .102, width: .048, shoot: .315, span: .225, nodes: 12, tooth: .014, shoulder: .16 },
  mango:  { length: .166, width: .046, shoot: .382, span: .349, nodes: 14, tooth: .009, shoulder: .00 },
  apple:  { length: .089, width: .052, shoot: .308, span: .202, nodes: 14, tooth: .060, shoulder: .40 },
  pear:   { length: .084, width: .045, shoot: .298, span: .197, nodes: 13, tooth: .022, shoulder: .48 },
  lemon:  { length: .117, width: .051, shoot: .363, span: .258, nodes: 11, tooth: .041, shoulder: .18 },
} as const;
export const orchardSpecies = Object.keys(lamina) as VillaFruitSpecies[];
export function orchardRandom(seed: number) {
  let state = seed >>> 0 || 73;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x1_0000_0000; };
}
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const byte = (v: number) => Math.round(clamp(v, 0, 255));
const tile = 128;
function sampleMap(data: Uint8Array, w: number, h: number, name: string) {
  // Linear pigment multipliers, not display/sRGB colours. Keep RGB in the
  // empty texels too: mip/filter fringes mustn't turn black against the sky.
  const map = new THREE.DataTexture(data, w, h); map.name = name;
  map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true; map.anisotropy = 2; map.needsUpdate = true;
  return map;
}
/** Three small single-season shoot drawings and a separate blade. All have
 * the bud at bottom centre, not in the middle of the card. No DOM or requests. */
function drawLeaves(kind: VillaFruitSpecies) {
  const s = lamina[kind], size = tile * 2, data = new Uint8Array(size * size * 4);
  const rand = orchardRandom(521401 + 3727 * orchardSpecies.indexOf(kind));
  const relief = new Uint8Array(tile * tile * 4);
  for (let i = 0; i < relief.length; i += 4) { relief[i] = relief[i + 1] = 128; relief[i + 2] = relief[i + 3] = 255; }
  for (let i = 0; i < data.length; i += 4) { data[i] = 173; data[i + 1] = 184; data[i + 2] = 155; }
  for (let motif = 0; motif < 4; motif++) {
    const w = motif === 3 ? s.width * 1.32 : s.span, h = motif === 3 ? s.length * 1.12 : s.shoot;
    const ox = tile * (motif % 2), oy = tile * (motif >> 1), dx = w / (tile - 5), dy = h / (tile - 5);
    const px = (x: number) => (x + w * .5) / dx + 2, py = (y: number) => y / dy + 2;
    const ink = (x: number, y: number, r: number, g: number, b: number, a: number) => {
      if (x < 1 || x > tile - 2 || y < 1 || y > tile - 2 || a <= 0) return;
      const i = 4 * ((y + oy) * size + x + ox), cover = Math.min(1, a);
      data[i] = byte(data[i] + (r - data[i]) * cover); data[i + 1] = byte(data[i + 1] + (g - data[i + 1]) * cover);
      data[i + 2] = byte(data[i + 2] + (b - data[i + 2]) * cover);
      data[i + 3] = byte(255 * cover + data[i + 3] * (1 - cover));
    };
    const stick = (ax: number, ay: number, bx: number, by: number, mm: number) => {
      const x0 = px(ax), y0 = py(ay), x1 = px(bx), y1 = py(by), vx = x1 - x0, vy = y1 - y0;
      const radius = mm * .0005 / dx;
      for (let y = Math.floor(Math.min(y0, y1) - radius - 1); y <= Math.max(y0, y1) + radius + 1; y++) {
        for (let x = Math.floor(Math.min(x0, x1) - radius - 1); x <= Math.max(x0, x1) + radius + 1; x++) {
          const t = clamp(((x - x0) * vx + (y - y0) * vy) / (vx * vx + vy * vy || 1));
          ink(x, y, 177 + 38 * t, 142 + 29 * t, 103, .68 + radius - Math.hypot(x - x0 - t * vx, y - y0 - t * vy));
        }
      }
    };
    const blade = (ax: number, ay: number, bx: number, by: number, width: number, age: number) => {
      const vx = bx - ax, vy = by - ay, len = Math.hypot(vx, vy), cx = vx / len, cy = vy / len;
      const curve = (rand() - .5) * width * .54, phase = rand() * 6, pigment = .73 + rand() * .23, ribs = kind === 'mango' ? 12 : 7;
      const bound = width * .8, tooth = 15 + Math.floor(rand() * 8);
      // Turn a protruding blade slightly edge-on rather than cropping its edge
      // at the rectangular chart boundary (very conspicuous from beneath).
      let fitX = 1, fitY = 1;
      for (let j = 1; j <= 20; j++) {
        const t = j / 20, arc = Math.sin(t * Math.PI), rim = width * .61 * arc ** .62;
        for (const side of [-1, 1]) {
          const q = curve * arc + side * rim, x = vx * t - cy * q, y = vy * t + cx * q;
          if (x !== 0) fitX = Math.min(fitX, ((x > 0 ? .484 : -.484) * w - ax) / x);
          if (y !== 0) fitY = Math.min(fitY, ((y > 0 ? .986 : .014) * h - ay) / y);
        }
      }
      for (let y = Math.max(1, Math.floor(py(Math.min(ay, by) - bound))); y <= Math.min(tile - 2, py(Math.max(ay, by) + bound)); y++) {
        for (let x = Math.max(1, Math.floor(px(Math.min(ax, bx) - bound))); x <= Math.min(tile - 2, px(Math.max(ax, bx) + bound)); x++) {
          const xx = ((x - 2) * dx - w * .5 - ax) / fitX, yy = ((y - 2) * dy - ay) / fitY, t = (xx * cx + yy * cy) / len;
          if (t <= 0 || t >= 1) continue;
          const arc = Math.sin(Math.PI * t), q = -xx * cy + yy * cx - curve * arc;
          const edge = .5 * width * arc ** (kind === 'mango' ? .81 : .67) * (1 + (.52 - t) * s.shoulder) *
            (1 + .037 * Math.sin(phase + t * 12) - s.tooth * ((t * tooth + (q < 0 ? .5 : 0)) % 1));
          const aa = .6 + (edge - Math.abs(q)) / Math.min(dx, dy); if (aa <= 0) continue;
          const lateral = q / edge, rib = clamp(1 - Math.abs(q) / Math.max(.00052, width * .022));
          const fine = (t * ribs - Math.abs(lateral) * (.30 + .16 * t) + (q < 0 ? .24 : .03) + 1) % 1;
          const veins = Math.max(0, 1 - Math.min(fine, 1 - fine) * 16) * (1 - Math.abs(lateral) * .76);
          const fold = .94 + .077 * lateral + .042 * Math.sin(t * 5 + phase) + .055 * veins + .15 * rib;
          const light = 226 * pigment * fold;
          ink(x, y, light * (1 + age * .20) + 8 * rib, light * (1.04 + age * .07), light * (.94 - .19 * age), aa);
          if (!(x & 1) && !(y & 1) && aa > .35) {
            // Each blade, not the plane of the spray, has its own petiole
            // turn, folded halves and recurved tip. Veins lie on that surface.
            const bank = Math.sin(phase * 1.69) * .48 + .35 * lateral + .14 * Math.sign(lateral) * (1 - rib);
            const curl = (.36 - .83 * t) * (.64 + .27 * Math.cos(phase)), norm = 127 / Math.hypot(bank, curl, 1);
            const ni = 4 * (((oy + y) >> 1) * tile + ((ox + x) >> 1));
            relief[ni] = byte(128 + (curl * cx - bank * cy) * norm); relief[ni + 1] = byte(128 + (curl * cy + bank * cx) * norm); relief[ni + 2] = byte(128 + norm);
          }
        }
      }
    };
    if (motif === 3) { // A whole blade on its own petiole, for isolated turning leaves.
      stick(0, 0, -.018 * w, h * .10, 1.8); blade(-.018 * w, .09 * h, w * .044, h * .985, s.width, .26); continue;
    }
    // A crooked shoot, with a shorter side shoot on two motifs. Leaves are
    // staggered and of unlike ages; opposite picket-fence pairs read as a fern.
    const bow = (rand() - .5) * w * .20, tilt = (rand() - .5) * w * .18 + (motif === 1 ? .15 : motif === 2 ? -.19 : 0) * w;
    const stemX = (t: number) => bow * Math.sin(t * Math.PI) + tilt * t * t;
    for (let k = 0; k < 4; k++) stick(stemX(k / 4), h * .79 * k / 4, stemX((k + 1) / 4), h * .79 * (k + 1) / 4, 3 - k * .48);
    const count = s.nodes + (motif === 0 ? -1 : motif === 1 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const t = .09 + .86 * (i + .15 + rand() * .54) / count, side = (i + motif) % 2 ? -1 : 1;
      const ang = side * (.62 + rand() * .89 + .21 * (1 - t)), length = s.length * (.66 + rand() * .37) * (1 - .23 * t * t);
      const x = stemX(t), y = h * .79 * t, sx = x + Math.sin(ang) * length * .12, sy = y + Math.cos(ang) * length * .12;
      stick(x, y, sx, sy, 1.7); blade(sx, sy, sx + Math.sin(ang) * length, sy + Math.cos(ang) * length, s.width * (.66 + rand() * .35), t * .7);
    }
    blade(stemX(1), h * .79, stemX(1) + w * (rand() - .45) * .23, h * .986, s.width * .59, .95);
    if (motif) {
      const side = motif === 1 ? -1 : 1, x = stemX(.24), y = .190 * h, ex = x + side * w * .27, ey = h * (motif === 1 ? .60 : .53);
      stick(x, y, ex, ey, 2.5);
      for (let j = 0; j < 5; j++) {
        const t = .15 + j * .19, sx = x + (ex - x) * t, sy = y + (ey - y) * t;
        blade(sx, sy, sx + w * side * (j === 2 ? -.15 : .19 + .055 * rand()), sy + h * (j === 1 ? -.058 : .13 + .035 * rand()), s.width * .75, .22 + j * .12);
      }
    }
  }
  return { pigment: sampleMap(data, size, size, `orchard/${kind}-sprigs`), relief: sampleMap(relief, tile, tile, `orchard/${kind}-lamina-normals`) };
}

/** Strips measure 0.93 m around × 0.76 m up the cambium. Wrap V along the
 * limb, not world Y. U selects cherry's horizontal lenticels, fissured pome
 * wood, plated mango or the much smoother mottled citrus skins. */
export const barkTileWidth = 128, barkTileHeight = 256;
function drawBark() {
  const w = barkTileWidth, h = barkTileHeight, width = w * orchardSpecies.length, data = new Uint8Array(width * h * 4);
  orchardSpecies.forEach((kind, k) => {
    const rand = orchardRandom(7907 * (k + 3)), citrus = kind === 'orange' || kind === 'lemon';
    const at = (x: number, y: number) => 4 * ((((y % h) + h) % h) * width + k * w + ((x % w) + w) % w);
    const stroke = (x: number, y: number, value: number) => {
      const i = at(Math.round(x), Math.round(y)); data[i] = byte(data[i] + value); data[i + 1] = byte(data[i + 1] + value * .99); data[i + 2] = byte(data[i + 2] + .91 * value);
    };
    const chips = Float32Array.from({ length: 16 * 16 }, () => rand());
    const cloud = (x: number, y: number) => {
      const a = x >> 0, b = y >> 0, fx = x - a, fy = y - b;
      const n = (i: number, j: number) => chips[(i & 15) + (j & 15) * 16];
      return (n(a, b) * (1 - fx) + n(a + 1, b) * fx) * (1 - fy) + (n(a, b + 1) * (1 - fx) + n(a + 1, b + 1) * fx) * fy;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = cloud(x * 8 / w, y * 16 / h), stria = cloud(x * 32 / w + .58 * c, y * 4 / h);
      const v = 171 + 41 * c + (stria - .5) * (citrus ? 16 : 51) + (rand() - .5) * 22, i = at(x, y);
      data[i] = byte(v * 1.02); data[i + 1] = byte(v); data[i + 2] = byte(v * (.96 + c * .045)); data[i + 3] = 255;
    }
    const strokes = kind === 'cherry' ? 590 : citrus ? 355 : 540;
    for (let j = 0; j < strokes; j++) {
      let x = rand() * w, y = rand() * h; const phase = rand() * 6, long = kind === 'cherry' ? 2 + rand() ** 2 * 16 : citrus ? 2 + rand() * 5 : 5 + rand() ** 2 * 30;
      const dx = kind === 'cherry' ? 1 : .12 * Math.cos(phase), dy = kind === 'cherry' ? .13 * Math.sin(phase) : 1;
      for (let n = 0; n < long; n++) {
        const strength = Math.sin(Math.PI * (n + .5) / (long + .1));
        stroke(x, y, -(citrus ? 23 : 43) * strength); stroke(x - dy, y + dx, (kind === 'cherry' ? 38 : 19) * strength);
        x += dx + (dy === 1 ? .29 * Math.sin(n * .31 + phase) : 0); y += dy;
      }
    }
  });
  const texture = sampleMap(data, width, h, 'orchard/bark'); texture.wrapT = THREE.RepeatWrapping; return texture;
}
/** The Garden owns the incoming finishes. Make the charts exactly once per
 * scene/cultivar; the ordinary Villa material/texture teardown can see them. */
export function finishOrchardSurfaces(kind: VillaFruitSpecies, wood: THREE.MeshStandardMaterial, leaf: THREE.MeshStandardMaterial) {
  if (!wood.map) { wood.map = drawBark(); wood.vertexColors = true; }
  if (!leaf.map) {
    const charts = drawLeaves(kind); leaf.map = charts.pigment; leaf.normalMap = charts.relief;
    leaf.side = THREE.DoubleSide; leaf.vertexColors = true; leaf.alphaTest = .32; leaf.alphaToCoverage = true;
    leaf.roughness = kind === 'orange' || kind === 'mango' ? .67 : .83;
  }
}

/** Called once AFTER the rigid index/range classification. Thin mesophyll
 * transmits the actual sun through the back of a blade. No emissive or extra
 * transparency/shadow pass: the existing shadowed IncidentLight supplies all
 * energy, including the estate survey in software, rain and the night dimmer. */
export function installVillaOrchardLight(scene: THREE.Object3D) {
  scene.getObjectByName('Villa garden')?.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
    const mat = object.material;
    if (!mat.map?.name.startsWith('orchard/') || !mat.normalMap || !mat.alphaTest) return;
    const prev = mat.onBeforeCompile.bind(mat), cacheKey = mat.customProgramCacheKey();
    mat.onBeforeCompile = (shader, renderer) => {
      prev(shader, renderer);
      // The Villa has one directional sun. Three's final IncidentLight is the
      // shadow-attenuated sun when NUM_DIR_LIGHTS == 1 (point/spot precede it).
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS == 1
          float laminaFacing = dot(geometryNormal, directLight.direction);
          float laminaScatter = 0.070 + 0.39 * max(-laminaFacing, 0.0);
          reflectedLight.directDiffuse += BRDF_Lambert(material.diffuseColor) * directLight.color * vec3(1.19, 1.04, 0.62) * laminaScatter;
        #endif`);
    };
    mat.customProgramCacheKey = () => cacheKey + '|orchard-thin-lamina-v1'; mat.needsUpdate = true;
  });
}
