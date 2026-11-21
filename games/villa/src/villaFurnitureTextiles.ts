import * as THREE from 'three';
import { bent, board, casting, loft, oval, rectRing, sheet, type FurnitureKit, type Point, type Ring } from './villaFurnitureForms.js';

/** Cut along the selvage. Top and underside are mapped in the same X/Z cloth
 * coordinates, while the narrow boxing strip is unwrapped along its own seam.
 * Ring index / radius UVs pinch stripes into a star on an otherwise flat face. */
function sewnSkin(rings: Ring[], lowerSeam: number, upperSeam: number) {
  const g = loft(rings), n = rings[0].length;
  const distance: number[] = [0], crease = rings[upperSeam];
  for (let i = 1; i < n; i++) distance.push(distance[i - 1] + Math.hypot(crease[i][0] - crease[i - 1][0], crease[i][2] - crease[i - 1][2]));
  // Expand here because the bounding line belongs to two different fabric cuts.
  // The batcher accepts non-indexed geometry without expanding it a second time.
  const out = g.toNonIndexed(), ids = g.index!, pos = out.getAttribute('position'), map = out.getAttribute('uv');
  for (let t = 0; t < ids.count; t += 3) {
    const ia = ids.getX(t), ib = ids.getX(t + 1), ic = ids.getX(t + 2);
    const lo = Math.floor(Math.min(ia, ib, ic) / n), hi = Math.floor(Math.max(ia, ib, ic) / n);
    const band = lo >= lowerSeam && hi <= upperSeam, wraps = band && Math.max(ia % n, ib % n, ic % n) === n - 1 && Math.min(ia % n, ib % n, ic % n) === 0;
    for (let j = t; j < t + 3; j++) {
      const i = ids.getX(j) % n, x = pos.getX(j), y = pos.getY(j), z = pos.getZ(j);
      if (band) map.setXY(j, (wraps && i === 0 ? distance[n - 1] + Math.hypot(crease[0][0] - crease[n - 1][0], crease[0][2] - crease[n - 1][2]) : distance[i]) * .80, y * .80);
      else map.setXY(j, x * .80 + .5, z * .80 + .5);
    }
  }
  g.dispose(); return out;
}

/** A seat has a boxed band, proud sewn cord, sprung shoulder and a depressed
 * sitting area. A bed pillow instead pinches to a single seam at the ears. */
export function seatPad(w: number, d: number, h: number, sag = .18) {
  const r = Math.min(w, d) * .16;
  const ring = (s: number, y: number) => rectRing(w * s, d * s, r * s, h * y, 0, 0, 2);
  // Keep vertex correspondence between the ring's rounded quadrants and the crown.
  const top = (s: number, y: number) => ring(s, y).map(([x, yy, z]): Point => [x, yy + .025 * h * z / d, z]);
  return sewnSkin([ring(.9, -.45), ring(.976, -.39), ring(.989, -.24), ring(.986, .19),
    ring(.996, .24), ring(1, .28), ring(.986, .31), top(.93, .45), top(.66, .5), top(.34, .5 - sag),
    top(.1, .5 - sag - .018)], 1, 6);
}
export function pillowForm(w: number, d: number, h: number) {
  const ring = (scale: number, y: number, tuck = 0) => oval(w, d, 0, 24, .47).map(([x, , z]): Point => {
    const u = 2 * x / w, v = 2 * z / d;
    const ear = Math.abs(u * v) ** 3;
    // Drawn-in ticking between four lifted corners; small diagonal creases fade
    // into the stuffing rather than cutting the outline into a starburst.
    const dart = Math.exp(-(((Math.abs(u) - .85) / .12) ** 2)) * Math.abs(v) ** 4;
    return [x * scale * (1 - .026 * v * v + .04 * ear), h * (y * (1 - .62 * ear) + .14 * ear - tuck * dart), z * scale * (1 - .075 * u * u + .1 * ear)];
  });
  return sewnSkin([ring(.13, -.50), ring(.59, -.47), ring(.87, -.29), ring(.974, -.085), ring(1, -.018),
    ring(1.007, .006), ring(.982, .029), ring(.91, .21, .07), ring(.77, .40, .16), ring(.49, .52), ring(.18, .55)], 3, 6);
}

