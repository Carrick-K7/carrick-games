import { describe, expect, it } from 'vitest';
import {
  VILLA_LANDSCAPE_CLUSTERS, VILLA_LANDSCAPE_TREES, VILLA_STREAM, VILLA_STREAM_BRIDGE,
  VILLA_STREAM_CUTOUTS, VILLA_STREAM_SECTIONS, VILLA_STREAM_WATER_OUTLINE, VILLA_STREAM_WATER_POLYGONS,
  villaLandscapeTreeBounds, villaStreamBasinGeometry, villaStreamBasinRows, villaStreamBridgeHeight,
  villaStreamContains, villaStreamDistance, villaStreamIntersectsPolygon, villaStreamSectionAt, villaStreamTerrainHeight,
} from '../src/villaStream.js';

const rect = (minX: number, maxX: number, minZ: number, maxZ: number) => [{ x: minX, z: minZ }, { x: maxX, z: minZ }, { x: maxX, z: maxZ }, { x: minX, z: maxZ }];

describe('Villa one-source stream, banks and crossing safety', () => {
  it('composes a modest meander entirely north of the retained fruit trees', () => {
    expect(VILLA_STREAM.minX).toBeLessThan(-40); expect(VILLA_STREAM.maxX).toBeGreaterThan(62);
    expect(VILLA_STREAM_SECTIONS.length).toBeLessThan(240);
    for (const s of VILLA_STREAM_SECTIONS) {
      expect(Object.values(s).every(Number.isFinite)).toBe(true);
      expect(s.z).toBeGreaterThan(-42); expect(s.z).toBeLessThan(-34);
      expect(s.halfWidth * 2).toBeGreaterThan(2.1); expect(s.halfWidth * 2).toBeLessThan(2.81);
      expect(s.z + s.halfWidth + VILLA_STREAM.bankWidth).toBeLessThan(-29);
    }
    expect(villaStreamSectionAt(0)!.z).toBe(-38);
    expect(VILLA_STREAM_WATER_OUTLINE).toHaveLength(VILLA_STREAM_SECTIONS.length * 2);
  });
  it('shares contiguous convex bank cutouts and exact drawn water quads', () => {
    for (let i = 0; i < VILLA_STREAM_CUTOUTS.length; i++) {
      const { polygon: p, bounds } = VILLA_STREAM_CUTOUTS[i]!;
      expect(bounds.maxX - bounds.minX).toBeLessThanOrEqual(.5);
      for (let j = 0; j < 4; j++) {
        const a = p[j]!, b = p[(j + 1) % 4]!, c = p[(j + 2) % 4]!;
        expect((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)).toBeGreaterThan(0);
        expect(a.x >= bounds.minX && a.x <= bounds.maxX && a.z >= bounds.minZ && a.z <= bounds.maxZ).toBe(true);
      }
      if (i) {
        expect(p[0]).toEqual(VILLA_STREAM_CUTOUTS[i - 1]!.polygon[1]);
        expect(p[3]).toEqual(VILLA_STREAM_CUTOUTS[i - 1]!.polygon[2]);
      }
      for (const v of VILLA_STREAM_WATER_POLYGONS[i]!.polygon) expect(villaStreamContains(v.x, v.z, 0, true)).toBe(true);
    }
  });
  it('never broadens the zero-radius water hazard onto visible dry banks', () => {
    for (let x = -43.7; x < 65.8; x += .173) {
      const s = villaStreamSectionAt(x)!;
      for (const sign of [-1, 1]) {
        expect(villaStreamContains(x, s.z + sign * (s.halfWidth - .0001), 0, true)).toBe(true);
        expect(villaStreamContains(x, s.z + sign * (s.halfWidth + .0001), 0, true)).toBe(false);
        expect(villaStreamContains(x, s.z + sign * (s.halfWidth + .20), .23, true)).toBe(true);
        expect(villaStreamContains(x, s.z + sign * (s.halfWidth + .30), .23, true)).toBe(false);
      }
    }
  });
  it('detects complete enclosure and water crossings with no wet footprint corners', () => {
    expect(villaStreamIntersectsPolygon(rect(-50, 70, -50, -25))).toBe(true);
    const crossing = rect(12, 14, -44, -29);
    expect(crossing.every(p => !villaStreamContains(p.x, p.z))).toBe(true);
    expect(villaStreamIntersectsPolygon(crossing)).toBe(true);
    const s = villaStreamSectionAt(15)!;
    expect(villaStreamIntersectsPolygon(rect(14.9, 15.1, s.z - .1, s.z + .1))).toBe(true);
    expect(villaStreamIntersectsPolygon(rect(-30, 50, -25, 159))).toBe(false);
    expect(villaStreamIntersectsPolygon(rect(13, 16, -49, -45))).toBe(false);
  });
  it('subtracts only the real bridge before circular and complete vehicle footprint tests', () => {
    for (let x = -2.0; x <= 2.0; x += .2) for (let z = -44; z <= -32; z += .2) expect(villaStreamContains(x, z, .23)).toBe(false);
    expect(villaStreamContains(0, -38, 0, true)).toBe(true);
    expect(villaStreamIntersectsPolygon(rect(-1.2, 1.2, -41, -35), .10)).toBe(false);
    expect(villaStreamIntersectsPolygon(rect(-1.2, 1.2, -41, -35), .10, true)).toBe(true);
    expect(villaStreamIntersectsPolygon(rect(1.3, 3.0, -41, -35))).toBe(true);
    expect(villaStreamContains(2.41, villaStreamSectionAt(2.41)!.z)).toBe(true);
    // The radius can extend off the deck even while its centre still lies on it.
    expect(villaStreamContains(2.25, -38, .23)).toBe(true);
  });
  it('has a continuous supported bridge, gentle entries and no unsupported water support', () => {
    const b = VILLA_STREAM_BRIDGE;
    expect(b.minZ - b.approachMinZ).toBe(3); expect(b.approachMaxZ - b.maxZ).toBe(3);
    expect(villaStreamBridgeHeight(0, b.approachMinZ + 1.5)).toBeCloseTo(.04, 12);
    expect(villaStreamBridgeHeight(0, b.approachMaxZ - 1.5)).toBeCloseTo(.04, 12);
    let last = 0;
    for (let z = b.approachMinZ; z <= b.approachMaxZ + .00001; z += .01) {
      const y = villaStreamBridgeHeight(0, Math.min(z, b.approachMaxZ))!;
      expect(y).not.toBeNull(); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(.080001);
      expect(Math.abs(y - last)).toBeLessThanOrEqual(.08 / 3 * .01 + 1e-10); last = y;
      expect(villaStreamContains(0, z, .23)).toBe(false);
    }
    expect(villaStreamBridgeHeight(0, b.approachMinZ)).toBe(0);
    expect(villaStreamBridgeHeight(0, b.approachMaxZ)).toBe(0);
    expect(villaStreamBridgeHeight(0, -38)).toBe(.08);
    expect(villaStreamBridgeHeight(2.41, -38)).toBeNull();
    expect(villaStreamBridgeHeight(2.25, -38, .23)).toBeNull();
    expect(villaStreamBridgeHeight(0, b.approachMinZ - .01)).toBeNull();
    expect(villaStreamBridgeHeight(0, b.approachMaxZ + .01)).toBeNull();
    for (const x of [-2.4, -1, 0, 1, 2.4]) {
      expect(villaStreamTerrainHeight(x, b.approachMinZ) ?? 0).toBe(0);
      expect(villaStreamTerrainHeight(x, b.approachMaxZ) ?? 0).toBe(0);
    }
  });
  it('matches every basin triangle height exactly and leaves no inter-transect cracks', () => {
    const { positions: p, indices } = villaStreamBasinGeometry();
    expect(p.every(Number.isFinite)).toBe(true); expect(indices.every(i => Number.isInteger(i) && i >= 0 && i < p.length / 3)).toBe(true);
    let error = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const vertices = [indices[i]!, indices[i + 1]!, indices[i + 2]!].map(k => ({ x: p[k * 3]!, y: p[k * 3 + 1]!, z: p[k * 3 + 2]! }));
      const x = vertices.reduce((sum, v) => sum + v.x / 3, 0), z = vertices.reduce((sum, v) => sum + v.z / 3, 0), y = vertices.reduce((sum, v) => sum + v.y / 3, 0);
      expect(villaStreamTerrainHeight(x, z)).not.toBeNull();
      error = Math.max(error, Math.abs(y - villaStreamTerrainHeight(x, z)!));
    }
    expect(error).toBeLessThan(1e-11);
    for (const s of VILLA_STREAM_SECTIONS.slice(1, -1)) {
      for (const row of villaStreamBasinRows(s)) {
        expect(villaStreamTerrainHeight(row.x, row.z) ?? 0).toBeCloseTo(row.y, 9);
        expect(Math.abs((villaStreamTerrainHeight(row.x - 1e-6, row.z) ?? 0) - (villaStreamTerrainHeight(row.x + 1e-6, row.z) ?? 0))).toBeLessThan(1e-5);
      }
    }
  });
  it('returns finite local heights, null outside and a shallow continuous water basin', () => {
    for (const s of VILLA_STREAM_SECTIONS) {
      expect(villaStreamTerrainHeight(s.x, s.z)).toBeCloseTo(VILLA_STREAM.bedY, 10);
      for (const sign of [-1, 1]) {
        expect(villaStreamTerrainHeight(s.x, s.z + sign * s.halfWidth)).toBeCloseTo(VILLA_STREAM.waterY, 10);
        expect(villaStreamTerrainHeight(s.x, s.z + sign * (s.halfWidth + 1.4)) ?? 0).toBeCloseTo(0, 10);
        expect(villaStreamTerrainHeight(s.x, s.z + sign * (s.halfWidth + 1.401))).toBeNull();
      }
    }
    expect(villaStreamTerrainHeight(0, -23.4)).toBeNull(); expect(villaStreamTerrainHeight(-45, -38)).toBeNull();
    expect(villaStreamDistance(0, -38)).toBe(0); expect(villaStreamDistance(0, -20)).toBeGreaterThan(12);
    expect(villaStreamContains(NaN, -38)).toBe(false); expect(villaStreamContains(0, Infinity)).toBe(false);
    expect(villaStreamTerrainHeight(NaN, -38)).toBeNull(); expect(villaStreamBridgeHeight(Infinity, -38)).toBeNull();
    expect(villaStreamIntersectsPolygon([])).toBe(false); expect(villaStreamIntersectsPolygon([{ x: NaN, z: 0 }, ...rect(0, 1, -39, -38)])).toBe(false);
  });
});

