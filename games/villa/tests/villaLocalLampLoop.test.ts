import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { villaLocalLampCount, villaLocalLampLoop } from '../src/villaLocalLampLoop.js';

const stock = THREE.ShaderChunk.lights_fragment_begin;
const tag = '#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0 && NUM_POINT_LIGHT_SHADOWS == 0\n';

describe('local lamp lighting in the actual Three fragment chunk', () => {
  it('keeps constant shadow samplers and the survey-only algorithm intact, including every other light', () => {
    const revised = villaLocalLampLoop(stock);
    const at = revised.indexOf(tag), alternate = revised.indexOf('\n#else\n', at + tag.length);
    expect(at).toBeGreaterThan(stock.indexOf('#if ( NUM_POINT_LIGHTS > 0 )'));
    const endPragma = '#pragma unroll_loop_end', end = revised.indexOf(endPragma, alternate) + endPragma.length;
    const fallback = revised.slice(alternate + '\n#else\n'.length, end);
    expect(fallback).toContain('getPointShadow( pointShadowMap[ i ]');
    expect(revised.slice(0, at) + fallback + revised.slice(end + '\n#endif\n'.length)).toBe(stock);
    const bounded = revised.slice(at + tag.length, alternate);
    expect(bounded).toContain('int i = 0; i < min( NUM_POINT_LIGHTS, villaLocalLightCount ); ++i');
    expect(bounded).not.toMatch(/unroll_loop|UNROLLED_LOOP_INDEX|pointShadowMap/);
    const math = (s: string) => s.split('\n').map(l => l.trim()).filter(l => /^(pointLight =|getPointLightInfo\(|RE_Direct\()/.test(l));
    expect(math(bounded)).toEqual(math(fallback)); expect(math(bounded)).toHaveLength(3);
  });
  it('follows the bound renderer array through empty, re-bound, and separately owned camera light lists', () => {
    const slot = { value: [] as unknown[] }, a = villaLocalLampCount(slot), b = villaLocalLampCount({ value: [1,2] });
    expect(a.value).toBe(0);slot.value=Array.from({length:8},(_,i)=>({intensity:i%2}));expect(a.value).toBe(8);
    slot.value.length=3;expect(a.value).toBe(3);slot.value=[];expect(a.value).toBe(0);expect(b.value).toBe(2);
    expect(villaLocalLampCount(undefined).value).toBe(0);
    const unknown=stock.replace('getPointShadow( pointShadowMap','unknownFutureShadow( pointShadowMap');
    expect(villaLocalLampLoop(unknown)).toBe(unknown);expect(villaLocalLampLoop('unrelated chunk')).toBe('unrelated chunk');
  });
});
