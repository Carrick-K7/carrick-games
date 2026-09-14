import { VILLA_CAR, VILLA_RACING, VILLA_SCOOTER } from './villaActivities.js';
import { VILLA_ELEVATOR, villaElevatorShaftContains } from './villaElevator.js';
import { VILLA_EAST_WALL as EAST, VILLA_WEST_WALL as WEST, VILLA_NORTH_WALL as NORTH, VILLA_SOUTH_WALL as SOUTH } from './villaEstateLayout.js';
import { VILLA_AQUARIUM, VILLA_RELAX_SEATS, villaRelaxSeat, resolveVillaSeatPosition } from './villaSeating.js';
import { VILLA_TEA_BAR } from './villaLivingLayout.js';
import type { VillaPetId } from './villaPets.js';
import { POOL, VILLA_ESTATE_BOUNDS, VILLA_GARAGE_EXTENT, VILLA_GARAGE_BAYS, VILLA_PICKUP, villaPondContains, villaTerrainHeight } from './villaEstateLayout.js';

/** Shared metre-scale architecture and walk surfaces: rendering and collision agree. */
export interface VillaCollider {
  minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number;
}
const colliderNarrowPhases = new WeakMap<VillaCollider, (p: VillaPosition, height: number) => boolean>();
/** Optional precise geometry for moving/rotated props; keeps collider snapshots plain. */
export function setVillaColliderNarrowPhase(collider: VillaCollider, test: (p: VillaPosition, height: number) => boolean): void {
  colliderNarrowPhases.set(collider, test);
}
export type VillaMaterial = 'plaster' | 'oak' | 'stone' | 'glass' | 'bronze' | 'roof';
export interface VillaBlock {
  x: number; y: number; z: number; w: number; h: number; d: number;
  material: VillaMaterial; solid: boolean;
}
export interface VillaPosition { x: number; y: number; z: number }
export interface VillaRoom {
  id: string; name: string; zh: string; floor: number;
  minX: number; maxX: number; minZ: number; maxZ: number;
}
export interface VillaRamp {
  minX: number; maxX: number; startZ: number; endZ: number; bottom: number; top: number; base: number;
}
export const STOREY = 3.6;
export const EYE_HEIGHT = 1.65;
export const PLAYER_RADIUS = 0.23;
export const STAIR_TREAD_THICKNESS = 0.15;
export const VILLA_SPAWN: VillaPosition = { x: -17, y: 0, z: 19.5 };
export const VILLA_ENTRANCE: VillaPosition = { x: 0, y: 0, z: 11.5 };
/** The staircase and the lift swapped places: the stairwell now occupies the
 * former shaft footprint (shifted west, same 3.95 x 7.5 size) and the lift
 * shaft sits in the north end of the former stairwell. */
