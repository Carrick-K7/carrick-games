import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { VILLA_INTERIOR_SWATCHES } from '../src/villaInteriorSwatchData.js';

// Byte receipt from the final embedded files; this check needs neither Pillow nor the source JPEGs.
const receipt = [
  ['oak', 1024, 256, 57026, 'bf1585a9edfd8d07a3df407024215bb218f25564b4dc8f84c3c216ae43d167f0'],
  ['limestone', 1024, 1024, 211154, 'cbac978178962179223603a970745ec9360079edfb7fc35d4eba1930cae8da83'],
  ['plaster', 512, 512, 49162, '077b5bfd752ff332b2ee737435b4bf6c21d88380e2fe3c288ee4cfd8b017ae41'],
] as const;

it('ships only three self-contained opaque VP8 images, within the compressed and mipmapped budgets', () => {
  expect(Object.keys(VILLA_INTERIOR_SWATCHES).sort()).toEqual(receipt.map(([key]) => key).sort());
  let compressed = 0, gpuBytes = 0;
  for (const [key, width, height, size, sha] of receipt) {
    const url = VILLA_INTERIOR_SWATCHES[key], prefix = 'data:image/webp;base64,';
    const bytes = Buffer.from(url.slice(prefix.length), 'base64');
    expect(url === prefix + bytes.toString('base64')).toBe(true);
    expect(bytes.length).toBe(size);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha);
    // One simple VP8 chunk (no VP8X/ALPH/ANIM/metadata), with a complete keyframe header.
    expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
    expect(bytes.readUInt32LE(4)).toBe(size - 8);
    expect(bytes.toString('ascii', 8, 16)).toBe('WEBPVP8 ');
    const chunkSize = bytes.readUInt32LE(16);
    expect(20 + chunkSize + (chunkSize % 2)).toBe(size);
    expect(bytes.readUInt8(20) & 1).toBe(0);
    expect(bytes.subarray(23, 26).toString('hex')).toBe('9d012a');
    expect(bytes.readUInt16LE(26) & 0x3fff).toBe(width);
    expect(bytes.readUInt16LE(28) & 0x3fff).toBe(height);
    compressed += size;
    let w: number = width, h: number = height;
    for (;;) {
      gpuBytes += 4 * w * h;
      if (w === 1 && h === 1) break;
      w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
    }
  }
  expect(compressed).toBeLessThanOrEqual(420_000);
  expect(gpuBytes).toBeLessThanOrEqual(10 * 1024 ** 2);
});
