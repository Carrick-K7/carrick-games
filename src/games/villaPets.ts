import type { VillaCollider, VillaPosition } from './villaWorld.js';

export type VillaPetKind = 'dog' | 'cat' | 'parrot' | 'rabbit';
export type VillaPetMode = 'idle' | 'exploring' | 'approaching' | 'eating' | 'happy';
export const VILLA_PET_KINDS: readonly VillaPetKind[] = ['dog', 'cat', 'parrot', 'rabbit'];
/** Bounds contain the entire pet, including wings/tails, not only its centre. */
export const VILLA_PET_LAWN = { minX: -20.6, maxX: -3.4, minZ: 12.8, maxZ: 22 } as const;
export const VILLA_PET_RADIUS = 0.4;
export const VILLA_PET_FEED_RANGE = 2.2;
export const VILLA_PET_FEED_COOLDOWN = 8;
export const VILLA_PET_FOOD: Readonly<Record<VillaPetKind, string>> = {
  dog: 'kibble', cat: 'kibble', parrot: 'seeds', rabbit: 'hay and greens',
};
/** Localized interaction copy; models contain no rendered text. */
export const VILLA_PET_LABELS = {
  dog: { en: 'Puppy', zh: '小狗', foodEn: 'Dog kibble', foodZh: '狗粮' },
  cat: { en: 'Cat', zh: '小猫', foodEn: 'Cat kibble', foodZh: '猫粮' },
  parrot: { en: 'Parrot', zh: '鹦鹉', foodEn: 'Seeds', foodZh: '种子' },
  rabbit: { en: 'Rabbit', zh: '兔子', foodEn: 'Hay and greens', foodZh: '干草和青菜' },
} as const;
export interface VillaPet extends VillaPosition {
  kind: VillaPetKind; yaw: number; mode: VillaPetMode;
  fed: boolean; feedCount: number; cooldown: number; food: string;
  speed: number; gait: number; timer: number; targetX: number; targetZ: number;
  flightHeight: number; seed: number;
}
export interface VillaPetsState {
  pets: VillaPet[];
  /** Latest ground-level visitor position; feeding requires advance() to supply it. */
  visitor: VillaPosition | null;
  /** Live, read-only scene/car boxes. Never include this model's own drivingColliders. */
  colliders: readonly VillaCollider[];
  time: number;
  /** Discrete cache invalidation token: increments only on successful feeding. */
  feedSequence: number;
}
const SPEED: Record<VillaPetKind, number> = { dog: 0.66, cat: 0.43, parrot: 0.52, rabbit: 0.58 };
const STARTS = [[-16, 18], [-15, 15], [-13, 14], [-18, 16]] as const;
export function createVillaPets(): VillaPetsState {
  return { time: 0, feedSequence: 0, visitor: null, colliders: [], pets: VILLA_PET_KINDS.map((kind, i) => ({
    kind, x: STARTS[i][0], y: 0, z: STARTS[i][1], yaw: i * 1.4,
    mode: 'idle', fed: false, feedCount: 0, cooldown: 0, food: VILLA_PET_FOOD[kind],
    speed: 0, gait: i, timer: 0.6 + i * 0.4, targetX: STARTS[i][0], targetZ: STARTS[i][1],
    flightHeight: 0, seed: 1709 + i * 7919,
  })) };
}
function random(pet: VillaPet): number {
  pet.seed = (Math.imul(pet.seed, 1664525) + 1013904223) >>> 0;
  return pet.seed / 4294967296;
}
function inLawn(x: number, z: number): boolean {
  const b = VILLA_PET_LAWN, r = VILLA_PET_RADIUS;
  return x >= b.minX + r && x <= b.maxX - r && z >= b.minZ + r && z <= b.maxZ - r;
}
/** Slab intersection, including zero-length segments: no endpoint-only tunnelling. */
function hitsBox(ax: number, az: number, bx: number, bz: number, c: VillaCollider, pad: number): boolean {
  // Most supplied scene boxes are far from the lawn: reject without slab allocations.
  if (Math.max(ax, bx) < c.minX - pad || Math.min(ax, bx) > c.maxX + pad
    || Math.max(az, bz) < c.minZ - pad || Math.min(az, bz) > c.maxZ + pad) return false;
  let lo = 0, hi = 1;
  for (const [a, delta, min, max] of [
    [ax, bx - ax, c.minX - pad, c.maxX + pad],
    [az, bz - az, c.minZ - pad, c.maxZ + pad],
  ]) {
    if (Math.abs(delta) < 1e-10) { if (a < min || a > max) return false; }
    else {
      const t0 = (min - a) / delta, t1 = (max - a) / delta;
      lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
      if (lo > hi) return false;
    }
  }
  return true;
}
function blocksLawn(c: VillaCollider): boolean {
  // Reserve the whole low flight corridor: birds cannot fly over a vegetable bed/car.
  return c.maxY > 0.025 && c.minY < 1.65;
}
function pathClear(ax: number, az: number, bx: number, bz: number, colliders: readonly VillaCollider[], pad: number): boolean {
  return !colliders.some(c => blocksLawn(c) && hitsBox(ax, az, bx, bz, c, pad));
}
function reachablePet(pet: VillaPet, p: VillaPosition, colliders: readonly VillaCollider[]): boolean {
  return [p.x, p.y, p.z].every(Number.isFinite) && Math.abs(p.y) <= 0.25
    && (pet.kind !== 'parrot' || pet.y <= 0.08)
    && Math.hypot(p.x - pet.x, p.z - pet.z) <= VILLA_PET_FEED_RANGE
    && pathClear(p.x, p.z, pet.x, pet.z, colliders, 0.025);
}
export function nearestVillaPet(state: VillaPetsState, p: VillaPosition, colliders: readonly VillaCollider[] = state.colliders): VillaPet | null {
  let nearest: VillaPet | null = null, distance = Infinity;
  for (const pet of state.pets) {
    const d = Math.hypot(p.x - pet.x, p.z - pet.z);
    if (d < distance && reachablePet(pet, p, colliders)) { nearest = pet; distance = d; }
  }
  return nearest;
}
/** Feed only a currently close, unobstructed pet; repeated input never resets its reaction. */
export function feedVillaPet(state: VillaPetsState, kind: VillaPetKind): boolean {
  const pet = state.pets.find(p => p.kind === kind);
  if (!pet || !state.visitor || pet.cooldown > 0 || !reachablePet(pet, state.visitor, state.colliders)) return false;
  pet.fed = true; pet.feedCount++; state.feedSequence++; pet.cooldown = VILLA_PET_FEED_COOLDOWN;
  pet.mode = 'approaching'; pet.timer = 1.2; pet.flightHeight = 0;
  pet.targetX = state.visitor.x; pet.targetZ = state.visitor.z;
  return true;
}
function explore(pet: VillaPet, colliders: readonly VillaCollider[]): void {
  const b = VILLA_PET_LAWN, r = VILLA_PET_RADIUS + 0.15;
  // Bounded retries; enclosed animals simply rest rather than teleporting out.
  for (let i = 0; i < 12; i++) {
    const x = b.minX + r + random(pet) * (b.maxX - b.minX - 2 * r);
    const z = b.minZ + r + random(pet) * (b.maxZ - b.minZ - 2 * r);
    if (!pathClear(x, z, x, z, colliders, VILLA_PET_RADIUS)) continue;
    pet.targetX = x; pet.targetZ = z; pet.mode = 'exploring'; pet.timer = 4 + random(pet) * 5;
    pet.flightHeight = pet.kind === 'parrot' && random(pet) < 0.55 ? 0.65 : 0;
    return;
  }
  pet.mode = 'idle'; pet.timer = 1; pet.flightHeight = 0;
}
function segmentDistance(ax: number, az: number, bx: number, bz: number, x: number, z: number): number {
  const dx = bx - ax, dz = bz - az, squared = dx * dx + dz * dz;
  const t = squared ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / squared)) : 0;
  return Math.hypot(ax + dx * t - x, az + dz * t - z);
}
function move(pet: VillaPet, state: VillaPetsState, dt: number): void {
  const dx = pet.targetX - pet.x, dz = pet.targetZ - pet.z, distance = Math.hypot(dx, dz);
  const stop = pet.mode === 'approaching' ? 0.7 : 0.18;
  if (distance <= stop) {
    pet.timer = 0; return;
  }
  const angle = Math.atan2(dx, dz), step = Math.min(distance - stop, SPEED[pet.kind] * dt);
  const side = pet.kind === 'cat' || pet.kind === 'rabbit' ? -1 : 1;
  for (const offset of [0, 0.45, -0.45, 0.95, -0.95, 1.5, -1.5, 2.3, -2.3, Math.PI]) {
    const heading = angle + offset * side;
    const x = pet.x + Math.sin(heading) * step, z = pet.z + Math.cos(heading) * step;
    if (!inLawn(x, z) || !pathClear(pet.x, pet.z, x, z, state.colliders, VILLA_PET_RADIUS)) continue;
    if (state.pets.some(other => other !== pet && segmentDistance(pet.x, pet.z, x, z, other.x, other.z) < 2 * VILLA_PET_RADIUS + 0.05)) continue;
    pet.x = x; pet.z = z; pet.speed = step / dt;
    const turn = Math.atan2(Math.sin(heading - pet.yaw), Math.cos(heading - pet.yaw));
    pet.yaw += Math.max(-dt * 5, Math.min(dt * 5, turn));
    return;
  }
  // Yield without pushing, chasing or clipping through another animal/obstacle.
  if (pet.mode === 'exploring') { pet.mode = 'idle'; pet.timer = 0.5 + random(pet) * 0.7; pet.flightHeight = 0; }
}
/**
 * Seconds, deterministic for identical calls. Invalid/nonpositive dt is ignored.
 * At most two seconds are simulated per call (suspended tabs discard backlog),
 * in <=1/30s swept steps. Cars must stop before overlapping pets: a collider
 * inserted on top of a pet causes it to wait, never an arbitrary escape teleport.
 */
