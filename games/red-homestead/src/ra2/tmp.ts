import { BinaryReader, DecodeBudget, RA2_LIMITS, colorize, fail, pixelCount, validatePalette } from './binary.js';

export interface TmpImage {
  /** Signed positions in the TMP's pixel coordinate system, not cell coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
  indices: Uint8Array;
  rgba: Uint8ClampedArray;
  /** Per-pixel layering bytes, when the file declares a Z plane. Not absolute world heights. */
  zData?: Uint8Array;
}

export interface TmpTile extends TmpImage {
  /** Original index-table slot; empty slots are preserved as null in TmpFile.tiles. */
  index: number;
  elevation: number;
  landType: number;
  slopeType: number;
  flags: number;
  radarLeft: readonly [number, number, number];
  radarRight: readonly [number, number, number];
  /** Distinguishes outside-diamond pixels from legitimate palette index 0. */
  coverage: Uint8Array;
  extra?: TmpImage;
  /** Damaged variants/bridge-state selection are not decoded by this importer. */
  damagedData: 'absent' | 'unsupported';
}

export interface TmpFile {
  columns: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
  tiles: (TmpTile | null)[];
  bounds: { x: number; y: number; width: number; height: number };
}

/** Expand the packed 4,8,...,width,...,8,4 diamond; the final canvas row is empty. */
function unpackDiamond(source: Uint8Array, width: number, height: number): Uint8Array {
  const output = new Uint8Array(width * height);
  let cursor = 0;
  for (let y = 0; y < height - 1; y++) {
    const length = 4 * Math.min(y + 1, height - 1 - y);
    const x = (width - length) / 2;
    output.set(source.subarray(cursor, cursor + length), y * width + x);
    cursor += length;
  }
  return output;
}

/** Decode TS 48x24 and RA2 60x30 template cells and optional vertical extra graphics.
 * No compositing/height displacement is guessed; signed positions and elevation are preserved.
 */
export function decodeTmp(bytes: Uint8Array, palette: Uint8ClampedArray): TmpFile {
  const r = new BinaryReader(bytes, 'TMP');
  validatePalette(palette, 'TMP');
  r.range(0, 16);
  const columns = r.u32(0), rows = r.u32(4), tileWidth = r.u32(8), tileHeight = r.u32(12);
  if (!columns || !rows) fail('TMP', 'INVALID_FORMAT', 'TMP grid is empty');
  if (columns > 10 || rows > 10 || columns * rows > RA2_LIMITS.maxTiles) fail('TMP', 'LIMIT_EXCEEDED', 'TMP tile count limit exceeded');
  if (!((tileWidth === 48 && tileHeight === 24) || (tileWidth === 60 && tileHeight === 30))) {
    fail('TMP', 'UNSUPPORTED', 'Only TS 48x24 and RA2 60x30 diamonds are supported', 8);
  }
  const count = columns * rows, tableEnd = 16 + count * 4;
  r.range(16, count * 4);
  const offsets = Array.from({ length: count }, (_, i) => r.u32(16 + i * 4));
  for (const offset of offsets) {
    if (offset !== 0 && (offset < tableEnd || offset >= bytes.length)) fail('TMP', 'INVALID_OFFSET', 'Tile offset lies outside body', offset);
  }
  const sorted = [...new Set(offsets.filter(Boolean))].sort((a, b) => a - b);
  const ends = new Map(sorted.map((offset, i) => [offset, sorted[i + 1] ?? bytes.length]));
  const packedPixels = tileWidth * tileHeight / 2;
  const canvasPixels = tileWidth * tileHeight;
  const budget = new DecodeBudget('TMP');
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  const extendBounds = (x: number, y: number, w: number, h: number) => {
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x + w); bottom = Math.max(bottom, y + h);
    pixelCount('TMP', right - left, bottom - top);
  };
  const tiles = offsets.map((offset, index): TmpTile | null => {
    if (offset === 0) return null;
    const end = ends.get(offset)!;
    r.range(offset, 52 + packedPixels, end);
    const x = r.i32(offset), y = r.i32(offset + 4);
    const extraOffset = r.u32(offset + 8), zOffset = r.u32(offset + 12), extraZOffset = r.u32(offset + 16);
    const extraX = r.i32(offset + 20), extraY = r.i32(offset + 24);
    const extraWidth = r.u32(offset + 28), extraHeight = r.u32(offset + 32), flags = r.u8(offset + 36);
    extendBounds(x, y, tileWidth, tileHeight);
    budget.add(canvasPixels * 6);
    const indices = unpackDiamond(bytes.subarray(offset + 52, offset + 52 + packedPixels), tileWidth, tileHeight);
    const coverage = unpackDiamond(new Uint8Array(packedPixels).fill(1), tileWidth, tileHeight);
    const rgba = colorize(indices, palette, false);
    for (let p = 0; p < coverage.length; p++) if (!coverage[p]) rgba[p * 4 + 3] = 0;
    // All plane offsets are relative to this tile cell header, not the file header.
    const occupied: [number, number][] = [[52, 52 + packedPixels]];
    const plane = (relative: number, size: number): Uint8Array => {
      if (relative < 52 || relative > end - offset || size > end - offset - relative) {
        fail('TMP', 'INVALID_OFFSET', 'Tile plane exceeds its cell data', offset + relative);
      }
      if (occupied.some(([start, stop]) => relative < stop && relative + size > start)) {
        fail('TMP', 'INVALID_OFFSET', 'Tile image/Z planes overlap', offset + relative);
      }
      occupied.push([relative, relative + size]);
      return bytes.subarray(offset + relative, offset + relative + size);
    };
    const tile: TmpTile = {
      index, x, y, width: tileWidth, height: tileHeight, indices, rgba, coverage, flags,
      elevation: r.u8(offset + 40), landType: r.u8(offset + 41), slopeType: r.u8(offset + 42),
      radarLeft: [r.u8(offset + 43), r.u8(offset + 44), r.u8(offset + 45)],
      radarRight: [r.u8(offset + 46), r.u8(offset + 47), r.u8(offset + 48)],
      damagedData: flags & 4 ? 'unsupported' : 'absent',
    };
    if (flags & 2) {
      budget.add(canvasPixels);
      tile.zData = unpackDiamond(plane(zOffset, packedPixels), tileWidth, tileHeight);
    }
    if (flags & 1) {
      const pixels = pixelCount('TMP', extraWidth, extraHeight);
      extendBounds(extraX, extraY, extraWidth, extraHeight);
      budget.add(pixels * 5);
      const extraIndices = new Uint8Array(plane(extraOffset, pixels));
      tile.extra = { x: extraX, y: extraY, width: extraWidth, height: extraHeight,
        indices: extraIndices, rgba: colorize(extraIndices, palette, true) };
      if (flags & 2) {
        budget.add(pixels);
        tile.extra.zData = new Uint8Array(plane(extraZOffset, pixels));
      }
    }
    return tile;
  });
  return { columns, rows, tileWidth, tileHeight, tiles,
    bounds: left === Infinity ? { x: 0, y: 0, width: 0, height: 0 } : { x: left, y: top, width: right - left, height: bottom - top } };
}
