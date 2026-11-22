import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import type { FurnitureKit } from '../src/villaFurnitureForms.js';
import { frontLoader, kitchenRun, placeSetting } from '../src/villaInteriorKitchen.js';
import { registerPantryFinish } from '../src/villaPantryFinish.js';
import { createVillaFridge, createVillaWardrobes, VILLA_FRIDGE_FREEZER as F } from '../src/villaWardrobe.js';
import { createVillaTeaBar, VILLA_TEA_BAR as B } from '../src/villaTeaBar.js';
import { teaPotBody } from '../src/villaTeaWare.js';
import { VILLA_WALL_COLLIDERS } from '../src/villaWorld.js';

const owned: THREE.Object3D[] = [];
function group() { const g = new THREE.Group(); owned.push(g); return g; }
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
function probe(targets: THREE.Object3D[], a: THREE.Vector3, b: THREE.Vector3) {
  return new THREE.Raycaster(a, b.clone().sub(a).normalize(), 0, a.distanceTo(b)).intersectObjects(targets, true)[0];
}
function surface(root: THREE.Object3D, allow = (_: THREE.Mesh) => true) {
  const list: THREE.Mesh[] = []; root.traverse(o => { if (o instanceof THREE.Mesh && allow(o)) list.push(o); }); return list;
}
function fixture() {
  const root = group(); let frame: THREE.Object3D = root;
  const names = 'oak walnut linen sage terra cream brass black steel white stone dark leaf leafLight soil blue coral lampGlow'.split(' ');
  const m = Object.fromEntries(names.map(name => [name, new THREE.MeshStandardMaterial({ name })])) as FurnitureKit['m'];
  const k: FurnitureKit = { m,
    at(x, y, z, yaw, make) { const old = frame; frame = new THREE.Group(); old.add(frame); frame.position.set(x, y, z); frame.rotation.y = yaw; make(); frame = old; },
    put(g, mat, x, y, z, rx = 0, ry = 0, rz = 0) { const mesh = new THREE.Mesh(g, mat); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); frame.add(mesh); },
    box(x, y, z, w, h, d, mat) { k.put(new THREE.BoxGeometry(w, h, d), mat, x, y, z); }, hit() {},
  };
  const tile = new THREE.MeshStandardMaterial(), glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: .32 });
  return { root, k, tile, glass };
}
afterEach(() => {
  const gs = new Set<THREE.BufferGeometry>(), ms = new Set<THREE.Material>(), ts = new Set<THREE.Texture>();
  for (const root of owned.splice(0)) { for (const o of surface(root)) { gs.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) ms.add(m); } root.clear(); }
  gs.forEach(g => g.dispose()); ms.forEach(m => { for (const t of Object.values(m)) if (t instanceof THREE.Texture) ts.add(t); m.dispose(); }); ts.forEach(t => t.dispose());
});

