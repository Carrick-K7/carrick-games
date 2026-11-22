import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { VILLA_ESTATE_FIELDS, VILLA_ESTATE_VIEWPOINT, VILLA_GARAGE_EXTENT, VILLA_POND, villaTerrainHeight } from './villaEstateLayout.js';
import { NatureMesh, fieldStone, polar, type P3 } from './villaNatureGeometry.js';
import { addRiparianPond, addRiparianLilies } from './villaRiparianPond.js';
import { addPondHabitat } from './villaRiparianBanks.js';
import { cultivatedSoil, FieldModelBuilder, plantRiparianField } from './villaRiparianFields.js';
import { RiparianTrail } from './villaRiparianTrail.js';
import { timberMember } from './villaOutdoorJoinery.js';
import { VILLA_SOUTH_ROAD_SAMPLES } from './villaDrivingCourse.js';
import { VILLA_SCENIC_ROAD } from './villaDriving.js';
import type { VillaCollider } from './villaWorld.js';

/** Fixed geometry; only the pond's surface normal field advances. No base lawn,
 * old garden, garage shell or fence. Scene traversal owns every resource. */
export function createVillaEstateModel(parent: THREE.Object3D): { colliders: VillaCollider[]; updatePond: (elapsedSeconds: number, rain?: number) => void } {
  const root = new THREE.Group(); root.name = 'villa-estate-additions'; root.userData = { static: true, terrainSampled: true }; parent.add(root);
  const model = new FieldModelBuilder(root, 'estate-landscape'), soil = cultivatedSoil();
  const timber = villaMaterial(0x907451, .87), leaf = villaMaterial(0x637c46, .97), cabbage = villaMaterial(0x87a16e, .96);
  const lavender = villaMaterial(0x87748f, .98), corn = villaMaterial(0xc0b36a, .98), stone = villaMaterial(0x9d9b8c, .93);
  for (const plant of [leaf, cabbage, lavender, corn]) { plant.side = THREE.DoubleSide; plant.vertexColors = true; }
  const castIron = villaMaterial(0x555950, .78, .32);
  // A few flush roadside catch basins: actual slats span the recessed sill, not
  // markings on the road or raised obstacles. Follow the real southern ribbon
  // frame and sample ground under both sides of every small grate on the hills.
  for (const [i, side] of [[77, 1], [185, -1], [298, 1]]) {
    const p = VILLA_SOUTH_ROAD_SAMPLES[i], q = VILLA_SOUTH_ROAD_SAMPLES[i + 1];
    const run = Math.hypot(q.x - p.x, q.z - p.z), fx = (q.x - p.x) / run, fz = (q.z - p.z) / run, offset = side * (VILLA_SCENIC_ROAD.width / 2 + .76);
    const at = (u: number, v: number, h: number): P3 => {
      const x = p.x + fz * (offset + u) + fx * v, z = p.z - fx * (offset + u) + fz * v;
      return [x, villaTerrainHeight(x, z) + h, z];
    };
    const bed = new NatureMesh(), a = bed.point(at(-.19,-.47,.008)), d = bed.point(at(.19,.47,.008));
    const b = bed.point(at(.19,-.47,.008)), c = bed.point(at(-.19,.47,.008)); bed.tri(a,c,b); bed.tri(b,c,d); model.geometry(bed.geometry(), castIron);
    for (const u of [-.212, .212]) timberMember(model, at(u,-.54,.030), at(u,.54,.030), .074,.058,stone,.009);
    for (const v of [-.50,.50]) timberMember(model, at(-.175,v,.030), at(.175,v,.030), .078,.058,stone,.009);
    for (let j = 0; j < 10; j++) {
      const v = -.425 + j * .094; timberMember(model, at(-.194,v,.048), at(.194,v,.048), .041,.016,castIron,.003);
    }
  }
  // Walkable low beds, distinct crop morphology and neat but imperfect rows.
  // Foliage is soft scenery, not invisible solid blocks spanning the farmland.
  for (const field of VILLA_ESTATE_FIELDS) {
    const marker = new THREE.Object3D(); marker.name = `estate-field-${field.crop}`; marker.userData = { ...field, cultivated: true }; root.add(marker);
    plantRiparianField(model, field, soil, timber, leaf, cabbage, lavender, corn);
    // Low cast-iron standpipe at the head of each irrigation line. The three
    // spokes span a genuinely open handwheel; its axle enters the riser.
    const ix = field.minX + .22, iz = field.minZ + .32, iy = villaTerrainHeight(ix, iz);
    model.at(ix, iy, iz, 0, () => {
      model.cylinder(0,.072,0,.026,.033,.105,castIron,[0,0,0],8);
      model.beam([0,.104,0],[.076,.104,0],.020,castIron,7);
      model.beam([.071,.109,0],[.083,.059,.008],.015,castIron,7);
      model.cylinder(0,.134,0,.010,.011,.048,castIron,[0,0,0],7);
      model.geometry(new THREE.TorusGeometry(.048,.007,5,13),castIron,[0,.158,0],[Math.PI/2,0,0]);
      for (let spoke=0;spoke<3;spoke++) model.beam([0,.158,0],polar(spoke*Math.PI*2/3,.048,.158),.004,castIron,5);
    });
    // Timber edges are ankle-low finishes, not full-field support colliders.
    for (const x of [field.minX, field.maxX]) for (let z = field.minZ; z < field.maxZ; z += 1) {
      const next = Math.min(field.maxZ, z + 1);
      timberMember(model, [x, villaTerrainHeight(x, z) + .049, z], [x, villaTerrainHeight(x, next) + .049, next], .079, .089, timber, .008);
      if (Math.round(z - field.minZ) % 3 === 0) model.cylinder(x, villaTerrainHeight(x, z) + .056, z, .054, .052, .113, timber, [0, 0, 0], 7);
    }
  }
  const trail = new RiparianTrail('estate-walking-gravel', 45671, 5.5);
  trail.path([{ x: -13.5, z: 24 }, { x: -13.6, z: 31 }, { x: -13.7, z: 50 }, { x: -12, z: 63 }], 1.6);
  const pondWalk = Array.from({ length: 97 }, (_, i) => { const a = i / 96 * Math.PI * 2; return { x: VILLA_POND.x + Math.cos(a) * 9.3, z: VILLA_POND.z + Math.sin(a) * 13 }; });
  trail.path(pondWalk, p => 1.34 + .18 * Math.sin(p.x * .52 + p.z * .34) + .09 * Math.cos(p.z * 1.01));
  trail.path([{ x: -5, z: 88 }, { x: 7, z: 100 }, { x: 13, z: 114 }, { x: 14, z: 127 }], 1.7, false, VILLA_ESTATE_VIEWPOINT);
  // Level natural pond: shape follows an irregular shoreline inside the exact
  // unsafe ellipse. A sloping bank fills the ground cutout without covering water.
  const pondRoot = new THREE.Group(); pondRoot.name = 'estate-natural-pond'; root.add(pondRoot);
  pondRoot.userData = { waterY: VILLA_POND.waterY, unsupported: true };
  const pond = addRiparianPond(pondRoot);
  addPondHabitat(model, pond.height); addRiparianLilies(model, pond.height, leaf, cabbage);
  const v = VILLA_ESTATE_VIEWPOINT; trail.landing(v, v.radius); trail.finish(model);
  const view = new THREE.Object3D(); view.name = 'estate-hill-viewpoint'; view.position.set(v.x, villaTerrainHeight(v.x, v.z), v.z); view.userData = { northViewToHouse: true }; root.add(view);
  for (const [x, z, scale] of [[18, 130, .8], [16.8, 131, .6], [17.7, 131.6, .5]]) {
    const y = villaTerrainHeight(x, z); model.geometry(fieldStone(x + z, scale, scale * .56, scale * .68), stone, [x, y + scale * .25, z], [0, x * .41, 0]); model.collide(x, y, z, scale * 1.5, scale * .8, scale);
  }
  model.finish();

  const workshop = new VillaModelBuilder(root, 'garage-maintenance-equipment');
  const metal = villaMaterial(0x88928e, .35, .7), charcoal = villaMaterial(0x28312f, .7), red = villaMaterial(0x97594a, .54, .15);
  // Authored as offsets from the garage's west wall, so moving the garage east
  // carries its equipment instead of leaving it standing inside the house.
  const g = VILLA_GARAGE_EXTENT;
  const gx = (x: number) => x - 12 + g.minX;
  // The north-wall props also track the wall: authored at minZ=-8 originally.
  const gz = (z: number) => z + (g.minZ + 8);
  // Rear workbench; the two reserved bay centres stay drive-through corridors.
  workshop.box(gx(28.8), .89, gz(-7.24), 3.6, .10, .72, timber, .025);
  for (const x of [27.25, 30.35]) for (const z of [gz(-7.48), gz(-7)]) workshop.box(gx(x), .43, z, .075, .86, .075, metal, .006);
  workshop.box(gx(28.8), 1.57, gz(-7.64), 3.55, 1.08, .045, charcoal, .006);
  for (let i = 0; i < 9; i++) {
    const x = gx(27.4 + i * .35);
    const hi = 1.76 + i % 3 * .075, face = gz(-7.58);
    // Each hung tool rests on a bent peg that returns into the slatboard.
    workshop.beam([x, hi - .07, gz(-7.64)], [x, hi - .07, face + .015], .009, metal, 6);
    if (i % 3 === 0) {
      const outline = new THREE.Shape(), contour = [[-.019,-.355], [.018,-.355], [.018,-.062], [.044,-.048], [.065,-.015], [.062,.035], [.041,.062], [.031,.015], [0,.003], [-.021,.022], [-.025,.064], [-.052,.039], [-.061,-.015], [-.039,-.048], [-.018,-.063]];
      contour.forEach(([u, v], k) => k ? outline.lineTo(u, v) : outline.moveTo(u, v)); outline.closePath();
      workshop.geometry(new THREE.ExtrudeGeometry(outline, { depth: .014, bevelEnabled: true, bevelSize: .002, bevelThickness: .002, bevelSegments: 1, steps: 1 }), metal, [x, hi, face - .007]);
      workshop.geometry(new THREE.TorusGeometry(.029, .009, 5, 12), metal, [x, hi - .372, face]);
    } else if (i % 3 === 1) {
      for (const hand of [-1, 1]) {
        workshop.beam([x + hand * .046, hi - .365, face], [x + hand * .009, hi - .16, face], .018, red, 7);
        workshop.beam([x + hand * .009, hi - .17, face], [x - hand * .024, hi - .067, face], .013, metal, 7);
        workshop.beam([x - hand * .024, hi - .067, face], [x - hand * .009, hi - .019, face], .010, metal, 6);
      }
      workshop.cylinder(x, hi - .136, face, .019, .019, .034, charcoal, [Math.PI / 2, 0, 0], 8);
    } else {
      workshop.cylinder(x, hi - .24, face, .024, .033, .168, timber, [0, 0, 0], 8);
      workshop.cylinder(x, hi - .149, face, .017, .026, .028, metal, [0, 0, 0], 9);
      workshop.beam([x, hi - .15, face], [x, hi + .057, face], .009, metal, 6);
      workshop.box(x, hi + .062, face, .021, .027, .007, metal, .002);
    }
  }
  workshop.collide(gx(28.8), 0, gz(-7.28), 3.7, 2.14, .85);
  // Tool trolley along east wall, real drawers, casters and push handle. It
  // parks north of the east window, clear of the SUV's door/exit corridor: at
  // the old z=-3.8 spot it clipped the reserved-2 exit anchor and blocked boarding.
  workshop.box(gx(33.8), .55, -8.0, .62, .72, 1.03, red, .026);
  workshop.box(gx(33.8), .93, -8.0, .68, .055, 1.09, charcoal, .014);
  for (let i = 0; i < 5; i++) {
    workshop.box(gx(33.479), .318 + i * .12, -8, .022, .113, .935, red, .006);
    workshop.box(gx(33.458), .348 + i * .12, -8, .034, .025, .69, metal, .006);
  }
  // Casters touch the slab: a wheel floating 5 cm read as clipping, not height.
  for (const x of [33.6, 34]) for (const z of [-8.4, -7.6]) {
    workshop.cylinder(gx(x), .075, z, .075, .075, .06, charcoal, [0, 0, Math.PI / 2], 12);
    for (const side of [-1, 1]) workshop.box(gx(x) + side * .041, .136, z, .015, .133, .045, metal, .006);
    workshop.cylinder(gx(x), .075, z, .021, .021, .102, metal, [0, 0, Math.PI / 2], 8);
  }
  workshop.beam([gx(33.52), .83, -8.5], [gx(33.52), .83, -8.75], .019, metal); workshop.beam([gx(33.52), .83, -8.75], [gx(34.05), .83, -8.75], .019, metal);
  workshop.collide(gx(33.8), 0, -8.1, .75, .98, 1.4);
  // Floor jack stays parked against the northern wall, not under a spawn vehicle.
  for (const side of [-1, 1]) {
    const x = gx(32.6) + side * .167;
    timberMember(workshop, [x, .11, gz(-7.31)], [x, .11, gz(-6.49)], .057, .115, red, .012);
    for (const z of [-7.25, -6.54]) {
      workshop.cylinder(x, .065, gz(z), .065, .065, .067, charcoal, [0, 0, Math.PI / 2], 12);
      workshop.cylinder(x, .065, gz(z), .022, .022, .080, metal, [0, 0, Math.PI / 2], 8);
    }
    timberMember(workshop, [x, .13, gz(-6.78)], [gx(32.6) + side * .064, .267, gz(-7.12)], .049, .064, metal, .008);
  }
  workshop.beam([gx(32.42), .12, gz(-6.68)], [gx(32.78), .12, gz(-6.68)], .026, metal);
  workshop.cylinder(gx(32.6), .275, gz(-7.12), .104, .081, .030, charcoal);
  workshop.geometry(new THREE.TorusGeometry(.089, .012, 6, 20), charcoal, [gx(32.6), .294, gz(-7.12)], [Math.PI/2, 0, 0]);
  workshop.beam([gx(32.6), .102, gz(-6.7)], [gx(32.6), .97, gz(-6.28)], .018, metal);
  workshop.beam([gx(32.6), .83, gz(-6.348)], [gx(32.6), .97, gz(-6.28)], .024, charcoal, 8);
  workshop.collide(gx(32.6), 0, gz(-6.85), .58, 1.06, 1.28);
  for (let i = 0; i < 3; i++) {
    // Section of a tyre: open bead and stamped sidewall rising to a broad
    // tread with moulded grooves. Unlike a doughnut these stack on flat lips.
    const rubber = new NatureMesh();
    rubber.round([[.004,.208],[.002,.258],[.009,.326],[.022,.359],[.037,.379],[.053,.385],[.060,.377],[.068,.385],
      [.095,.386],[.102,.378],[.110,.386],[.145,.385],[.152,.377],[.160,.384],[.178,.371],[.193,.347],[.202,.305],
      [.210,.25],[.206,.208],[.186,.201],[.026,.201],[.004,.208]], 28);
    workshop.geometry(rubber.geometry(), charcoal, [gx(33.76), i * .208, gz(-5.75)]);
  }
  workshop.collide(gx(33.76), 0, gz(-5.75), .82, .68, .82);
  const charger = new THREE.Group(); charger.name = 'garage-charging-pedestal'; charger.userData = { kind: 'charging-pedestal', count: 1 }; root.add(charger);
  const charge = new VillaModelBuilder(charger, 'charging-pedestal-details');
  const cx = gx(13.05);
  charge.box(cx, .60, -6.3, .24, 1.2, .22, metal, .025); charge.box(cx, 1.25, -6.3, .37, .43, .25, charcoal, .045);
  charge.box(cx, 1.30, -6.164, .24, .11, .012, villaMaterial(0x8caea2, .3), .009);
  const cable = new NatureMesh();
  cable.stem([[cx - .082,1.055,-6.19,.016],[cx - .120,.994,-6.142,.015],[cx - .157,.817,-6.127,.015],
    [cx - .145,.669,-6.12,.015],[cx - .092,.613,-6.114,.015],[cx + .016,.605,-6.111,.015],
    [cx + .102,.665,-6.114,.015],[cx + .145,.81,-6.118,.015],[cx + .146,.997,-6.123,.015]], 7);
  charge.geometry(cable.geometry(), charcoal);
  charge.beam([cx + .144,.956,-6.124], [cx + .146,1.059,-6.135], .024, metal, 8);
  charge.box(cx + .146, 1.068, -6.145, .052, .112, .076, charcoal, .015);
  charge.cylinder(cx + .146, 1.101, -6.166, .029, .029, .079, metal, [Math.PI / 2, 0, 0], 10);
  charge.box(cx, .032, -6.30, .345, .064, .310, charcoal, .009);
  for (const dx of [-.13,.13]) for (const dz of [-.115,.115]) charge.cylinder(cx + dx, .068, -6.30 + dz, .016, .016, .01, metal, [0, 0, 0], 6);
  charge.collide(cx, 0, -6.27, .47, 1.5, .47); charge.finish(); workshop.finish();
  return { colliders: [...model.colliders, ...workshop.colliders, ...charge.colliders], updatePond: pond.update };
}
