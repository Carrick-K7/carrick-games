import { VILLA_ESTATE_ROAD_PATHS } from './villaDrivingCourse.js';
import { VILLA_GARAGE_BAYS, VILLA_GARAGE_EXTENT, villaTerrainHeight } from './villaEstateLayout.js';
import type { VillaDrivingInput, VillaDrivingPose } from './villaDriving.js';

/** One-key parking: build a route from wherever a car stands to its own bay and
 *  steer it home with pure pursuit. Pure data and maths, so it is testable
 *  without a scene and identical for all three road vehicles. */
export type VillaParkVehicle = 'car' | 'pickup' | 'suv';
export interface VillaParkPoint { x: number; z: number }
export interface VillaParkRun {
  active: boolean;
  points: VillaParkPoint[];
  index: number;
  reversing: boolean;
  reverseFor: number;
  stuck: number;
  elapsed: number;
  /** Retained snapshot field; physical parking no longer uses a snap timer. */
  settle: number;
  /** Best remaining polyline distance and seconds since it improved. A legal
   *  route can lead away from the bay before turning onto its access road. */
  best: number;
  noProgress: number;
  /** Set when the run gives up: the caller reports it and returns control. */
  failed: '' | 'blocked' | 'lost';
}
export const VILLA_PARK_CRUISE = 4.6;
export const VILLA_PARK_SAMPLE = 1.6;
/** Two paths meet where their samples come this close; the authored junctions
 *  are 4-6 m apart, so a tighter value would split the network. */
export const VILLA_PARK_JUNCTION = 6;
const BAY_BY_VEHICLE: Record<VillaParkVehicle, (typeof VILLA_GARAGE_BAYS)[number]> = {
  car: VILLA_GARAGE_BAYS[0], pickup: VILLA_GARAGE_BAYS[1], suv: VILLA_GARAGE_BAYS[3],
};
/** The apron waypoint east of the house that every approach enters by. */
// Leave enough straight approach for a full-size wheelbase to align before
// reaching the garage. The old 2.4m apron required a pose snap to finish turns.
const APRIL_ENTRY = { x: VILLA_GARAGE_BAYS[0].x, z: VILLA_GARAGE_EXTENT.maxZ + 12 };
export function villaParkBay(vehicle: VillaParkVehicle): VillaParkPoint { return { x: BAY_BY_VEHICLE[vehicle].x, z: BAY_BY_VEHICLE[vehicle].z }; }
export function createVillaParkRun(): VillaParkRun {
  return { active: false, points: [], index: 0, reversing: false, reverseFor: 0, stuck: 0, elapsed: 0, settle: 0, best: Infinity, noProgress: 0, failed: '' };
}
/** Parked means inside the bay footprint, nose out or nose in as the driver left
 *  it: both are how a real garage bay holds a car. */
export function villaVehicleParked(vehicle: VillaParkVehicle, pose: VillaDrivingPose): boolean {
  const bay = villaParkBay(vehicle);
  const yaw = Math.abs(Math.atan2(Math.sin(pose.yaw), Math.cos(pose.yaw)));
  const aligned = Math.min(yaw, Math.abs(Math.PI - yaw)) < .25;
  return Math.abs(pose.x - bay.x) < 1.15 && Math.abs(pose.z - bay.z) < 1.9 && aligned;
}

interface Node extends VillaParkPoint { path: number }
/** Sample every road into a graph: consecutive samples of one path are linked,
 *  and samples of different paths are linked when they nearly coincide, which is
 *  how the six authored paths meet at their shared junctions. */
