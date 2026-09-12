import type { VillaCollider, VillaPosition } from './villaWorld.js';
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
export const VILLA_BEDS = [
  { id: 'bed-master', origin: p(-8, 3.6, 5.5), width: 2.55, depth: 3.8, yaw: 0,
    pillow: p(-8, 4.55, 6.75), pillowWidth: 1.15,
    rest: p(-8, 3.6, 6.65), eyeHeight: 1.12, pitch: 0.16,
    exits: [p(-6.05, 3.6, 5.3), p(-10, 3.6, 5.3), p(-8, 3.6, 3.1)] },
  { id: 'bed-guest', origin: p(-8, 3.6, -5.5), width: 2.1, depth: 3.8, yaw: Math.PI,
    pillow: p(-8, 4.55, -6.75), pillowWidth: 1.05,
    rest: p(-8, 3.6, -6.65), eyeHeight: 1.12, pitch: 0.16,
    exits: [p(-6.25, 3.6, -5.3), p(-9.8, 3.6, -5.3), p(-8, 3.6, -3.1)] },
] as const;
export function villaBedRestPose(id: string) {
  const bed = VILLA_BEDS.find(b => b.id === id);
  return bed ? { position: { ...bed.rest }, yaw: bed.yaw, pitch: bed.pitch, eyeHeight: bed.eyeHeight, freeLook: true as const, exits: bed.exits.map(e => ({ ...e })) } : null;
}

/** All authored non-vehicle seats. The original seven IDs/order remain compatible. */
export const VILLA_RELAX_SEATS: readonly VillaRelaxSeat[] = [
  sofa('sofa-living', -8, 0, 5.8, 4.2, 0, [p(-5.25, 0, 5.45), p(-6.1, 0, 4.6), p(-10.75, 0, 4.5)]),
  sofa('sofa-master', -4, 3.6, 6, 1.25, -0.3, [p(-2.75, 3.6, 5.45), p(-3.05, 3.6, 4.8), p(-5.15, 3.6, 5.5)]),
  sofa('sofa-library-west', 4.2, 3.6, 6.4, 1.4, 0.4, [p(3.35, 3.6, 5.25), p(3, 3.6, 6.3)]),
  sofa('sofa-library-east', 6.9, 3.6, 6.9, 1.5, -0.4, [p(8.3, 3.6, 6.5), p(7.1, 3.6, 5.55)]),
  sofa('sofa-roof', -7, 7.2, 5.5, 4.15, 0, [p(-4.25, 7.2, 5.1), p(-5.1, 7.2, 4.3), p(-9.75, 7.2, 4.3)]),
  ...[-20.2, -16.7].map((x, i): VillaRelaxSeat => ({ id: i ? 'lounger-east' : 'lounger-west', kind: 'lounger',
    origin: p(x, 0, 9), width: 0.97, depth: 2.7, seat: p(x, 0, 9.55),
    approach: p(x + (i ? 1.05 : -1.05), 0, 9.5), exits: [p(x + (i ? 1.05 : -1.05), 0, 9.5), p(x, 0, 10.85), p(x + (i ? -1.05 : 1.05), 0, 9.5)],
    yaw: 0, pitch: 0.08, eyeHeight: 0.94, freeLook: true })),
  // 1.1.0 east wing: the widened reading bay and roof lounge are real seats.
  sofa('sofa-library-bay', 13.4, 3.6, 6.9, 1.3, 0.5, [p(13.85, 3.6, 8.05), p(14.85, 3.6, 7.05), p(12.35, 3.6, 8.15)]),
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
  small('chair-guest', 'chair', -4.05, 3.6, -5.65, 0, 0.65, 0.68, 1.08, [p(-3.2, 3.6, -5.55), p(-4.05, 3.6, -4.8)]),
  small('stool-dressing', 'stool', -4.35, 3.6, 1.58, 0, 0.604, 0.544, 1.04, [p(-4.35, 3.6, 2.32), p(-3.58, 3.6, 1.7)]),
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