describe('pantry stonework, fittings and daily use', () => {
  it('turns honed stone into the sink cut, hides the steel flange UNDER it, and leaves the actual strainer holes open', () => {
    const { root, k, tile, glass } = fixture(); kitchenRun(k, tile, glass, k.m.lampGlow); root.updateMatrixWorld(true);
    const x = -5.67, z = -8.35, down = (dx: number, dz: number) => probe([root], v(x + dx, 1.10, z + dz), v(x + dx, .75, z + dz));
    const deck = down(.390, .028), edge = down(.381, .028), well = down(.354, .028);
    expect(deck.point.y).toBeCloseTo(.990, 5); expect(edge.point.y).toBeLessThan(deck.point.y - .001);
    expect(well.point.y).toBeLessThan(.947);
    // Horizontal inside-out casts see the downward return, then the wider flange beneath it.
    const face = (y: number) => probe([root], v(x + .33, y, z + .028), v(x + .412, y, z + .028));
    expect(face(.974).point.x - x).toBeCloseTo(.379, 3);
    expect(down(0, -.15).point.y).toBeCloseTo(.927, 3);
    expect(down(.0257, .109).point.y).toBeLessThan(.780); expect(down(.015, .109).point.y).toBeCloseTo(.8047, 3);
    const map = tile.map as THREE.DataTexture, pbr = tile.roughnessMap as THREE.DataTexture;
    expect(map.image.width).toBe(256); expect(map.image.height).toBe(256); expect(tile.metalnessMap).toBe(pbr);
    expect(pbr).not.toBe(map); expect(k.m.steel.map).toBeNull(); // bounded, local finishes only
  });
  it('finds actual grout, a painted shaker panel inset and a clear door joint behind the millwork arris', () => {
    const { root, k, tile, glass } = fixture(); kitchenRun(k, tile, glass, k.m.lampGlow); root.updateMatrixWorld(true);
    const across = (x: number, y: number, z: number, far: number) => probe([root], v(x, y, z), v(x, y, far));
    const joint = -11.157 + .248 * 5, bed = across(joint, 1.044, -8.825, -8.904), biscuit = across(joint + .103, 1.044, -8.825, -8.904);
    expect((bed.object as THREE.Mesh).material).toBe(k.m.stone); expect((biscuit.object as THREE.Mesh).material).toBe(tile);
    expect(biscuit.point.z - bed.point.z).toBeGreaterThan(.006);
    const cx = -5.67, frontZ = -8.35 + .550;
    const stile = across(cx + .016, .54, frontZ, frontZ - .10), panel = across(cx + .28, .54, frontZ, frontZ - .10);
    expect(stile.point.z - panel.point.z).toBeGreaterThan(.006); expect(across(cx, .54, frontZ, frontZ - .10)).toBeUndefined();
  });
  it('sets the chilled bottles and wrapped parcels on physical supports at open, intermediate and closed angles', () => {
    const root = group(), fridge = createVillaFridge(root), state = createVillaWardrobes();
    for (const progress of [0, .5, 1]) {
      state.wardrobes[F.id].progress = progress; fridge.update(state); root.updateMatrixWorld(true);
      const food = surface(fridge.root, m => (m.material as THREE.Material).name === 'pantry/cold-provisions');
      const trays = surface(fridge.root, m => m.parent === fridge.root && !food.includes(m));
      for (const [dx, z, y] of [[-.21 + .037, -.18, 1.386], [-.16, -.088, .341], [.145, -.067, .641]]) {
        const x = F.x + dx, zz = F.z + z;
        const shelf = probe(trays, v(x, y + .027, zz), v(x, y - .045, zz));
        const heel = probe(food, v(x, y - .019, zz), v(x, y + .030, zz));
        expect(heel.point.y).toBeCloseTo(shelf.point.y, 4);
      }
      const colors = food[0].geometry.getAttribute('color'); let warm = 0, green = 0;
      for (let i = 0; i < colors.count; i++) { warm += Number(colors.getX(i) > 1.25 * colors.getY(i)); green += Number(colors.getY(i) > 1.1 * colors.getX(i)); }
      expect(warm).toBeGreaterThan(70); expect(green).toBeGreaterThan(30);
      const leaf = fridge.root.getObjectByName('Kitchen/fridge-door-chill')!, mid = -(F.width - .03) / 2;
      const at = (x: number, y: number, z: number) => leaf.localToWorld(v(x, y, z));
      const shoulder = probe([leaf], at(mid - .181, -.138, -.158), at(mid - .181, -.138, -.06));
      const empty = probe([leaf], at(mid, -.138, -.158), at(mid, -.138, -.06));
      expect(shoulder).toBeDefined(); expect(empty).toBeUndefined();
    }
  });
  it('exposes a formed liner and a recessed, slotted vent in front of the actual kitchen partition', () => {
    const root = group(), fridge = createVillaFridge(root), state = createVillaWardrobes();
    state.wardrobes[F.id].progress = 1; fridge.update(state); root.updateMatrixWorld(true);
    const wall = VILLA_WALL_COLLIDERS.find(c => c.minX < F.x && c.maxX > F.x && c.maxY > 1.81 && c.minY < 1.64 && c.maxZ < F.z && c.maxZ > F.z - .4)!;
    expect(wall).toBeDefined();
    const at = (x: number, y: number) => probe([root], v(F.x + x, y, F.z + .31), v(F.x + x, y, wall.maxZ));
    expect(at(.273, 1.731).point.z - wall.maxZ).toBeGreaterThan(.020);
    const slot = at(0, 1.790), cheek = at(.022, 1.790);
    expect(cheek.point.z - slot.point.z).toBeGreaterThan(.009);
    expect(slot.point.z - wall.maxZ).toBeGreaterThan(.032);
  });
  it('leaves real air in a tumbler and supports its foot separately from the plate and folded napkin', () => {
    const { root, k, tile, glass } = fixture(); registerPantryFinish(k, tile, glass); placeSetting(k); root.updateMatrixWorld(true);
    const castY = (x: number, z: number, a: number, b: number) => probe([root], v(x, a, z), v(x, b, z)).point.y;
    expect(castY(.188 + .029, -.200, -.02, .13)).toBeCloseTo(0, 4);
    expect(castY(.188, -.200, .12, 0)).toBeCloseTo(.011, 4);
    expect(castY(.188 + .038, -.200, .12, .01)).toBeGreaterThan(.096);
    expect(castY(-.006, .024, .060, 0) - castY(-.006 + .073, .024, .060, 0)).toBeGreaterThan(.007);
    expect(castY(-.006 + .132, .024, .060, 0)).toBeGreaterThan(.022);
  });
  it.each([false, true])('exposes folded laundry through the porthole above a drum-bearing load (dryer=%s)', dryer => {
    const { root, k, tile, glass } = fixture(); registerPantryFinish(k, tile, glass); frontLoader(k, .64, .70, .94, glass, dryer); root.updateMatrixWorld(true);
    const cy = .94 * .46, r = .64 * .337, f = .70 / 2 - .014, z = f - .19;
    const textiles = surface(root, o => o.material === tile && o.geometry.boundingBox!.max.z > .08 && o.position.lengthSq() === 0);
    const drum = surface(root, o => o.material === k.m.steel && Math.abs(o.position.y - cy) < .001);
    const bottom = probe(drum, v(0, cy, z), v(0, cy - r * 1.08, z));
    const load = probe(textiles, v(0, cy - r * 1.03, z), v(0, cy, z));
    expect(Math.abs(load.point.y - bottom.point.y)).toBeLessThan(.0045);
    const at = (x: number) => probe(textiles, v(x, cy, z), v(x, cy - r, z)).point.y;
    expect(Math.abs(at(.06) - at(-.064))).toBeGreaterThan(.009);
    expect(probe(textiles, v(0, cy, f + .10), v(0, cy, f - .4))).toBeUndefined();
    expect(probe(textiles, v(.03, cy - .12, f + .10), v(.03, cy - .12, f - .35))).toBeDefined();
  });
});

