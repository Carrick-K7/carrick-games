import { VILLA_EAST_WALL as E, VILLA_WEST_WALL as W, VILLA_NORTH_WALL as N, VILLA_SOUTH_WALL as S, VILLA_GARAGE_EXTENT as G } from './villaEstateLayout.js';
import { STOREY, VILLA_BLOCKS } from './villaWorld.js';

/** World metres. Storeys have separate texel-centred slices: the floor on top of
 * a 20 cm slab must NOT blend lighting with the soffit below. The small glazed
 * stair pavilion fits in unused space above the garage in the upper atlas. */
export const roomGrid = { x0: -24.55, z0: -21.65, pitch: .32, nx: 249, nz: 98, layers: 8, low: .045, high: 3.345,
  dx: -24 / 26, dz: 24 / 26, pavilionShift: 36, returnStep: 3 } as const;
const pavilion = VILLA_BLOCKS.find(b => b.material === 'roof' && b.y > 2 * STOREY)!;
export const indoorVolumes = [
  { x0: W.inner, x1: E.inner, z0: N.inner, z1: S.inner, bottom: -.008, top: STOREY - .1, floor: 0, bank: 0, shift: 0 },
  { x0: G.minX, x1: G.maxX, z0: G.minZ, z1: G.maxZ, bottom: -.008, top: G.roofY, floor: 0, bank: 0, shift: 0 },
  { x0: W.inner, x1: E.inner, z0: N.inner, z1: S.inner, bottom: STOREY - .1, top: 2 * STOREY - .1, floor: STOREY, bank: 1, shift: 0 },
  // Roof overhang is .2 m, not an extra strip of indoor terrace.
  { x0: pavilion.x - pavilion.w / 2 + .2, x1: pavilion.x + pavilion.w / 2 - .2,
    z0: pavilion.z - pavilion.d / 2 + .25, z1: pavilion.z + pavilion.d / 2 - .25,
    bottom: 2 * STOREY - .008, top: pavilion.y, floor: 2 * STOREY, bank: 1, shift: roomGrid.pavilionShift },
] as const;
