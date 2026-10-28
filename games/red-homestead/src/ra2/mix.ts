import { BinaryReader, RA2_LIMITS, fail } from './binary.js';

export interface MixEntry {
  /** Unsigned TS/RA2 filename CRC32. */
  readonly id: number;
  /** Absolute byte offset in the supplied archive (not the on-disk body-relative offset). */
  readonly offset: number;
  readonly size: number;
}

export interface MixArchive {
  readonly entries: readonly MixEntry[];
  readonly header: 'basic' | 'advanced';
  readonly dataOffset: number;
  readonly dataSize: number;
  /** Trailer presence is checked; this parser does not authenticate SHA-1. */
  readonly checksum: 'absent' | 'present-unverified';
  /** Bounded zero-copy views. Do not modify the source bytes while using the archive. */
  getByName(name: string): Uint8Array | undefined;
  getById(id: number): Uint8Array | undefined;
}

/** TS/RA2 filename key: ASCII uppercase, Westwood's partial-dword padding, ZIP CRC32.
 * Header style cannot identify the hash algorithm. This is NOT TD/RA1's rotate/add hash.
 */
export function mixFilenameId(name: string): number {
  if (typeof name !== 'string' || name.length === 0 || name.length > 255 || !/^[\x20-\x7e]+$/.test(name)) {
    fail('MIX', 'INVALID_INPUT', 'MIX lookup names must be 1..255 printable ASCII characters');
  }
  const upper = name.toUpperCase();
  const remainder = upper.length % 4;
  const paddedLength = remainder === 0 ? upper.length : upper.length + 4 - remainder;
  let crc = 0xffffffff;
  for (let i = 0; i < paddedLength; i++) {
    const value = i < upper.length ? upper.charCodeAt(i)
      : i === upper.length ? remainder : upper.charCodeAt(upper.length - remainder);
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Index only: no recursive extraction, filesystem access, asset acquisition or decryption. */
export function parseMix(bytes: Uint8Array): MixArchive {
  const r = new BinaryReader(bytes, 'MIX', RA2_LIMITS.maxArchiveBytes);
  r.range(0, 2);
  let header: MixArchive['header'] = 'basic', prefix = 0, flags = 0;
  // A zero-count basic archive is only unambiguous in its canonical six-byte empty form.
  const emptyBasic = bytes.length === 6 && r.u16(0) === 0 && r.u32(2) === 0;
  if (r.u16(0) === 0 && !emptyBasic) {
    flags = r.u32(0);
    if (flags & 0x20000) fail('MIX', 'UNSUPPORTED', 'Encrypted MIX headers are not supported', 0);
    if ((flags & ~0x10000) !== 0) fail('MIX', 'UNSUPPORTED', 'Unknown MIX feature flags', 0);
    prefix = 4;
    header = 'advanced';
  }
  r.range(prefix, 6);
  const count = r.u16(prefix), dataSize = r.u32(prefix + 2), dataOffset = prefix + 6 + count * 12;
  r.range(prefix + 6, count * 12);
  r.range(dataOffset, dataSize);
  const checksum = flags & 0x10000 ? 'present-unverified' : 'absent';
  const trailerSize = checksum === 'absent' ? 0 : 20;
  r.range(dataOffset + dataSize, trailerSize);
  if (dataOffset + dataSize + trailerSize !== bytes.length) fail('MIX', 'INVALID_FORMAT', 'Declared body size does not match archive length');
  const byId = new Map<number, MixEntry>();
  const entries: MixEntry[] = [];
  for (let i = 0; i < count; i++) {
    const p = prefix + 6 + i * 12;
    const id = r.u32(p), relative = r.u32(p + 4), size = r.u32(p + 8);
    if (relative > dataSize || size > dataSize - relative) fail('MIX', 'INVALID_OFFSET', 'Entry exceeds MIX body', p + 4);
    if (byId.has(id)) fail('MIX', 'INVALID_FORMAT', 'Duplicate filename hash is ambiguous', p);
    const entry = Object.freeze({ id, offset: dataOffset + relative, size });
    entries.push(entry);
    byId.set(id, entry);
  }
  const sorted = entries.filter(e => e.size > 0).slice().sort((a, b) => a.offset - b.offset || a.size - b.size);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    if (b.offset < a.offset + a.size && !(a.offset === b.offset && a.size === b.size)) {
      fail('MIX', 'INVALID_OFFSET', 'Partially overlapping MIX entries', b.offset);
    }
  }
  const getById = (id: number): Uint8Array | undefined => {
    if (!Number.isInteger(id) || id < 0 || id > 0xffffffff) fail('MIX', 'INVALID_INPUT', 'Expected unsigned 32-bit entry id');
    const entry = byId.get(id);
    return entry ? bytes.subarray(entry.offset, entry.offset + entry.size) : undefined;
  };
  return Object.freeze({ entries: Object.freeze(entries), header, dataOffset, dataSize, checksum,
    getById, getByName: (name: string) => getById(mixFilenameId(name)) });
}
