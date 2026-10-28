import { describe, it, expect } from 'vitest';
import { project, unproject } from '../src/renderer.js';
describe('isometric input coordinates', () => {
  it('round trips tile interiors at every supported zoom independent of DPR', () => {
    for (const zoom of [.45, .8, 1, 1.5, 2]) {
      const camera = { x: 321, y: -90, zoom };
      for (const [x, y] of [[0, 0], [5, 9], [35, 35], [18, 3]]) {
        const point = project(x! + .5, y! + .5, camera);
        expect(unproject(point.x, point.y, camera)).toEqual({ x, y });
      }
    }
  });
});
