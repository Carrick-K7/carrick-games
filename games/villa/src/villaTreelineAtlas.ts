import * as THREE from 'three';

/** Original pen work at bough scale, not photographs or cutouts of whole trees.
 * The pen writes straight RGBA into a small, instance-owned WebGL data texture.
 * Coordinates grow upwards from the petiole. No canvas, image decode, network,
 * image callback, runtime camera alignment, or side effects at module load. */
export const SHOOT = { oak: 0, flush: 1, birch: 2, needle: 3, hazel: 4, grass: 5, scrub: 6, solid: 7 } as const;
const TILE = 128, W = TILE * 4, H = TILE * 2;
export const shootU = (tile: number, u: number) => ((tile % 4) * TILE + 1 + u * (TILE - 2)) / W;
export const shootV = (tile: number, v: number) => (Math.floor(tile / 4) * TILE + 1 + v * (TILE - 2)) / H;

export function woodRandom(seed: number) {
  let word = (Math.imul(Math.round(seed * 1039) + 1, 0x85ebca6b) ^ 0xb5297a4d) >>> 0;
  return () => { word = (Math.imul(word, 1664525) + 1013904223) >>> 0; return word / 4294967296; };
}
type P = [number, number];
type Ink = [number, number, number];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const along = (a: P, k: P, b: P, t: number): P => [lerp(lerp(a[0], k[0], t), lerp(k[0], b[0], t), t), lerp(lerp(a[1], k[1], t), lerp(k[1], b[1], t), t)];
const towards = (p: P, a: number, d: number): P => [p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d];

class Pen {
  private readonly ox: number; private readonly oy: number;
  constructor(private readonly rgba: Uint8Array, tile: number) { this.ox = tile % 4 * TILE; this.oy = Math.floor(tile / 4) * TILE; }
  private mark(x: number, y: number, r: number, g: number, b: number, alpha: number) {
    const i = ((this.oy + y) * W + this.ox + x) * 4, f = Math.min(1, alpha);
    const under = this.rgba[i + 3] / 255 * (1 - f), opacity = f + under;
    this.rgba[i] = (r * f + this.rgba[i] * under) / opacity;
    this.rgba[i + 1] = (g * f + this.rgba[i + 1] * under) / opacity;
    this.rgba[i + 2] = (b * f + this.rgba[i + 2] * under) / opacity;
    this.rgba[i + 3] = 255 * opacity;
  }
  line(a: P, b: P, r0: number, r1: number, c: Ink) {
    const dx = b[0] - a[0], dy = b[1] - a[1], d2 = dx * dx + dy * dy || 1, pad = Math.max(r0, r1) + 1;
    const x0 = Math.max(2, Math.floor(Math.min(a[0], b[0]) - pad)), x1 = Math.min(TILE - 3, Math.ceil(Math.max(a[0], b[0]) + pad));
    const y0 = Math.max(2, Math.floor(Math.min(a[1], b[1]) - pad)), y1 = Math.min(TILE - 3, Math.ceil(Math.max(a[1], b[1]) + pad));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + .5 - a[0], py = y + .5 - a[1], t = Math.max(0, Math.min(1, (px * dx + py * dy) / d2));
      const f = lerp(r0, r1, t) + .5 - Math.hypot(px - t * dx, py - t * dy);
      if (f > 0) this.mark(x, y, ...c, f);
    }
  }
  twig(a: P, k: P, b: P, r: number, c: Ink) {
    let p = a;
    for (let i = 1; i <= 4; i++) { const q = along(a, k, b, i / 4); this.line(p, q, r * (1.14 - (i - 1) * .18), r * (1.14 - i * .18), c); p = q; }
  }
  /** Two sides of the midrib catch light differently. Rounded oak lobes vs.
   * asymmetric, toothed birch tips; a leaflet starts at its own twig node. */
  leaf(p: P, angle: number, length: number, width: number, lobes: boolean, light: number, tilt: number) {
    const dx = Math.cos(angle), dy = Math.sin(angle), tip = towards(p, angle, length), pad = width * 1.2 + 1;
    const x0 = Math.max(2, Math.floor(Math.min(p[0], tip[0]) - pad)), x1 = Math.min(TILE - 3, Math.ceil(Math.max(p[0], tip[0]) + pad));
    const y0 = Math.max(2, Math.floor(Math.min(p[1], tip[1]) - pad)), y1 = Math.min(TILE - 3, Math.ceil(Math.max(p[1], tip[1]) + pad));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + .5 - p[0], py = y + .5 - p[1], t = (px * dx + py * dy) / length;
      if (t <= 0 || t >= 1) continue;
      const bow = Math.sin(Math.PI * t), v = py * dx - px * dy - tilt * width * .19 * bow;
      const margin = lobes ? .80 + .20 * Math.cos(t * 26 + (v > 0 ? .8 : 0)) : .96 + .04 * Math.cos(t * 47);
      const w = width * bow ** (lobes ? .48 : .76) * margin * (lobes ? .83 + .38 * t : 1.22 - .45 * t), f = w + .46 - Math.abs(v);
      if (f <= 0) continue;
      const rib = Math.max(0, 1 - Math.abs(v) * 2.1), value = light + (v < 0 ? .03 : -.066) * tilt + .038 * t + .07 * rib;
      this.mark(x, y, Math.min(255, 253 * value), Math.min(255, 255 * value), Math.min(255, 228 * value + 10 * tilt), f);
    }
  }
}

