import { ShaderChunk, type MeshStandardMaterial } from 'three';
import { VILLA_GARDEN_TREES } from './villaGarden.js';
import { drift, mix, saturate, smooth } from './villaRiparianGround.js';
import { sample01 } from './villaWeatheredFinish.js';

/** Irrigated stretches (~12 m) and smaller, oblique changes in the sward (~2.8 m).
 * Both the photographed floor and its few uncut tillers sample the same rooted place. */
export function lawnPatch(x: number, z: number) {
  const reach = 2 * drift((x + .24 * z) / 13 + 9.3, (z - .24 * x) / 11 - 6.7) - 1;
  const fleck = 2 * drift((.85 * x - .53 * z) / 2.7 - 17.1, (.53 * x + .85 * z) / 3.2 + 23.4) - 1;
  let shade = 0;
  for (const tree of VILLA_GARDEN_TREES) {
    const dx = x - tree.x, dz = z - tree.z, radius = 2.9 * tree.scale;
    if (Math.abs(dx) < radius && Math.abs(dz) < radius) {
      const canopy = Math.max(0, 1 - (dx * dx + dz * dz) / (radius * radius));
      shade = Math.max(shade, canopy * canopy); // Growing conditions, not another baked shadow.
    }
  }
  const meadow = smooth((z - 29) / 30);
  const fresh = saturate(.50 + .29 * reach + .23 * fleck + .17 * shade - .06 * meadow);
  // Keep the old mower's heading and pass width; let neighbouring runs bend together a little.
  const swath = Math.sin((x + .08 * z + .43 * reach + .10 * fleck) * 1.79);
  const value = 1 + .075 * reach + .044 * fleck + (.044 - .021 * meadow) * swath;
  return { reach, fleck, shade, meadow, fresh, swath, value };
}

// Draw the swatch through two gently wavering chart axes instead of resetting its phase at tiles.
// Each displacement is linear BETWEEN metre stations. Their sum is affine in every original
// 1 m cell, so extra cut vertices (including T junctions at the fence) lie on the same chart.
function axisOffset(metres: number, salt: number, spacing: number) {
  const offsetAt = (station: number) => {
    const t = station / spacing + .37, k = Math.floor(t);
    return mix(sample01(k, salt), sample01(k + 1, salt), smooth(t - k)) - .5;
  };
  const i = Math.floor(metres), t = metres - i, a = offsetAt(i);
  return t === 0 ? a : mix(a, offsetAt(i + 1), t);
}
export function lawnPhotoUV(x: number, z: number): readonly [number, number] {
  // Cross-axis wander changes which blades meet at the old 1.25 m repeat. The small
  // longitudinal term keeps their local size; the existing sampler still repeats twice per 2.5 m.
  const dx = .51 * axisOffset(x, 461, 5.7) + 1.12 * axisOffset(z, 83, 8.3);
  const dz = 1.06 * axisOffset(x, 307, 7.1) + .54 * axisOffset(z, 617, 5.2);
  return [(x + dx) / 2.5, (z + dz) / 2.5];
}

/** Keep photographed blade edges in their original metre chart. Only a small, softer
 * layer of clippings samples the wandering phase. Both taps use the SAME mipmapped
 * scan (or its normal loading/failed-image fallback); neither is a screen-space effect. */
export function bindManagedLawnPhoto(material: MeshStandardMaterial) {
  const previous = material.onBeforeCompile.bind(material), key = material.customProgramCacheKey();
  const varying = '\n#ifdef USE_MAP\nvarying vec2 vLawnMetricUv;\n#endif';
  const mapChunk = ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )',
    'mix( texture2D( map, vLawnMetricUv ), texture2D( map, vMapUv, 1.25 ), 0.18 )');
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.vertexShader = shader.vertexShader.replace('#include <uv_pars_vertex>', '#include <uv_pars_vertex>' + varying)
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvLawnMetricUv = (mapTransform * vec3(position.xz / 2.5, 1.0)).xy;\n#endif');
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_pars_fragment>', '#include <map_pars_fragment>' + varying)
      .replace('#include <map_fragment>', mapChunk);
  };
  material.customProgramCacheKey = () => key + '|lawn-clippings-v1';
  material.needsUpdate = true;
}
