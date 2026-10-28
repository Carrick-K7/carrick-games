import { BinaryReader, DecodeBudget, RA2_LIMITS, colorize, fail, pixelCount, validatePalette } from './binary.js';

export interface ShpFrame {
  /** Bounds in the full SHP canvas, not a centered rendering origin. */
  x: number;
  y: number;
  width: number;
  height: number;
  compression: 0 | 1 | 2 | 3;
  dataOffset: number;
  radarColor: readonly [number, number, number];
  indices: Uint8Array;
  rgba: Uint8ClampedArray;
  isShadow: boolean;
  /** Index of the corresponding normal frame, only for explicitly enabled shadows. */
  shadowOf?: number;
  /** Index of the paired shadow frame, only for explicitly enabled shadows. */
  shadowFrame?: number;
}

export interface ShpFile {
  width: number;
  height: number;
  frames: ShpFrame[];
  /** A heuristic only. SHP does not encode a shadow-frame flag. */
  shadowCandidate: boolean;
  shadowFrames: 'none' | 'second-half';
}

export interface ShpDecodeOptions {
  /** Must be chosen using art metadata/user intent, never inferred merely from frame count. */
  shadowFrames?: 'none' | 'second-half';
  /** Black overlay alpha, 0..255. Default 128. Draw it beneath its paired normal frame. */
  shadowOpacity?: number;
}

/** TS/RA2 only, not the unrelated TD/RA1 delta SHP format.
 * 0/1: raw rows; 2: length-prefixed raw rows; 3: length-prefixed RLE-zero rows.
 */
export function decodeShp(bytes: Uint8Array, palette: Uint8ClampedArray, options: ShpDecodeOptions = {}): ShpFile {
  const r = new BinaryReader(bytes, 'SHP');
  validatePalette(palette, 'SHP');
  if (!options || typeof options !== 'object') fail('SHP', 'INVALID_INPUT', 'Invalid SHP options');
  const shadowFrames = options.shadowFrames ?? 'none';
  const shadowOpacity = options.shadowOpacity ?? 128;
  if (shadowFrames !== 'none' && shadowFrames !== 'second-half') fail('SHP', 'INVALID_INPUT', 'Invalid shadow mode');
  if (!Number.isInteger(shadowOpacity) || shadowOpacity < 0 || shadowOpacity > 255) fail('SHP', 'INVALID_INPUT', 'Invalid shadow opacity');
  r.range(0, 8);
  if (r.u16(0) !== 0) fail('SHP', 'UNSUPPORTED', 'Not a TS/RA2 SHP header', 0);
  const width = r.u16(2), height = r.u16(4), count = r.u16(6);
  pixelCount('SHP', width, height);
  if (!count) fail('SHP', 'INVALID_FORMAT', 'SHP contains no frames', 6);
  if (count > RA2_LIMITS.maxFrames) fail('SHP', 'LIMIT_EXCEEDED', 'Frame count limit exceeded', 6);
  const tableEnd = 8 + count * 24;
  r.range(8, count * 24);
  const budget = new DecodeBudget('SHP');
  const headers = Array.from({ length: count }, (_, i) => {
    const p = 8 + i * 24;
    const x = r.u16(p), y = r.u16(p + 2), w = r.u16(p + 4), h = r.u16(p + 6);
    const compression = r.u8(p + 8), dataOffset = r.u32(p + 20); // Three alignment bytes are not flags.
    if (compression > 3) fail('SHP', 'UNSUPPORTED', `Unsupported SHP compression/flags ${compression}`, p + 8);
    const pixels = pixelCount('SHP', w, h, true);
    if (x + w > width || y + h > height) fail('SHP', 'INVALID_FORMAT', 'Frame bounds exceed SHP canvas', p);
    if (dataOffset !== 0 && (dataOffset < tableEnd || dataOffset > bytes.length)) {
      fail('SHP', 'INVALID_OFFSET', 'Frame offset points outside frame data', p + 20);
    }
    budget.add(pixels * 5);
    return { x, y, width: w, height: h, compression: compression as ShpFrame['compression'], dataOffset,
      radarColor: [r.u8(p + 12), r.u8(p + 13), r.u8(p + 14)] as const };
  });
  // A damaged frame cannot consume the following frame's data. Reused offsets are allowed.
  const offsets = [...new Set(headers.map(h => h.dataOffset).filter(Boolean))].sort((a, b) => a - b);
  const ends = new Map(offsets.map((offset, i) => [offset, offsets[i + 1] ?? bytes.length]));
  const frames: ShpFrame[] = headers.map(header => {
    const { width: w, height: h, compression, dataOffset } = header;
    const indices = new Uint8Array(w * h);
    if (dataOffset !== 0 && w > 0 && h > 0) {
      const end = ends.get(dataOffset)!;
      if (compression <= 1) {
        r.range(dataOffset, indices.length, end);
        indices.set(bytes.subarray(dataOffset, dataOffset + indices.length));
      } else {
        let source = dataOffset;
        for (let row = 0; row < h; row++) {
          r.range(source, 2, end);
          const length = r.u16(source);
          if (length < 2) fail('SHP', 'INVALID_FORMAT', 'Scanline length is smaller than its prefix', source);
          r.range(source, length, end);
          const rowEnd = source + length;
          source += 2;
          let column = 0;
          while (source < rowEnd) {
            const value = bytes[source++];
            if (compression === 3 && value === 0) {
              if (source === rowEnd) fail('SHP', 'TRUNCATED', 'Missing RLE-zero run length', source);
              const run = bytes[source++];
              if (run === 0) fail('SHP', 'INVALID_FORMAT', 'Zero-length RLE run is invalid', source - 1);
              column += run;
              if (column > w) fail('SHP', 'INVALID_FORMAT', 'RLE run crosses scanline bounds', source - 1);
            } else {
              if (column >= w) fail('SHP', 'INVALID_FORMAT', 'Scanline exceeds frame width', source - 1);
              indices[row * w + column++] = value;
            }
          }
          // Length-prefixed lines may omit trailing transparent pixels.
        }
      }
    }
    const rgba = colorize(indices, palette, compression !== 0);
    if (dataOffset === 0) rgba.fill(0);
    return { ...header, indices, rgba, isShadow: false };
  });
  const half = count / 2;
  const shadowCandidate = count % 2 === 0 && frames.slice(half).every(frame => frame.indices.every(index => index <= 1));
  if (shadowFrames === 'second-half') {
    if (!shadowCandidate) fail('SHP', 'INVALID_FORMAT', 'Explicit shadow framing requires an even frame count and 0/1 shadow indices');
    for (let i = half; i < count; i++) {
      const frame = frames[i];
      frame.isShadow = true;
      frame.shadowOf = i - half;
      frames[i - half].shadowFrame = i;
      frame.rgba.fill(0);
      for (let p = 0; p < frame.indices.length; p++) frame.rgba[p * 4 + 3] = frame.indices[p] === 1 ? shadowOpacity : 0;
    }
  }
  return { width, height, frames, shadowCandidate, shadowFrames };
}