// A larger branch is NOT a magnified sapling spray. Keep the intervening
// sections of scaffold bare; cloudlets at its bifurcating tips are separated
// by 8–20 px of air, which remains legible even at a 16px software-render mip.
// Each cloudlet in turn consists of a spray of fine shoots with individual
// attached, lit leaves. The plate has several peaks and a strongly off-axis
// shoulder rather than a pointed leaf/oval outline.
function branchPlate(pen: Pen, tile: number) {
  const rand = woodRandom(13.61 + tile), wood: Ink = [162,151,120];
  const mirror = tile === SHOOT.scrub, flush = tile === SHOOT.flush, birch = tile === SHOOT.birch, oak = !birch && tile !== SHOOT.hazel;
  const warp = ([x, y]: P): P => birch ? [64 + (x - 64) * .84 + y * .065, y * .86 + Math.abs(x - 64) * .19] :
    [mirror ? 129 - x : x + (flush ? 4 * Math.sin(y * .06) : 0), y];
  const base = warp([64,2]), crook = warp([57,32]), hook = warp([66,61]);
  const heel = warp([53,79]), head = warp([74,110]);
  pen.twig(base,warp([65,20]),crook,1.35,wood); pen.twig(crook,warp([60,40]),hook,1.24,wood);
  pen.twig(hook,warp([59,68]),heel,1.01,wood); pen.twig(heel,warp([61,94]),head,.67,wood);
  const levels: [P,P,P[]][] = [
    [crook,[38,37],[[15,36],[22,49],[39,53]]],
    [crook,[77,39],[[93,39],[111,48],[86,56]]],
    [hook,[38,66],[[12,65],[23,78],[39,78]]],
    [hook,[83,66],[[109,64],[116,80],[92,83]]],
    [heel,[33,91],[[20,94],[37,102],[48,95]]],
    [heel,[72,90],[[98,97],[86,106]]],
    [head,[69,112],[[57,118],[75,119]]],
    // Short, interior returns. Keep some shaded body behind the open tips;
    // do not simply stipple the outline of an otherwise hollow crown.
    [hook,[60,58],[[47,48],[66,63]]], [heel,[57,83],[[47,83],[69,91]]],
  ];
  for (const [j,[start,junction,sites]] of levels.entries()) {
    const elbow = warp(junction), bend: P = [lerp(start[0],elbow[0],.54),lerp(start[1],elbow[1],.29)];
    pen.twig(start,bend,elbow,1.1 - .056 * j,wood);
    for (const [k,site] of sites.entries()) {
      const centre = warp([site[0] + (rand() -.5) * 4,site[1] + (rand() -.5) * 4]);
      if (flush) { centre[0] += (j % 2 ? -1 : 1) * (j < 3 ? 4 : 1); centre[1] -= (j % 3) * 3; }
      const az = Math.atan2(centre[1] - elbow[1] + (birch ? 9 : 0),centre[0] - elbow[0]);
      const root: P = [centre[0] - 5 * Math.cos(az),centre[1] - 5 * Math.sin(az)];
      pen.twig(elbow,[lerp(elbow[0],root[0],.55),lerp(elbow[1],root[1],.31)],root,.64,wood);
      const shade = .52 + .30 * rand() + j * .015 + (k === 0 ? .045 : 0);
      // An entire lower cluster returns cool into the tree; its exposed side
      // has a rim of warmer leaves. This light variation survives averaging.
      const size = (.73 + rand() * .47) * (tile === SHOOT.hazel ? 1.14 : birch ? .82 : 1);
      for (let m = 0; m < 7; m++) {
        const a = az - 1.19 + m * .39 + .43 * (rand() -.5), len = (6 + 7 * rand()) * size;
        const tip = towards(root,a,len), mid = towards(root,a - .35,len * .58);
        pen.twig(root,mid,tip,.47,[175,170,131]);
        for (let n = 0; n < 9; n++) {
          const f = (n + .28 + .62 * rand()) / 9, node = along(root,mid,tip,f);
          const length = size * (3.0 + 3.6 * rand()), side = n % 2 === 0 ? -1 : 1;
          pen.leaf(node,a + side * (.62 + .8 * rand()),length,length * (.28 + .17 * rand()),oak,
            shade + f * .17 + rand() * .14,side * (.3 + .7 * rand()));
        }
      }
    }
  }
}

