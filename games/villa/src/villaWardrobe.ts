import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
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
  const b = new VillaModelBuilder(parent, 'Bedroom/openable-wardrobe'), w = VILLA_MASTER_WARDROBE;
  const oak = villaMaterial('#b69771', 0.78), back = villaMaterial('#786047', 0.88);
  const linen = villaMaterial('#e4ddca', 0.93), brass = villaMaterial('#b99b65', 0.34, 0.72);
  const fabrics = [linen, villaMaterial('#98a18a', 0.9), villaMaterial('#ac7f85', 0.9), villaMaterial('#788b9c', 0.9)];
  const leather = villaMaterial('#554b3f', 0.71);
  const glow = villaMaterial('#eedec0', 0.8); glow.emissive.set('#eac789'); glow.emissiveIntensity = 0.22;
  const bayWidth = w.width / w.bays, compartmentWidth = bayWidth / 2;
  const marker = new THREE.Object3D(); marker.name = 'Bedroom/wardrobe-row'; marker.position.set(w.x, w.y, w.z);
  marker.userData = { id: w.id, bays: 5, doors: 10, wall: 'north', womenCompartments: 9, menCompartments: 1, approach: w.approach }; b.root.add(marker);
  b.at(w.x, w.y, w.z, 0, () => {
    const solid = (x: number, y: number, z: number, width: number, height: number, depth: number, material: THREE.Material) => {
      b.box(x, y, z, width, height, depth, material, 0.008); b.collide(x, y - height / 2, z, width, height, depth);
    };
    solid(0, 0.07, -0.035, w.width - 0.12, 0.14, w.depth - 0.1, back);
    solid(0, 1.36, -0.355, w.width, 2.56, 0.07, oak);
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
      const node = new THREE.Object3D(); node.name = `wardrobe/compartment-${i + 1}`; node.position.set(w.x + x, w.y + 1.3, w.z + 0.2); node.userData = data; b.root.add(node);
      solid(x, 2.12, 0, compartmentWidth - 0.04, 0.035, 0.68, oak);
      solid(x, 0.43, 0, compartmentWidth - 0.04, 0.035, 0.68, oak);
      b.box(x, 2.075, -0.24, compartmentWidth - 0.1, 0.013, 0.027, glow, 0.002);
      b.beam([x - 0.19, 1.98, 0], [x + 0.19, 1.98, 0], 0.012, brass, 8);
      // Side-by-side hangers visible head-on; full-coverage everyday outfits, never mannequins.
      for (const side of [-1, 1]) {
        const gx = x + side * 0.1, z = side < 0 ? 0.1 : -0.09;
        b.geometry(new THREE.TorusGeometry(0.018, 0.003, 4, 8, Math.PI * 1.4), brass, [gx, 1.985, z]);
        b.beam([gx, 1.96, z], [gx - 0.087, 1.89, z], 0.004, oak, 5);
        b.beam([gx - 0.087, 1.89, z], [gx + 0.087, 1.89, z], 0.004, oak, 5);
        b.beam([gx + 0.087, 1.89, z], [gx, 1.96, z], 0.004, oak, 5);
        const dress = i !== 9 && i % 3 === 0, shirt = i === 9 || i % 3 === 2;
        const shape = new THREE.Shape();
        const outline = [[-0.025, 0], [-0.087, -0.024], [-0.11, -0.2], [-0.077, -0.22], [-0.06, -0.14], [-0.056, -0.41],
          [dress ? -0.09 : -0.068, dress ? -1.1 : -0.56], [dress ? 0.09 : 0.068, dress ? -1.1 : -0.56], [0.056, -0.41], [0.06, -0.14], [0.077, -0.22], [0.11, -0.2], [0.087, -0.024], [0.025, 0]];
        outline.forEach(([px, py], j) => j ? shape.lineTo(px, py) : shape.moveTo(px, py)); shape.closePath();
        b.geometry(new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: false }), side < 0 ? fabric : fabrics[(i + 1) % 4], [gx, 1.89, z]);
        if (shirt) for (const leg of [-1, 1]) b.box(gx + leg * 0.035, 0.98, z + 0.015, 0.055, 0.59, 0.03, fabrics[(i + 2) % 4], 0.008);
        else if (!dress) b.cylinder(gx, 1.04, z + 0.018, 0.063, 0.09, 0.5, fabric, [0, 0, 0], 10);
        // A collar, seam and buttons make clothes readable, without translucent presentation.
        b.box(gx, 1.57, z + 0.031, 0.004, 0.49, 0.004, linen, 0);
        b.geometry(new THREE.TorusGeometry(0.024, 0.006, 4, 10, Math.PI), linen, [gx, 1.875, z + 0.032], [0, 0, Math.PI]);
      }
      // Hat on top shelf; bag/scarf and closed shoes below the hanging rail.
      b.cylinder(x, 2.168, 0.08, 0.13, 0.13, 0.018, i === 9 ? leather : fabric, [0, 0, 0], 12);
      b.cylinder(x, 2.213, 0.08, 0.074, 0.086, 0.085, i === 9 ? leather : fabric, [0, 0, 0], 12);
      b.cylinder(x, 2.18, 0.08, 0.087, 0.087, 0.015, brass, [0, 0, 0], 12);
      if (i % 2 && i !== 9) {
        b.box(x, 0.56, 0.1, 0.21, 0.21, 0.11, leather, 0.026);
        b.geometry(new THREE.TorusGeometry(0.062, 0.007, 5, 12, Math.PI), leather, [x, 0.674, 0.1]);
        b.box(x, 0.6, 0.16, 0.035, 0.016, 0.008, brass, 0.002);
      } else b.box(x, 0.481, 0.1, 0.25, 0.07, 0.19, fabric, 0.015);
      for (const side of [-1, 1]) b.ellipsoid(x + side * 0.064, 0.245, 0.12, 0.045, 0.038, 0.098, leather);
    }
  });
  b.finish(); b.root.userData = { id: w.id, hollow: true, compartments: VILLA_WARDROBE_CONTENTS, womenFraction: 0.9, movingDoors: 10 };

  // One door template; all frame/panel/handle surfaces have positive separation.
  const templateParent = new THREE.Group(), door = new VillaModelBuilder(templateParent, 'wardrobe-door-template');
  const doorWidth = compartmentWidth - 0.024;
  door.box(0, 0, 0, doorWidth, 2.34, 0.058, oak, 0.008);
  door.box(0, 0, 0.042, doorWidth - 0.09, 2.23, 0.018, linen, 0.005); // 4mm reveal from oak face
  for (const y of [-0.32, 0.01]) door.cylinder(0, y, 0.077, 0.014, 0.014, 0.045, brass, [Math.PI / 2, 0, 0], 8);
  door.cylinder(0, -0.155, 0.105, 0.014, 0.014, 0.36, brass, [0, 0, 0], 8);
  door.finish();
  const batches = door.root.children.filter((n): n is THREE.Mesh => n instanceof THREE.Mesh).map(part => {
    const batch = new THREE.InstancedMesh(part.geometry, part.material, 10); batch.name = 'wardrobe/hinged-doors';
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
    batches.forEach(batch => { batch.instanceMatrix.needsUpdate = true; }); lastProgress = progress; return true;
  }
  update();
  return { root: b.root, colliders: b.colliders, doorColliders: panels, update };
}

