import type { VillaCollider, VillaPosition } from './villaWorld.js';
import { POOL } from './villaEstateLayout.js';
import { VILLA_BEDROOM_LAYOUT, VILLA_MASTER_STOOL } from './villaBedroomLayout.js';
export { VILLA_AQUARIUM } from './villaLivingLayout.js';

export interface VillaRelaxSeat {
  id: string;
  kind: 'sofa' | 'lounger' | 'chair' | 'stool' | 'bed';
  /** Floor-level anchor; eyeHeight remains relative to this floor. */
  seat: VillaPosition;
  approach: VillaPosition;
  /** Ordered candidates. ALWAYS check live support/colliders before standing. */
  exits: VillaPosition[];
  yaw: number;
  pitch: number;
  eyeHeight: number;
  /** The actual authored furniture origin and footprint, in metres. */
  origin: VillaPosition;
  width: number;
  depth: number;
  /** World-space segment inside the usable sofa cushions, not the arms. */
  cushionSegment?: readonly [VillaPosition, VillaPosition];
  freeLook: true;
  controller?: 'pc';
}
const p = (x: number, y: number, z: number): VillaPosition => ({ x, y, z });
const local = (origin: VillaPosition, yaw: number, x: number, z: number): VillaPosition =>
  p(origin.x + Math.cos(yaw) * x + Math.sin(yaw) * z, origin.y, origin.z - Math.sin(yaw) * x + Math.cos(yaw) * z);
const sofa = (id: string, x: number, y: number, z: number, width: number, yaw: number, exits: VillaPosition[]): VillaRelaxSeat => {
  const origin = p(x, y, z), span = Math.max(0, width / 2 - 0.48);
  return { id, kind: 'sofa', origin, width, depth: 1.3, seat: local(origin, yaw, 0, -0.12),
    cushionSegment: [local(origin, yaw, -span, -0.12), local(origin, yaw, span, -0.12)],
    approach: exits[0], exits, yaw, pitch: -0.06, eyeHeight: 1.16, freeLook: true };
};
const small = (id: string, kind: 'chair' | 'stool', x: number, y: number, z: number, yaw: number,
  width: number, depth: number, eyeHeight: number, exits: VillaPosition[]): VillaRelaxSeat => ({
  id, kind, origin: p(x, y, z), seat: local(p(x, y, z), yaw, 0, kind === 'chair' ? -0.04 : 0),
  width, depth, approach: exits[0], exits, yaw, pitch: -0.07, eyeHeight, freeLook: true,
});

/** Single centred pillow per bed, with eyes/head near it, facing along the mattress. */
export const VILLA_BEDS = (['master', 'guest'] as const).map(kind => {
  const b = VILLA_BEDROOM_LAYOUT[kind].bed, origin = p(b.x, 3.6, b.z);
  const pillow = local(origin, b.yaw, 0, 1.25); pillow.y = 4.55;
  return { id: `bed-${kind}`, origin, width: b.width, depth: 3.8, yaw: b.yaw,
    pillow, pillowWidth: kind === 'master' ? 1.15 : 1.05,
    rest: local(origin, b.yaw, 0, 1.15), eyeHeight: 1.12, pitch: .16,
    exits: [local(origin, b.yaw, b.width / 2 + .70, -.2), local(origin, b.yaw, -b.width / 2 - .70, -.2), local(origin, b.yaw, 0, -2.4)] };
});
export function villaBedRestPose(id: string) {
  const bed = VILLA_BEDS.find(b => b.id === id);
  return bed ? { position: { ...bed.rest }, yaw: bed.yaw, pitch: bed.pitch, eyeHeight: bed.eyeHeight, freeLook: true as const, exits: bed.exits.map(e => ({ ...e })) } : null;
}

