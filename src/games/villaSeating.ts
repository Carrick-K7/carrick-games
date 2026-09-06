import type { VillaPosition } from './villaWorld.js';

export interface VillaRelaxSeat {
  id: string;
  kind: 'sofa' | 'lounger';
  /** Floor-level player anchor, not cushion height; eyeHeight is relative to this floor. */
  seat: VillaPosition;
  approach: VillaPosition;
  /** Ordered candidates: controller must check live support/colliders before standing. */
  exits: VillaPosition[];
  /** Camera convention: yaw 0 faces -Z, matching the furniture's open front. */
  yaw: number;
  pitch: number;
  eyeHeight: number;
}

/** All five existing sofas and the two south-deck loungers. No scene/Three dependency. */
export const VILLA_RELAX_SEATS: readonly VillaRelaxSeat[] = [
  { id: 'sofa-living', kind: 'sofa', seat: { x: -6.65, y: 0, z: 5.68 },
    approach: { x: -5.25, y: 0, z: 5.45 }, exits: [{ x: -5.25, y: 0, z: 5.45 }, { x: -6.1, y: 0, z: 4.6 }],
    yaw: 0, pitch: -0.08, eyeHeight: 1.16 },
  { id: 'sofa-master', kind: 'sofa', seat: { x: -3.965, y: 3.6, z: 5.885 },
    approach: { x: -2.75, y: 3.6, z: 5.45 }, exits: [{ x: -2.75, y: 3.6, z: 5.45 }, { x: -3.05, y: 3.6, z: 4.8 }],
    yaw: -0.3, pitch: -0.06, eyeHeight: 1.16 },
  { id: 'sofa-library-west', kind: 'sofa', seat: { x: 4.153, y: 3.6, z: 6.289 },
    approach: { x: 3.35, y: 3.6, z: 5.25 }, exits: [{ x: 3.35, y: 3.6, z: 5.25 }, { x: 3, y: 3.6, z: 6.3 }],
    yaw: 0.4, pitch: -0.08, eyeHeight: 1.16 },
  { id: 'sofa-library-east', kind: 'sofa', seat: { x: 6.947, y: 3.6, z: 6.789 },
    approach: { x: 8.3, y: 3.6, z: 6.5 }, exits: [{ x: 8.3, y: 3.6, z: 6.5 }, { x: 7.1, y: 3.6, z: 5.55 }],
    yaw: -0.4, pitch: -0.08, eyeHeight: 1.16 },
  { id: 'sofa-roof', kind: 'sofa', seat: { x: -5.7, y: 7.2, z: 5.38 },
    approach: { x: -4.25, y: 7.2, z: 5.1 }, exits: [{ x: -4.25, y: 7.2, z: 5.1 }, { x: -5.1, y: 7.2, z: 4.3 }],
    yaw: 0, pitch: -0.04, eyeHeight: 1.16 },
  { id: 'lounger-west', kind: 'lounger', seat: { x: -20.2, y: 0, z: 9.55 },
    approach: { x: -21.25, y: 0, z: 9.5 }, exits: [{ x: -21.25, y: 0, z: 9.5 }, { x: -20.2, y: 0, z: 10.85 }],
    yaw: 0, pitch: 0.08, eyeHeight: 0.94 },
  { id: 'lounger-east', kind: 'lounger', seat: { x: -16.7, y: 0, z: 9.55 },
    approach: { x: -15.65, y: 0, z: 9.5 }, exits: [{ x: -15.65, y: 0, z: 9.5 }, { x: -16.7, y: 0, z: 10.85 }],
    yaw: 0, pitch: 0.08, eyeHeight: 0.94 },
];

export function villaRelaxSeat(id: string | null | undefined): VillaRelaxSeat | null {
  return VILLA_RELAX_SEATS.find(seat => seat.id === id) ?? null;
}

/** Tank cabinet aligned with the tea bar at z=-0.6; interaction stays in the living aisle. */
export const VILLA_AQUARIUM = {
  x: -3.5, z: -0.6, width: 3.43, depth: 1.03,
  approach: { x: -3.5, y: 0, z: 0.8 },
  anchor: { x: -3.5, y: 1.72, z: -0.085 },
} as const;