export const STAIR_HOLE = { minX: -0.85, maxX: 3.1, minZ: -7, maxZ: 0.5 };
export { POOL } from './villaEstateLayout.js';
export const VILLA_RAMPS: VillaRamp[] = [0, STOREY].flatMap(base => [
  { minX: -0.7, maxX: 1.08, startZ: 0.5, endZ: -5.5, bottom: base, top: base + 1.8, base },
  { minX: 1.32, maxX: 3.1, startZ: -5.5, endZ: 0.5, bottom: base + 1.8, top: base + STOREY, base },
]);
/** Separate structural soffit and oak finish: never share an exposed top plane. */
export const STAIR_FINISH_THICKNESS = 0.04;
export function villaTreadLayers(top: number) {
  return { bodyBottom: top - STAIR_TREAD_THICKNESS, bodyTop: top - STAIR_FINISH_THICKNESS, finishBottom: top - STAIR_FINISH_THICKNESS, finishTop: top };
}
export const VILLA_ROOMS: VillaRoom[] = [
  { id: 'studio', name: 'Studio', zh: '书房 · 工作室', floor: 0, minX: WEST.inner, maxX: -2, minZ: NORTH.inner, maxZ: -9 },
  { id: 'kitchen', name: 'Kitchen & dining', zh: '厨房 · 餐厅', floor: 0, minX: WEST.inner, maxX: -2, minZ: -9, maxZ: 0 },
  { id: 'living', name: 'Living room', zh: '客厅 · 壁炉与茶', floor: 0, minX: WEST.inner, maxX: -2, minZ: 0, maxZ: SOUTH.inner },
  { id: 'snooker', name: 'Snooker lounge', zh: '斯诺克厅', floor: 0, minX: 5.65, maxX: 17, minZ: -9, maxZ: 1 },
  { id: 'gym', name: 'Gym & hobby room', zh: '健身 · 多功能房', floor: 0, minX: 5.65, maxX: 17, minZ: NORTH.inner, maxZ: -9 },
  { id: 'gaming', name: 'Gaming room', zh: '电竞房', floor: 0, minX: 2, maxX: 17, minZ: 3, maxZ: SOUTH.inner },
  { id: 'east-lounge', name: 'Media lounge', zh: '影音休闲厅', floor: 0, minX: 17, maxX: EAST.inner, minZ: NORTH.inner, maxZ: SOUTH.inner },
  { id: 'garage', name: 'Garage & workshop', zh: '车库 · 工具间', floor: 0, ...VILLA_GARAGE_EXTENT },
  { id: 'study', name: 'Study', zh: '书房 · 阅读间', floor: 1, minX: 8, maxX: 17, minZ: NORTH.inner, maxZ: -9 },
  { id: 'bath', name: 'Bath & laundry', zh: '浴室 · 洗衣间', floor: 1, minX: 8, maxX: 17, minZ: -9, maxZ: 1 },
  { id: 'library', name: 'Reading lounge', zh: '书房 · 阅读角', floor: 1, minX: 2, maxX: 17, minZ: 3, maxZ: SOUTH.inner },
  { id: 'east-suite', name: 'Guest suite', zh: '东侧客房', floor: 1, minX: 17, maxX: EAST.inner, minZ: NORTH.inner, maxZ: SOUTH.inner },
  { id: 'master', name: 'Primary bedroom', zh: '主卧', floor: 1, minX: WEST.inner, maxX: -2, minZ: 0, maxZ: SOUTH.inner },
  { id: 'guest', name: 'Guest bedroom', zh: '次卧', floor: 1, minX: WEST.inner, maxX: -2, minZ: -9, maxZ: 0 },
  { id: 'study-west', name: 'Upstairs study', zh: '二楼书房', floor: 1, minX: WEST.inner, maxX: -2, minZ: NORTH.inner, maxZ: -9 },
  { id: 'balcony', name: 'Bedroom balcony', zh: '卧室阳台', floor: 1, minX: -11.5, maxX: 1.5, minZ: 9, maxZ: 11.5 },
  { id: 'terrace', name: 'Roof garden', zh: '天台 · 空中花园', floor: 2, minX: WEST.inner, maxX: EAST.inner, minZ: NORTH.inner, maxZ: SOUTH.inner },
];

const blocks: VillaBlock[] = [];
function add(x: number, y: number, z: number, w: number, h: number, d: number, material: VillaMaterial = 'plaster', solid = true) {
  blocks.push({ x, y, z, w, h, d, material, solid });
}
interface Opening { from: number; to: number; door?: boolean }
/** Window openings have real transparent glazing; door openings remain walkable. */
function wall(axis: 'x' | 'z', fixed: number, from: number, to: number, base: number, openings: Opening[] = []) {
  const piece = (a: number, b: number, bottom: number, h: number, material: VillaMaterial = 'plaster', depth = 0.22) => {
    if (b - a < 0.001 || h < 0.001) return;
    if (axis === 'x') add((a + b) / 2, base + bottom + h / 2, fixed, b - a, h, depth, material);
    else add(fixed, base + bottom + h / 2, (a + b) / 2, depth, h, b - a, material);
  };
  let cursor = from;
  for (const opening of [...openings].sort((a, b) => a.from - b.from)) {
    // Cut an actual rebate for each timber jamb. Previously plaster and oak
    // ended on the SAME exposed inner face, producing door-edge z-fighting.
    const trim = opening.door ? .05 : 0, lintelY = opening.door ? 3.04 : 3;
    piece(cursor, opening.from - trim, 0, 3.4);
    piece(opening.from - trim, opening.to + trim, lintelY, 3.4 - lintelY);
    if (!opening.door) {
      piece(opening.from, opening.to, 0, 0.32);
      piece(opening.from, opening.to, 0.32, 2.68, 'glass', 0.045);
      const panes = Math.ceil((opening.to - opening.from) / 1.65);
      for (let i = 0; i <= panes; i++) {
        const p = opening.from + (opening.to - opening.from) * i / panes;
        piece(p - 0.025, p + 0.025, 0.32, 2.68, 'bronze', 0.095);
      }
      piece(opening.from, opening.to, 0.29, 0.055, 'bronze', 0.095);
      piece(opening.from, opening.to, 2.96, 0.055, 'bronze', 0.095);
    } else {
      piece(opening.from - .05, opening.from, 0, 3.04, 'oak', .27);
      piece(opening.to, opening.to + .05, 0, 3.04, 'oak', .27);
      piece(opening.from, opening.to, 2.96, .08, 'oak', .27);
    }
    cursor = opening.to + trim;
  }
  piece(cursor, to, 0, 3.4);
}