const M = VILLA_BEDROOM_LAYOUT.master, G = VILLA_BEDROOM_LAYOUT.guest;
/** All authored non-vehicle seats. The original seven IDs/order remain compatible. */
export const VILLA_RELAX_SEATS: readonly VillaRelaxSeat[] = [
  sofa('sofa-living', -8, 0, 5.8, 4.2, 0, [p(-5.25, 0, 5.45), p(-6.1, 0, 4.6), p(-10.75, 0, 4.5)]),
  sofa('sofa-master', M.sofa.x, 3.6, M.sofa.z, M.sofa.width, M.sofa.yaw, [p(-9.4, 3.6, 8.1), p(-9.4, 3.6, 4.85), p(-8, 3.6, 6.45)]),
  sofa('sofa-library-west', 18.6, 3.6, -4.6, 1.4, -Math.PI / 2, [p(18.6, 3.6, -3.2), p(18.6, 3.6, -6.1), p(17.55, 3.6, -3.2)]),
  sofa('sofa-library-east', 23.1, 3.6, -4.6, 1.5, Math.PI / 2, [p(23.1, 3.6, -3.3), p(23.1, 3.6, -6.1), p(24.3, 3.6, -4.6)]),
  sofa('sofa-roof', -7, 7.2, 5.5, 4.15, 0, [p(-4.25, 7.2, 5.1), p(-5.1, 7.2, 4.3), p(-9.75, 7.2, 4.3)]),
  // The loungers sit on the pool's south deck, so they are anchored to the pool
  // rectangle rather than to a remembered coordinate.
  ...[POOL.minX + 3.2, POOL.minX + 6.7].map((x, i): VillaRelaxSeat => ({ id: i ? 'lounger-east' : 'lounger-west', kind: 'lounger',
    origin: p(x, 0, 9), width: 0.97, depth: 2.7, seat: p(x, 0, 9.55),
    approach: p(x + (i ? 1.05 : -1.05), 0, 9.5), exits: [p(x + (i ? 1.05 : -1.05), 0, 9.5), p(x, 0, 10.85), p(x + (i ? -1.05 : 1.05), 0, 9.5)],
    yaw: 0, pitch: 0.08, eyeHeight: 0.94, freeLook: true })),
  // 1.1.0 east wing: the widened reading bay and roof lounge are real seats.
  sofa('sofa-library-bay', 20.2, 3.6, 6.4, 1.3, 0.5, [p(20.2, 3.6, 7.75), p(18.9, 3.6, 6.4), p(21.4, 3.6, 7.6)]),
  // The doubled plan's upstairs guest suite needed somewhere to sit.
  sofa('sofa-east-suite', 24.6, 3.6, 6.9, 3.2, 0, [p(24.6, 3.6, 5.5), p(27.1, 3.6, 6.9), p(22.2, 3.6, 6.9)]),
  // (The old ground-floor media-lounge sofa went with that hall's furniture.)
  // Home-cinema tier: three-seat sofa, double loveseat and a single recliner,
  // all facing the screen wall on the room's north side.
  sofa('sofa-cinema-three', 22.6, 0, -12.9, 2.6, 0, [p(22.6, 0, -11.85), p(21.0, 0, -12.9), p(24.2, 0, -12.9)]),
  sofa('sofa-cinema-double', 25.9, 0, -12.6, 1.9, 0.55, [p(25.9, 0, -11.2), p(24.4, 0, -12.6), p(27.35, 0, -12.6)]),
  small('chair-cinema-single', 'chair', 19.3, 0, -12.6, -0.55, 1.06, 1.0, 1.18, [p(19.3, 0, -11.45), p(20.5, 0, -12.6), p(18.1, 0, -12.6)]),
  small('stool-tea-1', 'stool', -20.35, 0, -15.8, -Math.PI / 2, .74, .74, .88, [p(-21.25, 0, -15.8), p(-20.35, 0, -14.9)]),
  small('stool-tea-2', 'stool', -16.85, 0, -16.3, Math.PI / 2, .74, .74, .88, [p(-15.95, 0, -16.3), p(-16.85, 0, -15.3)]),
  small('stool-tea-3', 'stool', -18.5, 0, -13.95, 0, .74, .74, .88, [p(-18.5, 0, -13), p(-19.4, 0, -13.95)]),
  small('chair-roof-east-1', 'chair', 14.4, 7.2, 2.85, 0, 0.52, 0.52, 1.2, [p(14.4, 7.2, 1.75), p(15.5, 7.2, 2.85)]),
  small('chair-roof-east-2', 'chair', 14.4, 7.2, 5.75, Math.PI, 0.52, 0.52, 1.2, [p(14.4, 7.2, 6.85), p(13.3, 7.2, 5.75)]),
  ...[-9.33, -7.67].flatMap((x, col) => [-3.88, -1.72].map((z, row) =>
    small(`chair-dining-${col * 2 + row + 1}`, 'chair', x, 0, z, row ? 0 : Math.PI, 0.65, 0.68, 1.08,
      [p(x + (col ? 0.68 : -0.68), 0, z), p(x, 0, z + (row ? 0.8 : -0.8))]))),
  ...[-5.85, -4.55].map((x, i) => small(`stool-kitchen-${i + 1}`, 'stool', x, 0, -4.48, 0, 0.54, 0.51, 1.28,
    [p(x, 0, -3.7), p(x + (i ? 0.7 : -0.7), 0, -4.35)])),
  ...[0, 1, 2, 3].map(i => {
    const yaw = i * Math.PI / 2, origin = p(-6 + Math.sin(yaw) * 1.3, 7.2, -4.5 + Math.cos(yaw) * 1.3);
    return small(`chair-roof-${i + 1}`, 'chair', origin.x, origin.y, origin.z, yaw, 0.65, 0.68, 1.08,
      [local(origin, yaw, 0.75, 0.18), local(origin, yaw, -0.75, 0.18), local(origin, yaw, 0, 0.82)]);
  }),
  small('chair-guest', 'chair', G.chair.x, 3.6, G.chair.z, G.chair.yaw, .65, .68, 1.08, [p(-9.05, 3.6, -16.05), p(-7.35, 3.6, -16.05), p(-8.2, 3.6, -15.35)]),
  small('stool-dressing', 'stool', VILLA_MASTER_STOOL.x, 3.6, VILLA_MASTER_STOOL.z, 0, .604, .544, 1.04,
    [p(VILLA_MASTER_STOOL.x, 3.6, 2.45), p(VILLA_MASTER_STOOL.x + .85, 3.6, 1.75)]),
  small('chair-master-reading', 'chair', M.chair.x, 3.6, M.chair.z, M.chair.yaw, .65, .68, 1.08, [p(-12.9, 3.6, 4), p(-11.35, 3.6, 4.3)]),
  sofa('sofa-guest-lounge', G.sofa.x, 3.6, G.sofa.z, G.sofa.width, G.sofa.yaw, [p(-12.7, 3.6, -10.15), p(-8.3, 3.6, -10.15), p(-10.5, 3.6, -11.35)]),
  small('bench-master', 'stool', M.bench.x, 3.6, M.bench.z, Math.PI, M.bench.width, M.bench.depth, 1.10,
    [p(-17.5, 3.6, 6.2), p(-17.5, 3.6, 4.45), p(-18.8, 3.6, 5.3), p(-16.2, 3.6, 5.3)]),
  small('bench-guest-window', 'stool', G.bench.x, 3.6, G.bench.z, 0, G.bench.width, G.bench.depth, 1.10,
    [p(-15.7, 3.6, -16.25), p(-17.45, 3.6, -17.15), p(-13.95, 3.6, -17.15)]),
  { ...small('chair-pc', 'chair', 7.25, 0, 5.1, 0, 0.7, 0.75, 1.11, [p(6.35, 0, 5.2), p(7.25, 0, 5.97), p(8.15, 0, 5.2)]), controller: 'pc' },
  ...VILLA_BEDS.map((bed): VillaRelaxSeat => ({ id: bed.id, kind: 'bed', origin: { ...bed.origin }, width: bed.width + 0.15, depth: bed.depth,
    seat: { ...bed.rest }, approach: { ...bed.exits[0] }, exits: bed.exits.map(e => ({ ...e })), yaw: bed.yaw,
    pitch: bed.pitch, eyeHeight: bed.eyeHeight, freeLook: true })),
];
export function villaRelaxSeat(id: string | null | undefined): VillaRelaxSeat | null {
  return VILLA_RELAX_SEATS.find(seat => seat.id === id) ?? null;
}

