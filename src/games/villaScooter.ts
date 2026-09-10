import { PLAYER_RADIUS, POOL, STAIR_HOLE, VILLA_WALL_COLLIDERS, VILLA_RAILS, type VillaCollider, type VillaPosition } from './villaWorld.js';
import { VILLA_ELEVATOR } from './villaElevator.js';
import { VILLA_ESTATE_BOUNDS, villaPondIntersectsPolygon, villaTerrainAnchor, villaTerrainBounds, villaTerrainHeight, villaTerrainOrientation } from './villaEstateLayout.js';
import { villaVehicleGroundClear } from './villaDriving.js';

/** Model front is +Z; yaw is the seated camera offset, as on the villa car. */
import { VILLA_SCOOTER } from './villaActivities.js';
export { VILLA_SCOOTER } from './villaActivities.js';
/** Width conservatively encloses mirrors at full steering/lean, height includes rider. */
export const VILLA_SCOOTER_LIMITS = { halfWidth: .6, halfLength: 1.03, height: 1.8, wheelbase: 1.3, wheelRadius: .235, maxSpeed: 6.1, maxReverse: 1.65, maxSteer: .5 };
export const VILLA_SCOOTER_BOUNDS = VILLA_ESTATE_BOUNDS;
export interface VillaScooterState {
  x: number; z: number; yaw: number; speed: number; steering: number;
  distance: number; contact: boolean; collisions: number; handbrake: boolean;
  /** Signed tyre travel; optional for compatibility with pre-reverse snapshots. */
  wheelTravel?: number;
}
export type VillaScooterPose = Pick<VillaScooterState, 'x' | 'z' | 'yaw'>;
export interface VillaScooterInput { throttle: number; steer: number; brake: boolean; handbrake?: boolean }
const ownColliders = new WeakSet<VillaCollider>();
/** Separate ownership from the car: the two vehicles must collide with each other. */
export function registerVillaScooterColliders(colliders: readonly VillaCollider[]): void { colliders.forEach(c => ownColliders.add(c)); }
export function isVillaScooterCollider(collider: VillaCollider): boolean { return ownColliders.has(collider); }
export function createVillaScooter(): VillaScooterState {
  return { x: VILLA_SCOOTER.center.x, z: VILLA_SCOOTER.center.z, yaw: 0, speed: 0, steering: 0, distance: 0, contact: false, collisions: 0, handbrake: false };
}
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const finite = (n: number, fallback = 0) => Number.isFinite(n) ? n : fallback;
const validPose = (p: VillaScooterPose) => [p.x, p.z, p.yaw].every(Number.isFinite);
const transform = villaTerrainAnchor;
export function villaScooterFootprint(pose: VillaScooterPose): VillaPosition[] {
  const { halfWidth: w, halfLength: l } = VILLA_SCOOTER_LIMITS;
  return [transform(pose, -w, -l), transform(pose, w, -l), transform(pose, w, l), transform(pose, -w, l)];
}
/** Ground-level anchors: parent adds eyeHeight and pose.yaw + VILLA_SCOOTER.yaw.
 * Exits are candidates, not promises: select a fully clear side before dismounting.
 */
