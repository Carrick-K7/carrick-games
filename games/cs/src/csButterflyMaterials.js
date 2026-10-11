import * as T from 'three';

let palette;
/** Static butterfly-owned satin reflections; no image fetch or shared gun mutation. */
export function butterflyMaterials() {
  if (palette) return palette;
  const width = 256, height = 128, pixels = new Uint16Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const latitude = (y + .5) / height * Math.PI, longitude = (x + .5) / width * Math.PI * 2;
    const up = -Math.cos(latitude), side = Math.sin(latitude) * Math.cos(longitude);
    const sky = T.MathUtils.smoothstep(up, -.16, .34);
    const horizon = Math.exp(-Math.pow(up / .18, 2)) * .15;
    const softbox = Math.exp(-Math.pow((side + .42) / .24, 2) - Math.pow((up - .48) / .48, 2)) * 1.5;
    const i = (y * width + x) * 4;
    for (let c = 0; c < 3; c++) pixels[i + c] = T.DataUtils.toHalfFloat(
      T.MathUtils.lerp([.10, .115, .13][c], [.54, .61, .68][c], sky) + horizon + softbox * [1, .96, .88][c]);
    pixels[i + 3] = T.DataUtils.toHalfFloat(1);
  }
  const envMap = new T.DataTexture(pixels, width, height, T.RGBAFormat, T.HalfFloatType);
  envMap.name = 'butterfly-satin-reflections'; envMap.mapping = T.EquirectangularReflectionMapping;
  envMap.colorSpace = T.LinearSRGBColorSpace; envMap.minFilter = envMap.magFilter = T.LinearFilter; envMap.needsUpdate = true;
  const metal = (name, color, roughness, intensity) => new T.MeshStandardMaterial({ name, color,
    metalness: .9, roughness, envMap, envMapIntensity: intensity });
  // Module singletons are deliberately NOT per-instance disposable materials.
  palette = {
    satin: metal('butterfly-satin-steel', 0x9da5a8, .34, .75),
    bevel: metal('butterfly-ground-edge', 0xc3ccce, .22, .85),
    liner: metal('butterfly-dark-liner', 0x3e454b, .44, .55),
    grip: new T.MeshStandardMaterial({ name: 'butterfly-matte-inlay', color: 0x292f2d, metalness: .03, roughness: .86 }),
  };
  return palette;
}
