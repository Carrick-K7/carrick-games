import { BinaryReader, fail } from './binary.js';

/** Decode exactly 256 RGB VGA 6-bit entries. PAL itself has no alpha channel.
 * Bit replication expands 0..63 to 0..255; sprite transparency is applied by SHP/TMP.
 */
export function decodePalette(bytes: Uint8Array): Uint8ClampedArray {
  const reader = new BinaryReader(bytes, 'PAL');
  reader.range(0, 768);
  if (bytes.length !== 768) fail('PAL', 'INVALID_FORMAT', 'PAL must contain exactly 768 bytes');
  const rgba = new Uint8ClampedArray(1024);
  for (let i = 0; i < 256; i++) {
    for (let channel = 0; channel < 3; channel++) {
      const value = bytes[i * 3 + channel];
      if (value > 63) fail('PAL', 'INVALID_FORMAT', 'VGA palette component exceeds 6 bits', i * 3 + channel);
      rgba[i * 4 + channel] = (value << 2) | (value >>> 4);
    }
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}
