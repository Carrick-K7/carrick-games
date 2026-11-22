/** Authoring datums shared by the glass, its offline cameras and the optical tests.
 * Axes point from the silver INTO the occupied room; +Z is south. */
export const VILLA_MIRROR_ROOMS = ['master', 'dressing', 'ensuite', 'bath', 'gym'] as const;
export type MirrorRoom = typeof VILLA_MIRROR_ROOMS[number];
export const VILLA_MIRROR_SITES = {
  master:   { eye:[-22.1,5.38,.27],   axis:[0,0,1],  lo:[-24.09,3.61,.11],   hi:[-4.11,6.99,8.89] },
  dressing: { eye:[-13.31,4.94,-2],  axis:[-1,0,0], lo:[-24.09,3.61,-8.89], hi:[-13.11,6.99,-.11] },
  ensuite:  { eye:[-8,5.56,-8.75],   axis:[0,0,1],  lo:[-12.89,3.61,-8.89], hi:[-4.11,6.99,-.11] },
  bath:     { eye:[13.7,5.56,.75],   axis:[0,0,-1], lo:[8.11,3.61,-8.89],   hi:[16.89,6.99,.89] },
  // North wall's occupied face is z=-18.09; keep the eye in front of the mounted silver, not inside solid plaster.
  gym:      { eye:[15.5,1.45,-18.03],axis:[0,0,1],  lo:[5.65,.01,-18.09],   hi:[16.89,3.39,1] },
} as const;
export const VILLA_MIRROR_LIGHT = { master:'master', dressing:'wardrobe', ensuite:'ensuite', bath:'bath', gym:'gym' } as const;
export const VILLA_MIRROR_LAYERS = ['dayOff', 'dayLit', 'nightOff', 'nightLit'] as const;
export const VILLA_MIRROR_SIZE = 384;
export const VILLA_MIRROR_BUDGET = { perRoomBytes: 192 * 1024, totalBytes: 640 * 1024, gpuBytes: 15 * 1024 * 1024 } as const;

/** Inverse hemi-octahedron. Unlike a spherical map there is no meridian through
 * the room and no wasted back hemisphere. Canvas row zero is v=0. Coordinates
 * are capture-camera right, world up and face-forward, NOT mirror-view right. */
export function mirrorPlateDirection(u: number, v: number): [number, number, number] {
  const x = u + v - 1, y = u - v, z = Math.max(0, 1 - Math.abs(x) - Math.abs(y));
  const l = Math.hypot(x,y,z);
  return [x/l,y/l,z/l];
}
