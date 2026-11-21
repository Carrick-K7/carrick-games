import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createVillaBedroom, VILLA_MASTER_MIRROR, VILLA_MASTER_VANITY } from '../src/villaBedroom.js';
import { createVillaWardrobe, createVillaFridge, createVillaWardrobes, VILLA_MASTER_WARDROBE as W, VILLA_FRIDGE_FREEZER as F } from '../src/villaWardrobe.js';
import { createVillaSuiteFittings } from '../src/villaSuiteFittings.js';
import { createVillaBathDoorModel, createVillaBathDoors, VILLA_BATH_SLIDING_LEAVES } from '../src/villaBathDoors.js';
import { createVillaElevatorModel } from '../src/villaElevatorModel.js';
import { createVillaElevator, VILLA_ELEVATOR as E } from '../src/villaElevator.js';
import { createVillaSnookerTable, createVillaSnookerModel } from '../src/villaSnookerModel.js';
import { createVillaSnooker } from '../src/villaSnooker.js';

const roots: THREE.Group[] = [];
function make() { const s = new THREE.Group(); roots.push(s); return s; }
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
function meshes(root: THREE.Object3D, allowed = (_: THREE.Mesh) => true) {
  const out: THREE.Mesh[] = []; root.traverse(o => { if (o instanceof THREE.Mesh && allowed(o)) out.push(o); }); return out;
}
function hit(from: THREE.Vector3, to: THREE.Vector3, targets: THREE.Object3D[]) {
  return new THREE.Raycaster(from, to.clone().sub(from).normalize(), 0, from.distanceTo(to)).intersectObjects(targets, false)[0];
}
const mat = (hit: THREE.Intersection) => (hit.object as THREE.Mesh).material as THREE.MeshStandardMaterial;
afterEach(() => {
  const gs = new Set<THREE.BufferGeometry>(), ms = new Set<THREE.Material>(), ts = new Set<THREE.Texture>();
  for (const root of roots.splice(0)) { root.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.Line) { gs.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => ms.add(m)); } }); root.clear(); }
  gs.forEach(g => g.dispose()); ms.forEach(m => { for (const value of Object.values(m)) if (value instanceof THREE.Texture) ts.add(value); m.dispose(); }); ts.forEach(t => t.dispose()); vi.unstubAllGlobals();
});