export function villaScooterAnchors(pose: VillaScooterPose) {
  const exits = [transform(pose, 1, -.23), transform(pose, -1, -.23)];
  return { seat: transform(pose, 0, -.23), exit: exits[0]!, exits, interaction: exits[0]!,
    body: villaTerrainBounds(pose, VILLA_SCOOTER_LIMITS.halfWidth, VILLA_SCOOTER_LIMITS.halfLength, 1.4) satisfies VillaCollider };
}
/** These ground hazards are blocked even when the caller omits decorative colliders. */
export const VILLA_SCOOTER_FIXED_COLLIDERS: readonly VillaCollider[] = [POOL, STAIR_HOLE, VILLA_ELEVATOR].map(box => ({ minX: box.minX, maxX: box.maxX, minZ: box.minZ, maxZ: box.maxZ, minY: -2, maxY: 4 }));
/** OBB/AABB SAT; considers rider headroom, not just the low scooter shell. */
export function villaScooterOverlaps(pose: VillaScooterPose, box: VillaCollider): boolean {
  const radius = Math.hypot(VILLA_SCOOTER_LIMITS.halfWidth, VILLA_SCOOTER_LIMITS.halfLength) + VILLA_SCOOTER_LIMITS.height;
  if (isVillaScooterCollider(box) || pose.x + radius < box.minX || pose.x - radius > box.maxX || pose.z + radius < box.minZ || pose.z - radius > box.maxZ) return false;
  const bounds = villaTerrainBounds(pose, VILLA_SCOOTER_LIMITS.halfWidth, VILLA_SCOOTER_LIMITS.halfLength, VILLA_SCOOTER_LIMITS.height);
  if (isVillaScooterCollider(box) || box.maxY <= bounds.minY + .025 || box.minY >= bounds.maxY) return false;
  const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
  const dx = (box.minX + box.maxX) / 2 - pose.x, dz = (box.minZ + box.maxZ) / 2 - pose.z;
  const bx = (box.maxX - box.minX) / 2, bz = (box.maxZ - box.minZ) / 2;
  const terrain = villaTerrainOrientation(pose.x, pose.z, pose.yaw);
  const w = VILLA_SCOOTER_LIMITS.halfWidth + VILLA_SCOOTER_LIMITS.height * Math.abs(Math.sin(terrain.roll));
  const l = VILLA_SCOOTER_LIMITS.halfLength + VILLA_SCOOTER_LIMITS.height * Math.abs(Math.sin(terrain.pitch));
  return [[1, 0], [0, 1], [c, -s], [s, c]].every(([ax, az]) =>
    Math.abs(dx * ax! + dz * az!) <= w * Math.abs(c * ax! - s * az!) + l * Math.abs(s * ax! + c * az!) + bx * Math.abs(ax!) + bz * Math.abs(az!));
}
function groundClear(x: number, z: number, radius = 0): boolean {
  return villaVehicleGroundClear(x, z, VILLA_SCOOTER_LIMITS.height, radius);
}
export function villaScooterPoseBlocked(pose: VillaScooterPose, obstacles: readonly VillaCollider[]): boolean {
  if (!validPose(pose)) return true;
  const footprint = villaScooterFootprint(pose), bounds = villaTerrainBounds(pose, VILLA_SCOOTER_LIMITS.halfWidth, VILLA_SCOOTER_LIMITS.halfLength, VILLA_SCOOTER_LIMITS.height), b = VILLA_SCOOTER_BOUNDS;
  if (bounds.minX < b.minX || bounds.maxX > b.maxX || bounds.minZ < b.minZ || bounds.maxZ > b.maxZ || villaPondIntersectsPolygon(footprint)) return true;
  if (!groundClear(pose.x, pose.z) || footprint.some(p => !groundClear(p.x, p.z))) return true;
  return [VILLA_SCOOTER_FIXED_COLLIDERS, VILLA_WALL_COLLIDERS, VILLA_RAILS, obstacles].some(list => list.some(box => villaScooterOverlaps(pose, box)));
}
/** Conservative capsule-route test: expanded AABB slabs also protect tight corners. */
function routeTouches(a: VillaPosition, b: VillaPosition, box: VillaCollider): boolean {
  let lo = 0, hi = 1;
  for (const [origin, delta, min, max] of [[a.x, b.x - a.x, box.minX - PLAYER_RADIUS, box.maxX + PLAYER_RADIUS], [a.z, b.z - a.z, box.minZ - PLAYER_RADIUS, box.maxZ + PLAYER_RADIUS]]) {
    if (Math.abs(delta!) < 1e-12) { if (origin! < min! || origin! > max!) return false; }
    else { const t1 = (min! - origin!) / delta!, t2 = (max! - origin!) / delta!; lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2)); }
  }
  return lo <= hi;
}
/** side=+1 picks first/local +X candidate; -1 picks the other side. Full route,
 * standing headroom and support are checked, not merely a free endpoint.
 */
export function villaScooterExitClear(pose: VillaScooterPose, obstacles: readonly VillaCollider[], side: 1 | -1 = 1): boolean {
  if (!validPose(pose)) return false;
  const anchors = villaScooterAnchors(pose), exit = anchors.exits[side === 1 ? 0 : 1]!;
  let previous = anchors.seat;
  for (let i = 0; i <= 40; i++) {
    const x = anchors.seat.x + (exit.x - anchors.seat.x) * i / 40, z = anchors.seat.z + (exit.z - anchors.seat.z) * i / 40;
    const point = { x, y: villaTerrainHeight(x, z), z };
    if (!groundClear(x, z, PLAYER_RADIUS)) return false;
    for (const list of [VILLA_SCOOTER_FIXED_COLLIDERS, VILLA_WALL_COLLIDERS, VILLA_RAILS, obstacles]) for (const box of list) {
      if (!isVillaScooterCollider(box) && box.maxY > Math.min(point.y, previous.y) + .025 && box.minY < Math.max(point.y, previous.y) + 1.8 && routeTouches(previous, point, box)) return false;
    }
    previous = point;
  }
  return true;
}
/** Controller entry point: safe support plus a swept standing-person route;
 * only scooter-owned collider identities are excluded, never car/pet objects.
 */
