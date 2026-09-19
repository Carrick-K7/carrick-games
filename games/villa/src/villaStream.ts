/** Dependency-free, metre-scale north landscape contract. +Z is south.
 * The rendered shore, terrain opening and collision all use the SAME sampled
 * polygons, not a wider rectangular hazard or a separate analytic approximation.
 */
export interface VillaStreamPoint { x: number; z: number }
export interface VillaStreamBounds { minX: number; maxX: number; minZ: number; maxZ: number }
export const VILLA_STREAM = {
  minX: -44, maxX: 66, sampleMetres: .5, waterY: -.12, bedY: -.50,
  bankWidth: 1.4, flowMetresPerSecond: .24, audioRange: 18,
} as const;
export const VILLA_STREAM_BRIDGE = {
  minX: -2.4, maxX: 2.4, minZ: -41, maxZ: -35, deckY: .08,
  approachMinZ: -44, approachMaxZ: -32, railX: 2.30,
  railMinZ: -40.71, railMaxZ: -35.29, railTopY: 1.12,
} as const;
export const VILLA_STREAM_PATH = { minZ: -54, maxZ: -18.5, halfWidth: 1.1 } as const;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const finite = (p: VillaStreamPoint) => Number.isFinite(p.x) && Number.isFinite(p.z);
/** Authored lazy bends, not a high-frequency serpentine. The centre meets the
 * bridge at (0,-38); width stays 2.16–2.80m, narrowing around its abutments. */
export const VILLA_STREAM_SECTIONS = [...new Set([
  ...Array.from({ length: (VILLA_STREAM.maxX - VILLA_STREAM.minX) / VILLA_STREAM.sampleMetres + 1 }, (_, i) => VILLA_STREAM.minX + i * VILLA_STREAM.sampleMetres),
  VILLA_STREAM_BRIDGE.minX, VILLA_STREAM_BRIDGE.maxX,
])].sort((a, b) => a - b).map(x => ({
  x, z: -38 + 2.45 * Math.sin(x / 16) + .90 * Math.sin(x / 7.8),
  halfWidth: 1.24 + .10 * Math.sin(x / 12 + .6) + .06 * Math.sin(x / 4.7),
}));
export type VillaStreamSection = typeof VILLA_STREAM_SECTIONS[number];
const boundsOf = (points: readonly VillaStreamPoint[]): VillaStreamBounds => ({
  minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)),
  minZ: Math.min(...points.map(p => p.z)), maxZ: Math.max(...points.map(p => p.z)),
});
function strip(a: VillaStreamSection, b: VillaStreamSection, margin = 0) {
  // Counter-clockwise XZ: compatible with villaTerrainModel's convex subtract.
  const polygon = [{ x: a.x, z: a.z - a.halfWidth - margin }, { x: b.x, z: b.z - b.halfWidth - margin },
    { x: b.x, z: b.z + b.halfWidth + margin }, { x: a.x, z: a.z + a.halfWidth + margin }];
  return { polygon, bounds: boundsOf(polygon) };
}
/** Subtract these OUTER bank quads from the lawn. The stream model fills every
 * hole, including dry banks. Do not cut only the water then leave grass across
 * the depressed banks. Bounds and polygons deliberately have identical extents. */
export const VILLA_STREAM_CUTOUTS = VILLA_STREAM_SECTIONS.slice(1).map((b, i) => strip(VILLA_STREAM_SECTIONS[i]!, b, VILLA_STREAM.bankWidth));
export const VILLA_STREAM_WATER_POLYGONS = VILLA_STREAM_SECTIONS.slice(1).map((b, i) => strip(VILLA_STREAM_SECTIONS[i]!, b));
const unsafeWater = VILLA_STREAM_WATER_POLYGONS.filter(p => p.bounds.maxX <= VILLA_STREAM_BRIDGE.minX || p.bounds.minX >= VILLA_STREAM_BRIDGE.maxX);
export const VILLA_STREAM_BOUNDS = boundsOf(VILLA_STREAM_CUTOUTS.flatMap(p => p.polygon));
export const VILLA_STREAM_WATER_BOUNDS = boundsOf(VILLA_STREAM_WATER_POLYGONS.flatMap(p => p.polygon));
/** One simple outline, suitable for filling the map rather than stroking a fat,
 * misleading centreline. First half follows north bank, second follows south. */
