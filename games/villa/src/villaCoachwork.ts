import * as THREE from 'three';
import { VillaModelBuilder } from './villaModel.js';

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
  for (let i = 0; i < count; i++) builder.beam(sample(i / count), sample((i + 1) / count), radius, material, 6);
}

export function coachHull(stations: readonly CoachStation[], axles: readonly number[], hubY: number, archRadius: number, sill: number, crown = .045, rounding = { front: .20, rear: .13 }) {
  const startZ = stations[0][0], endZ = stations[stations.length - 1][0];
  const wrap = (across: number, z: number, height = 1) => {
    const front = ease(THREE.MathUtils.clamp((z - endZ + .48) / .48, 0, 1));
    const rear = ease(THREE.MathUtils.clamp((startZ + .32 - z) / .32, 0, 1));
    // Curved plan-view corners and an inward-swept lower bumper share their
    // exact edge vertices with the shoulders/bonnet, not a rectangular slab.
    return z + (rear * rounding.rear - front * rounding.front) * (across ** 4 + .38 * (1 - height) ** 2);
  };
  const section = (z: number) => {
    let index = 1;
    while (index < stations.length - 1 && z > stations[index][0]) index++;
    const a = stations[index - 1], b = stations[index], t = ease(THREE.MathUtils.clamp((z - a[0]) / (b[0] - a[0]), 0, 1));
    return { width: coachMix(a[1], b[1], t), belt: coachMix(a[2], b[2], t) };
  };
  const lower = (z: number) => {
    let y = sill;
    for (const axle of axles) {
      const d = Math.abs(z - axle);
      // Short vertical arch legs join the sill; the cap is a true circle.
      if (d < archRadius) y = Math.max(y, hubY + Math.sqrt(archRadius ** 2 - d ** 2));
      else if (d < archRadius + .018) y = Math.max(y, coachMix(hubY, sill, (d - archRadius) / .018));
    }
    return y;
  };
  const side = (sign: number, z: number, t: number): CoachPoint => {
    const s = section(z), bottom = lower(z);
    // Flared wheel lips meet the full shoulder width, while ordinary rocker
    // panels tuck inward. A tyre must not protrude through an inset arch cap.
    const inset = .065 * (1 - THREE.MathUtils.clamp((bottom - sill) / archRadius, 0, 1));
    return [sign * (s.width - inset * (1 - t) + .007 * Math.sin(Math.PI * t)), coachMix(bottom, s.belt, t), wrap(sign, z, t)];
  };
  const deck = (across: number, z: number, lift = 0): CoachPoint => {
    const s = section(z); return [across * s.width, s.belt + crown * (1 - across * across) + lift, wrap(across, z)];
  };
  const sides = (builder: VillaModelBuilder, material: THREE.Material, sign: number, start: number, end: number) => {
    coachPanel(builder, (u, v) => side(sign, coachMix(start, end, u), v), material, [sign, 0, 0], [-sign * .035, 0, 0], Math.ceil((end - start) * 52), 6);
  };
  const deckPanel = (builder: VillaModelBuilder, material: THREE.Material, start: number, end: number) => {
    coachPanel(builder, (u, v) => deck(u * 2 - 1, coachMix(start, end, v)), material, [0, 1, 0], [0, -.035, 0], 24, 28);
  };
  const fascia = (z: number, across: number, v: number, lift = 0): CoachPoint => {
    const s = section(z), sign = z === startZ ? -1 : 1;
    return [across * (s.width - .065 * (1 - v) + .007 * Math.sin(Math.PI * v)), coachMix(sill, s.belt + crown * (1 - across * across), v), wrap(across, z, v) + sign * lift];
  };
  const endPanel = (builder: VillaModelBuilder, material: THREE.Material, z: number) => {
    const sign = z === startZ ? -1 : 1;
    // Match bonnet U and side-panel V subdivisions, so their curved outer
    // boundary edges weld geometrically rather than leave tiny T-junction gaps.
    coachPanel(builder, (u, v) => fascia(z, u * 2 - 1, v), material, [0, 0, sign], [0, 0, -sign * .035], 24, 6);
  };
  const arches = (builder: VillaModelBuilder, material: THREE.Material, radius = .022) => {
    for (const sign of [-1, 1]) for (const axle of axles) {
      coachLine(builder, t => {
        const angle = t * Math.PI, z = axle + archRadius * Math.cos(angle), y = hubY + archRadius * Math.sin(angle);
        const s = section(z), v = (y - lower(z)) / Math.max(.03, s.belt - lower(z));
        return [side(sign, z, v)[0] + sign * .006, y, z];
      }, material, radius, 40);
      for (const direction of [-1, 1]) {
        const z = axle + direction * (archRadius + .008);
        coachLine(builder, t => [side(sign, z, 0)[0], coachMix(sill, hubY, t), z], material, radius, 3);
      }
    }
  };
  return { section, side, deck, fascia, sides, deckPanel, endPanel, arches, lower };
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
  return { roof, wind, window, pane, frame, topAt };
}

