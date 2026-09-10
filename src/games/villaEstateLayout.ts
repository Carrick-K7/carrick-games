/** Authoritative metre-scale estate layout. +Z south/front, +X east.
 * Intentionally dependency-free: World, vehicles and scene all consume this file.
 */
export interface VillaEstateRect { minX: number; maxX: number; minZ: number; maxZ: number }
export const VILLA_ESTATE_BOUNDS = { minX: -24.5, maxX: 45, minZ: -16.5, maxZ: 162 } as const;
export const VILLA_GARAGE_EXTENT = { minX: 12, maxX: 34.8, minZ: -8, maxZ: 2, roofY: 3.5 } as const;
export const VILLA_GARAGE_BAYS = [
  { id: 'sedan', x: 16.2, z: -2.6, doorMinX: 14, doorMaxX: 18.5 },
  { id: 'pickup', x: 21.5, z: -2.6, doorMinX: 19.3, doorMaxX: 23.7 },
  { id: 'reserved-1', x: 26, z: -2.6, doorMinX: 24.1, doorMaxX: 28 },
  { id: 'reserved-2', x: 30.7, z: -2.6, doorMinX: 28.7, doorMaxX: 32.8 },
] as const;
export const VILLA_PICKUP_LIMITS = { halfWidth: 1.2, halfLength: 2.86, height: 1.98, wheelbase: 3.45, maxSpeed: 6.5, maxReverse: 2.4, maxSteer: .53 } as const;
const pickupBay = VILLA_GARAGE_BAYS[1];
export const VILLA_PICKUP = {
  center: { x: pickupBay.x, y: 0, z: pickupBay.z },
  seat: { x: pickupBay.x + .52, y: 0, z: pickupBay.z + .37 },
  door: { x: pickupBay.x + 1.1, y: 0, z: pickupBay.z + .42 },
  exit: { x: pickupBay.x + 2.75, y: 0, z: pickupBay.z - .30 },
  body: { minX: pickupBay.x - 1.2, maxX: pickupBay.x + 1.2, minZ: pickupBay.z - 2.86, maxZ: pickupBay.z + 2.86, minY: 0, maxY: 1.98 },
  eyeHeight: 1.58, yaw: Math.PI,
} as const;
export const VILLA_SCOOTER_PARKING = { x: 38, y: 0, z: 7 } as const;
export const VILLA_ESTATE_BUILDINGS = [
  { id: 'house', minX: -12, maxX: 12, minZ: -9, maxZ: 9 },
  { id: 'garage', ...VILLA_GARAGE_EXTENT },
] as const;
/** Fence runs live just beyond support bounds, so they never bisect the old
 * garden or expanded garage. Parent samples rail/post Y with terrainHeight. */
export const VILLA_ESTATE_FENCE_SEGMENTS = [
  { from: { x: -24.8, z: -16.8 }, to: { x: -24.8, z: 162.3 } },
  { from: { x: 45.3, z: -16.8 }, to: { x: 45.3, z: 162.3 } },
  { from: { x: -24.8, z: -16.8 }, to: { x: 45.3, z: -16.8 } },
  { from: { x: -24.8, z: 162.3 }, to: { x: 45.3, z: 162.3 } },
] as const;
export const VILLA_POND_BOUNDS = { minX: -20, maxX: -6, minZ: 67, maxZ: 88 } as const;
export const VILLA_POND = { x: -13, z: 77.5, radiusX: 7, radiusZ: 10.5, waterY: -.10 } as const;
/** Extra western beds sit clear of both the preserved early oval and its long
 * southern branch. No original house, pool or garden planting is replaced. */
export const VILLA_ESTATE_FIELDS = [
  { minX: -22.4, maxX: -15.4, minZ: 30, maxZ: 40.5, crop: 'cabbage' },
  { minX: -22.4, maxX: -15.4, minZ: 43, maxZ: 54.5, crop: 'corn' },
  { minX: -22.4, maxX: -15.4, minZ: 57, maxZ: 63, crop: 'lavender' },
] as const;
export const VILLA_ESTATE_VIEWPOINT = { x: 14, z: 127, radius: 4.2 } as const;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp01(n); return t * t * t * (t * (t * 6 - 15) + 10); };
export function villaEstateContains(x: number, z: number, radius = 0): boolean {
  const b = VILLA_ESTATE_BOUNDS;
  return Number.isFinite(x) && Number.isFinite(z) && x - radius >= b.minX && x + radius <= b.maxX && z - radius >= b.minZ && z + radius <= b.maxZ;
}
/** Expanded ellipse is conservative for a circular player/tyre footprint. The
 * natural water edge is slightly inside it; no invisible walkable water patch. */
export function villaPondContains(x: number, z: number, padding = 0): boolean {
  const p = VILLA_POND, scale = 1 + Math.max(0, padding) / Math.min(p.radiusX, p.radiusZ);
  // Expanding normalized radius by padding/minRadius conservatively contains
  // the true circular offset even at diagonal ellipse tangents.
  return ((x - p.x) / (p.radiusX * scale)) ** 2 + ((z - p.z) / (p.radiusZ * scale)) ** 2 <= 1;
}
/** Exact polygon/ellipse contact (in ellipse-normalized coordinates), including
 * a pond wholly enclosed by a footprint and edge-only water crossings. */
