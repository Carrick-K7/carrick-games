import { rugCartoons } from './villaUpholsteryCartoons.js';

export type RugWeave = 'madder' | 'reed' | 'indigo' | 'oat';
export const rugWeaves: readonly RugWeave[] = ['madder', 'reed', 'indigo', 'oat'];
const yarns = [
  [0xa66b55, 0xb27d63, 0xc3a788, 0x606c68, 0x899281, 0xd7c4a3],
  [0xa6a792, 0x8f957d, 0xc3bba0, 0x747c69, 0xa57d6a, 0xd5cbb0],
  [0x68747b, 0x838a89, 0xb1a08b, 0x565f63, 0xac8672, 0xd2c5ae],
  [0xc8b69a, 0xb09d84, 0xd9ceb4, 0x83796a, 0x9a7b69, 0xddd3bd],
];
export function fleck(x: number, y: number) {
  let h = Math.imul(x + 157, 0x7feb352d) ^ Math.imul(y + 49, 0x846ca68b);
  h = Math.imul(h ^ h >>> 15, 0x2c1b3c6d); return ((h ^ h >>> 12) >>> 0) / 4294967296;
}
export const rugWidth = 384;
const rugHeight = 256;

/** Decode just the finite drawing of this rug: six yarns and fractional knot
 * coverage. The source loom, no external assets, is in assets-sources. */
function cartoon(input: string) {
  const s = atob(input), out = new Uint8Array(rugWidth * rugHeight); let i = 0, j = 0;
  while (i < s.length) {
    const tag = s.charCodeAt(i++), ref = tag >= 128, n = (tag & 127) + (ref ? 3 : 1);
    if (j + n > out.length || i + (ref ? 2 : n) > s.length) throw new Error('Invalid rug cartoon');
    if (ref) { const back = s.charCodeAt(i++) | (s.charCodeAt(i++) << 8); if (!back || back > j) throw new Error('Invalid rug span');
      for (let k = 0; k < n; k++, j++) out[j] = out[j - back]; }
    else for (let k = 0; k < n; k++) out[j++] = s.charCodeAt(i++);
  }
  if (j !== out.length) throw new Error('Truncated rug cartoon'); return out;
}

export function weaveRugPixels(bytes: Uint8Array, stride: number, ox: number, oy: number, weave: number) {
  const field = cartoon(rugCartoons[weave]), palette = yarns[weave], lut = new Uint8Array(256 * 4);
  for (let p = 0; p < 256; p++) {
    const a = palette[p & 7] ?? 0, b = palette[(p >> 3) & 7] ?? 0, f = (p >> 6) / 4;
    for (let c = 0; c < 3; c++) { const shift = 16 - 8 * c; lut[4 * p + c] = ((a >> shift) & 255) * (1 - f) + ((b >> shift) & 255) * f; }
  }
  const haze = new Int8Array(256); let noise = 4813 + 73 * weave;
  for (let i = 0; i < haze.length; i++) haze[i] = (fleck(i, weave + 153) - .5) * 12;
  for (let y = 0; y < rugHeight; y++) {
    const abrash = (haze[y >> 3] * .88 + haze[(y + 49) & 255] * .61) + ((y & 1) ? -2 : 2);
    for (let x = 0; x < rugWidth; x++) {
      noise = (Math.imul(noise, 1664525) + 1013904223) | 0;
      const wool = abrash + ((noise >>> 27) - 15) * .68 + haze[((x >> 3) + (y & 7) * 11) & 255] * .55;
      const k = 4 * ((oy + y) * stride + ox + x), p = field[y * rugWidth + x] * 4;
      bytes[k] = lut[p] + wool; bytes[k + 1] = lut[p + 1] + wool; bytes[k + 2] = lut[p + 2] + wool; bytes[k + 3] = 255;
    }
  }
}
