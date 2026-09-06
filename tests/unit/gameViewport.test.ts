import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseGame, type GameHost, type GameViewport } from '../../src/core/game';
import { canvasBackingScale, MAX_CANVAS_BACKING_PIXELS } from '../../src/core/render';

const viewport = (width: number, height: number, dpr = 1): GameViewport => ({ width, height, dpr, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } });
class Probe extends BaseGame {
  frames = 0;
  state = 42;
  init() { this.state = 0; }
  update() {}
  draw() { this.frames++; }
  handleInput() {}
  fluid(v: GameViewport) { this.resizeLogicalViewport(v); }
  point(x: number, y: number) { return this.canvasPoint(x, y); }
  result() { this.publishResult({ title: 'Complete', tone: 'success' }); }
  get size() { return [this.width, this.height]; }
}
function fixture() {
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  const ctx = { setTransform: vi.fn(), save: vi.fn(), restore: vi.fn(), imageSmoothingEnabled: true };
  const canvas = {
    width: 400, height: 500, dataset: {} as Record<string, string>,
    style: { width: '', height: '', left: '', top: '' },
    getContext: () => ctx,
    getBoundingClientRect() { return { left: parseFloat(this.style.left) || 0, top: parseFloat(this.style.top) || 0, width: parseFloat(this.style.width), height: parseFloat(this.style.height) }; },
  };
  const host: GameHost = { canvas: canvas as unknown as HTMLCanvasElement, logicalWidth: 400, logicalHeight: 500, isDarkTheme: () => true, isZhLang: () => false, isPixelMode: () => false, getRecord: () => null, reportScore: vi.fn(), requestShellRender: vi.fn() };
  return { canvas, game: new Probe(host) };
}
afterEach(() => vi.unstubAllGlobals());

describe('game window viewport contract', () => {
  it('maximizes fixed boards without changing coordinates or game state', () => {
    const { game, canvas } = fixture();
    game.setViewport(viewport(1920, 1080));
    expect(parseFloat(canvas.style.height)).toBe(1080);
    expect(parseFloat(canvas.style.width)).toBe(864);
    expect(canvas.style.left).toBe('528px');
    expect(game.size).toEqual([400, 500]);
    expect(game.state).toBe(42);
    expect(game.point(960, 540)).toEqual({ x: 200, y: 250 });
  });
  it('contains within asymmetric safe areas without changing pointer mapping', () => {
    const { game, canvas } = fixture();
    game.setViewport({ ...viewport(390, 844, 2), safeArea: { top: 47, right: 0, bottom: 34, left: 20 } });
    expect(parseFloat(canvas.style.width)).toBe(370);
    expect(parseFloat(canvas.style.left)).toBe(20);
    const box = canvas.getBoundingClientRect();
    expect(game.point(box.left + box.width, box.top + box.height)).toEqual({ x: 400, y: 500 });
  });
  it('resizes fluid games including height-only changes with no reset', () => {
    const { game, canvas } = fixture();
    game.fluid(viewport(1000, 600));
    const frames = game.frames;
    game.fluid(viewport(1000, 800));
    expect(game.frames).toBeGreaterThan(frames);
    expect(game.size).toEqual([1000, 800]);
    expect(canvas.dataset.logicalHeight).toBe('800');
    expect(canvas.style.height).toBe('800px');
    expect(game.point(500, 400)).toEqual({ x: 500, y: 400 });
    expect(game.state).toBe(42);
  });
  it('rejects zero/invalid viewports and bounds high-density allocation', () => {
    const { game, canvas } = fixture();
    game.fluid(viewport(0, 10));
    game.setViewport(viewport(10, NaN));
    expect(game.size).toEqual([400, 500]);
    game.fluid(viewport(7680, 4320, 4));
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(MAX_CANVAS_BACKING_PIXELS);
    expect(canvas.style.width).toBe('7680px');
    expect(canvas.width / canvas.height).toBeCloseTo(7680 / 4320, 2);
  });
  it('publishes the shared terminal contract without painting a second result panel', () => {
    const { game, canvas } = fixture();
    game.result();
    expect(canvas.dataset).toMatchObject({ gameResult: 'success', gameResultTitle: 'Complete' });
    expect(game.frames).toBe(0);
  });
  it('allows tiny display fits and limits DPR without capping CSS size', () => {
    expect(canvasBackingScale(1000, 1000, 100, 1)).toBe(.1);
    expect(canvasBackingScale(1000, 1000, 1000, 4)).toBe(2);
    expect(canvasBackingScale(-1, 100, 100, 1)).toBe(1);
  });
});
