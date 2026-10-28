import { RA2_LIMITS } from './binary.js';
import { readMapLines } from './map.js';
import type { MapParseOptions } from './map.js';

export class LcwFormatError extends Error {
  readonly name = 'LcwFormatError';
  readonly recoverable = true;
  constructor(message: string) { super(`LCW/Format80: ${message}`); }
}
function invalid(message: string): never { throw new LcwFormatError(message); }

/** Independent bounded implementation of the five documented LCW commands, not copied engine code.
 * Format facts: https://moddingwiki.shikadi.net/wiki/Westwood_LCW (Explanation section).
 * Every stream must end with 0x80, at exactly the requested output size and input EOF.
 */
export function decodeLcw(bytes: Uint8Array, expectedSize: number): Uint8Array {
  if (!(bytes instanceof Uint8Array) || bytes.length > RA2_LIMITS.maxPackedBytes) invalid('Invalid/oversized input');
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 0 || expectedSize > RA2_LIMITS.maxPackedOutputBytes) invalid('Invalid output budget');
  const result = new Uint8Array(expectedSize);
  let input = 0, output = 0;
  const byte = () => { if (input >= bytes.length) invalid('Truncated command or missing terminator'); return bytes[input++]; };
  const word = () => { const lo = byte(); return lo | (byte() << 8); };
  const space = (count: number) => { if (!count || count > result.length - output) invalid('Command exceeds output size or has zero length'); };
  const copy = (position: number, count: number) => {
    space(count);
    if (position < 0 || position >= output) invalid('Back-reference is outside written output');
    for (let i = 0; i < count; i++) result[output++] = result[position + i]; // intentional overlapping copy
  };
  const relative = bytes[0] === 0;
  if (relative) input++;
  for (;;) {
    const command = byte();
    if (command === 0x80) {
      if (output !== expectedSize || input !== bytes.length) invalid('Terminator does not match exact input/output size');
      return result;
    }
    if (command < 0x80) {
      const distance = ((command & 15) << 8) | byte();
      copy(output - distance, (command >>> 4) + 3);
    } else if (command < 0xc0) {
      const count = command & 63; space(count);
      if (count > bytes.length - input) invalid('Truncated literal');
      result.set(bytes.subarray(input, input + count), output); input += count; output += count;
    } else if (command === 0xfe) {
      const count = word(), value = byte(); space(count);
      result.fill(value, output, output + count); output += count;
    } else {
      const count = command === 0xff ? word() : (command & 63) + 3;
      const position = word();
      copy(relative ? output - position : position, count);
    }
  }
}

export type OverlayPackSection = 'OverlayPack' | 'OverlayDataPack';
export const OVERLAY_CELLS = 512 * 512;

/** Fixed 512x512, row-major X + 512Y. Absence is returned separately, never synthesized.
 * Format facts: https://www.modenc2.markjfox.net/OverlayPack . No rules/scripts are evaluated.
 */
export function decodeOverlayPack(bytes: Uint8Array, section: OverlayPackSection, options: MapParseOptions = {}): Uint8Array | undefined {
  let active = false, found = false, chars = 0;
  const parts = new Map<number, string>();
  for (const original of readMapLines(bytes, options)) {
    const line = original.split(';', 1)[0].trim();
    if (line.startsWith('[')) {
      const match = /^\[([^\[\]]{1,128})\]$/.exec(line);
      if (!match) invalid(`${section}: malformed section`);
      active = match[1].trim().toLowerCase() === section.toLowerCase();
      if (active && found) invalid(`${section}: duplicate section`);
      if (active) found = true;
    } else if (active && line) {
      const match = /^([1-9]\d{0,5})\s*=\s*(\S+)$/.exec(line);
      if (!match || Number(match[1]) > RA2_LIMITS.maxMapLines || parts.has(Number(match[1]))) invalid(`${section}: invalid/duplicate packed line`);
      chars += match[2].length;
      if (chars > RA2_LIMITS.maxPackedBase64Chars) invalid(`${section}: Base64 size limit exceeded`);
      parts.set(Number(match[1]), match[2]);
    }
  }
  if (!found) return undefined;
  const ordered = [];
  for (let i = 1; i <= parts.size; i++) {
    const part = parts.get(i); if (!part) invalid(`${section}: missing packed line ${i}`); ordered.push(part);
  }
  const text = ordered.join('');
  if (!text || text.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) invalid(`${section}: invalid Base64`);
  const binary = atob(text);
  if (btoa(binary) !== text || binary.length > RA2_LIMITS.maxPackedBytes) invalid(`${section}: noncanonical/oversized Base64`);
  const packed = Uint8Array.from(binary, char => char.charCodeAt(0));
  const view = new DataView(packed.buffer);
  const result = new Uint8Array(OVERLAY_CELLS);
  let input = 0, output = 0, chunks = 0;
  while (input < packed.length) {
    if (++chunks > RA2_LIMITS.maxPackChunks || input + 4 > packed.length) invalid(`${section}: invalid chunk header`);
    const compressed = view.getUint16(input, true), expanded = view.getUint16(input + 2, true); input += 4;
    if (!compressed || !expanded || expanded > 8192 || expanded > result.length - output || compressed > packed.length - input) invalid(`${section}: chunk size exceeds bounds`);
    result.set(decodeLcw(packed.subarray(input, input + compressed), expanded), output);
    input += compressed; output += expanded;
  }
  if (output !== OVERLAY_CELLS) invalid(`${section}: expected exactly 262144 cells, got ${output}`);
  return result;
}