function roadGraph(): { nodes: Node[]; edges: number[][] } {
  const nodes: Node[] = [], edges: number[][] = [];
  VILLA_ESTATE_ROAD_PATHS.forEach((path, pathIndex) => {
    let previous = -1;
    for (let i = 0; i < path.length; i++) {
      const a = path[i], samples: VillaParkPoint[] = [];
      if (i === 0) samples.push({ x: a.x, z: a.z });
      else {
        const b = path[i - 1]!, dx = a.x - b.x, dz = a.z - b.z;
        const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / VILLA_PARK_SAMPLE));
        for (let s = 1; s <= steps; s++) samples.push({ x: b.x + dx * s / steps, z: b.z + dz * s / steps });
      }
      for (const point of samples) {
        nodes.push({ ...point, path: pathIndex });
        const index = nodes.length - 1;
        edges[index] ??= [];
        if (previous >= 0) { edges[previous]!.push(index); edges[index].push(previous); }
        previous = index;
      }
    }
  });
  // Junction links: a sample of one path close to a sample of another.
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    if (nodes[i]!.path === nodes[j]!.path) continue;
    if (Math.hypot(nodes[i]!.x - nodes[j]!.x, nodes[i]!.z - nodes[j]!.z) < VILLA_PARK_JUNCTION) { edges[i]!.push(j); edges[j]!.push(i); }
  }
  return { nodes, edges };
}
let cachedGraph: { nodes: Node[]; edges: number[][] } | null = null;
const graph = () => (cachedGraph ??= roadGraph());
function nearestNode(points: VillaParkPoint[] | Node[], x: number, z: number): number {
  let best = 0, bestDistance = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = Math.hypot(points[i].x - x, points[i].z - z);
    if (d < bestDistance) { bestDistance = d; best = i; }
  }
  return best;
}
/** Dijkstra over the sampled road graph between the two nearest samples. */
function shortestPath(nodes: Node[], edges: number[][], from: number, to: number): number[] {
  const count = nodes.length, distance = new Array<number>(count).fill(Infinity), previous = new Array<number>(count).fill(-1);
  const visited = new Uint8Array(count);
  distance[from] = 0;
  for (;;) {
    let current = -1, best = Infinity;
    for (let i = 0; i < count; i++) if (!visited[i] && distance[i]! < best) { best = distance[i]!; current = i; }
    if (current < 0 || current === to) break;
    visited[current] = 1;
    for (const next of edges[current] ?? []) {
      const step = Math.hypot(nodes[next].x - nodes[current].x, nodes[next].z - nodes[current].z);
      if (distance[current]! + step < distance[next]!) { distance[next] = distance[current]! + step; previous[next] = current; }
    }
  }
  const route: number[] = [];
  for (let node = to; node >= 0; node = previous[node]!) { route.push(node); if (node === from) break; }
  return route.reverse();
}
/** Corner cutting for wide vehicles: sampled roads meet at right angles, which a
 *  3.45 m wheelbase cannot follow without leaving the asphalt or clipping the
 *  verge, so the polyline is rounded twice before anyone drives it. */
function smoothRoute(points: VillaParkPoint[]): VillaParkPoint[] {
  let current = points;
  for (let pass = 0; pass < 2; pass++) {
    const next: VillaParkPoint[] = [current[0]!];
    for (let i = 1; i < current.length - 1; i++) {
      const a = current[i - 1]!, b = current[i]!, c = current[i + 1]!;
      // Only round a real corner; straight runs stay exactly on the centreline.
      const turn = Math.abs(Math.atan2(c.x - b.x, c.z - b.z) - Math.atan2(b.x - a.x, b.z - a.z));
      const sharp = Math.min(turn, Math.PI * 2 - turn) > .35;
      if (!sharp) { next.push(b); continue; }
      next.push({ x: b.x * .25 + (a.x + c.x) * .375, z: b.z * .25 + (a.z + c.z) * .375 });
    }
    next.push(current[current.length - 1]!);
    current = next;
  }
  return current;
}
/** Route from the vehicle to its bay: the apron and bay last, the road graph in
 *  between, and a short straight leg first when the car is off the network. */
export function villaParkRoute(vehicle: VillaParkVehicle, pose: VillaDrivingPose): VillaParkPoint[] {
  const bay = villaParkBay(vehicle);
  const apron = { ...APRIL_ENTRY }, tail: VillaParkPoint[] = [apron, { x: bay.x, z: apron.z }, { x: bay.x, z: bay.z }];
  // Inside the garage but not in its bay: leave through the nearest door first,
  // then come back in through the car's own bay like any other approach.
  if (pose.x > VILLA_GARAGE_EXTENT.minX - 1 && pose.x < VILLA_GARAGE_EXTENT.maxX + 1
    && pose.z > VILLA_GARAGE_EXTENT.minZ - 1 && pose.z < VILLA_GARAGE_EXTENT.maxZ + 2) {
    const door = VILLA_GARAGE_BAYS.reduce((best, candidate) =>
      Math.abs(candidate.x - pose.x) < Math.abs(best.x - pose.x) ? candidate : best, VILLA_GARAGE_BAYS[0]);
    return [{ x: pose.x, z: pose.z }, { x: door.x, z: pose.z }, { x: door.x, z: apron.z }, ...tail];
  }
  // On the apron or the drive: straight in through the bay's own door.
  if (pose.x > VILLA_GARAGE_EXTENT.minX - 2 && pose.z < VILLA_GARAGE_EXTENT.maxZ + 8) return [{ x: pose.x, z: pose.z }, ...tail];
  const { nodes, edges } = graph();
  const start = nearestNode(nodes, pose.x, pose.z), goal = nearestNode(nodes, apron.x, apron.z);
  const route = shortestPath(nodes, edges, start, goal).map(index => ({ x: nodes[index]!.x, z: nodes[index]!.z }));
  return [{ x: pose.x, z: pose.z }, ...smoothRoute(route), ...tail];
}
/** Auto-park needs a car that is out on the estate or already sitting in its
 *  bay. One left sideways on the garage floor has to be driven out first: no
 *  amount of pursuit gets a 5 m car out of that corner honestly. */