// Ground floor facade, with four actual entrances, not painted-on doors. The
// envelope doubled west, east and north; the openings keep their old x/z so
// every window and door stays where the rooms already expect it.
wall('x', SOUTH.inner, WEST.inner, EAST.inner, 0, [
  { from: -23.2, to: -14.2 }, { from: -12, to: -4.5 },
  { from: -1.45, to: 1.45, door: true },
  { from: 3.5, to: 11 }, { from: 18.5, to: 27 }]);
wall('x', NORTH.inner, WEST.inner, EAST.inner, 0, [
  { from: -23.2, to: -15 }, { from: -12.5, to: -4 },
  { from: -1.45, to: 1.45, door: true },
  { from: 6.5, to: 12 }, { from: 19, to: 27 }]);
wall('z', WEST.inner, NORTH.inner, SOUTH.inner, 0, [
  { from: -17, to: -10 }, { from: -8, to: -1 }, { from: 1, to: 2.3 }, { from: 2.5, to: 5.2, door: true }, { from: 5.5, to: 8 }]);
wall('z', EAST.inner, NORTH.inner, SOUTH.inner, 0, [
  { from: -16, to: -12 }, { from: -7, to: -3 }, { from: -0.8, to: 1.8, door: true }, { from: 4, to: 8 }]);
// The west wing is one deep open-plan volume now, split into three bands.
wall('x', -9, WEST.inner, -2, 0, [{ from: -20.5, to: -15, door: true }]);
// A cased opening, not a door: the studio still reads as part of the wing.
wall('z', -2, NORTH.inner, -9, 0, [{ from: -16, to: -10.5, door: true }]);
// East rooms are divided from the hall by one full-depth wall with a wide arch.
wall('z', 17, NORTH.inner, SOUTH.inner, 0, [{ from: -3.5, to: 2.5, door: true }, { from: 4.5, to: 7.5, door: true }]);
wall('x', 3, 2, 17, 0, [{ from: 3, to: 5.5, door: true }]);
wall('z', 2, 3, 9, 0);
// The snooker lounge keeps a real north wall to hang its cue rack on, and the
// band behind it becomes the ground floor's flexible room.
wall('x', -9, 5.65, 17, 0, [{ from: 12, to: 15, door: true }]);
// Two private bedrooms, a bathroom and a library off the upstairs gallery.
wall('x', SOUTH.inner, WEST.inner, EAST.inner, STOREY, [
  { from: -23.2, to: -14.2 }, { from: -12, to: -8.8 },
  // The bedroom balcony's own door: rewriting this facade without it sealed the
  // balcony off behind glass.
  { from: -8.5, to: -6.2, door: true },
  { from: -5.9, to: -1.8 }, { from: -1.3, to: 1.3 }, { from: 3, to: 15 }, { from: 19.5, to: 27 }]);
