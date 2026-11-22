import * as THREE from 'three';
import { bent, board, casting, loft, oval, rectRing, sheet, type FurnitureKit, type Point, type Ring } from './villaFurnitureForms.js';
import { dress, measuredSheet, type ClothCut } from './villaUpholsteryFinish.js';
import { bedLayer } from './villaBeddingDrape.js';
import { casedPillow, chaiseThrow, tailoredPad } from './villaUpholsterySeats.js';

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
    // The cinema shell stops below the shoulder blades. The individual hinged
    // backs, their headrests and the spaces between them now show from the aisle.
    const shellTop = leather ? Math.min(high, .875 + .045 * (1 - Math.abs(x) / half)) : high;
    const ny = shellTop - .27, halfWidth = (leather ? .13 : .12) * (i === 0 || i === path.length - 1 ? .70 : 1);
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
export function sofaFrame(k: FurnitureKit, w: number, fabric: THREE.Material, chaise: boolean, n: number, style: SofaStyle, sewn: THREE.Material, site: string) {
  const { put, m } = k, cinema = style === 'cinema', outdoor = style === 'terrace';
  const cut: ClothCut = cinema ? 'hide' : fabric === m.sage || fabric === m.terra ? 'velvet' : 'flax';
  const dye = cinema ? '#926346' : fabric === m.sage ? '#788575' : fabric === m.terra ? '#a16b55' : site === 'sofa-living' ? '#ddd0b9' : '#cbcbc0';
  function covered(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
    put(dress(g, cut, dye), sewn, x, y, z, rx, ry, rz);
  }
  if (outdoor || style === 'reading') timberSettee(k, w, outdoor);
  else {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bent(k, m.walnut, [
      [sx * (w / 2 - .16), 0, sz * .51, .044], [sx * (w / 2 - .16), .016, sz * .51, .046], [sx * (w / 2 - .17), .045, sz * .50, .050], [sx * (w / 2 - .22), .21, sz * .45, .067],
    ]);
    put(board(w - .13, 1.12, .079, .13, .042), m.walnut, 0, .205, 0);
    // Tailored deck below the loose cushions: a straight boxing strip and a
    // tucked base, not a second pillowed seat penetrating the first one.
    covered(sewnSkin([rectRing(w - .15, 1.10, .107, .238), rectRing(w - .093, 1.163, .119, .253),
      rectRing(w - .061, 1.204, .135, .292), rectRing(w - .059, 1.207, .135, .418),
      rectRing(w - .091, 1.184, .125, .446), rectRing(w - .145, 1.134, .115, .453)], 1, 4), 0, 0, -.014);
    covered(sofaBody(w, cinema), 0, 0, 0);
  }
  const pitch = (w - .50) / n;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * pitch;
    // The chaise cushion runs to the toe in one piece, not through another seat.
    const long = chaise && i === 0, length = long ? 2.06 : .98;
    if (long) {
      const toe = board(pitch + .02, 1.25, .19, .10);
      if (outdoor) put(toe, m.oak, x, .357, -1.04); else covered(toe, x, .357, -1.04);
      for (const dx of [-.29, .29]) bent(k, m.walnut, [[x + dx, 0, -1.55, .040], [x + dx, .014, -1.55, .040], [x + dx * .9, .28, -1.52, .058]]);
    }
    if (outdoor) {
      put(seatPad(pitch - .014, length, .235, .18), fabric, x, .559, long ? -.66 : -.12);
      put(seatPad(pitch + .006, .65, .21, .03), fabric, x, .924, .316, -1.36);
      continue;
    }
    const lean = [.65, -.90, .27, -.43][i % 4];
    const wear = site === 'sofa-living' ? [.21, .16, .32, .29][i % 4] : cinema ? .26 : site.includes('guest') ? .18 : .28;
    const pad = tailoredPad(pitch - .017, length, .235, long ? 'chaise' : 'seat', wear, lean);
    const foldedWool = long ? chaiseThrow(pitch, pad) : null;
    covered(pad, x, .559, long ? -.66 : -.12);
    covered(tailoredPad(pitch - (cinema ? .041 : .013), cinema ? .68 : .647, cinema ? .251 : .219, cinema ? 'reclining' : 'back', wear, lean),
      x + lean * .005, .930 + .009 * lean, (cinema ? .384 : .300) + .007 * lean, -1.31 + lean * .041, lean * .019, lean * .029);
    if (cinema) {
      // A small leather head roll follows the recline and projects above the
      // aisle-side shell. No loose throw cushions in the theatre.
      covered(casedPillow(pitch * .81, .207, .151, 'lumbar', i === 1), x, 1.168 + lean * .007, .306, -1.29 + lean * .032);
    } else if (foldedWool) put(dress(foldedWool, 'throw', '#817963'), sewn, x, .559, -.66);
  }
  const offset = w > 1.65 ? w / 2 - .61 : .15;
  if (outdoor) {
    put(pillowForm(.51, .47, .22), m.terra, -offset, .864, .105, -1.22, -.13, .13);
    if (w > 1.65) put(pillowForm(.48, .48, .21), m.sage, offset, .875, .119, -1.26, .18, -.15);
  } else if (!cinema && site !== 'sofa-library-east' && site !== 'sofa-east-suite') {
    const green = site === 'sofa-living', lumbar = style === 'reading' || green;
    put(dress(casedPillow(lumbar ? .65 : .54, lumbar ? .358 : .474, .218, 'lumbar', true), green || style === 'reading' ? 'twill' : 'velvet',
      green ? '#71806e' : style === 'reading' ? '#a3775f' : '#9d746b'), sewn, green ? offset - .07 : -offset, lumbar ? .807 : .857, .101, -1.13, green ? .13 : -.10, green ? -.12 : .16);
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
export function bedstead(k: FurnitureKit, w: number, pillowWidth: number, guest: boolean, sewn: THREE.Material) {
  const { put, m, box } = k;
  for (const x of [-w / 2 + .13, w / 2 - .13]) for (const z of [-1.67, 1.67]) {
    bent(k, m.walnut, [[x, 0, z, .057], [x, .013, z, .057], [x, .045, z, .061], [x * .983, .25, z * .985, .085]]);
  }
  // A rebated frame with open underside; the mattress sits on transverse slats.
  for (const x of [-w / 2, w / 2]) put(board(.123, 3.72, .27, .046), m.oak, x, .334, 0);
  for (const z of [-1.8, 1.8]) put(board(w + .04, .13, .27, .045), m.oak, 0, .334, z);
  for (let i = 0; i < 8; i++) box(0, .413, -1.51 + .43 * i, w, .045, .17, m.walnut, 0);
  put(dress(mattress(w), 'ticking', '#e4decd'), sewn, 0, .622, 0);
  put(dress(bedLayer(w, 'quilt', guest), 'quilt', guest ? '#c0c9b9' : '#e4d7bd'), sewn, 0, 0, 0);
  put(dress(bedLayer(w, 'throw', guest), 'throw', guest ? '#7b8790' : '#a56f53'), sewn, 0, 0, 0);
  put(dress(bedLayer(w, 'facing', guest), 'facing', guest ? '#e2deca' : '#c7bea1'), sewn, 0, 0, 0);
  put(dress(casedPillow(pillowWidth, .73, .245, 'bed', !guest), 'flax', '#ece4d5'), sewn, 0, .926, 1.25);
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
  put(dress(measuredSheet(panel, w, 1.24), 'velvet', guest ? '#8a8376' : '#80907e'), sewn, 0, 0, 1.848, -Math.PI / 2);
}

export function curtain(width: number, height: number, pleats: number, hand = 0) {
  const full = width > 3, count = full ? Math.ceil(pleats * .70) : pleats, knots = [0];
  for (let i = 0; i < count; i++) knots.push(knots[i] + 1 + .22 * Math.sin(i * 2.13 + hand) + .12 * Math.cos(i * 1.38 - hand));
  const cols: number[] = [], phase = new Map<number, number>();
  for (let i = 0; i < count; i++) for (const t of [0, .20, .44, .72]) {
    const u = 2 * (knots[i] + t * (knots[i + 1] - knots[i])) / knots[count] - 1; cols.push(u); phase.set(u, i + t);
  }
  cols.push(1); phase.set(1, count);
  const rows = full ? [-1, -.90, -.20, .48, .88, 1] : [-1, -.973, -.64, -.03, .47, .91, 1];
  const cloth = sheet(cols, rows, (u, v, under) => {
    const fall = (1 - v) / 2, p = phase.get(u)!, weight = .72 + .28 * Math.cos(Math.floor(p) * 1.72 + hand);
    const wave = 2 * Math.PI * p + .84 * fall * Math.sin(p * 1.72 + hand) + .32 * fall * fall;
    const fullness = full ? .98 : .64 + .35 * fall, pinch = full ? .010 : .048;
    const hang = Math.cos(wave), swell = (.028 + fall * .045) * (.71 + .29 * weight);
    const x = u * width * fullness * .5 + pinch * fall * Math.sin(p * 1.67 + hand) + (full ? .036 : .024) * fall * fall * Math.sin(hand);
    const y = swell * hang + .028 * fall * Math.sin(2.8 * u + hand) + (under ? -.003 : .003);
    return [x, y, v * height / 2 + fall ** 3 * (.028 * hang + .020 * Math.cos(2.7 * p - hand))];
  });
  return measuredSheet(cloth, full ? width * 1.56 : width * 2.8, height).rotateX(-Math.PI / 2);
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
