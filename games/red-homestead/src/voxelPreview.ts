import type { VxlFile } from './ra2/vxl.js';
import { validateVoxelPair, type HvaFile } from './ra2/hva.js';
/** Geometry inspection only: palette colors, not Westwood normal tables / VPL lighting. */
export function rasterizeVoxelPreview(model: VxlFile, animation: HvaFile, palette: Uint8ClampedArray, frame = 0, facing = 0) {
  validateVoxelPair(model, animation);
  if (palette.length !== 1024 || !Number.isSafeInteger(frame) || frame < 0 || !Number.isFinite(facing)) throw new Error('invalid-voxel-preview');
  const matrices = animation.frames[frame % animation.frameCount]!;
  const points = new Float32Array(model.voxelCount * 4);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, n = 0;
  const motionScale = model.limbs[0]!.scale, k = Math.SQRT1_2;
  for (let limbIndex = 0; limbIndex < model.limbs.length; limbIndex++) {
    const limb = model.limbs[limbIndex]!, matrix = matrices[limbIndex]!;
    const dx = (limb.maxBounds[0]! - limb.minBounds[0]!) / limb.sizeX;
    const dy = (limb.maxBounds[1]! - limb.minBounds[1]!) / limb.sizeY;
    const dz = (limb.maxBounds[2]! - limb.minBounds[2]!) / limb.sizeZ;
    for (let i = 0; i < limb.voxels.length; i += 5) {
      const x = limb.minBounds[0]! + (limb.voxels[i]! + .5) * dx;
      const y = limb.minBounds[1]! + (limb.voxels[i + 1]! + .5) * dy;
      const z = limb.minBounds[2]! + (limb.voxels[i + 2]! + .5) * dz;
      const baseX = matrix[0]! * x + matrix[1]! * y + matrix[2]! * z + matrix[3]! * motionScale;
      const baseY = matrix[4]! * x + matrix[5]! * y + matrix[6]! * z + matrix[7]! * motionScale;
      const wx = baseX * Math.cos(facing) - baseY * Math.sin(facing);
      const wy = baseX * Math.sin(facing) + baseY * Math.cos(facing);
      const wz = matrix[8]! * x + matrix[9]! * y + matrix[10]! * z + matrix[11]! * motionScale;
      const sx = (wx - wy) * k, sy = (wx + wy) * k * .5 - wz * Math.sqrt(.75);
      if (!Number.isFinite(sx) || !Number.isFinite(sy) || Math.abs(sx) > 100000 || Math.abs(sy) > 100000) throw new Error('voxel-preview-transform');
      points[n++] = sx; points[n++] = sy; points[n++] = (wx + wy) * k * Math.sqrt(.75) + wz * .5; points[n++] = limb.voxels[i + 3]!;
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    }
  }
  if (!n) throw new Error('empty-voxel-model');
  const width = Math.ceil(maxX - minX) + 6, height = Math.ceil(maxY - minY) + 6;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width > 2048 || height > 2048 || width * height > 2_097_152) throw new Error('voxel-preview-dimensions');
  const rgba = new Uint8ClampedArray(width * height * 4), depth = new Float32Array(width * height).fill(-Infinity);
  for (let i = 0; i < n; i += 4) {
    const x = Math.floor(points[i]! - minX + 2), y = Math.floor(points[i + 1]! - minY + 2), z = points[i + 2]!, color = points[i + 3]! * 4;
    for (let oy = 0; oy < 2; oy++) for (let ox = 0; ox < 2; ox++) {
      const pixel = (y + oy) * width + x + ox;
      if (depth[pixel]! > z) continue;
      depth[pixel] = z; rgba[pixel * 4] = palette[color]!; rgba[pixel * 4 + 1] = palette[color + 1]!;
      rgba[pixel * 4 + 2] = palette[color + 2]!; rgba[pixel * 4 + 3] = 255;
    }
  }
  return { width, height, rgba, anchorX: 2 - minX, anchorY: 2 - minY, lighting: 'palette-only' as const };
}