wall('x', NORTH.inner, WEST.inner, EAST.inner, STOREY, [
  { from: -23.2, to: -14 }, { from: -11, to: -3 },
  { from: 10, to: 15.5 }, { from: 20, to: 27 }]);
wall('z', WEST.inner, NORTH.inner, SOUTH.inner, STOREY, [{ from: -17, to: -10 }, { from: -8, to: -1 }, { from: 1, to: 8 }]);
wall('z', EAST.inner, NORTH.inner, SOUTH.inner, STOREY, [{ from: -8, to: -2 }, { from: 4, to: 8 }, { from: -16, to: -11.5 }]);
// Gallery wall: one door per west room, and a wide opening onto the stair hall.
wall('z', -2, NORTH.inner, SOUTH.inner, STOREY, [
  { from: -16.5, to: -13.5, door: true }, { from: -4.8, to: -2.5, door: true }, { from: 1.5, to: 3.8, door: true }]);
wall('x', 0, WEST.inner, -2, STOREY);
wall('x', -9, WEST.inner, -2, STOREY, [{ from: -19, to: -15, door: true }]);
wall('z', 17, NORTH.inner, SOUTH.inner, STOREY, [{ from: -4, to: 0, door: true }, { from: 4, to: 7.5, door: true }]);
wall('x', 3, 2, 17, STOREY, [{ from: 3, to: 5.5, door: true }]);
wall('z', 2, 3, 9, STOREY);
// Wet rooms sit behind the lift lobby; the study takes the new north band.
wall('z', 8, NORTH.inner, 1, STOREY, [{ from: -6.2, to: -3.4, door: true }, { from: -15, to: -12, door: true }]);
wall('x', -9, 8, 17, STOREY, [{ from: 11, to: 14, door: true }]);
wall('x', 1, 8, 17, STOREY, [{ from: 9.2, to: 11.3, door: true }]);
// Four south-facing bays: sedan, pickup, and two genuinely empty spare spaces.
const garage = VILLA_GARAGE_EXTENT;
wall('z', garage.maxX, garage.minZ, garage.maxZ, 0, [{ from: -6.5, to: -3 }]);
wall('x', garage.minZ, garage.minX, garage.maxX, 0);
wall('x', garage.maxZ, garage.minX, garage.maxX, 0, VILLA_GARAGE_BAYS.map(bay => ({ from: bay.doorMinX, to: bay.doorMaxX, door: true })));
add((garage.minX + garage.maxX) / 2, garage.roofY, (garage.minZ + garage.maxZ) / 2,
  garage.maxX - garage.minX + .4, .22, garage.maxZ - garage.minZ + .4, 'roof', false);

// Slabs are cut around BOTH new openings: the shifted stairwell and the lift
// shaft that now occupies the former stairwell. Explicit rectangles keep every
// piece on a real edge instead of relying on one centred helper.
// Storeys 1 and 2 stop at the stairwell; the ground floor only needs the shaft.
for (const y of [STOREY, STOREY * 2]) {
  const finish: VillaMaterial = y === STOREY ? 'oak' : 'stone', cy = y - 0.1;
  // The west slab must meet the stair opening exactly: cutting it at x=-1.0
  // while STAIR_HOLE.minX is -0.85 left a 15 cm slit down the full depth of the
  // upper storeys, which read as a seam in the floor.
  add(-12.6, cy, -4.6, 23.6, 0.2, 27.6, finish, false);
  add(1.15, cy, -12.7, 3.9, 0.2, 11.4, 'stone', false);
  add(1.15, cy, 4.85, 3.9, 0.2, 8.7, finish, false);
  add(3.275, cy, -4.6, 0.35, 0.2, 27.6, finish, false);
  add(4.55, cy, -12.7, 2.2, 0.2, 11.4, 'stone', false);
  add(4.55, cy, 2.3, 2.2, 0.2, 13.8, finish, false);
  add(17.025, cy, -4.6, 22.75, 0.2, 27.6, finish, false);
}
add(-10.475, -0.13, -4.6, 27.85, 0.26, 27.6, 'oak', false);
add(17.025, -0.13, -4.6, 22.75, 0.26, 27.6, 'oak', false);
add(4.55, -0.13, -12.7, 2.2, 0.26, 11.4, 'oak', false);
add(4.55, -0.13, 2.3, 2.2, 0.26, 13.8, 'oak', false);
add(-5, STOREY - 0.1, 10.25, 13, 0.2, 2.5, 'stone', false);
// Layered fascia and timber accent fins make a composed modern exterior.
for (const y of [3.42, 7.02]) {
  add(2, y, SOUTH.outer, 52.8, 0.19, 0.48, 'stone', false);
  add(2, y, NORTH.outer, 52.8, 0.19, 0.48, 'stone', false);
  add(WEST.outer, y, -4.6, 0.48, 0.19, 27.6, 'stone', false);
  add(EAST.outer, y, -4.6, 0.48, 0.19, 27.6, 'stone', false);
}
for (let x = -2.65; x <= -1.65; x += 0.16) add(x, 3.5, 9.17, 0.07, 6.9, 0.14, 'oak', false);
add(0, 2.94, 10, 3.8, 0.14, 2.2, 'oak', false);
// Third-storey glazed stair pavilion; both stairs open onto the terrace at the front.
wall('z', -1.15, -7.35, 1.25, 7.2, [{ from: -6.9, to: 0.9 }]);
wall('z', 3.27, -7.35, 1.25, 7.2, [{ from: -6.9, to: 0.9 }]);
wall('x', -7.35, -1.15, 3.27, 7.2, [{ from: -0.8, to: 2.92 }]);
add(1.06, 10.6, -3.05, 4.82, 0.2, 9.1, 'roof', false);