export function villaParkAvailable(vehicle: VillaParkVehicle, pose: VillaDrivingPose): boolean {
  const insideGarage = pose.x > VILLA_GARAGE_EXTENT.minX - 1 && pose.x < VILLA_GARAGE_EXTENT.maxX + 1
    && pose.z > VILLA_GARAGE_EXTENT.minZ - 1 && pose.z < VILLA_GARAGE_EXTENT.maxZ + 2;
  return !insideGarage || villaVehicleParked(vehicle, pose);
}
/** A route may only be driven if the car actually fits the whole way: the roads
 *  are authored clear of buildings, but the controller cuts corners, so every
 *  waypoint is tested with the caller's own blocking predicate first. */
export function villaParkRouteClear(points: VillaParkPoint[], blocked: (pose: VillaDrivingPose) => boolean, step = 2): boolean {
  for (let i = 0; i < points.length; i += step) {
    const a = points[i]!, b = points[Math.min(points.length - 1, i + step)]!;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    // Two probes per gap: the centreline and the midpoint, so a corner the car
    // would clip between waypoints is caught too.
    if (blocked({ x: a.x, z: a.z, yaw })) return false;
    if (blocked({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, yaw })) return false;
  }
  return true;
}
/** Where the vehicle would be in its own frame, from the model's own rotation. */
function localFrame(pose: VillaDrivingPose, point: VillaParkPoint): { x: number; z: number } {
  const dx = point.x - pose.x, dz = point.z - pose.z, cos = Math.cos(pose.yaw), sin = Math.sin(pose.yaw);
  return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
}
export interface VillaParkLimits { halfWidth: number; halfLength: number; wheelbase: number; maxSpeed: number; maxReverse: number; maxSteer: number }
export interface VillaParkControl { input: VillaDrivingInput; run: VillaParkRun; arrived: boolean }
/** One control step: follow an interpolated lookahead, slow before turns, and
 *  maintain forward/reverse travel until the path genuinely changes direction.
 *  Only commands/run bookkeeping are changed; pose is read-only in practice. */
