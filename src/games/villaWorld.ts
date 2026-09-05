/** Shared metre-scale architecture and walk surfaces: rendering and collision agree. */
export interface VillaCollider {
  minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number;
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
export const STAIR_HOLE = { minX: 2.15, maxX: 6.25, minZ: -7, maxZ: 0.5 };
export const POOL = { minX: -22, maxX: -14.5, minZ: -6, maxZ: 5 };
export const VILLA_RAMPS: VillaRamp[] = [0, STOREY].flatMap(base => [
  { minX: 2.3, maxX: 4.08, startZ: 0.5, endZ: -5.5, bottom: base, top: base + 1.8, base },
  { minX: 4.32, maxX: 6.1, startZ: -5.5, endZ: 0.5, bottom: base + 1.8, top: base + STOREY, base },
]);
export const VILLA_ROOMS: VillaRoom[] = [
  { id: 'living', name: 'Living room', zh: '客厅 · 壁炉与茶', floor: 0, minX: -12, maxX: -2, minZ: 0, maxZ: 9 },
  { id: 'kitchen', name: 'Kitchen & dining', zh: '厨房 · 餐厅', floor: 0, minX: -12, maxX: -2, minZ: -9, maxZ: 0 },
  { id: 'gaming', name: 'Gaming room', zh: '电竞房', floor: 0, minX: 2, maxX: 12, minZ: 3, maxZ: 9 },
  { id: 'garage', name: 'Garage & workshop', zh: '车库 · 工具间', floor: 0, minX: 12, maxX: 20, minZ: -8, maxZ: 2 },
  { id: 'master', name: 'Primary bedroom', zh: '主卧', floor: 1, minX: -12, maxX: -2, minZ: 0, maxZ: 9 },
  { id: 'guest', name: 'Guest bedroom', zh: '次卧', floor: 1, minX: -12, maxX: -2, minZ: -9, maxZ: 0 },
  { id: 'bath', name: 'Bath & laundry', zh: '浴室 · 洗衣间', floor: 1, minX: 6.5, maxX: 12, minZ: -9, maxZ: 1 },
  { id: 'library', name: 'Reading lounge', zh: '书房 · 阅读角', floor: 1, minX: 2, maxX: 12, minZ: 3, maxZ: 9 },
  { id: 'balcony', name: 'Bedroom balcony', zh: '卧室阳台', floor: 1, minX: -11.5, maxX: 1.5, minZ: 9, maxZ: 11.5 },
  { id: 'terrace', name: 'Roof garden', zh: '天台 · 空中花园', floor: 2, minX: -12, maxX: 12, minZ: -9, maxZ: 9 },
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
    piece(cursor, opening.from, 0, 3.4);
    piece(opening.from, opening.to, 3, 0.4);
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
      piece(opening.from - 0.05, opening.from, 0, 3, 'oak', 0.27);
      piece(opening.to, opening.to + 0.05, 0, 3, 'oak', 0.27);
      piece(opening.from, opening.to, 2.96, 0.06, 'oak', 0.27);
    }
    cursor = opening.to;
  }
  piece(cursor, to, 0, 3.4);
}

// Ground floor facade, with four actual entrances, not painted-on doors.
wall('x', 9, -12, 12, 0, [{ from: -11, to: -3 }, { from: -1.45, to: 1.45, door: true }, { from: 3, to: 11 }]);
wall('x', -9, -12, 12, 0, [{ from: -11, to: -3 }, { from: -1.45, to: 1.45, door: true }, { from: 7, to: 11 }]);
wall('z', -12, -9, 9, 0, [{ from: -8, to: -1 }, { from: 1, to: 2.3 }, { from: 2.5, to: 5.2, door: true }, { from: 5.5, to: 8 }]);
wall('z', 12, -9, 9, 0, [{ from: -7, to: -3 }, { from: -0.8, to: 1.8, door: true }, { from: 4, to: 8 }]);
wall('x', 3, 2, 12, 0, [{ from: 3, to: 5.5, door: true }]);
wall('z', 2, 3, 9, 0);
// Two private bedrooms, a bathroom and a library off the upstairs gallery.
wall('x', 9, -12, 12, STOREY, [{ from: -11, to: -8.8 }, { from: -8.5, to: -6.2, door: true }, { from: -5.9, to: 1 }, { from: 3, to: 11 }]);
wall('x', -9, -12, 12, STOREY, [{ from: -11, to: -3 }, { from: -1.3, to: 1.3 }, { from: 7, to: 11 }]);
wall('z', -12, -9, 9, STOREY, [{ from: -8, to: -1 }, { from: 1, to: 8 }]);
wall('z', 12, -9, 9, STOREY, [{ from: -8, to: -2 }, { from: 4, to: 8 }]);
wall('z', -2, -9, 9, STOREY, [{ from: -4.8, to: -2.5, door: true }, { from: 1.5, to: 3.8, door: true }]);
wall('x', 0, -12, -2, STOREY);
wall('x', 3, 2, 12, STOREY, [{ from: 3, to: 5.5, door: true }]);
wall('z', 2, 3, 9, STOREY);
wall('z', 6.5, -9, 1, STOREY);
wall('x', 1, 6.5, 12, STOREY, [{ from: 7.3, to: 9.4, door: true }]);
// Attached garage: wide, always-open rolling door and internal access.
wall('z', 20, -8, 2, 0, [{ from: -6.5, to: -3 }]);
wall('x', -8, 12, 20, 0);
wall('x', 2, 12, 20, 0, [{ from: 14, to: 18.5, door: true }]);
add(16, 3.5, -3, 8.4, 0.22, 10.4, 'roof', false);

