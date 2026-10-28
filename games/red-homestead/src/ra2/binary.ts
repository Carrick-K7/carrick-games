/** In-memory-only parsing primitives. No resource acquisition occurs in this layer. */
export type Ra2Format = 'PAL' | 'SHP' | 'TMP' | 'MIX' | 'INI' | 'LZO1X' | 'IsoMapPack5' | 'PreviewPack';
export type Ra2ErrorCode = 'INVALID_INPUT' | 'TRUNCATED' | 'INVALID_FORMAT' | 'INVALID_OFFSET' | 'LIMIT_EXCEEDED' | 'UNSUPPORTED';

export class Ra2FormatError extends Error {
  readonly name = 'Ra2FormatError';
  constructor(
    readonly code: Ra2ErrorCode,
    readonly format: Ra2Format,
    message: string,
    readonly offset?: number,
  ) {
    super(`${format}: ${message}`);
  }
}

/** Hard ceilings apply to every call, including repeated/shared frame offsets. */
export const RA2_LIMITS = Object.freeze({
  maxInputBytes: 64 * 1024 * 1024,
  maxArchiveBytes: 512 * 1024 * 1024,
  maxMapBytes: 8 * 1024 * 1024,
  maxDimension: 4096,
  maxFramePixels: 4 * 1024 * 1024,
  maxFrames: 8192,
  maxTiles: 100,
  maxDecodedBytes: 128 * 1024 * 1024,
  maxMapEntries: 32768,
  maxMapLines: 131072,
  maxLineLength: 16384,
  maxLzoInputBytes: 16 * 1024 * 1024,
  maxLzoOutputBytes: 16 * 1024 * 1024,
  maxPackedBase64Chars: 8 * 1024 * 1024,
  maxPackedBytes: 6 * 1024 * 1024,
  maxPackedOutputBytes: 8 * 1024 * 1024,
  maxPackChunks: 1024,
  maxPackChunkOutputBytes: 8192,
  maxTerrainCells: 524288,
  maxPreviewDimension: 1024,
  maxPreviewPixels: 1024 * 1024,
});

export function fail(format: Ra2Format, code: Ra2ErrorCode, message: string, offset?: number): never {
  throw new Ra2FormatError(code, format, message, offset);
}

export class BinaryReader {
  readonly view: DataView;
  constructor(readonly bytes: Uint8Array, readonly format: Ra2Format, maxBytes = RA2_LIMITS.maxInputBytes) {
    if (!(bytes instanceof Uint8Array)) fail(format, 'INVALID_INPUT', 'Expected Uint8Array');
    if (bytes.byteLength > maxBytes) fail(format, 'LIMIT_EXCEEDED', 'Input byte limit exceeded');
    try { this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
    catch { fail(format, 'INVALID_INPUT', 'Unreadable or detached input buffer'); }
  }
  range(offset: number, size: number, end = this.bytes.length): void {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0) {
      fail(this.format, 'INVALID_OFFSET', 'Invalid byte range', offset);
    }
    if (offset > end || size > end - offset) fail(this.format, 'TRUNCATED', 'Byte range exceeds available data', offset);
  }
  u8(offset: number): number { this.range(offset, 1); return this.view.getUint8(offset); }
  u16(offset: number): number { this.range(offset, 2); return this.view.getUint16(offset, true); }
  u32(offset: number): number { this.range(offset, 4); return this.view.getUint32(offset, true); }
  i32(offset: number): number { this.range(offset, 4); return this.view.getInt32(offset, true); }
}

export function pixelCount(format: Ra2Format, width: number, height: number, allowEmpty = false): number {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 0 || height < 0 ||
    (!allowEmpty && (width === 0 || height === 0))) fail(format, 'INVALID_FORMAT', 'Invalid dimensions');
  if (width > RA2_LIMITS.maxDimension || height > RA2_LIMITS.maxDimension || width * height > RA2_LIMITS.maxFramePixels) {
    fail(format, 'LIMIT_EXCEEDED', 'Image dimension/pixel limit exceeded');
  }
  return width * height;
}

export class DecodeBudget {
  private used = 0;
  constructor(private readonly format: Ra2Format) {}
  add(bytes: number): void {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > RA2_LIMITS.maxDecodedBytes - this.used) {
      fail(this.format, 'LIMIT_EXCEEDED', 'Total decoded byte limit exceeded');
    }
    this.used += bytes;
  }
}

export function validatePalette(palette: Uint8ClampedArray, format: Ra2Format): void {
  if (!(palette instanceof Uint8ClampedArray) || palette.length !== 1024) {
    fail(format, 'INVALID_INPUT', 'Expected a 256-entry RGBA Uint8ClampedArray palette');
  }
}

export function colorize(indices: Uint8Array, palette: Uint8ClampedArray, transparentZero: boolean): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(indices.length * 4);
  for (let p = 0; p < indices.length; p++) {
    const index = indices[p];
    const target = p * 4;
    const source = index * 4;
    rgba[target] = palette[source];
    rgba[target + 1] = palette[source + 1];
    rgba[target + 2] = palette[source + 2];
    rgba[target + 3] = transparentZero && index === 0 ? 0 : palette[source + 3];
  }
  return rgba;
}
