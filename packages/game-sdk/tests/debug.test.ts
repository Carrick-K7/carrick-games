import { afterEach, expect, it, vi } from 'vitest';
import { installGameDebug } from '../src/debug';

afterEach(() => vi.unstubAllGlobals());
it('retires old QA callbacks and never removes a replacement owner', () => {
  const scope: Record<string, any> = {};
  vi.stubGlobal('window', scope);
  const a = vi.fn(), b = vi.fn();
  const releaseA = installGameDebug('__PROBE_DEBUG__', { run: a });
  const first = scope.__PROBE_DEBUG__;
  first.run(1); expect(a).toHaveBeenCalledWith(1);
  const releaseB = installGameDebug('__PROBE_DEBUG__', { run: b });
  const second = scope.__PROBE_DEBUG__;
  releaseA(); first.run(2);
  expect(a).toHaveBeenCalledTimes(1);
  expect(scope.__PROBE_DEBUG__).toBe(second);
  second.run(3); expect(b).toHaveBeenCalledWith(3);
  releaseB(); expect(scope.__PROBE_DEBUG__).toBeUndefined();
  scope.__PROBE_DEBUG__ = second; second.run(4);
  expect(b).toHaveBeenCalledTimes(1);
});