export const VILLA_STREAM_WATER_OUTLINE: readonly VillaStreamPoint[] = [
  ...VILLA_STREAM_SECTIONS.map(p => ({ x: p.x, z: p.z - p.halfWidth })),
  ...[...VILLA_STREAM_SECTIONS].reverse().map(p => ({ x: p.x, z: p.z + p.halfWidth })),
];
function sectionIndex(x: number): number {
  let lo = 0, hi = VILLA_STREAM_SECTIONS.length - 2;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (x > VILLA_STREAM_SECTIONS[mid + 1]!.x) lo = mid + 1; else hi = mid; }
  return lo;
}
export function villaStreamSectionAt(x: number): VillaStreamSection | null {
  if (!Number.isFinite(x) || x < VILLA_STREAM.minX || x > VILLA_STREAM.maxX) return null;
  const i = sectionIndex(x), a = VILLA_STREAM_SECTIONS[i]!, b = VILLA_STREAM_SECTIONS[i + 1]!, t = (x - a.x) / (b.x - a.x);
  return { x, z: lerp(a.z, b.z, t), halfWidth: lerp(a.halfWidth, b.halfWidth, t) };
}
const cross = (a: VillaStreamPoint, b: VillaStreamPoint, p: VillaStreamPoint) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
function segmentDistanceSquared(p: VillaStreamPoint, a: VillaStreamPoint, b: VillaStreamPoint): number {
  const dx = b.x - a.x, dz = b.z - a.z, t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return (p.x - a.x - t * dx) ** 2 + (p.z - a.z - t * dz) ** 2;
}
function containsPolygon(points: readonly VillaStreamPoint[], p: VillaStreamPoint): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j]!, b = points[i]!;
    if (segmentDistanceSquared(p, a, b) < 1e-18) return true;
    if ((a.z > p.z) !== (b.z > p.z) && p.x < a.x + (b.x - a.x) * (p.z - a.z) / (b.z - a.z)) inside = !inside;
  }
  return inside;
}
function touchesSegments(a: VillaStreamPoint, b: VillaStreamPoint, c: VillaStreamPoint, d: VillaStreamPoint, padding: number): boolean {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return true;
  return Math.min(segmentDistanceSquared(a, c, d), segmentDistanceSquared(b, c, d), segmentDistanceSquared(c, a, b), segmentDistanceSquared(d, a, b)) <= padding * padding + 1e-18;
}
function overlaps(a: VillaStreamBounds, b: VillaStreamBounds, padding: number) {
  return a.minX <= b.maxX + padding && a.maxX >= b.minX - padding && a.minZ <= b.maxZ + padding && a.maxZ >= b.minZ - padding;
}
/** Circular footprint vs drawn water, subtracting the real bridge by default.
 * Padding is actual body/tyre radius, not an aesthetic bank exclusion. Pass
 * includeBridge=true for raw water rendering/audio/rain tests beneath the deck. */
export function villaStreamContains(x: number, z: number, padding = 0, includeBridge = false): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(padding)) return false;
  padding = Math.max(0, padding);
  const p = { x, z }, box = { minX: x, maxX: x, minZ: z, maxZ: z };
  if (!overlaps(box, VILLA_STREAM_WATER_BOUNDS, padding)) return false;
  return (includeBridge ? VILLA_STREAM_WATER_POLYGONS : unsafeWater).some(({ polygon, bounds }) => overlaps(box, bounds, padding) &&
    (containsPolygon(polygon, p) || polygon.some((a, i) => segmentDistanceSquared(p, a, polygon[(i + 1) % polygon.length]!) <= padding * padding + 1e-18)));
}
/** Exact footprint-edge/shore crossings and complete enclosure, including
 * vehicles whose four corners are all on dry land but whose middle spans water.
 * Bridge subtraction happens to the water polygons BEFORE footprint testing. */