/** One cut-and-sewn U-shaped body. The arm noses roll forward; the arms climb
 * into the back through a curved elbow. Its rear and underside share the skin. */
export function sofaBody(w: number, leather: boolean) {
  const half = w / 2 - .135;
  const path = [
    [-half, -.62, .64], [-half, -.57, .81], [-half, -.46, .88], [-half, -.18, .90], [-half, .12, .97],
    [-half, .30, 1.12], [-half + .03, .44, 1.20], [-half + .10, .50, 1.22], [-half + .21, .52, 1.23],
    [0, .52, 1.25], [half - .21, .52, 1.23], [half - .1, .5, 1.22], [half - .03, .44, 1.2],
    [half, .30, 1.12], [half, .12, .97], [half, -.18, .90], [half, -.46, .88], [half, -.57, .81], [half, -.62, .64],
  ];
  const rings = path.map(([x, z, high], i) => {
    const prev = path[Math.max(0, i - 1)], next = path[Math.min(path.length - 1, i + 1)];
    const dx = next[0] - prev[0], dz = next[1] - prev[1], inv = 1 / Math.hypot(dx, dz);
    const ny = high - .27, halfWidth = (leather ? .13 : .12) * (i === 0 || i === path.length - 1 ? .70 : 1);
    return [[.79, .0], [1, .14], [1, .76], [.92, .91], [.64, .99], [0, 1], [-.66, .97], [-.94, .88], [-1, .66], [-.87, .07], [-.62, .0]].map(([width, y]): Point =>
      [x + dz * inv * halfWidth * width, .27 + ny * y, z - dx * inv * halfWidth * width]);
  });
  // This fabric follows the U in one piece. Measure both axes in metres; the
  // three-metre back span gets just as much weave per metre as the arm noses.
  const skin = loft(rings), uv = skin.getAttribute('uv');
  let run = 0;
  rings.forEach((ring, j) => {
    if (j) run += Math.hypot(path[j][0] - path[j - 1][0], path[j][1] - path[j - 1][1]);
    let wrap = 0;
    ring.forEach((p, i) => {
      if (i) wrap += Math.hypot(p[0] - ring[i - 1][0], p[1] - ring[i - 1][1], p[2] - ring[i - 1][2]);
      uv.setXY(j * ring.length + i, run * .8, wrap * .8);
    });
  });
  return skin;
}