/** Project the PRE-SEAT player position onto real cushion space, clamped clear of arms. */
export function resolveVillaSeatPosition(seat: VillaRelaxSeat, preSeatPosition: VillaPosition): VillaPosition {
  const segment = seat.cushionSegment;
  if (!segment || !Number.isFinite(preSeatPosition.x) || !Number.isFinite(preSeatPosition.z)) return { ...seat.seat };
  const [a, b] = segment, dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz;
  const t = length2 ? Math.max(0, Math.min(1, ((preSeatPosition.x - a.x) * dx + (preSeatPosition.z - a.z) * dz) / length2)) : 0;
  return p(a.x + dx * t, seat.seat.y, a.z + dz * t);
}

/** Front exits follow the chosen cushion; fallback sides are ordered by the player's entry. */
export function villaSeatExitCandidates(seat: VillaRelaxSeat, resolved = seat.seat, preSeatPosition?: VillaPosition): VillaPosition[] {
  const origin = preSeatPosition ?? resolved;
  const candidates = seat.exits.map(e => ({ ...e }));
  if (seat.kind === 'sofa') candidates.push(local(resolved, seat.yaw, 0, -1.05));
  if (preSeatPosition && Math.abs(preSeatPosition.y - seat.seat.y) < 0.1) candidates.push({ ...preSeatPosition });
  return candidates.sort((a, b) => Math.hypot(a.x - origin.x, a.z - origin.z) - Math.hypot(b.x - origin.x, b.z - origin.z));
}

/** Identity survives live collider updates; never ignore another chair or a shared room wall. */
const ownSeats = new WeakMap<VillaCollider, string>();
export function registerVillaSeatCollider(collider: VillaCollider, seatId: string): void { ownSeats.set(collider, seatId); }
export function villaSeatColliderId(collider: VillaCollider): string | null { return ownSeats.get(collider) ?? null; }
