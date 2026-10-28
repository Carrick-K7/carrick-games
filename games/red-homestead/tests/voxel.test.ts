import { describe, expect, it } from 'vitest';
import { decodeVxl, VoxelFormatError } from '../src/ra2/vxl.js';
import { decodeHva, validateVoxelPair } from '../src/ra2/hva.js';
import { rasterizeVoxelPreview } from '../src/voxelPreview.js';
function model() {
  const bodyAt = 830, bodySize = 15, tail = bodyAt + bodySize;
  const data = new Uint8Array(tail + 92), view = new DataView(data.buffer);
  data.set(new TextEncoder().encode('Voxel Animation'), 0);
  view.setUint32(16, 1, true); view.setUint32(20, 1, true); view.setUint32(24, 1, true); view.setUint32(28, bodySize, true);
  data[32] = 16; data[33] = 31; data.set(new TextEncoder().encode('body'), 802);
  view.setUint32(822, 1, true);
  view.setInt32(bodyAt, 0, true); view.setInt32(bodyAt + 4, 6, true); data.set([1, 2, 5, 4, 8, 7, 2], bodyAt + 8);
  view.setUint32(tail, 0, true); view.setUint32(tail + 4, 4, true); view.setUint32(tail + 8, 8, true); view.setFloat32(tail + 12, 1 / 12, true);
  for (const at of [16, 36, 56]) view.setFloat32(tail + at, 1, true);
  for (const at of [76, 80]) view.setFloat32(tail + at, 1, true); view.setFloat32(tail + 84, 4, true);
  data.set([1, 1, 4, 4], tail + 88);
  return data;
}
function animation() {
  const data = new Uint8Array(136), view = new DataView(data.buffer);
  data.set(new TextEncoder().encode('example'), 0); view.setUint32(16, 2, true); view.setUint32(20, 1, true);
  data.set(new TextEncoder().encode('body'), 24);
  for (let frame = 0; frame < 2; frame++) for (const [n, value] of [1, 0, 0, frame * 3, 0, 1, 0, 0, 0, 0, 1, 0].entries()) view.setFloat32(40 + frame * 48 + n * 4, value, true);
  return data;
}
describe('bounded VXL/HVA geometry decoding', () => {
  it('preserves sparse columns, color/normal indices and transforms', () => {
    const result = decodeVxl(model()); expect(result.voxelCount).toBe(2);
    expect([...result.limbs[0]!.voxels]).toEqual([0, 0, 1, 5, 4, 0, 0, 2, 8, 7]);
    expect(result.limbs[0]).toMatchObject({ name: 'body', sizeX: 1, sizeY: 1, sizeZ: 4, normalsMode: 4 });
  });
  it('respects subarray offsets and does not mutate input', () => {
    const original = model(), storage = new Uint8Array(original.length + 10); storage.set(original, 5);
    expect(decodeVxl(storage.subarray(5, 5 + original.length)).voxelCount).toBe(2);
    expect(storage.subarray(5, 5 + original.length)).toEqual(original);
  });
  it('rejects every truncated prefix without unchecked reads', () => {
    const data = model(); for (let end = 0; end < data.length; end++) expect(() => decodeVxl(data.subarray(0, end))).toThrow(VoxelFormatError);
  });
  it.each(['count', 'offset', 'run', 'repeat', 'float', 'bounds', 'normal'])('rejects malformed %s', problem => {
    const data = model(), view = new DataView(data.buffer), tail = 845;
    if (problem === 'count') view.setUint32(20, 1000000, true);
    if (problem === 'offset') view.setUint32(tail + 8, 100000, true);
    if (problem === 'run') data[839] = 8;
    if (problem === 'repeat') data[844] = 3;
    if (problem === 'float') view.setFloat32(tail + 12, NaN, true);
    if (problem === 'bounds') view.setFloat32(tail + 64, 8, true);
    if (problem === 'normal') data[tail + 91] = 255;
    expect(() => decodeVxl(data)).toThrow(VoxelFormatError);
  });
  it('preserves animation frames and positional section pairing', () => {
    const result = decodeHva(animation()); expect(result.frameCount).toBe(2); expect(result.frames[1]![0]![3]).toBe(3);
    expect(() => validateVoxelPair(decodeVxl(model()), result)).not.toThrow();
    expect(() => validateVoxelPair(decodeVxl(model()), { ...result, sections: [] })).toThrow('section-mismatch');
  });
  it('produces bounded palette-only geometry previews without pretending to use VPL lighting', () => {
    const palette = new Uint8ClampedArray(1024).fill(255);
    const result = rasterizeVoxelPreview(decodeVxl(model()), decodeHva(animation()), palette);
    expect(result.lighting).toBe('palette-only'); expect(result.width).toBeGreaterThan(0); expect(result.height).toBeGreaterThan(0);
    expect(result.rgba.some((value, i) => i % 4 === 3 && value === 255)).toBe(true);
    expect(() => rasterizeVoxelPreview(decodeVxl(model()), decodeHva(animation()), palette, -1)).toThrow('invalid-voxel-preview');
    const huge = decodeHva(animation()); huge.frames[0]![0]![3] = 1e15;
    expect(() => rasterizeVoxelPreview(decodeVxl(model()), huge, palette)).toThrow('voxel-preview-transform');
  });
  it('rejects zero-frame, nonfinite and truncated animation', () => {
    for (let size = 0; size < 136; size++) expect(() => decodeHva(animation().subarray(0, size))).toThrow(VoxelFormatError);
    const zero = animation(); new DataView(zero.buffer).setUint32(16, 0, true); expect(() => decodeHva(zero)).toThrow(VoxelFormatError);
    const nan = animation(); new DataView(nan.buffer).setFloat32(44, Infinity, true); expect(() => decodeHva(nan)).toThrow(VoxelFormatError);
  });
});
