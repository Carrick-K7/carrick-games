import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseGame, type GameHost } from '@carrick/game-sdk/game';

class Probe extends BaseGame {
  updates: number[] = [];
  frames = 0;
  manuallyPaused = false;
  init() {}
  update(dt: number) { if (!this.manuallyPaused) this.updates.push(dt); }
  draw() { this.frames++; }
  handleInput() {}
  now() { return this.gameNow(); }
  delay(fn: () => void, ms: number) { return this.setManagedTimeout(fn, ms); }
  cancel(id: number) { this.clearManagedTimeout(id); }
  frame(now: number) { (this as unknown as { loop: (now: number) => void }).loop(now); }
}

let clock: number;
beforeEach(() => {
  clock = 1000;
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('window', { devicePixelRatio: 1, setTimeout: globalThis.setTimeout, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const advance = (ms: number) => { clock += ms; vi.advanceTimersByTime(ms); };
function fixture() {
  const ctx = { setTransform: vi.fn(), save: vi.fn(), restore: vi.fn(), imageSmoothingEnabled: true };
  const canvas = { width: 400, height: 500, dataset: {} as Record<string, string>, style: {}, getContext: () => ctx, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const host: GameHost = { canvas: canvas as unknown as HTMLCanvasElement, logicalWidth: 400, logicalHeight: 500, isDarkTheme: () => true, isZhLang: () => false, isPixelMode: () => false, getRecord: () => null, reportScore: vi.fn(), requestShellRender: vi.fn() };
  return { game: new Probe(host), canvas };
}

describe('reading shell overlays freezes play without restarting it', () => {
  it('freezes simulation and animation, then continues the same prepared game', () => {
    const { game, canvas } = fixture();
    game.start();
    const count = canvas.dataset.gamePrepareCount, ticks = game.updates.length, frames = game.frames;
    game.setPresentationPaused(true);
    advance(10_000); game.frame(clock);
    expect(game.updates).toHaveLength(ticks);
    expect(game.frames).toBe(frames);
    expect(canvas.dataset.gamePresentation).toBe('paused');
    game.setPresentationPaused(false);
    advance(16); game.frame(clock);
    expect(game.updates).toHaveLength(ticks + 1);
    expect(game.updates.at(-1)).toBeCloseTo(.016, 6);
    expect(canvas.dataset.gamePrepareCount).toBe(count);
    expect(canvas.dataset.gamePresentation).toBe('active');
    game.destroy();
  });

  it('does not start an idle game or clear a manual gameplay pause', () => {
    const { game, canvas } = fixture();
    game.setPresentationPaused(true); game.setPresentationPaused(false);
    expect(game.updates).toHaveLength(0);
    expect(canvas.dataset.gamePrepareCount).toBe('0');
    game.start(); game.manuallyPaused = true;
    const count = game.updates.length;
    game.setPresentationPaused(true); advance(1000); game.setPresentationPaused(false);
    game.frame(clock);
    expect(game.manuallyPaused).toBe(true);
    expect(game.updates).toHaveLength(count);
    game.destroy();
  });

  it('excludes repeated help visits from gameplay wall-clock and reaction timing', () => {
    const { game } = fixture();
    expect(game.now()).toBe(1000);
    game.setPresentationPaused(true); advance(9000);
    expect(game.now()).toBe(1000);
    game.setPresentationPaused(true); advance(1000);
    game.setPresentationPaused(false); advance(250);
    expect(game.now()).toBe(1250);
    game.setPresentationPaused(true); advance(5000); game.setPresentationPaused(false);
    expect(game.now()).toBe(1250);
  });

  it('preserves the remaining AI delay, rather than firing while reading', () => {
    const { game } = fixture(), callback = vi.fn();
    game.delay(callback, 500); advance(200);
    game.setPresentationPaused(true); advance(10_000);
    expect(callback).not.toHaveBeenCalled();
    game.setPresentationPaused(false); advance(299);
    expect(callback).not.toHaveBeenCalled();
    advance(1); expect(callback).toHaveBeenCalledOnce();
    advance(1000); expect(callback).toHaveBeenCalledOnce();
  });

  it('defers newly scheduled work until closing and keeps cancellation handles stable', () => {
    const { game } = fixture(), callback = vi.fn();
    game.setPresentationPaused(true);
    const id = game.delay(callback, 100);
    expect(vi.getTimerCount()).toBe(0);
    advance(1000); game.setPresentationPaused(false);
    expect(vi.getTimerCount()).toBe(1);
    game.cancel(id); advance(200);
    expect(callback).not.toHaveBeenCalled();
  });

  it('never revives a destroyed game’s suspended callbacks', () => {
    const { game } = fixture(), callback = vi.fn();
    game.delay(callback, 100); game.setPresentationPaused(true);
    game.destroy(); game.setPresentationPaused(false); advance(1000);
    expect(callback).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