describe('fired tea service and draining decks', () => {
  it('intercepts tea below and between removable slats, and changes the turning below the teapot shoulder without sealing its bore', () => {
    const room = group(); createVillaTeaBar(room); room.updateMatrixWorld(true);
    const boatX = .13, boatZ = -.095, spacing = (1.14 - .042) / 13;
    const at = (x: number, z: number, hi = 1.01, lo = .948) => probe([room], v(B.x - x, hi, B.z - z), v(B.x - x, lo, B.z - z)).point.y;
    const left = at(boatX - 2.5 * spacing, boatZ), right = at(boatX + 2.5 * spacing, boatZ);
    expect(at(boatX, boatZ)).toBeCloseTo(.992, 4); expect(left).toBeGreaterThan(.954); expect(right - left).toBeGreaterThan(.001);
    expect(at(boatX, boatZ) - right).toBeGreaterThan(.030);
    const mesh = new THREE.Mesh(teaPotBody(), new THREE.MeshBasicMaterial()); group().add(mesh);
    const wall = (y: number) => probe([mesh], v(0, y, .20), v(0, y, 0)).point.z;
    expect(wall(.0205) - wall(.022)).toBeGreaterThan(.0006); expect(wall(.0255)).toBeGreaterThan(wall(.022) + .007);
  });
});