/** Two-leaf fridge-freezer: a stainless carcass whose doors swing on their
 *  hinges, with lit shelves behind them once open. */
export function createVillaFridge(parent: THREE.Object3D) {
  const b = new VillaModelBuilder(parent, 'Kitchen/fridge-freezer'), f = VILLA_FRIDGE_FREEZER;
  const steel = villaMaterial('#c3c7ca', 0.42, 0.62), shell = villaMaterial('#8f9599', 0.5, 0.35);
  const inner = villaMaterial('#e8ebee', 0.7), glassShelf = villaMaterial('#dbe6ea', 0.25, 0.1);
  const handle = villaMaterial('#6d7478', 0.34, 0.72), seal = villaMaterial('#3c4145', 0.85);
  const glow = villaMaterial('#eef4f6', 0.6); glow.emissive.set('#dff0f6'); glow.emissiveIntensity = 0;
  const doorWidth = f.width - 0.03, hingeX = f.width / 2 - 0.015;
  const leaves: Array<{ group: THREE.Group; panel: THREE.Mesh | null; height: number; cY: number }> = [];
  const panels: VillaCollider[] = [];
  b.at(f.x, f.y, f.z, 0, () => {
    // Carcass: back, two sides, top, bottom and the divider between the two zones.
    b.box(0, .96, -f.depth / 2 + .02, f.width, f.height, .04, shell, .004);
    for (const x of [-f.width / 2 + .015, f.width / 2 - .015]) b.box(x, .96, 0, .03, f.height, f.depth, shell, .004);
    b.box(0, f.height - .015, 0, f.width, .03, f.depth, shell, .004);
    b.box(0, .015, 0, f.width, .03, f.depth, shell, .004);
    b.box(0, 1.15, 0, f.width - .06, .025, f.depth - .06, inner, 0);
    b.collide(0, 0, 0, f.width, f.height, f.depth);
    // Lit interior: shelves, a crisper, bottles and a freezer basket.
    for (const y of [0.42, 0.72, 1.42, 1.66]) b.box(0, y, 0, f.width - .09, .014, f.depth - .12, glassShelf, 0);
    b.box(0, 1.52, .02, f.width - .09, .014, f.depth - .12, glow, 0);
    for (const [x, y, z, r] of [[-.2, .49, .06, .04], [-.1, .49, -.06, .035], [-.02, .5, .09, .038], [.16, .5, 0, .042]] as const) {
      b.cylinder(x, y + r, z, r, r, .12 + r, glassShelf, undefined, 10);
    }
    b.box(-.12, .98, .04, .3, .14, .3, seal, .006);
    b.box(.19, .28, 0, .3, .16, .34, steel, .008);
    for (let i = 0; i < 5; i++) b.beam([.06 + i * .06, .2, -.15], [.06 + i * .06, .36, -.15], .006, steel, 5);
    // Two hinged leaves, built as groups so the swing is a pure rotation.
    for (const zone of [{ cY: 1.5, height: 0.82 }, { cY: 0.57, height: 0.86 }] as const) {
      const group = new THREE.Group(); group.name = `Kitchen/fridge-door-${zone.cY > 1 ? 'chill' : 'freeze'}`;
      group.position.set(f.x + hingeX, f.y + zone.cY, f.z + f.depth / 2 + .012); b.root.add(group);
      const door = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, zone.height, .05), steel);
      door.position.set(-doorWidth / 2, 0, 0); door.castShadow = true; group.add(door);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(.016, .016, zone.height * .62, 10), handle);
      bar.position.set(-doorWidth + .075, 0, .055); bar.rotation.z = Math.PI / 2; group.add(bar);
      const badge = new THREE.Mesh(new THREE.BoxGeometry(.11, .03, .006), handle);
      badge.position.set(-doorWidth / 2, zone.height * .3, .03); group.add(badge);
      leaves.push({ group, panel: door as THREE.Mesh, height: zone.height, cY: zone.cY });
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
      leaf.group.rotation.y = angle;
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