export function villaPondIntersectsPolygon(points: readonly { x: number; z: number }[], padding = 0): boolean {
  const p = VILLA_POND, scale = 1 + Math.max(0, padding) / Math.min(p.radiusX, p.radiusZ);
  const vertices = points.map(v => ({ x: (v.x - p.x) / (p.radiusX * scale), z: (v.z - p.z) / (p.radiusZ * scale) }));
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[j]!, b = vertices[i]!, dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, -(a.x * dx + a.z * dz) / (dx * dx + dz * dz || 1)));
    if ((a.x + t * dx) ** 2 + (a.z + t * dz) ** 2 <= 1) return true;
    if ((a.z > 0) !== (b.z > 0) && 0 < a.x + (b.x - a.x) * -a.z / (b.z - a.z)) inside = !inside;
  }
  return inside;
}
/** C2-continuous positive rolls; exactly flat near every existing house/garden
 * object. Broad gaussian hills total <2.8m, never steep stair-like height bands.
 * A level pond shelf blends back into the meadow over a generous bank. */
export function villaTerrainHeight(x: number, z: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(z) || z <= 35) return 0;
  const hill = (cx: number, cz: number, sx: number, sz: number) => Math.exp(-(((x - cx) / sx) ** 2 + ((z - cz) / sz) ** 2));
  const hills = 1.85 * hill(17, 122, 35, 34) + .65 * hill(-10, 151, 30, 26) + .30 * hill(29, 68, 30, 23);
  const pondDistance = Math.hypot((x - VILLA_POND.x) / 10, (z - VILLA_POND.z) / 14);
  return hills * smooth((z - 35) / 26) * smooth((pondDistance - 1) / .75);
}
export function villaTerrainNormal(x: number, z: number) {
  const e = .025, dx = (villaTerrainHeight(x + e, z) - villaTerrainHeight(x - e, z)) / (2 * e);
  const dz = (villaTerrainHeight(x, z + e) - villaTerrainHeight(x, z - e)) / (2 * e), length = Math.hypot(dx, 1, dz);
  return { x: -dx / length, y: 1 / length, z: -dz / length };
}
/** Three Euler order YXZ: yaw stays the driver's heading; pitch/roll align the
 * chassis up axis to the common terrain normal. Never integrate vertical drift. */
export function villaTerrainOrientation(x: number, z: number, yaw = 0) {
  const n = villaTerrainNormal(x, z), dx = -n.x / n.y, dz = -n.z / n.y;
  const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw), lateral = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const pitch = -Math.atan(forward), roll = Math.atan(lateral * Math.cos(pitch));
  return { y: villaTerrainHeight(x, z), pitch: pitch || 0, roll: roll || 0, order: 'YXZ' as const };
}
export function villaTerrainLocalPoint(pose: { x: number; z: number; yaw: number }, x: number, y: number, z: number) {
  const terrain = villaTerrainOrientation(pose.x, pose.z, pose.yaw), cr = Math.cos(terrain.roll), sr = Math.sin(terrain.roll);
  const cp = Math.cos(terrain.pitch), sp = Math.sin(terrain.pitch), c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
  const rx = cr * x - sr * y, ry = cp * (sr * x + cr * y) - sp * z, rz = sp * (sr * x + cr * y) + cp * z;
  return { x: pose.x + c * rx + s * rz, y: terrain.y + ry, z: pose.z - s * rx + c * rz };
}
/** Ground anchors retain the familiar yaw-only XZ coordinates; the walking and
 * seated camera base is the exact support at that anchor, not a baked zero. */
export function villaTerrainAnchor(pose: { x: number; z: number; yaw: number }, localX: number, localZ: number) {
  const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw), x = pose.x + c * localX + s * localZ, z = pose.z - s * localX + c * localZ;
  return { x, y: villaTerrainHeight(x, z), z };
}
export function villaTerrainBounds(pose: { x: number; z: number; yaw: number }, halfWidth: number, halfLength: number, height: number) {
  // Analytic transformed-box extents: one terrain evaluation, not eight corner
  // evaluations for every obstacle during a 120Hz vehicle substep.
  const t = villaTerrainOrientation(pose.x, pose.z, pose.yaw), cr = Math.cos(t.roll), sr = Math.sin(t.roll), cp = Math.cos(t.pitch), sp = Math.sin(t.pitch), c = Math.cos(pose.yaw), s = Math.sin(pose.yaw), h = height / 2;
  const xx = c * cr + s * sp * sr, xy = -c * sr + s * sp * cr, xz = s * cp;
  const yx = cp * sr, yy = cp * cr, yz = -sp;
  const zx = -s * cr + c * sp * sr, zy = s * sr + c * sp * cr, zz = c * cp;
  const cx = pose.x + xy * h, cy = t.y + yy * h, cz = pose.z + zy * h;
  const ex = halfWidth * Math.abs(xx) + h * Math.abs(xy) + halfLength * Math.abs(xz);
  const ey = halfWidth * Math.abs(yx) + h * Math.abs(yy) + halfLength * Math.abs(yz);
  const ez = halfWidth * Math.abs(zx) + h * Math.abs(zy) + halfLength * Math.abs(zz);
  return { minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, minY: cy - ey, maxY: cy + ey };
}
