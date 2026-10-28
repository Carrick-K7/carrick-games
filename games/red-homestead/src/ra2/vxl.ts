/** VXL span geometry. No art acquisition or executable parsing. See public/CREDITS.md. */
export interface VxlLimb {
  name: string; infoIndex: number; sizeX: number; sizeY: number; sizeZ: number;
  scale: number; transform: number[]; minBounds: number[]; maxBounds: number[]; normalsMode: number;
  /** Packed x,y,z,colorIndex,normalIndex bytes; index 0 is not guessed to mean empty. */
  voxels: Uint8Array; voxelCount: number;
}
export interface VxlFile {
  name: string; palettes: { remapStart: number; remapEnd: number; rgb: Uint8Array }[];
  limbs: VxlLimb[]; voxelCount: number;
}
export class VoxelFormatError extends Error {
  readonly name = 'VoxelFormatError';
  constructor(readonly format: 'VXL' | 'HVA', readonly code: string, message: string) { super(`${format}: ${message}`); }
}
export const VOXEL_LIMITS = Object.freeze({ inputBytes: 32 * 1024 * 1024, limbs: 64, infoRecords: 256, voxels: 1_000_000, frames: 2048, matrices: 65536 });
export class VoxelReader {
  readonly view: DataView;
  constructor(readonly bytes: Uint8Array, readonly format: 'VXL' | 'HVA') {
    if (!(bytes instanceof Uint8Array) || bytes.length > VOXEL_LIMITS.inputBytes) this.fail('LIMIT', 'Invalid input or input too large');
    try { this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
    catch { this.fail('INPUT', 'Detached input'); }
  }
  fail(code: string, message: string): never { throw new VoxelFormatError(this.format, code, message); }
  range(at: number, count: number, end = this.bytes.length) {
    if (!Number.isSafeInteger(at) || !Number.isSafeInteger(count) || at < 0 || count < 0 || at > end || count > end - at) this.fail('TRUNCATED', 'Byte range outside file');
  }
  u32(at: number) { this.range(at, 4); return this.view.getUint32(at, true); }
  i32(at: number) { this.range(at, 4); return this.view.getInt32(at, true); }
  f32(at: number) {
    this.range(at, 4); const n = this.view.getFloat32(at, true);
    if (!Number.isFinite(n) || Math.abs(n) > 1_000_000) this.fail('FLOAT', 'Non-finite or excessive transform'); return n;
  }
  string(at: number) {
    this.range(at, 16); let name = '';
    for (let i = at; i < at + 16 && this.bytes[i]; i++) {
      const value = this.bytes[i]!; if (value < 32 || value > 126) this.fail('NAME', 'Invalid ASCII section name'); name += String.fromCharCode(value);
    }
    return name;
  }
}
export function decodeVxl(bytes: Uint8Array): VxlFile {
  const r = new VoxelReader(bytes, 'VXL'); r.range(0, 32);
  const name = r.string(0); if (name !== 'Voxel Animation') r.fail('MAGIC', 'Not a Westwood VXL');
  const paletteCount = r.u32(16), count = r.u32(20), infoCount = r.u32(24), bodySize = r.u32(28);
  if (paletteCount > 4 || count === 0 || count > VOXEL_LIMITS.limbs || infoCount === 0 || infoCount > VOXEL_LIMITS.infoRecords) r.fail('LIMIT', 'Palette or limb count outside supported limits');
  const headersAt = 32 + paletteCount * 770, bodyAt = headersAt + count * 28, tailAt = bodyAt + bodySize;
  r.range(0, tailAt + infoCount * 92);
  if (tailAt + infoCount * 92 !== bytes.length) r.fail('SIZE', 'Unexpected VXL trailing bytes');
  const palettes: VxlFile['palettes'] = [];
  for (let i = 0; i < paletteCount; i++) {
    const at = 32 + i * 770;
    palettes.push({ remapStart: bytes[at]!, remapEnd: bytes[at + 1]!, rgb: bytes.slice(at + 2, at + 770) });
  }
  const limbs: VxlLimb[] = []; let total = 0;
  for (let i = 0; i < count; i++) {
    const head = headersAt + i * 28, infoIndex = r.u32(head + 16);
    if (infoIndex >= infoCount) r.fail('INDEX', 'Limb references a missing info record');
    const at = tailAt + infoIndex * 92;
    const spanStart = bodyAt + r.u32(at), spanEnd = bodyAt + r.u32(at + 4), spanData = bodyAt + r.u32(at + 8);
    const scale = r.f32(at + 12), transform = Array.from({ length: 12 }, (_, n) => r.f32(at + 16 + n * 4));
    const minBounds = Array.from({ length: 3 }, (_, n) => r.f32(at + 64 + n * 4));
    const maxBounds = Array.from({ length: 3 }, (_, n) => r.f32(at + 76 + n * 4));
    const sizeX = bytes[at + 88]!, sizeY = bytes[at + 89]!, sizeZ = bytes[at + 90]!, normalsMode = bytes[at + 91]!;
    if (!sizeX || !sizeY || !sizeZ || scale <= 0 || scale > 100 || normalsMode > 4) r.fail('BOUNDS', 'Invalid voxel dimensions, scale or normals');
    if (minBounds.some((value, n) => value > maxBounds[n]!)) r.fail('BOUNDS', 'Inverted model bounds');
    const spans = sizeX * sizeY;
    r.range(spanStart, spans * 4, tailAt); r.range(spanEnd, spans * 4, tailAt); r.range(spanData, 0, tailAt);
    if (spanStart < bodyAt || spanEnd < bodyAt || spanData < bodyAt) r.fail('OFFSET', 'Span data outside body');
    const capacity = Math.min(sizeX * sizeY * sizeZ, VOXEL_LIMITS.voxels - total);
    const packed = new Uint8Array(capacity * 5); let used = 0;
    for (let span = 0; span < spans; span++) {
      const begin = r.i32(spanStart + span * 4), last = r.i32(spanEnd + span * 4);
      if (begin === -1 && last === -1) continue;
      if (begin < 0 || last < begin) r.fail('SPAN', 'Invalid span bounds');
      let p = spanData + begin, z = 0; const end = spanData + last + 1;
      r.range(p, end - p, tailAt);
      while (p < end) {
        r.range(p, 2, end); const skip = bytes[p++]!, run = bytes[p++]!;
        z += skip;
        if (z > sizeZ || run > sizeZ - z || skip + run === 0) r.fail('RUN', 'Invalid or non-progressing voxel run');
        r.range(p, run * 2 + 1, end);
        if (used + run > capacity) r.fail('LIMIT', 'Decoded voxel count exceeds budget');
        for (let n = 0; n < run; n++) {
          const out = used++ * 5;
          packed[out] = span % sizeX; packed[out + 1] = Math.floor(span / sizeX); packed[out + 2] = z++;
          packed[out + 3] = bytes[p++]!; packed[out + 4] = bytes[p++]!;
        }
        if (bytes[p++] !== run) r.fail('RUN', 'Mismatching reverse run length');
      }
      if (p !== end) r.fail('SPAN', 'Span data not exhausted');
    }
    total += used;
    limbs.push({ name: r.string(head), infoIndex, sizeX, sizeY, sizeZ, scale, transform, minBounds, maxBounds, normalsMode, voxels: packed.slice(0, used * 5), voxelCount: used });
  }
  return { name, palettes, limbs, voxelCount: total };
}