export function advanceVillaPark(vehicle: VillaParkVehicle, pose: VillaDrivingPose, speed: number, limits: VillaParkLimits, run: VillaParkRun, dt: number): VillaParkControl {
  const points = run.points;
  const last = points[points.length - 1];
  const idle: VillaParkControl = { input: { throttle: 0, steer: 0, brake: false, handbrake: true }, run, arrived: false };
  if (!run.active || !last || !Number.isFinite(dt) || dt <= 0) return idle;
  run.elapsed += dt;
  if (run.elapsed > 300) run.failed = 'lost';
  const bay = villaParkBay(vehicle), goalDistance = Math.hypot(bay.x - pose.x, bay.z - pose.z);
  if (goalDistance < .035 && villaVehicleParked(vehicle, pose) && Math.abs(speed) < .08) {
    // The drivetrain, not the controller, owns every millimetre of the pose.
    // In particular there is no timed settling/arrival teleport into the bay.
    run.active = false;
    return { input: { throttle: 0, steer: 0, brake: true, handbrake: true }, run, arrived: true };
  }
  run.settle = 0;
  const lookAhead = Math.min(7, 2.4 + Math.abs(speed) * .9);
  // Project onto actual SEGMENTS, then interpolate a fixed-distance lookahead.
  // The old endpoint-only search jumped across the whole 16m final leg, driving
  // a circle to the bay centre instead of aligning with its straight approach.
  let closest = run.index, closestDistance = Infinity, projection = points[run.index]!;
  for (let i = run.index; i < Math.min(points.length - 1, run.index + 7); i++) {
    const a = points[i]!, b = points[i + 1]!, dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz;
    if (length2 < 1e-8) continue;
    const t = Math.max(0, Math.min(1, ((pose.x - a.x) * dx + (pose.z - a.z) * dz) / length2));
    const p = { x: a.x + dx * t, z: a.z + dz * t }, distance = Math.hypot(p.x - pose.x, p.z - pose.z);
    if (distance < closestDistance) { closestDistance = distance; closest = i; projection = p; }
  }
  run.index = closest;
  let aimIndex = Math.min(points.length - 1, closest + 1), aim = projection, left = lookAhead;
  while (aimIndex < points.length) {
    const b = points[aimIndex]!, distance = Math.hypot(b.x - aim.x, b.z - aim.z);
    if (distance >= left) { const t = left / distance; aim = { x: aim.x + (b.x - aim.x) * t, z: aim.z + (b.z - aim.z) * t }; break; }
    left -= distance; aim = b;
    if (aimIndex === points.length - 1) break;
    aimIndex++;
  }
  const target = localFrame(pose, aim);
  // True bearing, so a target behind the car reads as |bearing| > PI/2 instead
  // of being clamped to the side; only the exact-zero case needs a guard.
  const bearing = Math.atan2(target.x, Math.abs(target.x) + Math.abs(target.z) < 1e-6 ? .001 : target.z);
  // A valid road route can initially lead AWAY from the bay. Measuring progress
  // by Euclidean bay distance repeatedly cancelled useful reversing, producing
  // a forward/reverse limit cycle with the stronger new drivetrain. Choose the
  // travel direction by target bearing with hysteresis, not a 1.6-second timer.
  const angle = Math.abs(bearing);
  if (!run.reversing && angle > Math.PI / 2 + .22) run.reversing = true;
  else if (run.reversing && angle < Math.PI / 2 - .22) run.reversing = false;
  run.reverseFor = 0;
  let routeRemaining = closestDistance + Math.hypot(points[Math.min(points.length - 1, closest + 1)]!.x - projection.x, points[Math.min(points.length - 1, closest + 1)]!.z - projection.z);
  for (let i = closest + 1; i < points.length - 1; i++) routeRemaining += Math.hypot(points[i + 1]!.x - points[i]!.x, points[i + 1]!.z - points[i]!.z);
  if (routeRemaining < run.best - .02) { run.best = routeRemaining; run.noProgress = 0; } else run.noProgress += dt;
  // Pure pursuit: curvature from the bearing to the look-ahead point. Positive
  // steer decreases yaw (villaDriving: right input rolls the nose right), so the
  // commanded steer carries the opposite sign of the bearing.
  const distance = Math.max(.6, Math.hypot(target.x, target.z));
  const curvature = 2 * Math.sin(bearing) / distance;
  const steerAngle = Math.atan(curvature * limits.wheelbase);
  const steer = Math.max(-1, Math.min(1, -steerAngle / limits.maxSteer));
  // Cap the speed by the corner coming up rather than only by the current
  // bearing: a long wheelbase needs to be slow BEFORE the corner arrives.
  let bend = 0, travelled = 0;
  for (let i = run.index; i < points.length - 1 && travelled < 9; i++) {
    const a = points[i]!, b = points[i + 1]!;
    travelled += Math.hypot(b.x - a.x, b.z - a.z);
    if (i > run.index) {
      const p = points[i - 1]!;
      const turn = Math.atan2(b.x - a.x, b.z - a.z) - Math.atan2(a.x - p.x, a.z - p.z);
      bend += Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)));
    }
  }
  const cornerSpeed = Math.max(1.3, VILLA_PARK_CRUISE - bend * 1.35 - limits.wheelbase * .18);
  const finalLeg = aimIndex >= points.length - 1;
  const remaining = finalLeg ? Math.hypot(last.x - pose.x, last.z - pose.z) : Infinity;
  const alignment = Math.abs(Math.cos(bearing));
  const cruise = finalLeg ? Math.min(1.3, remaining * .72) : Math.min(cornerSpeed, VILLA_PARK_CRUISE * (.25 + .75 * alignment));
  const wanted = Math.min(cruise, run.reversing ? Math.min(2, limits.maxReverse) : VILLA_PARK_CRUISE);
  const direction = run.reversing ? -1 : 1, alongSpeed = speed * direction;
  // Parking commands at most 35% accelerator, regardless of highway capability.
  // Signed speed feedback brakes a gear change before accelerating the other
  // way; a much smaller low-speed error band avoids overshoot at the bay centre.
  const error = wanted - alongSpeed;
  const throttle = error > 0 ? direction * Math.min(.35, .06 + error * .45) : 0;
  if (Math.abs(speed) < .05 && Math.abs(throttle) > .1) run.stuck += dt; else run.stuck = 0;
  if (run.stuck > 6) run.failed = 'blocked';
  return { input: { throttle, steer, brake: alongSpeed < -.04 || alongSpeed > wanted + Math.min(.12, wanted * .15), handbrake: false }, run, arrived: false };
}
/** Ground height at a route point, so the caller can keep the car seated. */
export const villaParkHeight = (point: VillaParkPoint) => villaTerrainHeight(point.x, point.z);
