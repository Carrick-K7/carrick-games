/** Shared architectural datum, in metres. Align BACK EDGES, never unlike-depth centres. */
export const VILLA_FIREPLACE_WALL = { x: -10, centerZ: -0.1, depth: 0.42, backZ: -0.1 - 0.42 / 2 } as const;
const backZ = VILLA_FIREPLACE_WALL.backZ;

/** South/living-facing cabinet. Equipment and interaction share this exact transform. */
export const VILLA_TEA_BAR = {
  x: -7.05, z: backZ + 0.8 / 2, width: 2.2, depth: 0.8, height: 0.95, backZ,
  yaw: Math.PI,
  approach: { x: -7.05, y: 0, z: 1.25 },
  anchor: { x: -7.3, y: 1.13, z: backZ + 0.8 / 2 + 0.205 },
  duration: 10,
} as const;

/** Ends west of the x=-2 room wall, leaving an actual reveal rather than intersecting it. */
export const VILLA_AQUARIUM = {
  x: -3.98, z: backZ + 1.03 / 2, width: 3.43, depth: 1.03, backZ,
  approach: { x: -3.98, y: 0, z: 1.45 },
  anchor: { x: -3.98, y: 1.72, z: backZ + 1.03 },
} as const;