/** Rail collision matches the visible handrails and glass guards. */
export const VILLA_RAILS: VillaCollider[] = [];
function rail(x: number, z: number, w: number, d: number, y: number, height = 1.05) {
  VILLA_RAILS.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: y, maxY: y + height });
}
// Stair guards run along the rising surfaces, including the central divider.
for (const ramp of VILLA_RAMPS) {
  for (let i = 0; i < 12; i++) {
    const z = ramp.startZ + (ramp.endZ - ramp.startZ) * (i + 0.5) / 12;
    const y = ramp.bottom + (ramp.top - ramp.bottom) * i / 12;
    rail(ramp.minX - 0.045, z, 0.09, 0.5, y, 1.1);
    rail(ramp.maxX + 0.045, z, 0.09, 0.5, y, 1.1);
  }
}
for (const base of [0, STOREY]) {
  rail(-0.81, -6.2, 0.09, 1.4, base + 1.8);
  rail(3.21, -6.2, 0.09, 1.4, base + 1.8);
  rail(1.2, -6.93, 4.05, 0.09, base + 1.8);
}
// Floor-level guards stop a player stepping sideways into the open stairwell.
for (const y of [3.6, 7.2]) {
  rail(-0.87, -3.25, 0.08, 7.5, y);
  rail(3.27, -3.25, 0.08, 7.5, y);
  rail(1.2, -7.03, 4.2, 0.08, y);
  rail(1.2, 0.51, 0.16, 0.12, y);
}
// Rooftop and bedroom balcony glass balustrades.
rail(2, 8.95, 52.4, 0.12, 7.2, 1.1);
rail(2, -18.15, 52.4, 0.12, 7.2, 1.1);
rail(-24.15, -4.6, 0.12, 27.4, 7.2, 1.1);
rail(28.15, -4.6, 0.12, 27.4, 7.2, 1.1);
rail(-5, 11.45, 13, 0.12, 3.6, 1.1);
rail(-11.45, 10.2, 0.12, 2.5, 3.6, 1.1);
rail(1.45, 10.2, 0.12, 2.5, 3.6, 1.1);

export const VILLA_BLOCKS: readonly VillaBlock[] = blocks;
export const VILLA_WALL_COLLIDERS: readonly VillaCollider[] = blocks.filter(b => b.solid).map(b => ({
  minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2,
  minY: b.y - b.h / 2, maxY: b.y + b.h / 2,
}));