export function advanceVillaPets(state: VillaPetsState, dt: number, colliders: readonly VillaCollider[], visitor?: VillaPosition): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  state.colliders = colliders;
  state.visitor = visitor && [visitor.x, visitor.y, visitor.z].every(Number.isFinite) ? { ...visitor } : null;
  const elapsed = Math.min(dt, 2), steps = Math.ceil(elapsed * 30), h = elapsed / steps;
  for (let i = 0; i < steps; i++) {
    state.time += h;
    for (const pet of state.pets) {
      pet.cooldown = Math.max(0, pet.cooldown - h); pet.timer -= h; pet.speed = 0;
      const visitor = state.visitor;
      // A nearby visitor gets a calm greeting, not a moving target. Airborne birds
      // also notice the visitor and gently land; no following/chasing is required.
      if ((pet.mode === 'idle' || pet.mode === 'exploring') && visitor && Math.abs(visitor.y) <= 0.25
        && Math.hypot(visitor.x - pet.x, visitor.z - pet.z) <= VILLA_PET_FEED_RANGE
        && pathClear(pet.x, pet.z, visitor.x, visitor.z, colliders, 0.025)) {
        pet.mode = 'idle'; pet.timer = 0.75; pet.flightHeight = 0;
        const heading = Math.atan2(visitor.x - pet.x, visitor.z - pet.z);
        const turn = Math.atan2(Math.sin(heading - pet.yaw), Math.cos(heading - pet.yaw));
        pet.yaw += Math.max(-h * 1.4, Math.min(h * 1.4, turn));
      }
      if (pet.timer <= 0) {
        if (pet.mode === 'approaching') { pet.mode = 'eating'; pet.timer = 1.8; }
        else if (pet.mode === 'eating') { pet.mode = 'happy'; pet.timer = 1.5; }
        else if (pet.mode === 'idle') explore(pet, colliders);
        else { pet.mode = 'idle'; pet.timer = 0.9 + random(pet) * 2.2; pet.flightHeight = 0; }
      }
      if (pet.mode === 'exploring' || pet.mode === 'approaching') move(pet, state, h);
      pet.gait += h * (pet.speed > 0 ? 9 : 2);
      if (pet.kind === 'parrot') {
        const target = pet.mode === 'exploring' ? pet.flightHeight : 0;
        pet.y += Math.max(-h * 0.4, Math.min(h * 0.4, target - pet.y));
      } else pet.y = pet.kind === 'rabbit' && pet.speed > 0 ? Math.max(0, Math.sin(pet.gait)) * 0.11 : 0;
    }
  }
}