export function villaStreamIntersectsPolygon(points: readonly VillaStreamPoint[], padding = 0, includeBridge = false): boolean {
  if (points.length < 3 || !points.every(finite) || !Number.isFinite(padding)) return false;
  padding = Math.max(0, padding);
  const box = boundsOf(points);
  if (!overlaps(box, VILLA_STREAM_WATER_BOUNDS, padding)) return false;
  return (includeBridge ? VILLA_STREAM_WATER_POLYGONS : unsafeWater).some(({ polygon, bounds }) => {
    if (!overlaps(box, bounds, padding)) return false;
    if (containsPolygon(polygon, points[0]!) || containsPolygon(points, polygon[0]!)) return true;
    return points.some((a, i) => polygon.some((c, j) => touchesSegments(a, points[(i + 1) % points.length]!, c, polygon[(j + 1) % polygon.length]!, padding)));
  });
}
/** Shared bathymetric rows from north to south. Banks are low and walkable;
 * the submerged rows are never player support (check water exclusion first). */
export function villaStreamBasinRows(section: VillaStreamSection): { x: number; y: number; z: number }[] {
  const h = section.halfWidth;
  const offsets = [-h - 1.4, -h - .9, -h - .4, -h, -h * .72, 0, h * .72, h, h + .4, h + .9, h + 1.4];
  const heights = [0, -.025, -.065, VILLA_STREAM.waterY, -.42, VILLA_STREAM.bedY, -.42, VILLA_STREAM.waterY, -.065, -.025, 0];
  return offsets.map((z, i) => ({ x: section.x, y: heights[i]!, z: section.z + z }));
}
export function villaStreamBasinGeometry() {
  const rows = VILLA_STREAM_SECTIONS.map(villaStreamBasinRows), positions = rows.flatMap(row => row.flatMap(p => [p.x, p.y, p.z])), indices: number[] = [];
  const stride = rows[0]!.length;
  for (let i = 0; i + 1 < rows.length; i++) for (let j = 0; j + 1 < stride; j++) { const a = i * stride + j, b = a + stride; indices.push(a, a + 1, b, a + 1, b + 1, b); }
  return { positions, indices, stride };
}
/** EXACT height of the same triangles villaStreamBasinGeometry renders. Null
 * means leave the original terrain alone. Never add bridge height to the grass
 * mesh: that would put opaque grass between/above the timber planks. */
export function villaStreamTerrainHeight(x: number, z: number): number | null {
  const section = villaStreamSectionAt(x);
  if (!section || !Number.isFinite(z) || Math.abs(z - section.z) > section.halfWidth + VILLA_STREAM.bankWidth) return null;
  const i = sectionIndex(x), a = villaStreamBasinRows(VILLA_STREAM_SECTIONS[i]!), b = villaStreamBasinRows(VILLA_STREAM_SECTIONS[i + 1]!);
  const t = (x - a[0]!.x) / (b[0]!.x - a[0]!.x);
  for (let j = 0; j + 1 < a.length; j++) {
    if (z > lerp(a[j + 1]!.z, b[j + 1]!.z, t) + 1e-10) continue;
    const vertices = z <= lerp(a[j + 1]!.z, b[j]!.z, t) ? [a[j]!, a[j + 1]!, b[j]!] : [a[j + 1]!, b[j + 1]!, b[j]!];
    const [p, q, r] = vertices, point = { x, z }, area = cross(p!, q!, r!);
    return (cross(q!, r!, point) * p!.y + cross(r!, p!, point) * q!.y + cross(p!, q!, point) * r!.y) / area;
  }
  return 0;
}
/** Deck and continuous 8cm/3m entry ramps (2.667% grade). The generous run
 * keeps long vehicles' centre-normal pitch modest at the flat/ramp joins.
 * Padding insets only X: the footprint can straddle a ramp end and dry ground
 * without losing support. Bridge rails supply the physical edge collision. */