function inRect(x: number, z: number, r: { minX: number; maxX: number; minZ: number; maxZ: number }, padding = 0) {
  return x >= r.minX - padding && x <= r.maxX + padding && z >= r.minZ - padding && z <= r.maxZ + padding;
}
export function villaFloor(y: number): number { return Math.max(0, Math.min(2, Math.floor((y + 0.15) / STOREY))); }
export function villaRoomAt(p: VillaPosition): { id: string; name: string; zh: string } {
  const floor = villaFloor(p.y);
  if (p.z >= 24) {
    if (p.x < -3.4) return p.z >= 64
      ? { id: 'pond', name: 'South pond & meadow', zh: '南侧池塘 · 草甸' }
      : { id: 'fields', name: 'South fields', zh: '南侧田地' };
    return { id: 'driving-course', name: 'South scenic road', zh: '南侧景观道路' };
  }
  if (floor === 0 && p.x < -3.4 && p.x > -22.8 && p.z >= 12.8 && p.z < 24) {
    return p.x > -11.6 && p.z >= 17 ? { id: 'garden', name: 'Vegetable garden', zh: '花园 · 菜地' }
      : { id: 'garden', name: 'Orchard & pets', zh: '果园 · 小伙伴' };
  }
  if (villaElevatorShaftContains(p.x, p.z)) return { id: 'elevator', name: 'Elevator', zh: '电梯' };
  if (inRect(p.x, p.z, STAIR_HOLE)) return { id: 'stairs', name: 'Oak staircase', zh: '橡木楼梯' };
  const room = VILLA_ROOMS.find(r => r.floor === floor && inRect(p.x, p.z, r));
  if (room) return room;
  if (floor === 0 && !inRect(p.x, p.z, { minX: WEST.outer, maxX: EAST.outer, minZ: NORTH.outer, maxZ: SOUTH.outer })) {
    return p.x < WEST.outer ? { id: 'garden', name: 'Pool garden', zh: '花园 · 泳池' } : { id: 'garden', name: 'Welcome home', zh: '庭院 · 欢迎回家' };
  }
  return { id: 'gallery', name: 'Sunlit gallery', zh: '采光走廊' };
}

/**
 * Select a nearby support first, then check headroom against thin floating treads.
 * A higher stacked flight is not a solid column down to its storey's floor: doing
 * that would block both ascent and descent precisely at y=3.6. The visible stair
 * construction uses the same thin tread/landing thickness and open underside.
 */