// Slabs stop at the stairwell: there is no invisible ceiling across either flight.
for (const y of [STOREY, STOREY * 2]) {
  add(-4.925, y - 0.1, 0, 14.15, 0.2, 18.4, y === STOREY ? 'oak' : 'stone', false);
  add(9.225, y - 0.1, 0, 5.95, 0.2, 18.4, y === STOREY ? 'oak' : 'stone', false);
  add(4.2, y - 0.1, -8.1, 4.1, 0.2, 2.2, 'stone', false);
  add(4.2, y - 0.1, 4.85, 4.1, 0.2, 8.7, y === STOREY ? 'oak' : 'stone', false);
}
add(0, -0.13, 0, 24.4, 0.26, 18.4, 'oak', false);
add(-5, STOREY - 0.1, 10.25, 13, 0.2, 2.5, 'stone', false);
// Layered fascia and timber accent fins make a composed modern exterior.
for (const y of [3.42, 7.02]) {
  add(0, y, 9.2, 24.8, 0.19, 0.48, 'stone', false);
  add(0, y, -9.2, 24.8, 0.19, 0.48, 'stone', false);
  add(-12.2, y, 0, 0.48, 0.19, 18.4, 'stone', false);
  add(12.2, y, 0, 0.48, 0.19, 18.4, 'stone', false);
}
for (let x = -2.65; x <= -1.65; x += 0.16) add(x, 3.5, 9.17, 0.07, 6.9, 0.14, 'oak', false);
add(0, 2.94, 10, 3.8, 0.14, 2.2, 'oak', false);
// Third-storey glazed stair pavilion; both stairs open onto the terrace at the front.
wall('z', 1.85, -7.35, 1.25, 7.2, [{ from: -6.9, to: 0.9 }]);
wall('z', 6.55, -7.35, 1.25, 7.2, [{ from: -6.9, to: 0.9 }]);
wall('x', -7.35, 1.85, 6.55, 7.2, [{ from: 2.2, to: 6.2 }]);
add(4.2, 10.6, -3.05, 5.1, 0.2, 9.1, 'roof', false);

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
  rail(2.19, -6.2, 0.09, 1.4, base + 1.8);
  rail(6.21, -6.2, 0.09, 1.4, base + 1.8);
  rail(4.2, -6.93, 4.05, 0.09, base + 1.8);
}
// Floor-level guards stop a player stepping sideways into the open stairwell.
for (const y of [3.6, 7.2]) {
  rail(2.13, -3.25, 0.08, 7.5, y);
  rail(6.27, -3.25, 0.08, 7.5, y);
  rail(4.2, -7.03, 4.2, 0.08, y);
  rail(4.2, 0.51, 0.16, 0.12, y);
}
// Rooftop and bedroom balcony glass balustrades.
rail(0, 8.95, 24, 0.12, 7.2, 1.1);
rail(0, -8.95, 24, 0.12, 7.2, 1.1);
rail(-11.95, 0, 0.12, 18, 7.2, 1.1);
rail(11.95, 0, 0.12, 18, 7.2, 1.1);
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
  if (inRect(p.x, p.z, STAIR_HOLE)) return { id: 'stairs', name: 'Oak staircase', zh: '橡木楼梯' };
  const room = VILLA_ROOMS.find(r => r.floor === floor && inRect(p.x, p.z, r));
  if (room) return room;
  if (floor === 0 && !inRect(p.x, p.z, { minX: -12.2, maxX: 12.2, minZ: -9.2, maxZ: 9.2 })) {
    return p.x < -12 ? { id: 'garden', name: 'Pool garden', zh: '花园 · 泳池' } : { id: 'garden', name: 'Welcome home', zh: '庭院 · 欢迎回家' };
  }
  return { id: 'gallery', name: 'Sunlit gallery', zh: '采光走廊' };
}