type SofaStyle = 'tailored' | 'cinema' | 'terrace' | 'reading';
function timberSettee(k: FurnitureKit, w: number, outdoor: boolean) {
  const { put, m } = k, wood = outdoor ? m.oak : m.walnut;
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - .092);
    // The terrace has elbow-height weather rails, with drainage beneath the
    // cushions. Library armchairs get a steam-bent, rising reading arm instead.
    const runner = outdoor ? [[-.57, 0], [-.487, 0], [-.417, .346], [.378, .346], [.47, 0], [.552, 0], [.493, .435], [-.497, .435]] :
      [[-.554, 0], [-.49, 0], [-.334, .326], [.277, .326], [.481, 0], [.553, 0], [.434, .308], [.388, .397], [-.429, .397]];
    put(casting(runner, .072), wood, x, 0, 0, 0, -Math.PI / 2);
    const grip = outdoor ? [[-.53, .745], [-.503, .774], [.479, .792], [.512, .771], [.50, .718], [.357, .702], [-.467, .692], [-.525, .709]] :
      [[-.504, .784], [-.463, .825], [-.377, .819], [-.170, .785], [.034, .791], [.233, .854], [.388, .975], [.471, 1.014], [.496, .966], [.339, .817], [.139, .725], [-.134, .708], [-.383, .751], [-.474, .746]];
    put(casting(grip, outdoor ? .135 : .112), wood, x, 0, 0, 0, -Math.PI / 2);
    bent(k, wood, [[x, .372, -.398, .030], [x, .450, -.394, .030], [x, outdoor ? .726 : .782, -.350, .025]], 8);
    bent(k, wood, [[x, .366, .382, .031], [x, .746, .412, .029], [x, 1.103, .516, .031], [x, 1.161, .522, .027]], 8);
  }
  for (const z of [-.484, .383]) k.box(0, .385, z, w - .15, .085, .072, wood, 0);
  const panels = outdoor ? 11 : 5;
  for (let i = 0; i < panels; i++) {
    const pitch = (w - .17) / panels, x = (i - (panels - 1) / 2) * pitch;
    put(board(pitch - .022, 1.064, .043, .022, .006), wood, x, .430, -.053);
    const back = [[-.5, .443], [.5, .443], [.44, 1.133], [.35, 1.160], [-.31, 1.160], [-.46, 1.126]].map(([u, y]) => [u * (pitch - .029), y - .64]);
    put(casting(back, .035), wood, x, .639, .431, .127);
  }
  put(board(w - .114, .095, .064, .038), wood, 0, 1.164, .507);
}
export function sofaFrame(k: FurnitureKit, w: number, fabric: THREE.Material, chaise: boolean, n: number, style: SofaStyle) {
  const { put, m } = k, cinema = style === 'cinema';
  if (style === 'terrace' || style === 'reading') timberSettee(k, w, style === 'terrace');
  else {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bent(k, m.walnut, [
      [sx * (w / 2 - .16), 0, sz * .51, .044], [sx * (w / 2 - .16), .016, sz * .51, .046], [sx * (w / 2 - .17), .045, sz * .50, .050], [sx * (w / 2 - .22), .21, sz * .45, .067],
    ]);
    put(board(w - .13, 1.12, .079, .13, .042), m.walnut, 0, .205, 0);
    // Tailored deck below the loose cushions: a straight boxing strip and a
    // tucked base, not a second pillowed seat penetrating the first one.
    put(sewnSkin([rectRing(w - .15, 1.10, .107, .238), rectRing(w - .093, 1.163, .119, .253),
      rectRing(w - .061, 1.204, .135, .292), rectRing(w - .059, 1.207, .135, .418),
      rectRing(w - .091, 1.184, .125, .446), rectRing(w - .145, 1.134, .115, .453)], 1, 4), fabric, 0, 0, -.014);
    put(sofaBody(w, cinema), fabric, 0, 0, 0);
  }
  const pitch = (w - .50) / n;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * pitch;
    // The chaise cushion runs to the toe in one piece, not through another seat.
    const long = chaise && i === 0, length = long ? 2.06 : .98;
    if (long) {
      put(board(pitch + .02, 1.25, .19, .10), style === 'terrace' ? m.oak : fabric, x, .357, -1.04);
      for (const dx of [-.29, .29]) bent(k, m.walnut, [[x + dx, 0, -1.55, .040], [x + dx, .014, -1.55, .040], [x + dx * .9, .28, -1.52, .058]]);
    }
    put(seatPad(pitch - .014, length, .235, cinema ? .24 : .18), fabric, x, .559, long ? -.66 : -.12);
    put(seatPad(pitch + .006, .65, cinema ? .25 : .21, .03), fabric, x, .924, .316, -1.36);
    if (cinema) put(pillowForm(pitch * .84, .215, .145), fabric, x, 1.163, .332, -1.35);
  }
  if (!cinema) {
    const offset = w > 1.65 ? w / 2 - .61 : .15;
    put(pillowForm(.51, .47, .22), m.terra, -offset, .864, .105, -1.22, -.13, .13);
    if (w > 1.65) put(pillowForm(.48, .48, .21), m.sage, offset, .875, .119, -1.26, .18, -.15);
  }
}

/** Mattress ticking is boxed around the coil core with two sewn beads. The
 * duvet is independent: generous drop at the foot, eased side hems and a rolled
 * turnover at the head. The narrow throw follows the actual quilt, not a slab. */
export function mattress(w: number) {
  const ring = (scale: number, y: number) => rectRing(w * scale, 3.55 * scale, .18, y, 0, 0, 5);
  return sewnSkin([ring(.952, -.185), ring(.987, -.168), ring(.997, -.139), ring(1, -.124), ring(.994, -.110),
    ring(.993, .087), ring(1, .110), ring(.994, .123), ring(.989, .147), ring(.949, .169), ring(.70, .185)], 2, 8);
}
/** Evaluate the crown/shoulder of the same ticking the quilt is resting on.
 * Rounded corner signed distances interpolate between the mattress sections;
 * unlike a constant Y offset this also fits the curved mattress ends. */