export function villaStreamBridgeHeight(x: number, z: number, padding = 0): number | null {
  const b = VILLA_STREAM_BRIDGE;
  if (![x, z, padding].every(Number.isFinite) || x < b.minX + Math.max(0, padding) || x > b.maxX - Math.max(0, padding) || z < b.approachMinZ || z > b.approachMaxZ) return null;
  if (z < b.minZ) return b.deckY * (z - b.approachMinZ) / (b.minZ - b.approachMinZ);
  if (z > b.maxZ) return b.deckY * (b.approachMaxZ - z) / (b.approachMaxZ - b.maxZ);
  return b.deckY;
}
/** Useful for quiet spatial ambience, independent of bridge water exclusion. */
export function villaStreamDistance(x: number, z: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return Infinity;
  let squared = Infinity;
  for (let i = 1; i < VILLA_STREAM_SECTIONS.length; i++) squared = Math.min(squared, segmentDistanceSquared({ x, z }, VILLA_STREAM_SECTIONS[i - 1]!, VILLA_STREAM_SECTIONS[i]!));
  return Math.sqrt(squared);
}

/** Asymmetric copses separated by broad meadow views, never a hedge perimeter.
 * The cluster radius is only a compositional footprint, NOT a solid collider. */
export const VILLA_LANDSCAPE_CLUSTERS = [
  { side: 'west', x: -52, z: -25, count: 4, radius: 5.0 },
  { side: 'west', x: -60, z: 24, count: 5, radius: 7.2 },
  { side: 'west', x: -51, z: 76, count: 3, radius: 5.0 },
  { side: 'west', x: -64, z: 131, count: 5, radius: 7.4 },
  { side: 'east', x: 77, z: -21, count: 4, radius: 5.5 },
  { side: 'east', x: 85, z: 35, count: 5, radius: 7.5 },
  { side: 'east', x: 75, z: 89, count: 3, radius: 5.5 },
  { side: 'east', x: 86, z: 143, count: 4, radius: 7.0 },
  { side: 'north', x: -30, z: -70, count: 5, radius: 6.0 },
  { side: 'north', x: -6, z: -79, count: 3, radius: 5.8 },
  { side: 'north', x: 27, z: -72, count: 4, radius: 5.6 },
  { side: 'north', x: 53, z: -82, count: 5, radius: 7.2 },
  { side: 'south', x: -26, z: 180, count: 4, radius: 6.0 },
  { side: 'south', x: 8, z: 188, count: 5, radius: 7.0 },
  { side: 'south', x: 43, z: 180, count: 4, radius: 6.0 },
] as const;
export type VillaLandscapeTreeKind = 'oak' | 'birch' | 'pine';
export const VILLA_LANDSCAPE_TREES = VILLA_LANDSCAPE_CLUSTERS.flatMap((cluster, index) => Array.from({ length: cluster.count }, (_, j) => {
  const a = j * 2.399 + index * .83, r = cluster.radius * (.28 + .56 * Math.sqrt(j / cluster.count));
  return { x: cluster.x + Math.cos(a) * r, z: cluster.z + Math.sin(a) * r,
    scale: .85 + ((index * 7 + j * 3) % 9) * .065, yaw: a,
    kind: (['oak', 'birch', 'pine'] as const)[(index + j) % 3]!, side: cluster.side, cluster: index };
}));
/** These bounds include visible crown tips, not just the trunk. */
export function villaLandscapeTreeBounds(tree: typeof VILLA_LANDSCAPE_TREES[number]): VillaStreamBounds {
  const radius = (tree.kind === 'pine' ? 1.9 : tree.kind === 'birch' ? 2.1 : 3.1) * tree.scale;
  return { minX: tree.x - radius, maxX: tree.x + radius, minZ: tree.z - radius, maxZ: tree.z + radius };
}
export const VILLA_STREAM_RENDER_BUDGET = { maxMeshes: 15, maxTriangles: 18000 } as const;
export const VILLA_LANDSCAPE_RENDER_BUDGET = { maxMeshes: 9, maxTriangles: 42000, trees: VILLA_LANDSCAPE_TREES.length } as const;