describe('close-range residential fittings, interrogated as visitor-visible triangles', () => {
  it('keeps both floating-panel faces recessed throughout the wardrobe swing and leaves a finger passage under the mounted pull', () => {
    const scene = make(), w = createVillaWardrobe(scene), state = createVillaWardrobes(), panels = meshes(scene, m => m instanceof THREE.InstancedMesh);
    for (const progress of [0, .45, 1]) {
      state.wardrobes[W.id].progress = progress; w.update(state); scene.updateMatrixWorld(true);
      const leaf = scene.getObjectByName('wardrobe/door-1')!, cast = (a: THREE.Vector3, b: THREE.Vector3) => {
        const h = hit(leaf.localToWorld(a), leaf.localToWorld(b), panels);
        return h && leaf.worldToLocal(h.point);
      };
      for (const side of [-1, 1]) {
        const panel = cast(v(.113, .121, side * .15), v(.113, .121, 0));
        const stile = cast(v(.229, .121, side * .15), v(.229, .121, 0));
        expect(panel.z * side).toBeCloseTo(.013, 4); expect(stile.z * side).toBeGreaterThan(panel.z * side + .008);
      }
      expect(cast(v(-.060, -.144, .070), v(.060, -.144, .070))).toBeUndefined();
      expect(cast(v(-.060, -.144, .105), v(.060, -.144, .105)).x).toBeCloseTo(-.014, 3);
      expect(cast(v(-.055, -.32, .057), v(.055, -.32, .057)).x).toBeLessThan(-.009);
    }
  });

  it('exposes adult-width draped outfits on 3/4 hangers, with curved fronts, real backs and a visible collar opening', () => {
    const scene = make(), w = createVillaWardrobe(scene), state = createVillaWardrobes(); state.wardrobes[W.id].progress = 1; w.update(state); scene.updateMatrixWorld(true);
    // The first bay’s front dress and back coat: measure the *built* geometry in
    // garment-local coordinates. A flat cardboard cutout cannot pass the depth probes.
    const centre = W.x - W.width / 2 + .26;
    for (const [side, z, color] of [[-1, .157, 0xe4ddca], [1, -.136, 0x98a18a]]) {
      const clothes = meshes(scene, o => !(o instanceof THREE.InstancedMesh) && (o.material as THREE.MeshStandardMaterial).color.getHex() === color);
      const local = new THREE.Matrix4().makeRotationY(side * .54).setPosition(centre + side * .043, W.y + 1.905, W.z + z);
      const world = (x: number, y: number, z: number) => v(x, y, z).applyMatrix4(local), inv = local.clone().invert();
      const across = (y: number) => {
        let width = 0;
        for (let i = 0; i <= 100; i++) if (hit(world(-.25 + i * .005, y, .11), world(-.25 + i * .005, y, -.11), clothes)) width += .005;
        return width;
      };
      expect(across(-.072)).toBeGreaterThan(.312);
      const front = hit(world(.002, -.156, .12), world(.002, -.156, -.11), clothes), edge = hit(world(.084, -.156, .12), world(.084, -.156, -.11), clothes);
      const rear = hit(world(.002, -.156, -.11), world(.002, -.156, .12), clothes);
      expect(front.point.clone().applyMatrix4(inv).z - rear.point.clone().applyMatrix4(inv).z).toBeGreaterThan(.052);
      expect(Math.abs(front.point.clone().applyMatrix4(inv).z - edge.point.clone().applyMatrix4(inv).z)).toBeGreaterThan(.005);
      expect(hit(world(.003, .04, .003), world(.003, -.08, .003), clothes)).toBeUndefined();
      // Neither the widest cloth nor its hanger intersects the carcass/closed door.
      for (const g of clothes) {
        const p = g.geometry.getAttribute('position'); let vertices = 0;
        for (let j = 0; j < p.count; j++) {
          const vertex = new THREE.Vector3().fromBufferAttribute(p, j), q = vertex.clone().applyMatrix4(inv);
          if (Math.abs(q.x) > .24 || Math.abs(q.z) > .065 || q.y > .012 || q.y < -.99) continue;
          vertices++; expect(vertex.z).toBeLessThan(W.z + .386); expect(vertex.z).toBeGreaterThan(W.z - .32);
          expect(Math.abs(vertex.x - centre)).toBeLessThan(.244);
        }
        expect(vertices).toBeGreaterThan(50);
      }
    }
  });

  it('cuts side-to-side air passages between the actual cloth folds on the master and dressing shelves', () => {
    const s = make(); createVillaWardrobe(s); createVillaSuiteFittings(s); s.updateMatrixWorld(true); const all = meshes(s);
    // Shoot through one ply and the air gap directly above it. The cloth turns back
    // over itself only near its end, where that same gap closes.
    const check = (x: number, y: number, z: number, w: number, d: number, h: number) => {
      const across = (level: number, length: number) => hit(v(x - w * .56, y + h * level, z + d * length), v(x + w * .56, y + h * level, z + d * length), all);
      expect(across(.125, 0)).toBeDefined(); expect(across(.251, 0)).toBeUndefined(); expect(across(.251, .477)).toBeDefined();
      expect(across(.40, 0)).toBeDefined(); expect(across(.572, 0)).toBeUndefined();
    };
    check(W.x - W.width / 2 + .26, W.y + .4475, W.z + .10, .235, .184, .026);
    check(-21.55 - 4.1 / 3, 3.6 + 2.22, -8.52, 4.1 / 3 * .58, .365, .052);
  });

  it('carries the refrigerator shelf bins and gasket with each door while exposing stocked shelves behind them', () => {
    const scene = make(), fridge = createVillaFridge(scene), state = createVillaWardrobes(), g = scene.getObjectByName('Kitchen/fridge-door-chill')!;
    const targets = meshes(g), mid = -(F.width - .03) / 2;
    for (const p of [0, .53, 1]) {
      state.wardrobes[F.id].progress = p; fridge.update(state); scene.updateMatrixWorld(true);
      // Empty vertical space inside an actual pocket, then its thin floor, not a block.
      const from = g.localToWorld(v(mid + .047, -.116, -.096));
      const h = hit(from, g.localToWorld(v(mid + .047, -.26, -.096)), targets);
      expect(g.worldToLocal(h.point).y).toBeCloseTo(-.223, 4);
      const retainer = hit(g.localToWorld(v(mid + .047, -.163, -.212)), g.localToWorld(v(mid + .047, -.163, -.090)), targets);
      expect(g.worldToLocal(retainer.point).z).toBeLessThan(-.158);
      const gasket = hit(g.localToWorld(v(mid + .351, .014, -.10)), g.localToWorld(v(mid + .351, .014, -.010)), targets);
      expect(gasket.distance).toBeLessThan(.071);
    }
    const bottles = meshes(fridge.root), x = F.x - .21, y = F.y + 1.529;
    const stock = hit(v(x, y, F.z + .44), v(x, y, F.z - .30), bottles);
    expect(stock.point.z - F.z).toBeGreaterThan(-.18); expect(stock.point.z - F.z).toBeLessThan(-.13);
  });

  it('surrounds the dressing glass with stepped wood and polished metal, and keeps the brush cup open down to the ceramic floor', () => {
    const scene = make(); createVillaBedroom(scene); scene.updateMatrixWorld(true); const all = meshes(scene), m = VILLA_MASTER_MIRROR, d = VILLA_MASTER_VANITY;
    const depth = (inset: number) => hit(v(m.x + m.width / 2 - inset, m.y, m.z + .12), v(m.x + m.width / 2 - inset, m.y, m.z - .05), all);
    const bead = depth(.051), wood = depth(.037), glass = depth(.20);
    expect(mat(bead).metalness).toBeGreaterThan(.6); expect(mat(wood).metalness).toBe(0); expect(mat(glass).roughness).toBeLessThan(.1);
    expect(bead.point.z - glass.point.z).toBeGreaterThan(.005);
    const cx = d.x + d.width / 2 - .25;
    const floor = hit(v(cx + .021, d.y + 1.03, d.z - .101), v(cx + .021, d.y + .817, d.z - .101), all);
    expect(floor.point.y - d.y).toBeCloseTo(.834, 3);
    const rim = hit(v(cx + .065, d.y + 1.03, d.z - .13), v(cx + .065, d.y + .817, d.z - .13), all);
    expect(rim.point.y - floor.point.y).toBeGreaterThan(.145);
  });

  it('shows the shared bathroom’s milled double finger cups below their bezels, from BOTH rooms at every slide position', () => {
    const s = make(), doors = createVillaBathDoorModel(s), state = createVillaBathDoors();
    for (const progress of [0, .42, 1]) {
      state.progressW = state.progressE = progress; doors.update(state); s.updateMatrixWorld(true);
      for (const layout of VILLA_BATH_SLIDING_LEAVES) {
        const group = s.getObjectByName(`bath-door-${layout.which}-${layout.end ? 'far' : 'near'}`)!, parts = meshes(group);
        for (const side of [-1, 1]) {
          const at = (dz: number) => hit(group.localToWorld(v(side * .08, 1.11, layout.handleZ + dz)), group.localToWorld(v(0, 1.11, layout.handleZ + dz)), parts);
          const centre = at(0), slope = at(.041), lip = at(.054), pane = at(.082);
          expect(mat(centre).name).toBe('bath-door-gaskets'); expect(mat(lip).name).toBe('bath-door-handles');
          expect(lip.distance + .020).toBeLessThan(centre.distance); expect(centre.distance - slope.distance).toBeGreaterThan(.007);
          expect(pane.distance).toBeCloseTo(.069, 4); // exact 22mm pane; cut-out spans its face
        }
      }
    }
  });

  it('has a waste through each ceramic bowl AND slab; exposes water inside separate flared bath and toilet walls and slots through the shower drain', () => {
    const s = make(); createVillaSuiteFittings(s); s.updateMatrixWorld(true); const all = meshes(s);
    const down = (x: number, z: number, from: number, to: number) => hit(v(x, 3.6 + from, z), v(x, 3.6 + to, z), all);
    for (const x of [-9.04, -6.96]) {
      expect(down(x + .006, -8.39 + .016, 1.12, .79)).toBeUndefined();
      const wall = down(x + .18, -8.39 + .008, 1.12, .80).point.y - 3.6;
      const rim = down(x + .312, -8.39 + .008, 1.12, .80).point.y - 3.6;
      expect(wall).toBeGreaterThan(.91); expect(rim).toBeGreaterThan(wall + .08);
    }
    const water = down(-11.55, -6.65, .89, .1), bank = down(-11.55 + .558, -6.65 + .28, .89, .1), edge = down(-11.55 + .634, -6.65 + .28, .89, .1);
    expect(mat(water).transparent).toBe(true); expect(water.point.y).toBeCloseTo(3.903, 3); expect(mat(bank).transparent).toBe(false);
    expect(bank.point.y).toBeGreaterThan(water.point.y + .09); expect(edge.point.y).toBeGreaterThan(bank.point.y + .10);
    const pan = down(-11.40, -1.15, .70, .12), seat = down(-11.40 + .273, -1.15, .70, .12), base = down(-11.40 + .17, -1.15, .70, .12);
    expect(mat(pan).transparent).toBe(true); expect(pan.point.y).toBeCloseTo(3.861, 3); expect(seat.point.y).toBeGreaterThan(pan.point.y + .25); expect(base.point.y).toBeLessThan(seat.point.y - .12);
    const trench = down(-5.45 - .282, -1.32 + .655, .13, .02), plate = down(-5.45 - .257, -1.32 + .655, .13, .02);
    expect(plate.point.y - trench.point.y).toBeGreaterThan(.030);
  });

  it('puts actual legends at control faces, telescopes four glass sashes clear, and leaves hollow pockets, handrail clearance and ventilator recesses', () => {
    const glyphs: Array<[string, number, number]> = [];
    const ctx = new Proxy({ fillText: (text: string, x: number, y: number) => glyphs.push([text, x, y]) }, { get: (obj, prop) => Reflect.get(obj, prop) ?? (() => undefined), set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ctx, width: 256, height: 256 }) });
    const s = make(), lift = createVillaElevatorModel(s), e = createVillaElevator(), car = s.getObjectByName('elevator-car')!, all = meshes(car);
    const local = (x: number, y: number, z: number) => car.localToWorld(v(x, y, z));
    lift.update(e); s.updateMatrixWorld(true);
    const labels = all.filter(m => m.material instanceof THREE.MeshBasicMaterial && m.material.map);
    const legend = hit(local(.823, 1.335, -5.32), local(.823, 1.335, -5.14), labels);
    const pixel = [legend.uv!.x * 256, (1 - legend.uv!.y) * 256], glyph = glyphs.find(([text]) => text === '3')!;
    expect(pixel[0]).toBeCloseTo(glyph[1], 3); expect(pixel[1]).toBeCloseTo(glyph[2], 3);
    const through = hit(local(0, 1.02, -7.35), local(.75, 1.02, -7.35), all); expect(through).toBeUndefined();
    const hand = hit(local(0, 1.02, -7.20), local(0, 1.02, -7.37), all); expect(hand.point.z - (E.centerZ + 6.3)).toBeCloseTo(-7.27, 2);
    const vent = hit(local(.66, 2.30, -6.67), local(.66, 2.45, -6.67), all), ceiling = hit(local(.66, 2.30, -6.695), local(.66, 2.45, -6.695), all);
    expect(vent.point.y - ceiling.point.y).toBeGreaterThan(.07);
    const leaves = meshes(s).filter(m => m.parent?.name.includes('-door-') && m.parent.name.includes('landing-0'));
    const testGate = () => hit(v(E.centerX + .12, 1.55, E.frontZ + .4), v(E.centerX + .12, 1.55, E.frontZ - .2), leaves);
    expect(mat(testGate()).transparent).toBe(true); e.phase = 'open'; e.door = 1; lift.update(e); s.updateMatrixWorld(true); expect(testGate()).toBeUndefined();
    e.phase = 'moving'; e.y = .2; lift.update(e); s.updateMatrixWorld(true); expect(testGate()).toBeDefined();
  });

  it('lets a ball reach every snooker catch cup, with air between the net strands and actual graduated cue splices and a crowned tip', () => {
    const s = make(), table = createVillaSnookerTable(s).root; s.updateMatrixWorld(true); const all = meshes(table), local = (x: number, y: number, z: number) => table.localToWorld(v(x, y, z));
    const p = [.9, 0];
    const bank = (height: number) => hit(local(.82, height, .68), local(.97, height, .68), all).point.x;
    const nose = bank(.8865); expect(bank(.864) - nose).toBeGreaterThan(.013); expect(bank(.899) - nose).toBeGreaterThan(.013);
    for (const pocket of [[-.889, -1.7845], [.889, -1.7845], [-.9, 0], [.9, 0], [-.889, 1.7845], [.889, 1.7845]]) {
      const mouth = hit(local(pocket[0], 1, pocket[1]), local(pocket[0], .47, pocket[1]), all);
      expect(mouth.point.y).toBeCloseTo(.502, 3);
    }
    let air = 0, rope = 0;
    for (let i = -16; i <= 16; i++) {
      const cut = hit(local(p[0] + i * .0025, .689, -.089), local(p[0] + i * .0025, .689, .089), all);
      if (!cut) air++; else if (mat(cut).name === 'snooker-chalk') rope++;
    }
    expect(air).toBeGreaterThan(4); expect(rope).toBeGreaterThan(2);
    const physics = createVillaSnooker(), game = createVillaSnookerModel(s); game.update(physics, true); s.updateMatrixWorld(true);
    const cue = s.getObjectByName('snooker-active-cue')!, wood = cue.children[0] as THREE.Mesh, vertex = wood.geometry.getAttribute('position');
    // One splice's boundary rises over 20cm at its points, with a continuous full taper at these transitions.
    const amber = wood.geometry.getAttribute('color'); expect(amber.count).toBe(vertex.count);
    const stations = new Set<number>(); for (let i = 0; i < vertex.count; i++) if (vertex.getY(i) > -.285 && vertex.getY(i) < -.065) stations.add(Math.round(vertex.getY(i) * 1000));
    expect(stations.size).toBeGreaterThan(6);
    const axial = hit(cue.localToWorld(v(0, .60, 0)), cue.localToWorld(v(0, .574, 0)), meshes(cue));
    expect(cue.worldToLocal(axial.point).y).toBeCloseTo(.587, 4);
  });
});
