import type { IUniform } from 'three';

/** On the live sun pass, expanding the complete physical lighting calculation
 * once per local bulb costs seconds of cold driver compilation. WebGL2 can
 * index a plain uniform array. Keep Three's exact order/BRDF and every lamp;
 * keep its original constant-index code whenever point-shadow samplers exist.
 * Deliberately leave the survey-only (including mirror-authoring) path alone. */
export function villaLocalLampLoop(chunk: string): string {
  const head = chunk.indexOf('#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )');
  const start = chunk.indexOf('#pragma unroll_loop_start', head), marker = '#pragma unroll_loop_end';
  const end = chunk.indexOf(marker, start), next = chunk.indexOf('#if ( NUM_SPOT_LIGHTS', head);
  if (head < 0 || start < head || end < start || next < end) return chunk;
  const original = chunk.slice(start, end + marker.length);
  const header = 'for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {';
  const shadow = original.indexOf('#if defined( USE_SHADOWMAP )'), close = original.indexOf('#endif', shadow);
  if (!original.includes(header) || !original.includes('pointLight = pointLights[ i ];') || !original.includes('RE_Direct( directLight,') ||
      shadow < 0 || close < shadow || !original.slice(shadow, close).includes('getPointShadow(')) return chunk;
  const plain = original.slice(0, shadow) + original.slice(close + '#endif'.length);
  const loop = plain.replace('#pragma unroll_loop_start', '').replace(header,
    'for ( int i = 0; i < min( NUM_POINT_LIGHTS, villaLocalLightCount ); ++i ) {').replace(marker, '');
  return chunk.slice(0, start) + '#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0 && NUM_POINT_LIGHT_SHADOWS == 0\n' +
    loop + '\n#else\n' + original + '\n#endif\n' + chunk.slice(end + marker.length);
}

/** Three binds `pointLights.value` to the actual camera's light state AFTER
 * onBeforeCompile, and can rebind it for another pass. Do not snapshot the
 * empty template, infer the count from a room, or truncate dim/off slots. */
export function villaLocalLampCount(points: IUniform<ArrayLike<unknown>> | undefined): IUniform<number> {
  return { get value() { return points?.value?.length ?? 0; } };
}