export function villaSupportAt(x: number, z: number, previousY: number, headHeight = EYE_HEIGHT + 0.1): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(previousY)) return null;
  const bounds = VILLA_ESTATE_BOUNDS;
  if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return null;
  if (inRect(x, z, POOL, PLAYER_RADIUS) || villaPondContains(x, z, PLAYER_RADIUS) || villaElevatorShaftContains(x, z)) return null;
  const heights: number[] = [villaTerrainHeight(x, z)];
  const overhead: { top: number; thickness: number }[] = [];
  for (const y of [STOREY, STOREY * 2]) {
    // Interior envelope of the upper storeys, inset a hair inside the walls.
    if (inRect(x, z, { minX: WEST.inner + .1, maxX: EAST.outer, minZ: NORTH.inner + .1, maxZ: SOUTH.outer }) && !inRect(x, z, STAIR_HOLE)) {
      heights.push(y); overhead.push({ top: y, thickness: .2 });
    }
  }
  if (inRect(x, z, { minX: -11.5, maxX: 1.5, minZ: 9, maxZ: 11.5 })) heights.push(STOREY);
  for (const ramp of VILLA_RAMPS) {
    if (x >= ramp.minX && x <= ramp.maxX && z >= Math.min(ramp.startZ, ramp.endZ) && z <= Math.max(ramp.startZ, ramp.endZ)) {
      const t = (z - ramp.startZ) / (ramp.endZ - ramp.startZ);
      const top = ramp.bottom + (ramp.top - ramp.bottom) * t;
      heights.push(top);
      overhead.push({ top, thickness: STAIR_TREAD_THICKNESS });
    }
  }
  for (const base of [0, STOREY]) {
    if (inRect(x, z, { minX: -0.7, maxX: 3.1, minZ: -6.9, maxZ: -5.5 })) {
      heights.push(base + 1.8);
      overhead.push({ top: base + 1.8, thickness: 0.2 });
    }
  }
  const candidates = heights.filter(h => h <= previousY + 0.24 && h >= previousY - 0.3);
  if (!candidates.length) return null;
  const support = Math.max(...candidates);
  // Walking under a tall flight is fine, but one's head cannot pass through its
  // low end. The supported tread itself is excluded from the headroom test.
  if (overhead.some(surface => surface.top > support + 0.24 && surface.top - surface.thickness < support + headHeight)) return null;
  return support;
}
export function villaCollides(p: VillaPosition, colliders: readonly VillaCollider[], height = 1.55): boolean {
  return colliders.some(c => {
    if (p.y + height <= c.minY + 0.02 || p.y >= c.maxY - 0.025) return false;
    const narrow = colliderNarrowPhases.get(c);
    if (narrow) return narrow(p, height);
    const x = Math.max(c.minX, Math.min(p.x, c.maxX));
    const z = Math.max(c.minZ, Math.min(p.z, c.maxZ));
    return (p.x - x) ** 2 + (p.z - z) ** 2 < PLAYER_RADIUS ** 2;
  });
}
/** Substeps prevent tunnelling; split axes slide naturally along walls and furniture. */
export function moveVillaPlayer(position: VillaPosition, dx: number, dz: number, colliders: readonly VillaCollider[], supportAt = villaSupportAt, height = 1.55): VillaPosition {
  const p = { ...position };
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return p;
  const distance = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(distance / 0.09));
  if (steps > 2048) return p;
  for (let i = 0; i < steps; i++) {
    for (const axis of ['x', 'z'] as const) {
      const next = { ...p, [axis]: p[axis] + (axis === 'x' ? dx : dz) / steps };
      const support = supportAt(next.x, next.z, p.y);
      if (support == null) continue;
      next.y = support;
      if (!villaCollides(next, colliders, height)) Object.assign(p, next);
    }
  }
  return p;
}

