import { VoxelReader, VOXEL_LIMITS, type VxlFile } from './vxl.js';
export interface HvaFile { name: string; sections: string[]; frameCount: number; frames: number[][][] }
/** Row-major 3×4 transforms, in frame then section order. */
export function decodeHva(bytes: Uint8Array): HvaFile {
  const r = new VoxelReader(bytes, 'HVA'); r.range(0, 24);
  const name = r.string(0), frameCount = r.u32(16), sectionCount = r.u32(20);
  if (!frameCount || !sectionCount || frameCount > VOXEL_LIMITS.frames || sectionCount > VOXEL_LIMITS.limbs || frameCount * sectionCount > VOXEL_LIMITS.matrices) r.fail('LIMIT', 'Invalid animation counts');
  const start = 24 + sectionCount * 16, end = start + frameCount * sectionCount * 48;
  r.range(0, end); if (end !== bytes.length) r.fail('SIZE', 'Unexpected animation trailing bytes');
  const sections = Array.from({ length: sectionCount }, (_, i) => r.string(24 + i * 16));
  const frames = Array.from({ length: frameCount }, (_, frame) => Array.from({ length: sectionCount }, (_, section) => {
    const at = start + (frame * sectionCount + section) * 48;
    return Array.from({ length: 12 }, (_, n) => r.f32(at + n * 4));
  }));
  return { name, sections, frameCount, frames };
}
export function validateVoxelPair(model: VxlFile, animation: HvaFile): void {
  // The original loader pairs by position. Reject mismatches instead of reading past another layer.
  if (model.limbs.length !== animation.sections.length) throw new Error('voxel-animation-section-mismatch');
}
