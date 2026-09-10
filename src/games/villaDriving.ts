import { VILLA_CAR } from './villaActivities.js';
import { PLAYER_RADIUS, POOL, villaSupportAt, type VillaCollider, type VillaPosition } from './villaWorld.js';
import { VILLA_ESTATE_BOUNDS, villaEstateContains, villaPondContains, villaPondIntersectsPolygon, villaTerrainAnchor, villaTerrainBounds, villaTerrainHeight, villaTerrainOrientation } from './villaEstateLayout.js';

export interface VillaDrivingState {
  x: number; z: number; yaw: number; speed: number; steering: number;
  distance: number; collisions: number; contact: boolean; handbrake: boolean;
}
export interface VillaDrivingInput { throttle: number; steer: number; brake: boolean; handbrake?: boolean }
export const VILLA_DRIVING_BOUNDS = VILLA_ESTATE_BOUNDS;
export const VILLA_DRIVING_LIMITS = { halfWidth: 0.96, halfLength: 2.36, height: 1.48, wheelbase: 2.92, maxSpeed: 7, maxReverse: 3, maxSteer: 0.56 };
export const VILLA_SCENIC_ROAD = { x: 6, z: 39, radiusX: 15, radiusZ: 10.5, width: 8.4, drivewayWidth: 8.8 } as const;
export interface VillaDrivingProfile {
  readonly id: string;
  readonly limits: Readonly<typeof VILLA_DRIVING_LIMITS>;
  readonly spawn: { readonly x: number; readonly z: number };
  readonly seat: readonly [number, number];
  readonly exit: readonly [number, number];
  readonly door: readonly [number, number];
  readonly acceleration: number;
  readonly reverseAcceleration: number;
}
export const VILLA_SEDAN_PROFILE: VillaDrivingProfile = {
  id: 'sedan', limits: VILLA_DRIVING_LIMITS, spawn: VILLA_CAR.center,
  seat: [.43, .05], exit: [2.35, .15], door: [1, .4], acceleration: 2.1, reverseAcceleration: 1.5,
};
/** Always supplied internally: the pool is not a drivable ground surface. Pond
 * contact uses its actual ellipse, not a rectangular invisible garden wall. */
export const VILLA_DRIVING_FIXED_COLLIDERS: readonly VillaCollider[] = [{ ...POOL, minY: -2, maxY: 1 }];
const colliderOwners = new WeakMap<VillaCollider, string>();
/** Default remains SEDAN ONLY. A pickup never enters the sedan ownership set. */
export function registerVillaVehicleColliders(colliders: readonly VillaCollider[], profile = VILLA_SEDAN_PROFILE): void { colliders.forEach(c => colliderOwners.set(c, profile.id)); }
export function isVillaVehicleCollider(collider: VillaCollider, profile = VILLA_SEDAN_PROFILE): boolean { return colliderOwners.get(collider) === profile.id; }
export function createVillaDriving(profile = VILLA_SEDAN_PROFILE): VillaDrivingState {
  return { x: profile.spawn.x, z: profile.spawn.z, yaw: 0, speed: 0, steering: 0, distance: 0, collisions: 0, contact: false, handbrake: false };
}
export type VillaDrivingPose = Pick<VillaDrivingState, 'x' | 'z' | 'yaw'>;
const validPose = (pose: VillaDrivingPose) => [pose.x, pose.z, pose.yaw].every(Number.isFinite);
export function villaCarFootprint(pose: VillaDrivingPose, profile = VILLA_SEDAN_PROFILE) {
  const { halfWidth: w, halfLength: l } = profile.limits;
  return [[-w, -l], [w, -l], [w, l], [-w, l]].map(([x, z]) => villaTerrainAnchor(pose, x, z));
}
/** Ground-level camera base and exits use the same support as walking. Parent
 * adds the vehicle-specific eye height; alternative exit is local -X. */