export interface VillaHotspot { id: 'fireplace' | 'aquarium' | 'gaming' | 'tea' | 'roof' | 'car' | 'racing' | 'scooter' | 'media' | 'figures' | 'replicas' | 'elevator' | 'snooker' | 'faucet' | 'tea-bar' | 'pickup' | 'swing' | 'camping-chair' | 'wardrobe-master' | 'fridge-freezer' | `sofa-${string}` | `lounger-${string}` | `chair-${string}` | `stool-${string}` | `bed-${string}` | `pet-${VillaPetId}`; x: number; y: number; z: number; name: string; zh: string; radius?: number }
export const VILLA_HOTSPOTS: readonly VillaHotspot[] = [
  ...VILLA_ELEVATOR.floors.map(y => ({ id: 'elevator' as const, x: VILLA_ELEVATOR.centerX, y, z: VILLA_ELEVATOR.frontZ + 0.72, radius: 1.05, name: 'Call the elevator', zh: '呼叫电梯' })),
  { id: 'fireplace', x: -10, y: 0, z: 1.7, name: 'Light / extinguish the fireplace', zh: '点燃 / 熄灭壁炉' },
  { id: 'aquarium', ...VILLA_AQUARIUM.approach, name: 'Feed the fish', zh: '喂喂小鱼' },
  ...VILLA_RELAX_SEATS.map(seat => ({ id: seat.id as VillaHotspot['id'], ...seat.seat, radius: seat.kind === 'sofa' ? 1.7 : 1.35,
    name: seat.kind === 'bed' ? 'Lie on the bed' : seat.kind === 'sofa' ? 'Sit on the sofa' : seat.kind === 'lounger' ? 'Relax by the pool' : 'Sit on the chair',
    zh: seat.kind === 'bed' ? '躺在床上' : seat.kind === 'sofa' ? '坐在沙发上' : seat.kind === 'lounger' ? '躺在池畔休息' : '坐下休息' })),
  { id: 'scooter', x: VILLA_SCOOTER.center.x + 1, y: 0, z: VILLA_SCOOTER.center.z - .23, radius: 1.15, name: 'Ride the electric scooter', zh: '骑上电动车' },
  { id: 'faucet', x: -5.67, y: 0, z: -7.2, radius: 1.05, name: 'Kitchen tap on / off', zh: '开关厨房水龙头' },
  { id: 'tea-bar', ...VILLA_TEA_BAR.approach, radius: 1.1, name: 'Brew a pot of tea', zh: '冲一壶茶' },
  { id: 'gaming', x: 6.65, y: 0, z: 4.3, radius: .75, name: 'Switch the gaming setup on / off', zh: '开关电竞设备' },
  { id: 'car', ...VILLA_CAR.door, radius: 1.75, name: 'Open the driver door / take a seat', zh: '打开驾驶位车门 / 入座' },
  { id: 'pickup', ...VILLA_PICKUP.door, radius: 2.15, name: 'Drive the pickup', zh: '驾驶皮卡' },
  { id: 'racing', ...VILLA_RACING.exit, radius: 1.2, name: 'Sit in the simulator', zh: '坐进驾驶模拟器' },
  { id: 'media', x: 7.5, y: 0, z: 8.25, radius: 1.25, name: 'Screen input: PC / PlayStation / Switch', zh: '大屏信号源：PC / PlayStation / Switch' },
  { id: 'figures', x: 3.1, y: 0, z: 6.45, radius: 1.25, name: 'Original anime figure collection · display lights', zh: '原创动漫美少女手办 · 开关柜灯' },
  { id: 'snooker', x: 9.15, y: 0, z: -.95, radius: 1.1, name: 'Play snooker practice', zh: '开始斯诺克练习' },
  { id: 'replicas', x: 10.35, y: 0, z: 4.1, radius: 1.15, name: 'Replica collection · display lights', zh: '仿真武器收藏 · 开关柜灯' },
  { id: 'tea', x: -8, y: 0, z: 3.6, name: 'A moment for warm tea', zh: '喝一杯热茶' },
  { id: 'roof', x: -7, y: 7.2, z: 3.4, name: 'Enjoy the rooftop evening', zh: '享受天台晚风' },
];
export function nearestVillaHotspot(p: VillaPosition, car?: { door: VillaPosition; driverSide: boolean }, scooter?: VillaPosition, pickup?: { door: VillaPosition; driverSide: boolean }): VillaHotspot | null {
  let nearest: VillaHotspot | null = null;
  let distance = Infinity;
  for (const original of VILLA_HOTSPOTS) {
    let h = original.id === 'car' && car ? { ...original, ...car.door }
      : original.id === 'pickup' && pickup ? { ...original, ...pickup.door }
        : original.id === 'scooter' && scooter ? { ...original, ...scooter } : original;
    const seat = villaRelaxSeat(h.id);
    if (seat) {
      let point = resolveVillaSeatPosition(seat, p);
      if (seat.kind === 'bed') {
        const dx = p.x - seat.origin.x, dz = p.z - seat.origin.z, c = Math.cos(seat.yaw), s = Math.sin(seat.yaw);
        const x = Math.max(-seat.width / 2, Math.min(seat.width / 2, dx * c - dz * s));
        const z = Math.max(-seat.depth / 2, Math.min(seat.depth / 2, dx * s + dz * c));
        point = { x: seat.origin.x + c * x + s * z, y: seat.origin.y, z: seat.origin.z - s * x + c * z };
      }
      h = { ...h, ...point };
    }
    if (Math.abs(h.y - p.y) > 0.4) continue;
    if (h.id === 'car' && (car ? !car.driverSide : p.x < VILLA_CAR.body.maxX)) continue;
    if (h.id === 'pickup' && (pickup ? !pickup.driverSide : p.x < VILLA_PICKUP.body.maxX)) continue;
    if (h.id === 'elevator' && (p.z < VILLA_ELEVATOR.frontZ + 0.12 || Math.abs(p.x - VILLA_ELEVATOR.centerX) > 0.85)) continue;
    const d = Math.hypot(h.x - p.x, h.z - p.z);
    if (d < (h.radius ?? 2.4) && d < distance) { nearest = h; distance = d; }
  }
  return nearest;
}
