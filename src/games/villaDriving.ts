import { VILLA_CAR } from './villaActivities.js';
import { PLAYER_RADIUS, POOL, villaSupportAt, type VillaCollider, type VillaPosition } from './villaWorld.js';

export interface VillaDrivingState {
  x: number; z: number; yaw: number; speed: number; steering: number;
  distance: number; collisions: number; contact: boolean;
  handbrake: boolean;
}
export const VILLA_DRIVING_BOUNDS = { minX: -25, maxX: 27, minZ: -16, maxZ: 55 };
export const VILLA_DRIVING_LIMITS = { halfWidth: 0.96, halfLength: 2.36, height: 1.48, wheelbase: 2.92, maxSpeed: 7, maxReverse: 3, maxSteer: 0.56 };
export const VILLA_SCENIC_ROAD = { x: 6, z: 39, radiusX: 15, radiusZ: 10.5, width: 8.4, drivewayWidth: 8.8 } as const;
/** Always supplied internally: the pool is not a drivable ground surface. */
export const VILLA_DRIVING_FIXED_COLLIDERS: readonly VillaCollider[] = [{ ...POOL, minY: -2, maxY: 1 }];
const ownColliders = new WeakSet<VillaCollider>();
export function registerVillaVehicleColliders(colliders: readonly VillaCollider[]): void { colliders.forEach(c => ownColliders.add(c)); }
export function isVillaVehicleCollider(collider: VillaCollider): boolean { return ownColliders.has(collider); }
export function createVillaDriving(): VillaDrivingState {
  return { x: VILLA_CAR.center.x, z: VILLA_CAR.center.z, yaw: 0, speed: 0, steering: 0, distance: 0, collisions: 0, contact: false, handbrake: false };
}
type Pose = Pick<VillaDrivingState, 'x' | 'z' | 'yaw'>;
function transform(p: Pose, x: number, z: number) {
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  return { x: p.x + c * x + s * z, y: 0, z: p.z - s * x + c * z };
}
export function villaCarFootprint(pose: Pose) {
  const { halfWidth: w, halfLength: l } = VILLA_DRIVING_LIMITS;
  return [[-w, -l], [w, -l], [w, l], [-w, l]].map(([x, z]) => transform(pose, x, z));
}
/** Anchors remain ground-level; the seated camera adds VILLA_CAR.eyeHeight. */
export function villaCarAnchors(pose: Pose) {
  const corners = villaCarFootprint(pose);
  return { seat: transform(pose, 0.43, 0.05), exit: transform(pose, 2.35, 0.15), door: transform(pose, 1, 0.4),
    body: { minX: Math.min(...corners.map(p => p.x)), maxX: Math.max(...corners.map(p => p.x)), minZ: Math.min(...corners.map(p => p.z)), maxZ: Math.max(...corners.map(p => p.z)), minY: 0, maxY: 1.48 } };
}
/** Exact XZ capsule/rectangle contact: endpoint, edge crossing, and rounded corners. */
function corridorTouchesBox(a: VillaPosition, b: VillaPosition, box: VillaCollider): boolean {
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
/** Full standing-person route, not just a free endpoint on the other side of a wall.
 * Own cabin/animated door are intentionally excluded; callers separately interlock
 * the door animation and validate the final exit against its accurate narrow phase.
 */
export function villaCarExitClear(state: Pose, obstacles: readonly VillaCollider[]): boolean {
  if (![state.x, state.z, state.yaw].every(Number.isFinite)) return false;
  const { seat, door, exit } = villaCarAnchors(state), route = [seat, door, exit], height = 1.75;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    for (const obstacle of obstacles) {
      if (isVillaVehicleCollider(obstacle) || obstacle.maxY <= 0.025 || obstacle.minY >= height - 0.02) continue;
      if (corridorTouchesBox(a, b, obstacle)) return false;
    }
    // Pool is unsafe regardless of its shallow decorative rim/visual colliders.
    if (corridorTouchesBox(a, b, VILLA_DRIVING_FIXED_COLLIDERS[0])) return false;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.04));
    for (let j = 0; j <= steps; j++) {
      const x = a.x + (b.x - a.x) * j / steps, z = a.z + (b.z - a.z) * j / steps;
      // Ground-level exit only, including standing headroom and the complete
      // footprint near property edges. Corners conservatively enclose the circle.
      for (const [ox, oz] of [[0, 0], [-PLAYER_RADIUS, -PLAYER_RADIUS], [-PLAYER_RADIUS, PLAYER_RADIUS], [PLAYER_RADIUS, -PLAYER_RADIUS], [PLAYER_RADIUS, PLAYER_RADIUS]]) {
        const support = villaSupportAt(x + ox, z + oz, 0, height);
        if (support == null || Math.abs(support) > 0.001) return false;
      }
    }
  }
  return true;
}
/** OBB/AABB SAT, including corner-only contacts; overhead slabs and ground finishes do not block. */
export function villaCarOverlaps(pose: Pose, box: VillaCollider): boolean {
  if (isVillaVehicleCollider(box) || box.maxY <= 0.07 || box.minY >= VILLA_DRIVING_LIMITS.height) return false;
  const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
  const dx = (box.minX + box.maxX) / 2 - pose.x, dz = (box.minZ + box.maxZ) / 2 - pose.z;
  const bx = (box.maxX - box.minX) / 2, bz = (box.maxZ - box.minZ) / 2;
  const { halfWidth: w, halfLength: l } = VILLA_DRIVING_LIMITS;
  return [[1, 0], [0, 1], [c, -s], [s, c]].every(([ax, az]) =>
    Math.abs(dx * ax + dz * az) <= w * Math.abs(c * ax - s * az) + l * Math.abs(s * ax + c * az) + bx * Math.abs(ax) + bz * Math.abs(az));
}
export function villaDrivingPoseBlocked(pose: Pose, obstacles: readonly VillaCollider[]): boolean {
  const b = VILLA_DRIVING_BOUNDS;
  return villaCarFootprint(pose).some(p => p.x < b.minX || p.x > b.maxX || p.z < b.minZ || p.z > b.maxZ)
    || VILLA_DRIVING_FIXED_COLLIDERS.some(o => villaCarOverlaps(pose, o)) || obstacles.some(o => villaCarOverlaps(pose, o));
}
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const approach = (n: number, target: number, amount: number) => n + clamp(target - n, -amount, amount);
/** Metres/seconds, front +Z. Right steering decreases Three yaw; reverse naturally reverses the turn. */
export function advanceVillaDriving(state: VillaDrivingState, input: { throttle: number; steer: number; brake: boolean; handbrake?: boolean }, dt: number, obstacles: readonly VillaCollider[]): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const duration = Math.min(dt, 0.25); // Ignore suspension time rather than teleporting after a hidden tab.
  const count = Math.ceil(duration / (1 / 120)), h = duration / count;
  const throttle = Number.isFinite(input.throttle) ? clamp(input.throttle, -1, 1) : 0;
  const steer = Number.isFinite(input.steer) ? clamp(input.steer, -1, 1) : 0;
  const wasContact = state.contact;
  state.contact = false; state.handbrake = !!input.handbrake;
  for (let i = 0; i < count; i++) {
    state.steering = approach(state.steering, steer * VILLA_DRIVING_LIMITS.maxSteer, h * 1.8);
    if (input.brake || state.handbrake) state.speed = approach(state.speed, 0, h * (state.handbrake ? 8.5 : 5.5));
    else if (throttle === 0) state.speed = approach(state.speed, 0, h * (0.32 + Math.abs(state.speed) * 0.13));
    else state.speed += throttle * h * (state.speed * throttle < 0 ? 4.5 : throttle > 0 ? 2.1 : 1.5);
    state.speed = clamp(state.speed, -3, 7);
    const rearGrip = state.handbrake && Math.abs(state.speed) > 2 ? 1.18 : 1;
    const angle = -state.speed / VILLA_DRIVING_LIMITS.wheelbase * Math.tan(state.steering) * h * rearGrip;
    const next = { x: state.x + Math.sin(state.yaw + angle / 2) * state.speed * h, z: state.z + Math.cos(state.yaw + angle / 2) * state.speed * h, yaw: state.yaw + angle };
    let moved = 0;
    if (villaDrivingPoseBlocked(next, obstacles)) {
      // Sweep up to contact rather than retaining a visible substep-sized gap.
      let lo = 0, hi = 1;
      for (let j = 0; j < 16; j++) {
        const t = (lo + hi) / 2;
        const probe = { x: state.x + (next.x - state.x) * t, z: state.z + (next.z - state.z) * t, yaw: state.yaw + angle * t };
        if (villaDrivingPoseBlocked(probe, obstacles)) hi = t; else lo = t;
      }
      state.x += (next.x - state.x) * lo; state.z += (next.z - state.z) * lo; state.yaw += angle * lo;
      state.contact = true; state.speed = 0;
      break;
    }
    moved = Math.hypot(next.x - state.x, next.z - state.z); Object.assign(state, next); state.distance += moved;
  }
  if (state.contact && !wasContact) state.collisions++;
}