/**
 * Select a nearby support first, then check headroom against thin floating treads.
 * A higher stacked flight is not a solid column down to its storey's floor: doing
 * that would block both ascent and descent precisely at y=3.6. The visible stair
 * construction uses the same thin tread/landing thickness and open underside.
 */
export function villaSupportAt(x: number, z: number, previousY: number): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(previousY)) return null;
  if (x < -24.5 || x > 24.5 || z < -16.5 || z > 23.5) return null;
  if (inRect(x, z, POOL, PLAYER_RADIUS)) return null;
  const heights: number[] = [0];
  const overhead: { top: number; thickness: number }[] = [];
  for (const y of [STOREY, STOREY * 2]) {
    if (inRect(x, z, { minX: -12.1, maxX: 12.1, minZ: -9.1, maxZ: 9.1 }) && !inRect(x, z, STAIR_HOLE)) heights.push(y);
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
    if (inRect(x, z, { minX: 2.3, maxX: 6.1, minZ: -6.9, maxZ: -5.5 })) {
      heights.push(base + 1.8);
      overhead.push({ top: base + 1.8, thickness: 0.2 });
    }
  }
  const candidates = heights.filter(h => h <= previousY + 0.24 && h >= previousY - 0.3);
  if (!candidates.length) return null;
  const support = Math.max(...candidates);
  // Walking under a tall flight is fine, but one's head cannot pass through its
  // low end. The supported tread itself is excluded from the headroom test.
  if (overhead.some(surface => surface.top > support + 0.24 && surface.top - surface.thickness < support + EYE_HEIGHT + 0.1)) return null;
  return support;
}
export function villaCollides(p: VillaPosition, colliders: readonly VillaCollider[]): boolean {
  return colliders.some(c => {
    if (p.y + 1.55 <= c.minY + 0.02 || p.y >= c.maxY - 0.025) return false;
    const x = Math.max(c.minX, Math.min(p.x, c.maxX));
    const z = Math.max(c.minZ, Math.min(p.z, c.maxZ));
    return (p.x - x) ** 2 + (p.z - z) ** 2 < PLAYER_RADIUS ** 2;
  });
}
/** Substeps prevent tunnelling; split axes slide naturally along walls and furniture. */
export function moveVillaPlayer(position: VillaPosition, dx: number, dz: number, colliders: readonly VillaCollider[]): VillaPosition {
  const p = { ...position };
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return p;
  const distance = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(distance / 0.09));
  if (steps > 2048) return p;
  for (let i = 0; i < steps; i++) {
    for (const axis of ['x', 'z'] as const) {
      const next = { ...p, [axis]: p[axis] + (axis === 'x' ? dx : dz) / steps };
      const support = villaSupportAt(next.x, next.z, p.y);
      if (support == null) continue;
      next.y = support;
      if (!villaCollides(next, colliders)) Object.assign(p, next);
    }
  }
  return p;
}

export interface VillaHotspot { id: 'fireplace' | 'aquarium' | 'gaming' | 'tea' | 'roof'; x: number; y: number; z: number; name: string; zh: string }
export const VILLA_HOTSPOTS: readonly VillaHotspot[] = [
  { id: 'fireplace', x: -10, y: 0, z: 1.7, name: 'Light / extinguish the fireplace', zh: '点燃 / 熄灭壁炉' },
  { id: 'aquarium', x: -3.5, y: 0, z: 2, name: 'Feed the fish', zh: '喂喂小鱼' },
  { id: 'gaming', x: 8, y: 0, z: 5.3, name: 'Switch the gaming setup on / off', zh: '开关电竞设备' },
  { id: 'tea', x: -8, y: 0, z: 3.6, name: 'A moment for warm tea', zh: '喝一杯热茶' },
  { id: 'roof', x: -7, y: 7.2, z: 3.4, name: 'Enjoy the rooftop evening', zh: '享受天台晚风' },
];
export function nearestVillaHotspot(p: VillaPosition): VillaHotspot | null {
  let nearest: VillaHotspot | null = null;
  let distance = 2.4;
  for (const h of VILLA_HOTSPOTS) {
    if (Math.abs(h.y - p.y) > 0.4) continue;
    const d = Math.hypot(h.x - p.x, h.z - p.z);
    if (d < distance) { nearest = h; distance = d; }
  }
  return nearest;
}