export function villaScooterSafeExit(pose: VillaScooterPose, obstacles: readonly VillaCollider[]): VillaPosition | null {
  const anchors = villaScooterAnchors(pose);
  return villaScooterExitClear(pose, obstacles, 1) ? anchors.exits[0]! : villaScooterExitClear(pose, obstacles, -1) ? anchors.exits[1]! : null;
}
/** Compatibility name for callers authored before controller integration. */
export const chooseVillaScooterExit = villaScooterSafeExit;
/** W=throttle +1; S=throttle -1 brakes forward travel, then reverses slowly.
 * W brakes reverse before driving forwards. brake/Space only stop, never reverse.
 * Positive D/right DECREASES world yaw forwards and INCREASES it in reverse.
 * Caller supplies live obstacles (including pets, car, doors and fences); only
 * scooter-registered objects are ignored. Units metres/seconds, dt capped .25s.
 */
export function advanceVillaScooter(state: VillaScooterState, input: VillaScooterInput, dt: number, obstacles: readonly VillaCollider[]): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  if (!validPose(state)) { Object.assign(state, createVillaScooter()); return; }
  const duration = Math.min(dt, .25), count = Math.ceil(duration * 120), h = duration / count;
  const throttle = clamp(finite(input.throttle), -1, 1), steer = clamp(finite(input.steer), -1, 1);
  state.speed = clamp(finite(state.speed), -VILLA_SCOOTER_LIMITS.maxReverse, VILLA_SCOOTER_LIMITS.maxSpeed);
  state.steering = clamp(finite(state.steering), -VILLA_SCOOTER_LIMITS.maxSteer, VILLA_SCOOTER_LIMITS.maxSteer);
  state.distance = Math.max(0, finite(state.distance));
  state.wheelTravel = finite(state.wheelTravel ?? state.distance);
  state.handbrake = !!input.handbrake;
  const wasContact = state.contact; state.contact = false;
  for (let i = 0; i < count; i++) {
    state.steering += (steer * VILLA_SCOOTER_LIMITS.maxSteer - state.steering) * (1 - Math.exp(-9 * h));
    const stop = (amount: number) => state.speed + clamp(-state.speed, -amount, amount);
    if (state.handbrake || input.brake) state.speed = stop(h * (state.handbrake ? 6 : 4.6));
    else if (throttle * state.speed < 0) state.speed = stop(h * 4.6);
    else if (throttle === 0) state.speed = stop(h * (.22 + Math.abs(state.speed) * .09));
    else state.speed += throttle * h * ((throttle > 0 ? 1.9 : 1.05) - .22 - Math.abs(state.speed) * .09);
    state.speed = clamp(state.speed, -VILLA_SCOOTER_LIMITS.maxReverse, VILLA_SCOOTER_LIMITS.maxSpeed);
    // Symmetric kinematic steering: backing up reverses the turn, not the input.
    const angle = -state.speed / VILLA_SCOOTER_LIMITS.wheelbase * Math.tan(state.steering) * h / (1 + Math.abs(state.speed) * .13);
    const next = { x: state.x + Math.sin(state.yaw + angle / 2) * state.speed * h, z: state.z + Math.cos(state.yaw + angle / 2) * state.speed * h, yaw: state.yaw + angle };
    if (villaScooterPoseBlocked(next, obstacles)) {
      let lo = 0, hi = 1;
      for (let j = 0; j < 14; j++) {
        const t = (lo + hi) / 2;
        const probe = { x: state.x + (next.x - state.x) * t, z: state.z + (next.z - state.z) * t, yaw: state.yaw + angle * t };
        if (villaScooterPoseBlocked(probe, obstacles)) hi = t; else lo = t;
      }
      const dx = (next.x - state.x) * lo, dz = (next.z - state.z) * lo;
      state.x += dx; state.z += dz; state.yaw += angle * lo; state.distance += Math.hypot(dx, dz); state.wheelTravel += Math.sign(state.speed) * Math.hypot(dx, dz);
      state.speed = 0; state.contact = true; break;
    }
    const travelled = Math.hypot(next.x - state.x, next.z - state.z);
    state.distance += travelled; state.wheelTravel += Math.sign(state.speed) * travelled; Object.assign(state, next);
  }
  state.yaw = Math.atan2(Math.sin(state.yaw), Math.cos(state.yaw));
  if (state.contact && !wasContact) state.collisions++;
}