/** Original machined alloy wheels, model-specific spoke count/finish. Rounded
 * tyre shoulders remain at the original axle datums; no terrain/pose changes. */
export function coachWheels(builder: VillaModelBuilder, options: { axles: readonly number[]; x: number; y: number; radius: number; width: number; spokes: number }, rubber: THREE.Material, dark: THREE.Material, metal: THREE.Material, accent: THREE.Material) {
  const { axles, x, y, radius, width, spokes } = options, rim = radius * .70;
  for (const side of [-1, 1]) for (const z of axles) {
    builder.geometry(new THREE.TorusGeometry(radius - width / 2, width / 2, 12, 48), rubber, [side * x, y, z], [0, Math.PI / 2, 0]);
    builder.cylinder(side * (x + width * .34), y, z, rim * .96, rim * .96, .025, dark, [0, 0, Math.PI / 2], 40);
    builder.cylinder(side * (x + width * .38), y, z, rim * .75, rim * .75, .012, dark, [0, 0, Math.PI / 2], 32);
    const face = x + width * .40;
    builder.geometry(new THREE.TorusGeometry(rim, .010, 6, 40), metal, [side * face, y, z], [0, Math.PI / 2, 0]);
    for (let i = 0; i < spokes; i++) {
      const angle = i * Math.PI * 2 / spokes;
      coachPanel(builder, (u, v) => {
        const r = coachMix(.045, rim - .007, v), a = angle + .20 * v + (u - .5) * coachMix(.62, .23, v);
        return [side * (face + .006), y + Math.cos(a) * r, z + Math.sin(a) * r];
      }, accent, [side, 0, 0], [-side * .014, 0, 0], 1, 3);
    }
    builder.cylinder(side * (face + .009), y, z, .048, .048, .016, metal, [0, 0, Math.PI / 2], 20);
    for (let bolt = 0; bolt < 5; bolt++) {
      const angle = bolt * Math.PI * 2 / 5;
      builder.cylinder(side * (face + .020), y + Math.cos(angle) * .033, z + Math.sin(angle) * .033, .005, .005, .005, dark, [0, 0, Math.PI / 2], 6);
    }
    // Circumferential sidewall moulding gives the tyre a readable shoulder.
    builder.geometry(new THREE.TorusGeometry(radius * .87, .0035, 5, 48), dark, [side * (x + width * .41), y, z], [0, Math.PI / 2, 0]);
  }
}

/** Lofted upholstered cushions: shoulders taper above the lumbar region, with
 * rounded bolster edges instead of intersecting rectangular seat blocks. */
export function coachSeat(builder: VillaModelBuilder, x: number, cushionY: number, z: number, width: number, fabric: THREE.Material, insert: THREE.Material, dark: THREE.Material, stitch: THREE.Material, backHeight = .53) {
  builder.box(x, cushionY - .115, z, width * .79, .08, .48, dark, .022);
  builder.ellipsoid(x, cushionY, z, width / 2, .105, .30, fabric);
  builder.box(x, cushionY + .05, z + .02, width * .59, .085, .42, insert, .035);
  for (const sign of [-1, 1]) builder.ellipsoid(x + sign * width * .405, cushionY + .065, z, width * .10, .105, .26, fabric);
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
  builder.box(x, top + .10, z - .35, width * .51, .17, .125, fabric, .037);
  for (let row = 0; row < 5; row++) builder.beam([x - width * .23, cushionY + .094, z - .13 + row * .062], [x + width * .23, cushionY + .094, z - .13 + row * .062], .0015, stitch, 5);
}
