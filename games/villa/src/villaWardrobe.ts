import * as THREE from 'three';
import { PantryBuilder, coldLiner, doorProvisions, glassLedge, stockColdShelves, wrappedParcel } from './villaPantryCold.js';
import { villaMaterial } from './villaModel.js';
import { IndexedFittingBuilder, foldedLinen, formedTube, surround, vessel, panel } from './villaFittingGeometry.js';
import { FittedCaseBuilder, fittedVeneer, hanger, hangingGarment, shoe, wovenCloth } from './villaCabinetDressings.js';
import { PLAYER_RADIUS, setVillaColliderNarrowPhase, type VillaCollider, type VillaPosition } from './villaWorld.js';

export const VILLA_MASTER_WARDROBE = {
  id: 'wardrobe-master', x: -8.6, y: 3.6, z: 0.54, width: 5.2, depth: 0.78, height: 2.68,
  bays: 5, doorsPerBay: 2, handleFrontZ: 1.084,
  approach: { x: -8.6, y: 3.6, z: 2.05 }, anchor: { x: -8.6, y: 5, z: 1.1 },
  name: 'Wardrobe', zh: '衣柜',
} as const;
/** A tall fridge-freezer: same openable-door contract as the wardrobe, so the
 *  hotspot, toggle and animation plumbing is shared rather than duplicated. */
export const VILLA_FRIDGE_FREEZER = {
  id: 'fridge-freezer', x: -3.15, y: 0, z: -8.58, width: 0.78, depth: 0.74, height: 1.92,
  bays: 1, doorsPerBay: 2, handleFrontZ: 0,
  approach: { x: -3.15, y: 0, z: -7.35 }, anchor: { x: -3.15, y: 1.1, z: -7.9 },
  name: 'Fridge', zh: '冰箱', openName: 'Open the fridge', openNameZh: '打开冰箱',
  closeName: 'Close the fridge', closeNameZh: '关闭冰箱',
} as const;
/** Entries whose approach point opens a hinged front and exposes lit contents. */
export const VILLA_WARDROBES = [VILLA_MASTER_WARDROBE, VILLA_FRIDGE_FREEZER] as const;
type VillaOpenable = (typeof VILLA_WARDROBES)[number] & { openName?: string; openNameZh?: string; closeName?: string; closeNameZh?: string };
export function villaOpenableLabel(id: string, open: boolean, zh: boolean): string | null {
  const entry = (VILLA_WARDROBES as readonly VillaOpenable[]).find(w => w.id === id);
  if (!entry) return null;
  const fallback = zh ? (open ? '关闭衣柜' : '打开衣柜') : (open ? 'Close the wardrobe' : 'Open the wardrobe');
  const key = open ? (zh ? entry.closeNameZh : entry.closeName) : (zh ? entry.openNameZh : entry.openName);
  return key ?? fallback;
}
export interface VillaWardrobeState { wardrobes: Record<string, { open: boolean; progress: number }> }
export function createVillaWardrobes(): VillaWardrobeState {
  return { wardrobes: Object.fromEntries(VILLA_WARDROBES.map(w => [w.id, { open: false, progress: 0 }])) };
}
/** Pure, reversible target toggle. Unknown IDs cannot create invisible wardrobes. */
export function toggleVillaWardrobe(state: VillaWardrobeState, id: string): boolean {
  const wardrobe = state.wardrobes[id];
  if (!wardrobe || !VILLA_WARDROBES.some(w => w.id === id)) return false;
  wardrobe.open = !wardrobe.open; return true;
}
export function advanceVillaWardrobes(state: VillaWardrobeState, dt: number): boolean {
  if (!Number.isFinite(dt) || dt <= 0) return false;
  let changed = false;
  for (const { id } of VILLA_WARDROBES) {
    const w = state.wardrobes[id]; if (!w) continue;
    const next = Math.max(0, Math.min(1, w.progress + (w.open ? 1 : -1) * dt / 0.95));
    changed ||= next !== w.progress; w.progress = next;
  }
  return changed;
}
export const VILLA_WARDROBE_CONTENTS = Array.from({ length: 10 }, (_, i) => ({
  compartment: i + 1, styling: i === 9 ? 'men' : 'women',
  garments: i === 9 ? ['shirt', 'trousers'] : [i % 3 === 0 ? 'long dress' : i % 3 === 1 ? 'blouse and skirt' : 'cardigan and trousers', 'coat'],
  accessories: i === 9 ? ['cap', 'shoes'] : ['hat', i % 2 ? 'handbag' : 'folded scarf', 'shoes'],
}));