export function villaCarAnchors(pose: VillaDrivingPose, profile = VILLA_SEDAN_PROFILE) {
  const transform = (p: readonly [number, number], side = 1) => villaTerrainAnchor(pose, p[0] * side, p[1]);
  const exits = [transform(profile.exit), transform(profile.exit, -1)];
  return { seat: transform(profile.seat), exit: exits[0]!, exits, door: transform(profile.door),
    body: villaTerrainBounds(pose, profile.limits.halfWidth, profile.limits.halfLength, profile.limits.height) };
}
/** Exact XZ capsule/rectangle contact: endpoint, edge crossing, rounded corners. */
export function villaVehicleCorridorTouchesBox(a: VillaPosition, b: VillaPosition, box: VillaCollider): boolean {
  const dx = b.x - a.x, dz = b.z - a.z;
  let lo = 0, hi = 1;
  for (const [origin, delta, min, max] of [[a.x, dx, box.minX, box.maxX], [a.z, dz, box.minZ, box.maxZ]]) {
    if (Math.abs(delta) < 1e-12) { if (origin < min || origin > max) { lo = 1; hi = 0; break; } }
    else { const t1 = (min - origin) / delta, t2 = (max - origin) / delta; lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2)); }
  }
  if (lo <= hi) return true;
  const r2 = PLAYER_RADIUS ** 2;
  for (const p of [a, b]) {
    const x = Math.max(box.minX, Math.min(p.x, box.maxX)), z = Math.max(box.minZ, Math.min(p.z, box.maxZ));
    if ((p.x - x) ** 2 + (p.z - z) ** 2 <= r2) return true;
  }
  const length2 = dx * dx + dz * dz;
  for (const x of [box.minX, box.maxX]) for (const z of [box.minZ, box.maxZ]) {
    const t = length2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / length2)) : 0;
    if ((x - a.x - t * dx) ** 2 + (z - a.z - t * dz) ** 2 <= r2) return true;
  }
  return false;
}
/** No snapping to a floor above/below the terrain, nor unsupported pond exits. */
export function villaVehicleGroundClear(x: number, z: number, height: number, radius = 0): boolean {
  if (!villaEstateContains(x, z, radius) || villaPondContains(x, z, radius)) return false;
  const probes = radius ? [[0, 0], [-radius, -radius], [-radius, radius], [radius, -radius], [radius, radius]] : [[0, 0]];
  return probes.every(([dx, dz]) => {
    const y = villaTerrainHeight(x + dx, z + dz), support = villaSupportAt(x + dx, z + dz, y, height);
    return support != null && Math.abs(support - y) < .001;
  });
}
/** Full standing route, not just a free endpoint beyond a wall. Only the current
 * vehicle's cabin/door is ignored. Caller interlocks the automatic door first. */
export function villaCarExitClear(state: VillaDrivingPose, obstacles: readonly VillaCollider[], profile = VILLA_SEDAN_PROFILE, side: 1 | -1 = 1): boolean {
  if (!validPose(state)) return false;
  const anchors = villaCarAnchors(state, profile), exit = anchors.exits[side === 1 ? 0 : 1]!;
  const door = villaTerrainAnchor(state, profile.door[0] * side, profile.door[1]), route = [anchors.seat, door, exit], height = 1.75;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    // Terrain is gently curved. Small intermediate segments make vertical
    // clearance track its surface instead of testing every obstacle against y=0.
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .04));
    let previous = a;
    for (let j = 0; j <= steps; j++) {
      const x = a.x + (b.x - a.x) * j / steps, z = a.z + (b.z - a.z) * j / steps;
      const point = { x, y: villaTerrainHeight(x, z), z };
      if (!villaVehicleGroundClear(x, z, height, PLAYER_RADIUS)) return false;
      for (const obstacle of [...VILLA_DRIVING_FIXED_COLLIDERS, ...obstacles]) {
        if (isVillaVehicleCollider(obstacle, profile) || obstacle.maxY <= Math.min(previous.y, point.y) + .025 || obstacle.minY >= Math.max(previous.y, point.y) + height - .02) continue;
        if (villaVehicleCorridorTouchesBox(previous, point, obstacle)) return false;
      }
      previous = point;
    }
  }
  return true;
}
export function villaCarSafeExit(pose: VillaDrivingPose, obstacles: readonly VillaCollider[], profile = VILLA_SEDAN_PROFILE): VillaPosition | null {
  const anchors = villaCarAnchors(pose, profile);
  return villaCarExitClear(pose, obstacles, profile, 1) ? anchors.exits[0]! : villaCarExitClear(pose, obstacles, profile, -1) ? anchors.exits[1]! : null;
}
/** OBB/AABB SAT with terrain-relative vertical bounds; roof tilt is conservatively
 * included in XZ. Flat-ground footprints are unchanged. */