describe('Villa composed all-sides peripheral planting', () => {
  it('preserves a broad meadow and keeps whole crowns outside the walkable fence', () => {
    expect(VILLA_LANDSCAPE_TREES.length).toBeGreaterThan(45); expect(VILLA_LANDSCAPE_TREES.length).toBeLessThan(75);
    for (const side of ['north', 'east', 'south', 'west']) {
      const clusters = VILLA_LANDSCAPE_CLUSTERS.filter(c => c.side === side), trees = VILLA_LANDSCAPE_TREES.filter(t => t.side === side);
      expect(clusters.length).toBeGreaterThanOrEqual(3); expect(new Set(trees.map(t => t.kind)).size).toBe(3);
    }
    for (const t of VILLA_LANDSCAPE_TREES) {
      const b = villaLandscapeTreeBounds(t);
      expect(b.maxX < -42 || b.minX > 64 || b.maxZ < -60 || b.minZ > 164, JSON.stringify(t)).toBe(true);
    }
    for (let i = 0; i < VILLA_LANDSCAPE_CLUSTERS.length; i++) for (let j = i + 1; j < VILLA_LANDSCAPE_CLUSTERS.length; j++) {
      const a = VILLA_LANDSCAPE_CLUSTERS[i]!, b = VILLA_LANDSCAPE_CLUSTERS[j]!;
      expect(Math.hypot(a.x - b.x, a.z - b.z) - a.radius - b.radius).toBeGreaterThan(7);
    }
  });
});