/** Hollow fitted joinery plus three instance batches for ten physically separate hinged doors. */
export function createVillaWardrobe(parent: THREE.Object3D) {
  const b = new FittedCaseBuilder(parent, 'Bedroom/openable-wardrobe'), w = VILLA_MASTER_WARDROBE;
  const oak = fittedVeneer('#b69771', 0xfff2db), back = fittedVeneer('#8c7156', 0xa79079);
  const brass = villaMaterial('#b99b65', .35, .68);
  const fabrics = [wovenCloth('#e4ddca', 'oxford'), wovenCloth('#98a18a', 'herringbone'),
    wovenCloth('#b99184', 'houndstooth'), wovenCloth('#8498a2', 'pinstripe')];
  const leather = villaMaterial('#554b3f', 0.71);
  const glow = villaMaterial('#eedec0', 0.8); glow.emissive.set('#eac789'); glow.emissiveIntensity = 0.22;
  const bayWidth = w.width / w.bays, compartmentWidth = bayWidth / 2;
  const marker = new THREE.Object3D(); marker.name = 'Bedroom/wardrobe-row'; marker.position.set(w.x, w.y, w.z);
  marker.userData = { id: w.id, bays: 5, doors: 10, wall: 'north', womenCompartments: 9, menCompartments: 1, approach: w.approach }; b.root.add(marker);
  b.at(w.x, w.y, w.z, 0, () => {
    const solid = (x: number, y: number, z: number, width: number, height: number, depth: number, material: THREE.Material) => {
      b.box(x, y, z, width, height, depth, material, 0); b.collide(x, y - height / 2, z, width, height, depth);
    };
    solid(0, 0.07, -0.035, w.width - 0.12, 0.14, w.depth - 0.1, back);
    solid(0, 1.36, -0.355, w.width, 2.56, 0.07, back);
    for (const x of [-w.width / 2 + 0.035, w.width / 2 - 0.035]) solid(x, 1.37, 0, 0.07, 2.56, w.depth, oak);
    solid(0, 0.165, 0, w.width, 0.07, w.depth, oak);
    solid(0, 2.635, 0, w.width, 0.09, w.depth, oak);
    for (let bay = 0; bay < w.bays; bay++) {
      const center = -w.width / 2 + (bay + 0.5) * bayWidth;
      const node = new THREE.Object3D(); node.name = `Bedroom/wardrobe-bay-${bay + 1}`; node.position.set(w.x + center, w.y, w.z); node.userData = { doors: 2, handles: 2 }; b.root.add(node);
      if (bay) solid(center - bayWidth / 2, 1.37, 0.02, 0.035, 2.4, 0.69, oak);
      solid(center, 1.37, 0.01, 0.026, 2.4, 0.68, oak);
    }
    for (let i = 0; i < 10; i++) {
      const x = -w.width / 2 + (i + 0.5) * compartmentWidth;
      const data = VILLA_WARDROBE_CONTENTS[i], fabric = fabrics[i % fabrics.length];
      const hinge = x - (i % 2 ? -1 : 1) * (compartmentWidth - .024) / 2;
      for (const y of [.41, 1.37, 2.34]) {
        b.geometry(vessel([[0, 0], [.007, 0], [.009, .005], [.009, .023], [.006, .024], [.006, .028],
          [.009, .029], [.009, .050], [.007, .053], [0, .053]], 6), brass, [hinge, y, .425]);
        b.box(hinge, y + .012, .394, .014, .021, .061, brass, 0);
      }
      const node = new THREE.Object3D(); node.name = `wardrobe/compartment-${i + 1}`; node.position.set(w.x + x, w.y + 1.3, w.z + 0.2); node.userData = data; b.root.add(node);
      solid(x, 2.12, 0, compartmentWidth - 0.04, 0.035, 0.68, oak);
      solid(x, 0.43, 0, compartmentWidth - 0.04, 0.035, 0.68, oak);
      // The shallow accessory tray bears on side runners, not a floating lip.
      for (const side of [-1,1]) {
        b.box(x + side*(compartmentWidth/2-.027), .416, 0, .014, .027, .64, brass, 0);
        b.box(x + side*(compartmentWidth/2-.041), .469, .005, .018, .047, .64, oak, 0);
      }
      b.box(x,.458,.323,compartmentWidth-.080,.024,.014,oak,0);
      b.box(x, 2.075, -0.24, compartmentWidth - 0.1, 0.013, 0.027, glow, 0.002);
      // Two staggered rods sit in real sockets. Each hanger hooks over its rod,
      // rather than floating ahead of or behind a single decorative crossbar.
      for (const side of [-1, 1]) {
        const gx = x + side * .043, z = side < 0 ? .157 : -.136, yaw = side * (.54 + (i % 3) * .075);
        b.beam([x - .244, 1.98, z], [x + .244, 1.98, z], .012, brass, 10);
        for(const end of [-1,1]) b.cylinder(x+end*.2415,1.98,z,.021,.021,.024,brass,[0,0,Math.PI/2],9);
        const style = side === 1 && i !== 9 ? 'coat' : i === 9 ? (side < 0 ? 'shirt' : 'trousers') : i % 3 === 0 ? 'dress' : i % 3 === 1 ? 'blouse' : 'cardigan';
        // Adult shoulders are 32–39cm wide. Hang front-to-back and turn the hangers
        // slightly, instead of squeezing two front-facing outfits into 52cm.
        b.at(gx, 0, z, yaw, () => {
          hanger(b, 0, 1.98, 0, .151, oak, brass, yaw);
          hangingGarment(b, 0, 1.905, 0, style, side < 0 ? fabric : fabrics[(i + 1) % 4], fabrics[(i + 2) % 4], brass, .32 + i * .61);
        });
      }
      // Hat on top shelf; bag/scarf and closed shoes below the hanging rail.
      // Folded heavier knitwear, interspersed with hat forms; not a row of ten identical cloches.
      const stacked = i % 3 === 1;
      if (stacked) {
        for(let fold=0;fold<2;fold++) b.geometry(foldedLinen(.36-fold*.018,.31,.082),fabrics[(i+fold)%4],
          [x-.009*fold,2.1375+.073*fold,.01+.012*fold],[0,.065*fold,0]);
      }
      const hat = i === 9 ? leather : fabric, hatY = stacked ? 2.288 : 2.138;
      if (i===9) {
        // Peaked cap: the stitched visor projects only in front of the crown.
        b.geometry(vessel([[.086,.014,.076],[.091,.025,.079],[.085,.067,.069],[.061,.095,.052],
          [.030,.105,.030],[0,.108]],14),fabric,[x,hatY,.068]);
        b.geometry(vessel([[0,.006],[.085,.004,.063,0,.038],[.090,.012,.067,0,.039],
          [.085,.017,.064,0,.038],[0,.019]],14),leather,[x,hatY,.089]);
      } else {
      b.geometry(vessel([[0, .001], [.083, 0, .074], [.125, .003, .111], [.130, .008, .116], [.127, .012, .113],
        [.084, .017, .076], [.082, .024, .074], [.073, .082, .068], [.067, .091, .062], [.039, .087, .053], [0, .082]], 12), hat, [x, hatY, .08]);
      b.geometry(vessel([[.082, 0, .074], [.083, .002, .075], [.080, .012, .072], [.078, .013, .070]], 12), leather, [x, hatY + .024, .08]);
      }
      if (i % 2 && i !== 9) {
        b.geometry(vessel([[0, 0], [.091, .002, .049], [.104, .018, .055], [.106, .096, .051], [.089, .177, .041],
          [.083, .192, .028], [.078, .193, .023], [.079, .170, .023]], 16, .57), leather, [x, .449, .1]);
        for (const z of [.077, .123]) b.geometry(formedTube([[-.054, 0, 0, .005], [-.054, .039, 0, .005],
          [-.042, .073, 0, .006], [-.022, .087, 0, .006], [.022, .087, 0, .006], [.042, .073, 0, .006],
          [.054, .039, 0, .005], [.054, 0, 0, .005]], 7), leather, [x, .627, z]);
        b.box(x, .607, .145, .03, .016, .007, brass, 0);
      } else for (let fold = 0; fold < 3; fold++) {
        b.geometry(foldedLinen(.235 - fold * .010, .184 - fold * .006, .026), fold === 1 ? fabrics[(i + 1) % 4] : fabric,
          [x + .004 * fold, .4475 + fold * .0225, .10], [0, fold * .037, 0]);
      }
      for (const side of [-1, 1]) shoe(b, x + side * .064, .20, .12, leather, back);

    }
  });
  b.finish(); b.root.userData = { id: w.id, hollow: true, compartments: VILLA_WARDROBE_CONTENTS, womenFraction: 0.9, movingDoors: 10 };

  // One door template; all frame/panel/handle surfaces have positive separation.
  const templateParent = new THREE.Group(), door = new FittedCaseBuilder(templateParent, 'wardrobe-door-template');
  const doorWidth = compartmentWidth - 0.024;
  // Real stiles, rails and a recessed floating panel. The reverse has a formed
  // retaining bead (not another solid oak slab), plus escutcheons behind the pull.
  const casing = surround(doorWidth, 2.34, .012, [[0, -.024], [0, .025], [.004, .029], [.034, .029],
    [.046, .018], [.049, .008], [.049, -.014], [.040, -.023], [.037, -.029], [.006, -.029], [0, -.024]], 3);
  casing.userData.railAndStile = true; door.geometry(casing, oak);
  const field = panel(doorWidth - .086, 2.254, .008, .026, .003);
  field.userData.veneerLayup = true; door.geometry(field, oak);
  // A narrow valet strap hangs over a flush keeper inside each door. The whole
  // assembly stays inside the retaining bead and follows the moving leaf.
  door.geometry(formedTube([[-.143,.255,-.013,.003],[-.143,.255,-.023,.003],[-.138,.255,-.024,.003],
    [-.063,.255,-.024,.003],[-.058,.255,-.023,.003],[-.058,.255,-.013,.003]],6,0,[0,1,0]),brass);
  door.geometry(formedTube([[.002,.129,-.019,.0008,.016],[.001,.246,-.020,.0008,.017],
    [0,.255,-.020,.0008,.017],[0,.259,-.023,.0008,.017],[0,.257,-.027,.0008,.017],
    [0,.250,-.0277,.0008,.017],[-.001,.211,-.026,.0008,.019],[-.006,-.084,-.019,.0009,.021],
    [-.007,-.115,-.019,.0009,.016],[-.004,-.145,-.020,.0008,.0018]],6,0,[1,0,0]),fabrics[0],[-.10,0,0]);
  for (const y of [-.32, .01]) {
    door.cylinder(0, y, .017, .023, .024, .010, brass, [Math.PI / 2, 0, 0], 12);
    door.cylinder(0, y, -.018, .012, .010, .010, brass, [Math.PI / 2, 0, 0], 8);
  }
  door.geometry(formedTube([[0, -.32, .020, .011], [0, -.32, .075, .011], [0, -.317, .091, .012],
    [0, -.308, .101, .013], [0, -.294, .105, .014], [0, -.015, .105, .014], [0, -.001, .101, .013],
    [0, .007, .091, .012], [0, .01, .075, .011], [0, .01, .020, .011]], 10, 0, [1, 0, 0]), brass);
  door.finish();
  const batches = door.root.children.filter((n): n is THREE.Mesh => n instanceof THREE.Mesh).map(part => {
    const batch = new THREE.InstancedMesh(part.geometry, part.material, 10); batch.name = 'wardrobe/hinged-doors';
    if(part.material===fabrics[0]) for(let i=0;i<10;i++) batch.setColorAt(i,new THREE.Color([0x768389,0xb28368,0x83896c,0xaca18b][i%4]));
    batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage); batch.frustumCulled = false; batch.castShadow = batch.receiveShadow = true; b.root.add(batch); return batch;
  });
  templateParent.clear();
  const transforms: { x: number; z: number; yaw: number }[] = [];
  const panels: VillaCollider[] = [], markers: THREE.Object3D[] = [];
  for (let i = 0; i < 10; i++) {
    const c = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, minY: w.y + 0.205, maxY: w.y + 2.545 };
    panels.push(c); b.colliders.push(c); transforms.push({ x: 0, z: 0, yaw: 0 });
    const marker = new THREE.Object3D(); marker.name = `wardrobe/door-${i + 1}`; marker.userData = { wardrobeId: w.id, compartment: i + 1, hinge: i % 2 ? 'right' : 'left', collider: c }; b.root.add(marker); markers.push(marker);
    setVillaColliderNarrowPhase(c, (p: VillaPosition) => {
      const t = transforms[i], dx = p.x - t.x, dz = p.z - t.z;
      const x = dx * Math.cos(t.yaw) - dz * Math.sin(t.yaw), z = dx * Math.sin(t.yaw) + dz * Math.cos(t.yaw);
      return Math.hypot(Math.max(0, Math.abs(x) - doorWidth / 2), Math.max(0, Math.abs(z - 0.044) - 0.073)) < PLAYER_RADIUS;
    });
  }
  const dummy = new THREE.Object3D(), bounds = new THREE.Box3(), matrix = new THREE.Matrix4();
  const localBounds = new THREE.Box3(new THREE.Vector3(-doorWidth / 2, -1.17, -0.029), new THREE.Vector3(doorWidth / 2, 1.17, 0.119));
  let lastProgress = -1;
  function update(state?: VillaWardrobeState, lightOn = true): boolean {
    glow.emissiveIntensity = lightOn ? 0.22 : 0;
    const progress = Math.max(0, Math.min(1, state?.wardrobes[w.id]?.progress ?? 0));
    if (progress === lastProgress) return false;
    const eased = progress * progress * (3 - 2 * progress), angle = eased * Math.PI * 0.49;
    for (let i = 0; i < 10; i++) {
      const sign = i % 2 ? -1 : 1, centerX = -w.width / 2 + (i + 0.5) * compartmentWidth;
      const pivotX = w.x + centerX - sign * doorWidth / 2, yaw = -sign * angle;
      // Closed door BACK is 6mm beyond the carcass front: no shared/z-fighting frame plane.
      const cx = pivotX + Math.cos(yaw) * sign * doorWidth / 2, cz = w.z + 0.425 - Math.sin(yaw) * sign * doorWidth / 2;
      dummy.position.set(cx, w.y + 1.375, cz); dummy.rotation.set(0, yaw, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      batches.forEach(batch => batch.setMatrixAt(i, dummy.matrix));
      markers[i].position.copy(dummy.position); markers[i].rotation.copy(dummy.rotation); markers[i].userData.openFraction = progress;
      transforms[i] = { x: cx, z: cz, yaw };
      // Collider uses the symmetric panel extents plus the handle protrusion, updated IN PLACE.
      matrix.compose(dummy.position, dummy.quaternion, new THREE.Vector3(1, 1, 1)); bounds.copy(localBounds).applyMatrix4(matrix);
      Object.assign(panels[i], { minX: bounds.min.x, maxX: bounds.max.x, minZ: bounds.min.z, maxZ: bounds.max.z, minY: bounds.min.y, maxY: bounds.max.y });
    }
    batches.forEach(batch => {
      batch.instanceMatrix.needsUpdate = true;
      // Raycaster uses the *batch* broad phase even with frustumCulled=false.
      // A closed-pose handle sphere would mask the outermost open leaf.
      batch.boundingSphere = null; batch.boundingBox = null;
    }); lastProgress = progress; return true;
  }
  update();
  return { root: b.root, colliders: b.colliders, doorColliders: panels, update };
}

