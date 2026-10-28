import { BinaryReader, RA2_LIMITS, fail } from './binary.js';
import { decodeLzo1x } from './lzo.js';
import { readMapLines } from './map.js';
import type { MapParseOptions } from './map.js';

type PackSection = 'IsoMapPack5' | 'PreviewPack';
function sextet(char: number, format: PackSection): number {
  if (char >= 65 && char <= 90) return char - 65;
  if (char >= 97 && char <= 122) return char - 71;
  if (char >= 48 && char <= 57) return char + 4;
  if (char === 43) return 62;
  if (char === 47) return 63;
  fail(format, 'INVALID_FORMAT', 'Invalid Base64 character');
}

/** Strict canonical Base64: no internal whitespace, URL alphabet, missing padding or stray '='. */
function base64(text: string, format: PackSection): Uint8Array {
  if (!text.length || text.length % 4 !== 0) fail(format, 'INVALID_FORMAT', 'Invalid Base64 length');
  if (text.length > RA2_LIMITS.maxPackedBase64Chars) fail(format, 'LIMIT_EXCEEDED', 'Packed Base64 limit exceeded');
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const size = text.length / 4 * 3 - padding;
  if (size > RA2_LIMITS.maxPackedBytes) fail(format, 'LIMIT_EXCEEDED', 'Packed byte limit exceeded');
  const output = new Uint8Array(size);
  let written = 0;
  for (let i = 0; i < text.length; i += 4) {
    const last = i + 4 === text.length;
    const a = sextet(text.charCodeAt(i), format), b = sextet(text.charCodeAt(i + 1), format);
    const c = last && padding === 2 ? 0 : sextet(text.charCodeAt(i + 2), format);
    const d = last && padding > 0 ? 0 : sextet(text.charCodeAt(i + 3), format);
    if (last && ((padding === 2 && (b & 15) !== 0) || (padding === 1 && (c & 3) !== 0))) {
      fail(format, 'INVALID_FORMAT', 'Noncanonical Base64 padding bits');
    }
    output[written++] = (a << 2) | (b >>> 4);
    if (written < size) output[written++] = (b << 4) | (c >>> 2);
    if (written < size) output[written++] = (c << 6) | d;
  }
  return output;
}

function packedSection(bytes: Uint8Array, format: PackSection, options: MapParseOptions): Uint8Array {
  const parts = new Map<number, string>();
  let active = false, found = false, characters = 0;
  for (const original of readMapLines(bytes, options)) {
    const line = original.split(';', 1)[0].trim();
    if (!line) continue;
    if (line.startsWith('[')) {
      const section = /^\[([^\[\]]{1,128})\]$/.exec(line);
      if (!section) fail(format, 'INVALID_FORMAT', 'Malformed INI section header');
      active = section[1].trim().toLowerCase() === format.toLowerCase();
      if (active) {
        if (found) fail(format, 'INVALID_FORMAT', 'Duplicate packed section');
        found = true;
      }
      continue;
    }
    if (!active) continue;
    const equal = line.indexOf('=');
    if (equal <= 0) fail(format, 'INVALID_FORMAT', 'Malformed packed INI line');
    const key = line.slice(0, equal).trim(), value = line.slice(equal + 1).trim();
    if (!/^[1-9]\d{0,5}$/.test(key) || Number(key) > RA2_LIMITS.maxMapLines) fail(format, 'INVALID_FORMAT', 'Packed line keys must be bounded positive integers');
    const index = Number(key);
    if (parts.has(index)) fail(format, 'INVALID_FORMAT', 'Duplicate packed line index');
    if (!value) fail(format, 'INVALID_FORMAT', 'Empty packed line');
    characters += value.length;
    if (characters > RA2_LIMITS.maxPackedBase64Chars) fail(format, 'LIMIT_EXCEEDED', 'Packed Base64 limit exceeded');
    parts.set(index, value);
  }
  if (!found) fail(format, 'UNSUPPORTED', `No ${format} section; missing content is not synthesized`);
  const ordered: string[] = [];
  for (let i = 1; i <= parts.size; i++) {
    const part = parts.get(i);
    if (part === undefined) fail(format, 'INVALID_FORMAT', 'Missing packed line index');
    ordered.push(part);
  }
  return base64(ordered.join(''), format);
}

/** Shared, internal, bounded Base64 + chunked-LZO container decoder. */
export function decodeMapPack(bytes: Uint8Array, format: PackSection, outputLimit: number, options: MapParseOptions): { decoded: Uint8Array; chunkCount: number } {
  if (!Number.isSafeInteger(outputLimit) || outputLimit < 1 || outputLimit > RA2_LIMITS.maxPackedOutputBytes) {
    fail(format, 'INVALID_INPUT', 'Invalid packed output budget');
  }
  const packed = packedSection(bytes, format, options);
  const r = new BinaryReader(packed, format, RA2_LIMITS.maxPackedBytes);
  const chunks: { offset: number; size: number; output: number }[] = [];
  let cursor = 0, total = 0;
  while (cursor < packed.length) {
    if (chunks.length >= RA2_LIMITS.maxPackChunks) fail(format, 'LIMIT_EXCEEDED', 'Packed chunk count limit exceeded', cursor);
    r.range(cursor, 4);
    const size = r.u16(cursor), output = r.u16(cursor + 2);
    if (!size || !output) fail(format, 'INVALID_FORMAT', 'Zero-sized compressed chunk', cursor);
    if (output > RA2_LIMITS.maxPackChunkOutputBytes) fail(format, 'LIMIT_EXCEEDED', 'Chunk output exceeds 8192 bytes', cursor + 2);
    cursor += 4;
    r.range(cursor, size);
    total += output;
    if (total > outputLimit) fail(format, 'LIMIT_EXCEEDED', 'Packed output exceeds content budget', cursor);
    chunks.push({ offset: cursor, size, output });
    cursor += size;
  }
  const decoded = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    decoded.set(decodeLzo1x(packed.subarray(chunk.offset, chunk.offset + chunk.size), chunk.output), position);
    position += chunk.output;
  }
  return { decoded, chunkCount: chunks.length };
}