function tickingAt(x: number, z: number, w: number) {
  const dist = (scale: number) => {
    const dx = Math.abs(x) - w * scale / 2 + .18, dz = Math.abs(z) - 3.55 * scale / 2 + .18;
    return Math.hypot(Math.max(0, dx), Math.max(0, dz)) + Math.min(0, Math.max(dx, dz)) - .18;
  };
  let d0 = dist(.70), y0 = .807;
  for (const [scale, y] of [[.949, .791], [.989, .769], [.994, .745], [1, .732]]) {
    if (d0 <= 0) return y0;
    const d1 = dist(scale); if (d1 <= 0) return THREE.MathUtils.lerp(y0, y, d0 / (d0 - d1));
    d0 = d1; y0 = y;
  }
  return y0;
}
function quiltNormal(u: number, v: number): Point {
  const side = THREE.MathUtils.clamp((Math.abs(u) - .90) / .071, 0, 1) * Math.PI / 2;
  const foot = THREE.MathUtils.clamp((-v - .88) / .092, 0, 1) * Math.PI / 2;
  const nx = Math.sign(u) * Math.sin(side), ny = Math.cos(side) * Math.cos(foot), nz = -Math.sin(foot), length = Math.hypot(nx, ny, nz);
  return [nx / length, ny / length, nz / length];
}
function quiltPoint(w: number, u: number, v: number, under: boolean): Point {
  const mw = w - .075, e = Math.abs(u), halfW = mw / 2, halfD = 3.55 / 2;
  const side = Math.max(0, (e - .948) / .052), foot = Math.max(0, (-v - .948) / .052);
  // From the crown, over the sewn shoulder, then back IN against the ticking
  // below the bead. Thickness follows the outward normal, not global Y.
  let x = Math.sign(u) * halfW * (e <= .89 ? e / .89 * .94 : .94 + .054 * Math.min(1, (e - .89) / .058));
  let z = v >= -.86 ? -.595 + 1.22 * v : -1.6442 - (halfD * .994 - 1.6442) * Math.min(1, (-v - .86) / .088);
  const waves = .6 * Math.cos(3.6 * Math.PI * u + v * 1.4) + .4 * Math.sin(6 * Math.PI * u - v * 2);
  const lift = .008 * Math.max(0, waves - .30) ** 2;
  let base = tickingAt(x, z, mw) + .0012 + lift;
  if (side || foot) {
    base = Math.min(.746 - (.136 - .012 * Math.sin(v * 4.7)) * side, .746 - (.148 - .009 * Math.cos(u * 5)) * foot);
    const scale = base >= .732 ? THREE.MathUtils.lerp(1, .994, (base - .732) / .014) :
      THREE.MathUtils.lerp(1, .993, Math.min(1, (.732 - base) / .023));
    const ease = .0012 + lift;
    if (side) x = Math.sign(u) * (halfW * scale + ease);
    if (foot) z = -(halfD * scale + ease);
    // At the two foot corners the cloth turns on a diagonal; excess material
    // gathers here rather than hanging over an imaginary square corner.
    const dx = Math.max(0, Math.abs(x) - (halfW * scale - .18)), dz = Math.max(0, -z - (halfD * scale - .18)), radial = Math.hypot(dx, dz);
    if (dx && dz && radial > .18 + ease) {
      const ratio = (.18 + ease) / radial;
      x -= Math.sign(u) * dx * (1 - ratio); z += dz * (1 - ratio);
    }
  }
  const fold = .041 * Math.exp(-(((v - .84) * 9) ** 2)) - .010 * Math.exp(-(((v - .70) * 11) ** 2));
  const thickness = .017 + (.025 + .017 * waves + fold) * (1 - .53 * Math.max(side, foot));
  const normal = quiltNormal(u, v), t = under ? 0 : thickness;
  return [x + normal[0] * t, base + normal[1] * t, z + normal[2] * t];
}
const quiltColumns = [-1, -.977, -.957, -.948, -.925, -.89, -.76, -.62, -.49, -.34, -.22, -.11, 0, .14, .27, .4, .54, .67, .8, .89, .925, .948, .957, .977, 1];
const throwRows = [-.72, -.67, -.53, -.38, -.31, -.30];
export function quilt(w: number, throwOnly = false) {
  // The two pieces use identical triangles under the runner. Even between
  // sampled stations the wool lies on the quilt instead of bridging its valleys.
  const rows = throwOnly ? throwRows : [-1, -.977, -.957, -.948, -.92, -.86, ...throwRows, -.1, .18, .45, .64, .70, .78, .84, .9, .96, 1];
  return sheet(quiltColumns, rows, (u, v, under) => {
    const p = quiltPoint(w, u, v, !throwOnly && under);
    if (throwOnly) {
      const n = quiltNormal(u, v), t = under ? .0008 : .014 + .003 * Math.cos(u * 17 + v * 8);
      for (let i = 0; i < 3; i++) p[i] += n[i] * t;
    }
    return p;
  });
}
export function bedstead(k: FurnitureKit, w: number, pillowWidth: number) {
  const { put, m, box } = k;
  for (const x of [-w / 2 + .13, w / 2 - .13]) for (const z of [-1.67, 1.67]) {
    bent(k, m.walnut, [[x, 0, z, .057], [x, .013, z, .057], [x, .045, z, .061], [x * .983, .25, z * .985, .085]]);
  }
  // A rebated frame with open underside; the mattress sits on transverse slats.
  for (const x of [-w / 2, w / 2]) put(board(.123, 3.72, .27, .046), m.oak, x, .334, 0);
  for (const z of [-1.8, 1.8]) put(board(w + .04, .13, .27, .045), m.oak, 0, .334, z);
  for (let i = 0; i < 8; i++) box(0, .413, -1.51 + .43 * i, w, .045, .17, m.walnut, 0);
  put(mattress(w), m.linen, 0, .622, 0);
  put(quilt(w + .075), m.cream, 0, 0, 0);
  put(quilt(w + .075, true), m.terra, 0, 0, 0);
  put(pillowForm(pillowWidth, .68, .245), m.linen, 0, .926, 1.25);
  // Cabriole-shouldered timber headboard and seven integral fluted upholstery channels.
  const half = w / 2 + .15;
  const outline = [[-half, .14], [half, .14], [half, 1.48], [half - .028, 1.56], [half - .13, 1.6],
    [half - .25, 1.62], [half - .34, 1.71], [half * .57, 1.755], [0, 1.79], [-half * .57, 1.755],
    [-half + .34, 1.71], [-half + .25, 1.62], [-half + .13, 1.6], [-half + .028, 1.56], [-half, 1.48]];
  put(casting(outline, .105), m.oak, 0, 0, 1.9);
  const cols = Array.from({ length: 29 }, (_, i) => i / 14 - 1), rows = [-1, -.92, -.45, 0, .65, .92, 1];
  const panel = sheet(cols, rows, (u, v, under) => {
    const top = 1.72 - .14 * Math.abs(u) ** 3 - .065 * Math.abs(u) ** 8;
    const h = .48 + (top - .48) * (1 + v) / 2;
    const relief = (.035 + .045 * (1 - Math.cos((u + 1) * 7 * Math.PI))) * (1 - v ** 6);
    return [u * (half - .055), under ? -.005 : .012 + relief, h];
  });
  put(panel, m.sage, 0, 0, 1.848, -Math.PI / 2);
}

