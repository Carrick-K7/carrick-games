import { RA2_LIMITS, fail } from './binary.js';
import { readMapLines } from './map.js';
import { decodeMapPack } from './mapPack.js';
import type { MapParseOptions, MapRect } from './map.js';

export interface Ra2MapPreview extends MapRect {
  kind: 'embedded-preview';
  source: 'PreviewPack';
  /** Original tightly packed BGR888 bytes, not RGB. */
  bgr: Uint8Array;
  rgba: Uint8ClampedArray;
  chunkCount: number;
  /** An embedded map-list thumbnail is not decoded/playable terrain or a terrain texture. */
  notTerrain: true;
}

/** Read the map's own embedded BGR image without loading any map script or asset. */
export function decodeMapPreview(bytes: Uint8Array, options: MapParseOptions = {}): Ra2MapPreview {
  let active = false, found = false, size: MapRect | undefined;
  for (const original of readMapLines(bytes, options)) {
    const line = original.split(';', 1)[0].trim();
    if (!line) continue;
    if (line.startsWith('[')) {
      const section = /^\[([^\[\]]{1,128})\]$/.exec(line);
      if (!section) fail('PreviewPack', 'INVALID_FORMAT', 'Malformed INI section header');
      active = section[1].trim().toLowerCase() === 'preview';
      if (active) {
        if (found) fail('PreviewPack', 'INVALID_FORMAT', 'Duplicate [Preview] section');
        found = true;
      }
      continue;
    }
    if (!active) continue;
    const equal = line.indexOf('=');
    if (equal <= 0) fail('PreviewPack', 'INVALID_FORMAT', 'Malformed preview metadata');
    if (line.slice(0, equal).trim().toLowerCase() !== 'size') continue;
    if (size) fail('PreviewPack', 'INVALID_FORMAT', 'Duplicate Preview.Size');
    const fields = line.slice(equal + 1).split(',').map(field => field.trim());
    if (fields.length !== 4 || fields.some(field => !/^\d{1,6}$/.test(field))) fail('PreviewPack', 'INVALID_FORMAT', 'Preview.Size requires four nonnegative integers');
    const [x, y, width, height] = fields.map(Number);
    if (x > RA2_LIMITS.maxDimension || y > RA2_LIMITS.maxDimension) fail('PreviewPack', 'LIMIT_EXCEEDED', 'Preview origin exceeds limit');
    if (!width || !height) fail('PreviewPack', 'INVALID_FORMAT', 'Preview dimensions must be positive');
    if (width > RA2_LIMITS.maxPreviewDimension || height > RA2_LIMITS.maxPreviewDimension || width * height > RA2_LIMITS.maxPreviewPixels) {
      fail('PreviewPack', 'LIMIT_EXCEEDED', 'Preview pixel/dimension limit exceeded');
    }
    size = { x, y, width, height };
  }
  if (!size) fail('PreviewPack', 'UNSUPPORTED', 'No Preview.Size; preview dimensions are not guessed');
  const pixels = size.width * size.height;
  const { decoded: bgr, chunkCount } = decodeMapPack(bytes, 'PreviewPack', pixels * 3, options);
  if (bgr.length !== pixels * 3) fail('PreviewPack', 'INVALID_FORMAT', 'Preview bytes do not match width × height × 3');
  const rgba = new Uint8ClampedArray(pixels * 4);
  for (let p = 0; p < pixels; p++) {
    rgba[p * 4] = bgr[p * 3 + 2];
    rgba[p * 4 + 1] = bgr[p * 3 + 1];
    rgba[p * 4 + 2] = bgr[p * 3];
    rgba[p * 4 + 3] = 255;
  }
  return { kind: 'embedded-preview', source: 'PreviewPack', ...size, bgr, rgba, chunkCount, notTerrain: true };
}