function conifer(pen: Pen) {
  const rand = woodRandom(2.7), wood: Ink = [158,143,112];
  const base: P = [64,1.8], low: P = [62,32], mid: P = [53,64], crown: P = [70,94];
  pen.twig(base,[68,16],low,1.43,wood); pen.twig(low,[60,50],mid,1.19,wood); pen.twig(mid,[59,77],crown,.95,wood);
  const forks: [P,P,P[]][] = [
    [low,[36,34],[[13,36],[27,53]]], [low,[83,42],[[109,43],[99,60],[80,56]]],
    [mid,[30,59],[[10,63],[17,80],[37,76]]], [mid,[80,70],[[110,76],[93,91]]],
    [mid,[47,85],[[29,99],[44,107],[56,99]]], [crown,[74,105],[[66,120],[85,116],[99,105]]],
  ];
  for (const [j,[heel,knee,buds]] of forks.entries()) {
    pen.twig(heel,[lerp(heel[0],knee[0],.56),lerp(heel[1],knee[1],.22)],knee,.94 - j * .045,wood);
    for (const tip of buds) {
      const bend: P = [lerp(knee[0],tip[0],.49),lerp(knee[1],tip[1],.23)], axis = Math.atan2(tip[1] - knee[1],tip[0] - knee[0]);
      pen.twig(knee,bend,tip,.68,wood);
      for (let k = 0; k < 12; k++) {
        const u = .12 + (k + .48 * rand()) / 13 * .86, node = along(knee,bend,tip,u), a = axis + (k % 2 ? .84 : -.91) + (rand() -.5) * .85;
        const len = (6.3 + 7.2 * rand()) * (1.22 - .49 * u), nose = towards(node,a,len), value = 154 + 71 * rand() + u * 11;
        pen.line(node,nose,.73,.35,[value,value + 4,value - 12]);
        for (let n = 0; n < 16; n++) {
          const f = (n + .6 * rand()) / 16, bud: P = [lerp(node[0],nose[0],f),lerp(node[1],nose[1],f)];
          const light = value + rand() * 18, needle = towards(bud, a + (n % 2 ? 1 : -1) * (.48 + rand() * .67), (1 - .48 * f) * (3.1 + 4.2 * rand()));
          pen.line(bud,needle,.64,.20,[light - 4,light + 4,light - 9]);
        }
      }
    }
  }
}

function meadow(pen: Pen) {
  const rand = woodRandom(96.31);
  for (let i = 0; i < 69; i++) {
    const base: P = [59 + rand() * 13, 1.5 + rand() * 2], d = 2 * rand() - 1, h = 23 + rand() * (83 - 21 * Math.abs(d));
    const shoulder: P = [base[0] + d * (12 + rand() * 15), h * .88], end: P = [base[0] + d * (26 + rand() * 27), h];
    const value = 146 + rand() * 93, ink: Ink = [value, value, value - 24];
    pen.twig(base, shoulder, end, .49 + rand() * 1.24, ink);
    if (i % 5 === 1) {
      const a = Math.atan2(h - shoulder[1], end[0] - shoulder[0]);
      for (let k = 0; k < 6; k++) {
        const node = towards(end, a, k * 1.7), awn = a + (k % 2 ? 1 : -1) * .56, tip = towards(node, awn, 3.9 - k * .27);
        pen.line(node, tip, .9, .58, [236, 210, 156]); pen.line(tip, towards(tip, awn, 2.7), .41, .2, [235, 223, 165]);
      }
    }
  }
}

export function createVillaTreelineAtlas(): THREE.DataTexture {
  const rgba = new Uint8Array(W * H * 4);
  // Straight alpha with pigment already in transparent pixels: mip sampling does
  // not pick up a black/white fringe when the camera crosses the meadow. The
  // neutral last tile is solid at every useful mip and shares the draw with bark.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (x >= 3 * TILE && y >= TILE) rgba.fill(255, i, i + 4);
    else { rgba[i] = 203; rgba[i + 1] = 207; rgba[i + 2] = 187; }
  }
  for (const tile of [SHOOT.oak,SHOOT.flush,SHOOT.birch,SHOOT.hazel,SHOOT.scrub]) branchPlate(new Pen(rgba,tile),tile);
  conifer(new Pen(rgba, SHOOT.needle)); meadow(new Pen(rgba, SHOOT.grass));
  const atlas = new THREE.DataTexture(rgba, W, H, THREE.RGBAFormat);
  atlas.name = 'villa/woodland-pen-sprigs'; atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.magFilter = THREE.LinearFilter; atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.generateMipmaps = true; atlas.needsUpdate = true; return atlas;
}