/** Two-leaf fridge-freezer: a stainless carcass whose doors swing on their
 *  hinges, with lit shelves behind them once open. */
export function createVillaFridge(parent: THREE.Object3D) {
  const b = new PantryBuilder(parent, 'Kitchen/fridge-freezer'), f = VILLA_FRIDGE_FREEZER;
  const steel = villaMaterial('#bcbcb2', .43, .61), shell = villaMaterial('#a1a49b', .54, .32);
  const inner = villaMaterial('#ecebe0', .59), glassShelf = villaMaterial('#bcd2ca', .23, .06);
  glassShelf.transparent = true; glassShelf.opacity = .27; glassShelf.depthWrite = false;
  const food = villaMaterial('#ffffff', .66), seal = villaMaterial('#494b44', .82);
  food.vertexColors = inner.vertexColors = true; food.name = 'pantry/cold-provisions';
  const glow = villaMaterial('#eef4f6', 0.6); glow.emissive.set('#dff0f6'); glow.emissiveIntensity = 0;
  const doorWidth = f.width - 0.03, hingeX = f.width / 2 - 0.015;
  const leaves: THREE.Group[] = [];
  const panels: VillaCollider[] = [];
  b.at(f.x, f.y, f.z, 0, () => {
    // Carcass: back, two sides, top, bottom and the divider between the two zones.
    b.box(0, .96, -f.depth / 2 + .02, f.width, f.height, .04, shell, .004);
    for (const x of [-f.width / 2 + .015, f.width / 2 - .015]) b.box(x, .96, 0, .03, f.height, f.depth, shell, .004);
    b.box(0, f.height - .015, 0, f.width, .03, f.depth, shell, .004);
    b.box(0, .015, 0, f.width, .03, f.depth, shell, .004);
    b.box(0, 1.15, 0, f.width - .06, .025, f.depth - .06, inner, 0);
    b.collide(0, 0, 0, f.width, f.height, f.depth);
    // The kick and mullion fill the *stationary* space between doors. Shelves stop
    // short of closed dairy racks; no intersecting slabs are hidden by a door.
    b.box(0, .071, .336, doorWidth, .136, .043, seal, .004);
    for (let i = 0; i < 4; i++) b.box(0, .032 + i * .022, .362, doorWidth - .082, .008, .006, shell, 0);
    b.box(0, 1.045, .326, doorWidth, .089, .073, shell, .004);
    coldLiner(b, inner, seal);
    for (const y of [.32, .62, 1.38, 1.64]) glassLedge(b, y, glassShelf, inner);
    b.box(0, 1.846, -.262, .47, .023, .041, glow, .004);
    stockColdShelves(b, food);
    for (const [i, y] of [.066, .326, .626].entries()) {
      b.box(0, y + .008, -.07, .65, .014, .44, inner, 0);
      for (const x of [-.315, .315]) b.box(x, y + .094, -.07, .021, .174, .44, inner, 0);
      b.box(0, y + .090, -.283, .622, .17, .013, inner, 0);
      b.box(0, y + .075, .146, .64, .145, .014, glassShelf, .004);
      b.box(0, y + .150, .15, .63, .015, .019, steel, .003);
      for (const [j, x] of [-.158, .145].entries()) wrappedParcel(b, food, x, y + .015, -.088 + .021 * j, i * 2 + j);
    }
    // The liner, compression gasket and bottle retainer travel with each leaf.
    // All metal/liner/seal parts for a given moving door are only three draws.
    for (const zone of [{ cY: 1.5, height: .82 }, { cY: .57, height: .86 }]) {
      const door = new PantryBuilder(b.root, `Kitchen/fridge-door-${zone.cY > 1 ? 'chill' : 'freeze'}`), mid = -doorWidth / 2;
      const group = door.root; group.position.set(f.x + hingeX, f.y + zone.cY, f.z + f.depth / 2 + .012);
      door.geometry(panel(doorWidth, zone.height, .024, .049, .005), steel, [mid, 0, 0]);
      door.geometry(surround(doorWidth - .030, zone.height - .030, .028,
        [[.021, -.024], [.019, -.032], [.014, -.032], [.010, -.029], [.007, -.033], [.003, -.033], [0, -.028], [0, -.022]], 4), seal, [mid, 0, 0]);
      door.geometry(panel(doorWidth - .078, zone.height - .079, .033, .012, .003), inner, [mid, 0, -.029]);
      door.geometry(formedTube([[0, -.199, .024, .010], [0, -.198, .036, .012], [0, -.189, .047, .012],
        [0, -.173, .054, .013], [0, .171, .054, .013], [0, .187, .049, .012], [0, .197, .036, .011],
        [0, .198, .024, .010]], 12, 0, [1, 0, 0]), steel, [-doorWidth + .068, .023, 0]);
      const cy = zone.height * .27;
      door.box(mid + .15, cy, .025, .12, .031, .004, seal, .002);
      for (const y of [-.23, .10]) {
        door.box(mid, y, -.093, doorWidth - .16, .014, .137, inner, 0);
        for (const x of [mid - .282, mid + .282]) door.box(x, y + .042, -.096, .015, .089, .135, inner, 0);
        door.beam([mid - .28, y + .067, -.157], [mid + .28, y + .067, -.157], .0055, steel, 8);
        door.box(mid, y + .022, -.158, .568, .047, .01, inner, .002);
      }
      doorProvisions(door, inner, mid, zone.cY > 1);
      door.finish(); leaves.push(group);
      panels.push({ minX: f.x + hingeX - doorWidth, maxX: f.x + hingeX, minZ: f.z + f.depth / 2 - .01, maxZ: f.z + f.depth / 2 + .06,
        minY: f.y + zone.cY - zone.height / 2, maxY: f.y + zone.cY + zone.height / 2 });
    }
  });
  b.finish();
  let lastProgress = -1;
  function update(state?: VillaWardrobeState, lightOn = true): boolean {
    glow.emissiveIntensity = lightOn ? 0.55 : 0;
    const progress = Math.max(0, Math.min(1, state?.wardrobes[f.id]?.progress ?? 0));
    if (progress === lastProgress) return false;
    lastProgress = progress;
    const angle = progress * progress * (3 - 2 * progress) * Math.PI * 0.62;
    for (const leaf of leaves) {
      leaf.rotation.y = angle;
      // The open leaf sweeps into the room; close the collider gap it leaves behind.
      const reach = Math.cos(angle) * doorWidth, swing = Math.sin(angle) * doorWidth;
      const index = leaves.indexOf(leaf);
      Object.assign(panels[index], {
        minX: Math.min(f.x + hingeX - reach, f.x + hingeX - swing), maxX: f.x + hingeX,
        minZ: f.z + f.depth / 2 - .01, maxZ: f.z + f.depth / 2 + .06 + Math.abs(swing),
      });
    }
    return true;
  }
  update();
  return { root: b.root, colliders: b.colliders, doorColliders: panels, update };
}