export function curtain(width: number, height: number, pleats: number) {
  const cols = Array.from({ length: pleats * 5 + 1 }, (_, i) => 2 * i / (pleats * 5) - 1);
  const cloth = sheet(cols, width > 3 ? [-1, -.94, -.35, .6, 1] : [-1, -.978, -.52, .52, .975, 1], (u, v, under) => {
    const a = (u + 1) * pleats * Math.PI + .17 * (1 - v * v) * Math.sin(u * 5);
    return [u * width * (.50 - .045 * (v + 1)), (.024 + .029 * (1 - v) / 2) * Math.cos(a) + (under ? -.004 : .004),
      v * height / 2 + (1 - v) * .007 * Math.cos(a)];
  });
  return cloth.rotateX(-Math.PI / 2);
}

/** Towel bolt, including the visible spiral return instead of a capped tube. */
export function towelRoll(length: number, r: number) {
  const line: number[][] = [], inner: number[][] = [];
  for (let i = 0; i <= 46; i++) {
    const a = i / 46 * Math.PI * 4.6, rr = r * (.17 + .83 * i / 46);
    line.push([rr * Math.cos(a), rr * Math.sin(a)]);
    inner.unshift([(rr - r * .24) * Math.cos(a), (rr - r * .24) * Math.sin(a)]);
  }
  return casting([...line, ...inner], length);
}
