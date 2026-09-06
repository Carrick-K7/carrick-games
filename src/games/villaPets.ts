import type { VillaCollider, VillaPosition } from './villaWorld.js';

export type VillaPetKind = 'dog' | 'cat' | 'parrot' | 'rabbit';
export type VillaPetId = VillaPetKind | 'parrot-blue';
export const VILLA_PET_IDS: readonly VillaPetId[] = ['dog', 'cat', 'parrot', 'rabbit', 'parrot-blue'];
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
  id: VillaPetId; kind: VillaPetKind; yaw: number; mode: VillaPetMode;
  /** Independent excursion clock and waypoint cursor; feeding pauses, not cancels, a visit. */
  visitTimer: number; visit: 'lawn' | 'outbound' | 'living' | 'returning'; waypoint: number;
  wingPhase: number; wingFold: number; verticalSpeed: number; bank: number;
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
const STARTS = [[-16, 18], [-15, 15], [-13, 14], [-18, 16], [-16.5, 13.5]] as const;
/** Front opening is x ±1.45 at z=9. The east living aisle avoids sofa, table and aquarium. */
export const VILLA_PET_VISIT_ROUTE = [[-13, 14.5], [-3, 14.5], [0, 11.5], [0, 6.5], [-4.6, 6.5], [-4.6, 4.5]] as const;
export function createVillaPets(): VillaPetsState {
  return { time: 0, feedSequence: 0, visitor: null, colliders: [], pets: VILLA_PET_IDS.map((id, i) => {
    const kind: VillaPetKind = id === 'parrot-blue' ? 'parrot' : id;
    return {
      id, kind, x: STARTS[i][0], y: 0, z: STARTS[i][1], yaw: i * 1.4,
      visitTimer: 18 + i * 23, visit: 'lawn', waypoint: 0,
      wingPhase: i * 1.7, wingFold: 0, verticalSpeed: 0, bank: 0,
      mode: 'idle', fed: false, feedCount: 0, cooldown: 0, food: VILLA_PET_FOOD[kind],
      speed: 0, gait: i, timer: 0.6 + i * 0.4, targetX: STARTS[i][0], targetZ: STARTS[i][1],
      flightHeight: 0, seed: 1709 + i * 7919,
    };
  }) };
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
export function feedVillaPet(state: VillaPetsState, id: VillaPetId): boolean {
  const pet = state.pets.find(p => p.id === id);
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
/** A tiny authored navigation graph, not a per-frame world search. Every edge is
 * validated against live furniture/doors/cars; a blocked animal waits in place. */
function visitStep(pet: VillaPet, state: VillaPetsState): boolean {
  if (pet.kind !== 'dog' && pet.kind !== 'cat') return false;
  const route = VILLA_PET_VISIT_ROUTE;
  if (pet.visit === 'lawn') {
    if (pet.visitTimer > 0) return false;
    // Single-file front-door etiquette prevents opposite-direction deadlocks.
    if (state.pets.some(other => other !== pet && other.visit !== 'lawn')) return false;
    pet.visitTimer = 8;
    if (!pathClear(pet.x, pet.z, route[0][0], route[0][1], state.colliders, VILLA_PET_RADIUS)) return false;
    for (let i = 1; i < route.length; i++) {
      const from = route[i - 1], to = route[i];
      if (!pathClear(from[0], from[1], to[0], to[1], state.colliders, VILLA_PET_RADIUS)) return false;
    }
    pet.visit = 'outbound'; pet.waypoint = 0;
  }
  if (pet.visit === 'living') {
    pet.mode = 'idle'; pet.timer = 1;
    if (pet.visitTimer > 0) return true;
    pet.visit = 'returning'; pet.waypoint = route.length - 2;
  }
  const [x, z] = route[pet.waypoint];
  if (Math.hypot(pet.x - x, pet.z - z) < 0.19) {
    pet.waypoint += pet.visit === 'outbound' ? 1 : -1;
    if (pet.waypoint === route.length) {
      pet.visit = 'living'; pet.visitTimer = 8 + random(pet) * 8; pet.mode = 'idle'; pet.timer = 1; return true;
    }
    if (pet.waypoint < 0) {
      pet.visit = 'lawn'; pet.visitTimer = 90 + random(pet) * 70; pet.mode = 'idle'; pet.timer = 2; return true;
    }
  }
  [pet.targetX, pet.targetZ] = route[pet.waypoint];
  pet.mode = 'exploring'; pet.timer = 2;
  return true;
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
  const angle = Math.atan2(dx, dz);
  // Birds steer along their heading, rather than sliding sideways while turning.
  const bird = pet.kind === 'parrot';
  const turn = Math.atan2(Math.sin(angle - pet.yaw), Math.cos(angle - pet.yaw));
  if (bird) pet.yaw += Math.max(-dt * 2.4, Math.min(dt * 2.4, turn));
  pet.bank += ((bird && pet.y > 0.08 ? -turn * 0.18 : 0) - pet.bank) * Math.min(1, dt * 5);
  const cruise = bird ? (pet.y > 0.15 ? 0.66 : 0.3) * Math.max(0.15, Math.cos(turn)) : SPEED[pet.kind];
  const step = Math.min(distance - stop, cruise * dt);
  const side = pet.kind === 'cat' || pet.kind === 'rabbit' ? -1 : 1;
  const visiting = pet.visit !== 'lawn';
  const singleFile = visiting && (!inLawn(pet.x, pet.z) || !inLawn(pet.targetX, pet.targetZ));
  for (const offset of bird || singleFile ? [0] : [0, 0.45, -0.45, 0.95, -0.95, 1.5, -1.5, 2.3, -2.3, Math.PI]) {
    const heading = (bird ? pet.yaw : angle) + offset * side;
    const x = pet.x + Math.sin(heading) * step, z = pet.z + Math.cos(heading) * step;
    if ((!visiting && !inLawn(x, z)) || !pathClear(pet.x, pet.z, x, z, state.colliders, VILLA_PET_RADIUS)) continue;
    if (state.pets.some(other => other !== pet && segmentDistance(pet.x, pet.z, x, z, other.x, other.z) < 2 * VILLA_PET_RADIUS + 0.05)) continue;
    pet.x = x; pet.z = z; pet.speed = step / dt;
    const turn = Math.atan2(Math.sin(heading - pet.yaw), Math.cos(heading - pet.yaw));
    pet.yaw += Math.max(-dt * 5, Math.min(dt * 5, turn));
    return;
  }
  // Yield without pushing, chasing or clipping through another animal/obstacle.
  if (pet.mode === 'exploring') {
    pet.flightHeight = 0;
    // A bird can finish turning on its toes while blocked, not restart the turn
    // after every tiny failed step (which would permanently trap facing birds).
    if (!bird && !visiting) { pet.mode = 'idle'; pet.timer = 0.5 + random(pet) * 0.7; }
  }
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
      pet.visitTimer -= h;
      const reacting = pet.mode === 'approaching' || pet.mode === 'eating' || pet.mode === 'happy';
      if (!reacting) visitStep(pet, state);
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
      pet.gait += h * (pet.speed > 0 ? pet.kind === 'parrot' ? pet.speed * 24 : 9 : 2);
      if (pet.kind === 'parrot') {
        const remaining = Math.hypot(pet.targetX - pet.x, pet.targetZ - pet.z);
        const target = pet.mode === 'exploring' ? pet.flightHeight * Math.min(1, remaining / 0.9, Math.max(0, pet.timer) / 1.4) : 0;
        const desired = Math.max(-0.48, Math.min(0.48, (target - pet.y) * 3));
        pet.verticalSpeed += Math.max(-h * 1.4, Math.min(h * 1.4, desired - pet.verticalSpeed));
        pet.y = Math.max(0, Math.min(0.72, pet.y + pet.verticalSpeed * h));
        if (target === 0 && pet.y < 0.002) { pet.y = 0; pet.verticalSpeed = 0; }
        const spread = target > 0.03 || pet.y > 0.015 ? 1 : 0;
        pet.wingFold += Math.max(-h * 2.5, Math.min(h * 4, spread - pet.wingFold));
        pet.wingPhase += h * (pet.verticalSpeed > 0.03 ? 17 : pet.verticalSpeed < -0.03 ? 11 : 13);
        pet.bank *= Math.max(0, 1 - h * (pet.speed === 0 ? 5 : 0.5));
      } else pet.y = pet.kind === 'rabbit' && pet.speed > 0 ? Math.max(0, Math.sin(pet.gait)) * 0.11 : 0;
    }
  }
}
