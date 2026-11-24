import * as THREE from 'three';
import { VillaModelBuilder } from './villaModel.js';
import { bentRail, ovalLoop, roundedLoop, sectionLoft, turnedSection } from './villaVehicleSections.js';
import { motorTyreStock, type MotorTyre } from './villaMotorFinish.js';
import { along, cuts, edgePoint, pressFascia, type CoachOpening } from './villaCoachPressings.js';

export type CoachPoint = [number, number, number];
export type CoachStation = readonly [z: number, halfWidth: number, belt: number];
export const coachMix = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);

/** Indexed parametric sheet with deliberately oriented normals. No degenerate
 * pole triangles, mirrored negative scales, or reliance on DoubleSide lighting. */
export function coachSheet(uSteps: number, vSteps: number, sample: (u: number, v: number) => CoachPoint, outward: CoachPoint): THREE.BufferGeometry {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let v = 0; v <= vSteps; v++) for (let u = 0; u <= uSteps; u++) {
    positions.push(...sample(u / uSteps, v / vSteps)); uv.push(u / uSteps, v / vSteps);
  }
  const p = (u: number, v: number) => new THREE.Vector3(...sample(u, v));
  const normal = p(.51, .5).sub(p(.49, .5)).cross(p(.5, .51).sub(p(.5, .49)));
  const flip = normal.dot(new THREE.Vector3(...outward)) < 0;
  for (let v = 0; v < vSteps; v++) for (let u = 0; u < uSteps; u++) {
    const a = v * (uSteps + 1) + u, b = a + 1, c = a + uSteps + 1, d = c + 1;
    indices.push(...(flip ? [a, c, b, b, c, d] : [a, b, c, b, d, c]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices); g.computeVertexNormals(); return g;
}

/** A fitted panel has an inner skin AND sealed perimeter. Its thickness points
 * inward, so exterior datums are shared exactly with neighbouring panels. */
export function coachPanel(builder: VillaModelBuilder, sample: (u: number, v: number) => CoachPoint, material: THREE.Material, outward: CoachPoint, inward: CoachPoint, uSteps = 24, vSteps = 8) {
  const inner = (u: number, v: number): CoachPoint => sample(u, v).map((x, i) => x + inward[i]) as CoachPoint;
  builder.geometry(coachSheet(uSteps, vSteps, sample, outward), material);
  builder.geometry(coachSheet(uSteps, vSteps, inner, outward.map(x => -x) as CoachPoint), material);
  for (const edge of [0, 1, 2, 3]) {
    const boundary = (u: number, v: number): CoachPoint => {
      const a = edge === 0 ? sample(u, 0) : edge === 1 ? sample(1, u) : edge === 2 ? sample(1 - u, 1) : sample(0, 1 - u);
      return a.map((x, i) => x + inward[i] * v) as CoachPoint;
    };
    // Derive the perimeter's outward direction from its centre and the panel
    // centre, rather than a fixed global axis (which breaks raked roofs).
    const a = new THREE.Vector3(...boundary(.5, 0)), center = new THREE.Vector3(...sample(.5, .5));
    builder.geometry(coachSheet(edge % 2 ? vSteps : uSteps, 1, boundary, a.sub(center).toArray() as CoachPoint), material);
  }
}

export function coachLine(builder: VillaModelBuilder, sample: (t: number) => CoachPoint, material: THREE.Material, radius: number, count = 28) {
  builder.geometry(bentRail(Array.from({ length: count + 1 }, (_, i) => sample(i / count)), radius, radius < .009 ? 6 : 8), material);
}

type CoachStyle = 'fastback' | 'touring' | 'utility';
interface CoachForm { style: CoachStyle; hoodBase?: number; rearGlass?: number; front: number; rear: number }
const sat = (t: number) => Math.max(0, Math.min(1, t));
const swell = (distance: number) => Math.max(0, 1 - distance * distance) ** 2;
export function coachHull(stations: readonly CoachStation[], axles: readonly number[], hubY: number, archRadius: number, sill: number, crown = .045,
  form: CoachForm = { style: 'fastback', front: .20, rear: .13 }) {
  const startZ = stations[0][0], endZ = stations[stations.length - 1][0];
  const utility = form.style === 'utility', touring = form.style === 'touring';
  const flange = utility ? .063 : touring ? .057 : .043, outerR = archRadius + flange;
  const noseRun = Math.min(.56, Math.max(.40, endZ - Math.max(...axles) - outerR - .026));
  const wrap = (across: number, z: number, height = 1) => {
    // Keep the rounded bumper out of the arch die. A quadratic lead-in
    // preserves the order of the tightly spaced stations even at the sill.
    const f = sat((z - endZ + noseRun) / noseRun), front = f * f * (2 - f), rear = ease(sat((startZ + .35 - z) / .35));
    const a2 = across * across;
    return z + (rear * form.rear - front * form.front) * (a2 * (.74 + .26 * a2) + .38 * (1 - height) ** 2);
  };
  // Monotone tangents at the wheel/cowl/bumper sections, rather than stopping
  // the highlight dead flat at every single longitudinal station.
  const slopes = (k: 1 | 2) => {
    const d = stations.slice(1).map((s, i) => (s[k] - stations[i][k]) / (s[0] - stations[i][0]));
    return stations.map((_, i) => i === 0 ? d[0] : i === d.length ? d[i - 1]
      : d[i - 1] * d[i] <= 0 ? 0 : 2 * d[i - 1] * d[i] / (d[i - 1] + d[i]));
  };
  const dw = slopes(1), dh = slopes(2);
  const section = (z: number) => {
    let i = 1; while (i < stations.length - 1 && z > stations[i][0]) i++;
    const a = stations[i - 1], b = stations[i], dz = b[0] - a[0], t = sat((z - a[0]) / dz);
    const sample = (k: 1 | 2, d: number[]) => coachMix(a[k], b[k], ease(t)) + dz * t * (1 - t) * ((1 - t) * d[i - 1] - t * d[i]);
    return { width: sample(1, dw), belt: sample(2, dh) };
  };
  const leg = hubY > sill ? .018 : 0, cutUp = Math.max(0, sill - hubY);
  const half = (r: number) => Math.sqrt(r * r - cutUp * cutUp), outerHalf = half(outerR);
  const bottomAt = (r: number, d: number) => {
    const w = half(r);
    if (d <= w + 1e-9) return hubY + Math.sqrt(Math.max(cutUp * cutUp, r * r - Math.min(d, w) ** 2));
    return d < w + leg ? coachMix(hubY, sill, (d - w) / leg) : sill;
  };
  const nearest = (z: number) => {
    let d = Infinity; for (const axle of axles) d = Math.min(d, Math.abs(z - axle)); return d;
  };
  const lower = (z: number) => bottomAt(outerR, nearest(z));
  const side = (sign: number, z: number, t: number): CoachPoint => {
    const s = section(z), d = nearest(z), y = coachMix(bottomAt(outerR, d), s.belt, t);
    const h = (y - sill) / (s.belt - sill), flare = ease(sat((outerHalf + .19 - d) / .24));
    // The fastback's low prow leaves a very steep forward heel on its wing.
    // Release the rocker hollow over just this chord; taper back to the usual
    // flare within 6 cm. No change to either axle, the arch or the door leaf.
    const heel = form.style === 'fastback' ? 1 - ease(sat((Math.abs(z - axles[axles.length - 1] - outerHalf) - .020) / .040)) : 0;
    const wheel = coachMix(flare, 1, heel);
    const beltLine = .82 - .060 * (z - startZ) / (endZ - startZ);
    // The upper stamping rolls back under the window; below it a drawn hollow
    // flows into a kicked-out rocker. The hollow dies out over the bearings.
    const waist = (utility ? .022 : touring ? .032 : .024) * swell((h - beltLine + .19) / .17);
    const swage = (utility ? .024 : .020) * swell((h - beltLine) / .15);
    const rocker = (utility ? .040 : touring ? .049 : .041) * swell((h - .16) / .16);
    const width = s.width - .065 * (1 - h) * (1 - .82 * wheel) + .007 * Math.sin(Math.PI * h)
      + (rocker + swage - waist) * (1 - .92 * wheel);
    return [sign * width, y, wrap(sign, z, h)];
  };
  const hoodRun = (z: number) => form.hoodBase === undefined ? 0 : sat((z - form.hoodBase) / (endZ - form.hoodBase));
  const split = (z: number) => coachMix(utility ? .61 : touring ? .68 : .75, utility ? .53 : touring ? .51 : .58, ease(hoodRun(z)));
  const deck = (across: number, z: number, lift = 0): CoachPoint => {
    const s = section(z), p = Math.abs(across), t = hoodRun(z), seam = split(z);
    const load = ease(sat(t / .24)) * (.48 + .52 * swell((z - axles[axles.length - 1]) / .97));
    const ridge = seam + (utility ? .21 : .15);
    // Broad arched pontoon above the bearing, with a parabolic fall all the way
    // to the outer wing. The pickup's higher, folded centre contrasts with the
    // open valley of the fastback and the two longer muscles of the touring nose.
    const wing = p < ridge ? swell((p - ridge) / (utility ? .22 : .30)) : 1 - ((p - ridge) / (1 - ridge)) ** 2;
    const dome = utility ? .090 * ease(sat((seam + .015 - p) / .17))
      : touring ? .035 * swell(p / (seam - .035)) : -.013 * (1 - p * p);
    let top = s.belt + crown * (1 - p * p) + load * (dome + wing * (utility ? .083 : touring ? .110 : .094));
    if (form.rearGlass !== undefined && z < form.rearGlass) {
      const run = sat((form.rearGlass - z) / (form.rearGlass - startZ));
      top += (touring ? .056 : .069) * ease(run) * (4 * run * (1 - run)) * (1 - p ** 4); // kick rolls back to the lamp datum
    }
    return [across * s.width, top + lift, wrap(across, z)];
  };
  // Put columns on the circular die and on real panel joints; flat spans only
  // need a few stations. All sides/door returns/arches use this same cut list.
  const marks = [...stations.map(s => s[0]), startZ, endZ];
  if (form.hoodBase !== undefined) marks.push(form.hoodBase);
  if (form.rearGlass !== undefined) marks.push(form.rearGlass);
  for (let z = startZ + .096; z < endZ; z += .096) if (nearest(z) > outerHalf + leg + .025) marks.push(z);
  const theta = Math.asin(cutUp / outerR);
  for (const a of axles) {
    for (let i = 0; i <= 24; i++) marks.push(a + outerR * Math.cos(coachMix(theta, Math.PI - theta, i / 24)));
    marks.push(a - outerHalf - leg, a + outerHalf + leg);
  }
  const stationsZ = cuts(marks), zs = (from: number, to: number) => cuts([from, ...stationsZ.filter(z => z > from + 1e-6 && z < to - 1e-6), to]);
  const levels = [0, .09, .16, .23, .36, .48, .60, .69, .77, .83, .91, 1];
  const sides = (b: VillaModelBuilder, mat: THREE.Material, sign: number, start: number, end: number) => {
    const z = zs(start, end);
    coachPanel(b, (u, v) => side(sign, along(z, u), along(levels, v)), mat, [sign, 0, 0], [-sign * .035, 0, 0], z.length - 1, levels.length - 1);
  };
  // Separate matched bonnet and wings. The 6 mm shut line is a recessed seal
  // between turned paint edges, not a proud painted cord across the bonnet.
  const wingCuts = [.21, .41, .62, .80, .92, 1], hoodCuts = [-.16, -.08, -.0034, .0034];
  const lateral = (index: number, seam: number) => {
    const i = Math.abs(index);
    return Math.sign(index) * (i < 3 ? i * .125 : i < 7 ? seam + hoodCuts[i - 3] : coachMix(seam, 1, wingCuts[i - 7]));
  };
  const plainCuts = Array.from({ length: 25 }, (_, i) => i / 12 - 1);
  const acrossAt = (z: number) => form.hoodBase === undefined || z < form.hoodBase ? plainCuts
    : Array.from({ length: 25 }, (_, i) => lateral(i - 12, split(z)));
  const deckPanel = (b: VillaModelBuilder, paint: THREE.Material, start: number, end: number, seal?: THREE.Material) => {
    const z = zs(start, end);
    if (!seal) {
      coachPanel(b, (u, v) => deck(u * 2 - 1, along(z, v)), paint, [0, 1, 0], [0, -.035, 0], 24, z.length - 1); return;
    }
    const panel = (a: number, e: number, u: number, v: number, lift = 0) => {
      const at = along(z, v), seam = split(at), k = a + u * (e - a), i = Math.min(e - 1, Math.floor(k));
      return deck(coachMix(lateral(i, seam), lateral(i + 1, seam), k - i), at, lift);
    };
    for (const [a, e] of [[-12, -6], [-5, 5], [6, 12]]) coachPanel(b, (u, v) => panel(a, e, u, v), paint,
      [0, 1, 0], [0, -.018, 0], e - a, z.length - 1);
    for (const a of [-6, 5]) b.geometry(coachSheet(1, z.length - 1,
      (u, v) => panel(a, a + 1, u, v, -.009), [0, 1, 0]), seal);
  };
  // Rule every aperture and return from the same physical edge chords. This
  // avoids a folded sliver where a closely spaced lamp cut meets the shoulder.
  const endForm = (z: number) => {
    const xs = acrossAt(z);
    return { xs, top: xs.map(a => deck(a, z)), edge: levels.map(v => side(1, z, v)) };
  };
  const head = endForm(endZ), tail = endForm(startZ);
  const fascia = (z: number, across: number, v: number, lift = 0): CoachPoint => {
    const f = z === startZ ? tail : head, edge = edgePoint(levels, f.edge, v), top = edgePoint(f.xs, f.top, across);
    return [across * edge[0], coachMix(sill, top[1], v), top[2] + edge[2] - f.edge[levels.length - 1][2] + Math.sign(z) * lift];
  };
  const endPanel = (b: VillaModelBuilder, paint: THREE.Material, z: number, openings: CoachOpening[] = []) =>
    pressFascia(b, paint, z, fascia, coachSheet, acrossAt(z), levels, openings);
  const arches = (b: VillaModelBuilder, lip: THREE.Material, liner: THREE.Material) => {
    for (const sign of [-1, 1]) for (const axle of axles) {
      const columns = zs(axle - outerHalf - leg, axle + outerHalf + leg), mouthHalf = half(archRadius);
      const roll = (u: number, radial: number, lateral: number): CoachPoint => {
        const z = along(columns, u), dz = z - axle, outside = side(sign, z, 0);
        const innerZ = axle + Math.sign(dz) * (Math.min(Math.abs(dz) / outerHalf, 1) * mouthHalf + Math.max(0, Math.abs(dz) - outerHalf));
        return [outside[0] + sign * lateral, coachMix(outside[1], bottomAt(archRadius, Math.abs(innerZ - axle)), radial), coachMix(outside[2], innerZ, radial)];
      };
      const reach = utility ? .025 : touring ? .022 : .014;
      b.geometry(coachSheet(columns.length - 1, 3, (u, v) => roll(u, along([0, .20, .82, 1], v),
        reach * along([0, .58, 1, .74], v)), [sign, 0, 0]), lip);
      // Turn the hem INTO the wheel house. The return crosses the tyre width
      // above the tread, not its spoke windows or the loaded contact patch.
      b.geometry(coachSheet(columns.length - 1, 2, (u, v) => roll(u, along([1, .96, .84], v),
        along([reach * .74, -.010, utility ? -.225 : -.197], v)), [0, -1, 0]), liner);
    }
  };
  return { section, side, deck, fascia, sides, deckPanel, endPanel, arches, lower, acrossAt };
}

/** A shallow formed housing or intake on the REAL curved fascia. Softly
 * clipped corners, front, inner skin and perimeter give it physical depth. */
export function coachFasciaPatch(builder: VillaModelBuilder, hull: ReturnType<typeof coachHull>, z: number, a0: number, a1: number, v0: number, v1: number, material: THREE.Material, lift = .009) {
  const sample = (u: number, v: number, extra = 0): CoachPoint => {
    const mid = (a0 + a1) / 2, across = mid + (coachMix(a0, a1, u) - mid) * (.88 + .12 * Math.sin(Math.PI * v));
    return hull.fascia(z, across, coachMix(v0, v1, v), lift + extra);
  };
  coachPanel(builder, sample, material, [0, 0, Math.sign(z)], [0, 0, -Math.sign(z) * .012], 16, 8);
  return sample;
}

type OpticalFace = (u: number, v: number, lift?: number) => CoachPoint;
/** Dark radiator fins behind the grille bars. Only their leading folds catch
 * light; the backing stays recessed. No invented upper grille on the electric sedan. */
export function coachCoolingFins(b: VillaModelBuilder, face: OpticalFace, vertical: boolean, count: number) {
  const metal=new THREE.MeshStandardMaterial({color:0x505653,roughness:.57,metalness:.39});metal.name='grille/blackened-fins';
  for(let i=0;i<count;i++) {
    const t=(i+.6)/(count+.2);
    b.geometry(coachSheet(vertical?1:14,vertical?5:1,(u,v)=>vertical
      ?face(t+(u-.5)*.019,.065+.87*v,.001+u*.004)
      :face(.045+.91*u,t+(v-.5)*.055,.001+v*.004),[0,0,1]),metal);
  }
}
/** A spun reflector around a smaller proud, convex optic. Both sit inside the
 * gasket on the local curved face, not world-Z facing dots glued to a bumper. */
export function coachProjector(b: VillaModelBuilder, face: OpticalFace, center: number, halfWidth: number, metal: THREE.Material, lens: THREE.Material) {
  const ring = (radius: number, lift: number) => Array.from({length:16},(_,i)=>{
    const a=i*Math.PI/8;
    return face(center+halfWidth*radius*Math.cos(a), .48+.324*radius*Math.sin(a),lift);
  });
  // The rolled reflector lip turns back into the silver bowl. Its raised pupil
  // is a separate refracting shape with a flatter centre, without transmission.
  b.geometry(sectionLoft([ring(1,.002),ring(.96,.011),ring(.86,.012),ring(.53,.004)],false,false,[0,0,1]),metal);
  b.geometry(sectionLoft([ring(.59,.004),ring(.59,.010),ring(.43,.017),ring(.21,.020)],false,true,[0,0,1]),lens);
}
/** The light guide follows the rolled brow of its pocket. A folded optical
 * carrier, not an emissive disk, fills the outer end under that brow. */
export function coachHeadlamp(b: VillaModelBuilder, face: OpticalFace, alloy: THREE.Material, light: THREE.Material, style: CoachStyle) {
  const blade = (u: number, v: number) => {
    const h = style === 'utility' ? .23 : .18 - .064 * u;
    return face(coachMix(.045, .965, u), .95 - h + h * v, .009 + .007 * Math.sin(Math.PI * v));
  };
  b.geometry(coachSheet(16, 4, blade, [0, 0, 1]), light);
  if (style === 'utility') {
    // Two rectangular sealed-beam chambers in a single work-light casting.
    for (const [lo, hi] of [[.055, .50], [.535, .947]]) {
      const ring = (w: number, h: number, d: number) => roundedLoop(w, h, .082, 2)
        .map(([x, y]) => face((lo + hi) / 2 + x * (hi - lo), .40 + y * .67, d));
      b.geometry(sectionLoft([ring(1, 1, .004), ring(.95, .94, .016), ring(.76, .65, .006)], false, false, [0, 0, 1]), alloy);
      b.geometry(coachSheet(8, 4, (u, v) => face(coachMix(lo + .066, hi - .066, u), .22 + .36 * v,
        .010 + .005 * Math.sin(Math.PI * v) + .002 * Math.cos(u * Math.PI * 8)), [0, 0, 1]), light);
    }
  } else {
    coachProjector(b, face, .225, .132, alloy, light);
    // Narrow flashed facets share a continuous, slightly cupped reflector.
    b.geometry(coachSheet(10, 4, (u, v) => face(.405 + u * .532, .17 + .205 * u + (.51 - .16 * u) * v,
      .004 + .008 * Math.sin(Math.PI * v) + .0025 * Math.cos(u * Math.PI * 10)), [0, 0, 1]), alloy);
    if (style === 'touring') b.geometry(coachSheet(12, 2, (u, v) => face(.41 + .52 * u, .14 + .20 * u + .085 * v, .012), [0, 0, 1]), light);
  }
}
/** A pressure-moulded prismatic lamp in its own gasket. Each facet catches the
 * existing light separately; the small clear reversing chamber and ledge aren't
 * a white line painted across the whole red cover. */
export function coachTailLens(b: VillaModelBuilder, face: OpticalFace, lens: THREE.Material, clear: THREE.Material, tall=false) {
  const mould=(u0:number,u1:number,v0:number,v1:number,cells:number,material:THREE.Material) => {
    const facelet=coachSheet(cells*2,4,(u,v)=>{
      const prism=1-2*Math.abs((u*cells%1)-.5);
      return face(coachMix(u0,u1,u),coachMix(v0,v1,v),.003+.009*Math.sin(Math.PI*v)+.0036*prism);
    },[0,0,-1]);
    const cut=facelet.toNonIndexed();facelet.dispose();cut.computeVertexNormals();b.geometry(cut,material);
  };
  if(tall){
    mould(.095,.905,.57,.945,5,lens); mould(.095,.905,.38,.53,5,clear); mould(.095,.905,.055,.345,5,lens);
  } else {
    mould(.035,.965,.39,.935,9,lens); mould(.035,.245,.08,.34,3,clear); mould(.272,.965,.08,.34,7,lens);
  }
}

/** Rolled liftback pressing with inset optics and a blank registration plate.
 * Even the light-bar bridge lies below the metal, not across it as a wire. */
export function coachHatch(b: VillaModelBuilder, hull: ReturnType<typeof coachHull>, z: number, paint: THREE.Material,
  dark: THREE.Material, metal: THREE.Material, red: THREE.Material, clear: THREE.Material, touring = false) {
  const wing = touring ? .437 : .405, bay = touring ? .56 : .54;
  const [plate, bar, left, right] = hull.endPanel(b, paint, z, [
    { rect: [-bay, bay, .33, touring ? .69 : .71], depth: touring ? .086 : .071, shape: 'press', stock: paint },
    { rect: [-wing + .008, wing - .008, .795, .887], depth: .012, shape: 'press', stock: dark },
    { rect: [-wing, -.996, touring ? .724 : .740, .950], depth: .022, shape: 'press', stock: dark },
    { rect: [wing, .996, touring ? .724 : .740, .950], depth: .022, shape: 'press', stock: dark },
  ]);
  for (const lamp of [left, right]) coachTailLens(b, lamp, red, clear);
  b.geometry(coachSheet(22, 3, (u, v) => bar(u, .35 + .38 * v, .005 + .003 * Math.sin(Math.PI * v)), [0, 0, -1]), red);
  const ring = (w: number, h: number, d: number) => roundedLoop(w, h, .040, 2).map(([x, y]) => plate(.5 + x, .46 + y, d));
  b.geometry(sectionLoft([ring(.68, .55, .001), ring(.671, .52, .008)], true, true, [0, 0, -1]), dark);
  b.geometry(sectionLoft([ring(.634, .435, .0081), ring(.628, .427, .010)], false, true, [0, 0, -1]), metal);
}

/** Exterior smoke tint remains legible without an environment map, while the
 * back face transmits much more light for the actual seated view. No reflection
 * target, textures, per-frame mutation, or fake opaque cabin block is needed. */
export function coachGlass(color: THREE.ColorRepresentation, opacity = .64): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity, depthWrite: false, roughness: .19, metalness: .04, side: THREE.DoubleSide, clearcoat: .7 });
  material.forceSinglePass = true;
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
      // The authored pane normals face out. Interior visibility is deliberately
      // retained instead of turning the road blue with the exterior smoke tint.
      diffuseColor.a *= gl_FrontFacing ? 1.0 : 0.20;
      #include <alphatest_fragment>
    `);
  };
  material.customProgramCacheKey = () => 'villa-coach-glass-sided-v1';
  return material;
}

export interface CoachCanopy {
  frontBase: number; rearBase: number;
  front: CoachStation; rear: CoachStation;
  crown: number;
}
/** All six greenhouse boundaries use the same samplers. Glazing is a thin
 * surface; only the opaque roof has thickness. Door panes are not duplicated. */
export function coachCanopy(hull: ReturnType<typeof coachHull>, shape: CoachCanopy) {
  const roof = (u: number, v: number): CoachPoint => {
    const across = u * 2 - 1, t = ease(v);
    return [across * coachMix(shape.rear[1], shape.front[1], t), coachMix(shape.rear[2], shape.front[2], t) + shape.crown * (1 - across * across), coachMix(shape.rear[0], shape.front[0], v)];
  };
  const wind = (front: boolean, u: number, v: number): CoachPoint => {
    const top = roof(u, front ? 1 : 0), base = hull.deck(u * 2 - 1, front ? shape.frontBase : shape.rearBase);
    return base.map((x, i) => coachMix(x, top[i], v)) as CoachPoint;
  };
  const windPane = (b: VillaModelBuilder, glass: THREE.Material, front: boolean, rows: number) => {
    const base = front ? shape.frontBase : shape.rearBase, coarse = hull.acrossAt(base);
    // Fit the lower pane to the 24 actual hood chords (including its hems).
    // Four extra knots on those chords let the top share the roof's 28 cuts.
    const xs = cuts([...coarse, ...[2, 9, 14, 21].map(i => (coarse[i] + coarse[i + 1]) / 2)]);
    const edge = coarse.map(a => hull.deck(a, base)), points = xs.map(x => edgePoint(coarse, edge, x));
    b.geometry(coachSheet(28, rows, (u, v) => {
      const top = roof(u, front ? 1 : 0), row = u * 28, i = Math.min(27, Math.floor(row));
      return top.map((n, k) => coachMix(coachMix(points[i][k], points[i + 1][k], row - i), n, v)) as CoachPoint;
    }, [0, 1, front ? 1 : -1]), glass);
  };
  const topAt = (z: number): CoachPoint => {
    if (z > shape.front[0]) return wind(true, 1, (shape.frontBase - z) / (shape.frontBase - shape.front[0]));
    if (z < shape.rear[0]) return wind(false, 1, (z - shape.rearBase) / (shape.rear[0] - shape.rearBase));
    return roof(1, (z - shape.rear[0]) / (shape.front[0] - shape.rear[0]));
  };
  const window = (sign: number, z: number, v: number): CoachPoint => {
    const top = topAt(z), s = hull.section(z);
    return [sign * coachMix(s.width, top[0], v), coachMix(s.belt, top[1], v), z];
  };
  const pane = (builder: VillaModelBuilder, material: THREE.Material, sign: number, start: number, end: number) => {
    // End triangles of a triangular quarter-light would collapse at v=0/1;
    // stop 0.5mm inside the frame, which overlaps the sealed end of the pane.
    builder.geometry(coachSheet(40, 12, (u, v) => window(sign, coachMix(start + .0005, end - .0005, u), v), [sign, 0, 0]), material);
  };
  const frame = (builder: VillaModelBuilder, paint: THREE.Material, seal: THREE.Material) => {
    for (const front of [true, false]) {
      for (const u of [0, 1]) coachLine(builder, t => wind(front, u, t), paint, front ? .028 : .04);
      coachLine(builder, t => wind(front, t, 0), seal, .012);
      coachLine(builder, t => wind(front, t, 1), paint, .011);
    }
    for (const u of [0, 1]) coachLine(builder, t => roof(u, t), paint, .018);
  };
  return { roof, wind, windPane, window, pane, frame, topAt };
}

/** Original machined alloy wheels, model-specific spoke count/finish. Rounded
 * tyre shoulders remain at the original axle datums; no terrain/pose changes. */
export function coachWheels(builder: VillaModelBuilder, options: { axles: readonly number[]; x: number; y: number; radius: number; width: number; spokes: number; design: 'aero' | 'utility' | 'split' }, rubber: THREE.Material, dark: THREE.Material, metal: THREE.Material, accent: THREE.Material) {
  const { axles, x, y, radius, width, spokes } = options, rim = radius * .70;
  const touring = options.design === 'split', utility = options.design === 'utility';
  const stock = motorTyreStock(y,radius,width,options.design,(rubber as THREE.MeshStandardMaterial).color), tyres: MotorTyre[] = [];
  const alloy = new THREE.MeshStandardMaterial({color:utility?0xb0afa3:0xb7bfc1,metalness:utility?.46:.59,roughness:utility?.42:.31});
  alloy.name='wheel/turned-alloy';
  for (const side of [-1, 1]) for (const z of axles) {
    const band = (section: [number, number][], mat: THREE.Material) => builder.geometry(
      turnedSection(section.map(([a,r]) => [side * a,r]), 44), mat, [side*x,y,z]);
    tyres.push(stock.mount(builder.root,[side*x,y,z]));
    const face = width * .405;
    band([[-width*.39,rim+.003],[face-.009,rim+.004],[face,rim+.006],[face+.003,rim],[face-.002,rim-.010],
      [face-.027,rim-.014],[-width*.38,rim-.018]], alloy);
    // A recessed swept brake track and hat. Leave the model-specific spoke
    // windows open; no bright disk across the whole inner barrel.
    band([[-width*.24,rim*.77],[-width*.15,rim*.77],[-width*.15,rim*.48],[-width*.24,rim*.46]],alloy);
    band([[-width*.20,rim*.48],[-width*.09,rim*.47],[-width*.09,rim*.26],[-width*.20,rim*.26]],dark);
    builder.cylinder(side*(x-width*.10),y,z,rim*.29,rim*.29,width*.84,dark,[0,0,Math.PI/2],24);
    for (let i=0; i<spokes; i++) for (const branch of (touring ? [-1,1] : [0])) {
      const angle = i*Math.PI*2/spokes;
      coachPanel(builder,(u,v) => {
        const r = coachMix(.039,rim-.006,v);
        const sweep = touring ? .14*v+branch*(.025+.16*v*v) : utility ? -.11*Math.sin(v*Math.PI) : .37*v;
        const half = touring ? .115-.057*v : utility ? .28-.16*v : .36-.15*v+.05*Math.sin(v*Math.PI);
        const a=angle+sweep+(u*2-1)*half;
        const dish=face-.009 - (1-v)**2 * (utility ? .012 : .025) + .006*Math.sin(u*Math.PI);
        return [side*(x+dish),y+Math.cos(a)*r,z+Math.sin(a)*r];
      },accent === metal ? alloy : accent,[side,0,0],[-side*.012,0,0],2,5);
    }
    builder.cylinder(side*(x+face-.019), y,z,.053,.061,.028,metal,[0,0,Math.PI/2],24);
    for (let i=0;i<spokes;i++) {
      const a=(i+.5)*Math.PI*2/spokes;
      builder.cylinder(side*(x+face-.003),y+.040*Math.cos(a),z+.040*Math.sin(a),.0055,.007,.007,dark,[0,0,Math.PI/2],6);
    }
  }
  return tyres;
}

/** Lofted upholstered cushions: shoulders taper above the lumbar region, with
 * rounded bolster edges instead of intersecting rectangular seat blocks. */
export function coachSeat(builder: VillaModelBuilder, x: number, cushionY: number, z: number, width: number, fabric: THREE.Material, insert: THREE.Material, dark: THREE.Material, stitch: THREE.Material, backHeight = .53) {
  builder.box(x, cushionY - .115, z, width * .79, .08, .48, dark, .022);
  // One upholstered skirt rolls up into both bolsters, then down into the
  // squab. Padding and inset share a sewn edge instead of overlapping pillows.
  const seatRing = (w: number, d: number, h: number, wings: number) => ovalLoop(1, 1, 28, .53).map(([u,v]): CoachPoint =>
    [x+u*width*w*(1-.07*v), cushionY+h+wings*u**4*(1-.32*v*v)+.013*v, z+v*d]);
  const join = seatRing(.365,.224,.071,.019);
  builder.geometry(sectionLoft([seatRing(.44,.25,-.088,0),seatRing(.50,.285,-.035,.012),
    seatRing(.50,.289,.028,.062),seatRing(.45,.266,.073,.069),join], true, false), fabric);
  builder.geometry(sectionLoft([join,seatRing(.25,.18,.070,.005),seatRing(.11,.09,.066,0)],false,true,[0,1,0]),insert);
  const bottom = cushionY + .03, top = bottom + backHeight;
  coachPanel(builder, (u, v) => {
    const a = u * 2 - 1, w = width * coachMix(.50, .40, ease(v));
    return [x + a * w, coachMix(bottom, top, v), z - .245 - .095 * v + .035 * (1 - a * a) + .027 * Math.sin(v * Math.PI)];
  }, fabric, [0, 0, 1], [0, 0, -.095], 14, 18);
  coachPanel(builder, (u, v) => {
    const a = u * 2 - 1;
    return [x + a * width * .27, coachMix(bottom + .065, top - .075, v), z - .214 - .075 * v + .014 * (1 - a * a) + .018 * Math.sin(v * Math.PI)];
  }, insert, [0, 0, 1], [0, 0, -.012], 10, 12);
  for (const sign of [-1, 1]) {
    builder.beam([x + sign * .068, top - .025, z - .34], [x + sign * .068, top + .055, z - .34], .009, stitch, 8);
    coachLine(builder, t => [x + sign * width * .295, coachMix(bottom + .09, top - .07, t), z - .202 - .075 * t], stitch, .0018, 12);
  }
  builder.geometry(sectionLoft([[-.078,.44,.139],[-.046,.52,.17],[.032,.51,.166],[.065,.43,.13]].map(([depth,w,h]) =>
    roundedLoop(width*w,h,.045).map(([a,b]): CoachPoint => [x+a,top+.10+b,z-.35+depth-b*.13]))),fabric);
  for (const v of [-.11,-.022,.066,.154]) coachLine(builder,t=>{
    const a=t*2-1; return [x+a*width*.229,cushionY+.070+.006*a*a+.013*v/.25,z+v];
  }, stitch,.0014,7);
}