export function villaCarOverlaps(pose: VillaDrivingPose, box: VillaCollider, profile = VILLA_SEDAN_PROFILE): boolean {
  const radius = Math.hypot(profile.limits.halfWidth, profile.limits.halfLength) + profile.limits.height;
  if (isVillaVehicleCollider(box, profile) || pose.x + radius < box.minX || pose.x - radius > box.maxX || pose.z + radius < box.minZ || pose.z - radius > box.maxZ) return false;
  const bounds = villaTerrainBounds(pose, profile.limits.halfWidth, profile.limits.halfLength, profile.limits.height);
  if (isVillaVehicleCollider(box, profile) || box.maxY <= bounds.minY + .07 || box.minY >= bounds.maxY) return false;
  const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw), terrain = villaTerrainOrientation(pose.x, pose.z, pose.yaw);
  const dx = (box.minX + box.maxX) / 2 - pose.x, dz = (box.minZ + box.maxZ) / 2 - pose.z;
  const bx = (box.maxX - box.minX) / 2, bz = (box.maxZ - box.minZ) / 2;
  const w = profile.limits.halfWidth + profile.limits.height * Math.abs(Math.sin(terrain.roll));
  const l = profile.limits.halfLength + profile.limits.height * Math.abs(Math.sin(terrain.pitch));
  return [[1, 0], [0, 1], [c, -s], [s, c]].every(([ax, az]) =>
    Math.abs(dx * ax + dz * az) <= w * Math.abs(c * ax - s * az) + l * Math.abs(s * ax + c * az) + bx * Math.abs(ax) + bz * Math.abs(az));
}
export function villaDrivingPoseBlocked(pose: VillaDrivingPose, obstacles: readonly VillaCollider[], profile = VILLA_SEDAN_PROFILE): boolean {
  if (!validPose(pose)) return true;
  const footprint = villaCarFootprint(pose, profile), l = profile.limits, bounds = villaTerrainBounds(pose, l.halfWidth, l.halfLength, l.height), b = VILLA_DRIVING_BOUNDS;
  return bounds.minX < b.minX || bounds.maxX > b.maxX || bounds.minZ < b.minZ || bounds.maxZ > b.maxZ
    || !villaVehicleGroundClear(pose.x, pose.z, l.height) || footprint.some(p => !villaVehicleGroundClear(p.x, p.z, l.height))
    || villaPondIntersectsPolygon(footprint) || VILLA_DRIVING_FIXED_COLLIDERS.some(o => villaCarOverlaps(pose, o, profile)) || obstacles.some(o => villaCarOverlaps(pose, o, profile));
}
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const approach = (n: number, target: number, amount: number) => n + clamp(target - n, -amount, amount);
/** Metres/seconds, front +Z. Right input decreases Three yaw; reverse naturally
 * reverses the turn. Optional profile retains every existing sedan call. */
export function advanceVillaDriving(state: VillaDrivingState, input: VillaDrivingInput, dt: number, obstacles: readonly VillaCollider[], profile = VILLA_SEDAN_PROFILE): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  if (!validPose(state)) { Object.assign(state, createVillaDriving(profile)); return; }
  const limits = profile.limits, duration = Math.min(dt, .25), count = Math.ceil(duration * 120), h = duration / count;
  const throttle = Number.isFinite(input.throttle) ? clamp(input.throttle, -1, 1) : 0;
  const steer = Number.isFinite(input.steer) ? clamp(input.steer, -1, 1) : 0;
  state.speed = Number.isFinite(state.speed) ? clamp(state.speed, -limits.maxReverse, limits.maxSpeed) : 0;
  state.steering = Number.isFinite(state.steering) ? clamp(state.steering, -limits.maxSteer, limits.maxSteer) : 0;
  state.distance = Number.isFinite(state.distance) ? Math.max(0, state.distance) : 0;
  const wasContact = state.contact;
  state.contact = false; state.handbrake = !!input.handbrake;
  for (let i = 0; i < count; i++) {
    state.steering = approach(state.steering, steer * limits.maxSteer, h * 1.8);
    if (input.brake || state.handbrake) state.speed = approach(state.speed, 0, h * (state.handbrake ? 8.5 : 5.5));
    else if (throttle === 0) state.speed = approach(state.speed, 0, h * (.32 + Math.abs(state.speed) * .13));
    else if (state.speed * throttle < 0) state.speed = approach(state.speed, 0, h * 4.5);
    else state.speed += throttle * h * (throttle > 0 ? profile.acceleration : profile.reverseAcceleration);
    state.speed = clamp(state.speed, -limits.maxReverse, limits.maxSpeed);
    const rearGrip = state.handbrake && Math.abs(state.speed) > 2 ? 1.18 : 1;
    const angle = -state.speed / limits.wheelbase * Math.tan(state.steering) * h * rearGrip;
    const next = { x: state.x + Math.sin(state.yaw + angle / 2) * state.speed * h, z: state.z + Math.cos(state.yaw + angle / 2) * state.speed * h, yaw: state.yaw + angle };
    if (villaDrivingPoseBlocked(next, obstacles, profile)) {
      let lo = 0, hi = 1;
      for (let j = 0; j < 16; j++) {
        const t = (lo + hi) / 2, probe = { x: state.x + (next.x - state.x) * t, z: state.z + (next.z - state.z) * t, yaw: state.yaw + angle * t };
        if (villaDrivingPoseBlocked(probe, obstacles, profile)) hi = t; else lo = t;
      }
      const dx = (next.x - state.x) * lo, dz = (next.z - state.z) * lo;
      state.x += dx; state.z += dz; state.yaw += angle * lo; state.distance += Math.hypot(dx, dz);
      state.contact = true; state.speed = 0; break;
    }
    state.distance += Math.hypot(next.x - state.x, next.z - state.z); Object.assign(state, next);
  }
  if (state.contact && !wasContact) state.collisions++;
}
