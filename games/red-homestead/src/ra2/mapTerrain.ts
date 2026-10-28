import { BinaryReader, RA2_LIMITS, fail } from './binary.js';
import { readMapHeader } from './map.js';
import { decodeMapPack } from './mapPack.js';
import type { MapParseOptions, MapRect, Ra2MapMetadata } from './map.js';

export interface Ra2TerrainCell {
  /** Original isometric cell coordinates, not screen coordinates or rectangular array indices. */
  x: number;
  y: number;
  /** Raw unsigned 32-bit theater-global tile index. 0xffff is the format's clear-tile sentinel. */
  tileIndex: number;
  subTileIndex: number;
  level: number;
  iceGrowth: number;
}
export interface Ra2MapTerrain {
  kind: 'terrain-tiles';
  source: 'IsoMapPack5';
  size: MapRect;
  theater: Ra2MapMetadata['theater'];
  tiles: Ra2TerrainCell[];
  tileCount: number;
  /** Missing clear cells are not manufactured in tiles[]. */
  declaredCellCount: number;
  omittedCellCount: number;
  chunkCount: number;
  unpackedBytes: number;
  /** Community maps use both a four-zero coordinate terminator and exact record-buffer EOF. */
  termination: 'zero-coordinate' | 'end-of-buffer';
  /** Tile indices still require the matching theater INI tileset table and local TMP assets. */
  requiresTheaterMapping: true;
}

/** Dedicated terrain-data import, separate from inert parseMapIni metadata.
 * Decodes only actual records: no inferred art, tile table, overlay, rules or playable scene.
 */
export function decodeMapTerrain(bytes: Uint8Array, options: MapParseOptions = {}): Ra2MapTerrain {
  const { size, theater } = readMapHeader(bytes, options);
  if (size.x !== 0 || size.y !== 0) fail('IsoMapPack5', 'UNSUPPORTED', 'Nonzero Map.Size origins are not supported by the terrain decoder');
  const maximumCells = (size.width * 2 - 1) * size.height;
  if (maximumCells > RA2_LIMITS.maxTerrainCells) fail('IsoMapPack5', 'LIMIT_EXCEEDED', 'Map cell count limit exceeded');
  const { decoded, chunkCount } = decodeMapPack(bytes, 'IsoMapPack5', Math.min(maximumCells * 11 + 4, RA2_LIMITS.maxPackedOutputBytes), options);
  const total = decoded.length;
  const terminated = total >= 4 && (total - 4) % 11 === 0;
  if (!terminated && (total === 0 || total % 11 !== 0)) fail('IsoMapPack5', 'INVALID_FORMAT', 'Terrain data must contain whole 11-byte records, optionally followed by a four-byte terminator');
  const terrain = new BinaryReader(decoded, 'IsoMapPack5', RA2_LIMITS.maxPackedOutputBytes);
  if (terminated && terrain.u32(total - 4) !== 0) fail('IsoMapPack5', 'INVALID_FORMAT', 'Missing zero coordinate terminator', total - 4);
  const recordsEnd = terminated ? total - 4 : total;
  const seen = new Set<number>();
  const tiles: Ra2TerrainCell[] = [];
  for (let at = 0; at < recordsEnd; at += 11) {
    const x = terrain.u16(at), y = terrain.u16(at + 2);
    // The map has H strips, alternating W and W-1 cells. Coordinates are diagonal.
    if (x === 0 || y === 0 || x + y < size.width + 1 || x + y > size.width + size.height * 2 || Math.abs(x - y) > size.width - 1) {
      fail('IsoMapPack5', 'INVALID_FORMAT', 'Terrain cell coordinates exceed map diamond', at);
    }
    const key = x * 65536 + y;
    if (seen.has(key)) fail('IsoMapPack5', 'INVALID_FORMAT', 'Duplicate terrain cell coordinates', at);
    seen.add(key);
    tiles.push({ x, y, tileIndex: terrain.u32(at + 4), subTileIndex: terrain.u8(at + 8), level: terrain.u8(at + 9), iceGrowth: terrain.u8(at + 10) });
  }
  return { kind: 'terrain-tiles', source: 'IsoMapPack5', size, theater, tiles, tileCount: tiles.length,
    declaredCellCount: maximumCells, omittedCellCount: maximumCells - tiles.length, chunkCount,
    unpackedBytes: total, termination: terminated ? 'zero-coordinate' : 'end-of-buffer', requiresTheaterMapping: true };
}
