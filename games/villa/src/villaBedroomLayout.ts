/** Shared 2F suite datums. Furniture and interaction anchors consume the same
 * layout: the guest entrance is an aisle, never a bed/desk footprint. */
export const VILLA_MASTER_VANITY = {
  x: -22.1, y: 3.6, z: .59, width: 3.2, depth: .82, height: .82,
  kneeWidth: 1.05, kneeHeight: .69,
} as const;
export const VILLA_MASTER_MIRROR = {
  x: VILLA_MASTER_VANITY.x, y: 5.38, z: .205, width: 2.5, height: 1.38, depth: .065,
} as const;
export const VILLA_MASTER_STOOL = {
  x: VILLA_MASTER_VANITY.x, y: 3.6, z: 1.66, width: .6, depth: .54, height: .49,
} as const;
export const VILLA_BEDROOM_LAYOUT = {
  master: {
    bed: { x: -17.5, z: 2.1, width: 2.55, yaw: Math.PI },
    sofa: { x: -9.4, z: 6.45, width: 2.6, yaw: Math.PI / 2 },
    chair: { x: -12.2, z: 4.85, yaw: -.75 },
    coffee: { x: -11.35, z: 6.65, width: 1.05, depth: 1.45 },
    bench: { x: -17.5, z: 5.3, width: 2, depth: .55 },
  },
  guest: {
    bed: { x: -21.3, z: -11.1, width: 2.1, yaw: 0 },
    sofa: { x: -10.5, z: -10.15, width: 3.0, yaw: 0 },
    coffee: { x: -10.5, z: -12.2, width: 1.7, depth: .85 },
    desk: { x: -8.2, z: -17.48, width: 3.0, depth: .85 },
    chair: { x: -8.2, z: -16.2, yaw: 0 },
    bench: { x: -15.7, z: -17.15, width: 2.4, depth: .55 },
  },
} as const;
