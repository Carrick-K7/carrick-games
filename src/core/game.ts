import {
  configureHiDpiCanvas,
  drawGameResultOverlay,
  getRetroPalette,
  getCanvasPoint,
  isPixelMode,
  setCanvasDisplaySize,
  type CanvasPoint,
  type GameResultOverlayOptions,
} from './render.js';
import type { LevelSelectState } from './levelselect.js';
import { getStoredRecord } from './storage.js';
export { getStoredRecord, readStoredRecords } from './storage.js';

export interface GameShellSnapshot {
  score?: number;
  levelSelect?: LevelSelectState;
}

export interface GameFrameTelemetry {
  levelSelect?: LevelSelectState;
}

/** Display pixels, independent of a game's world/board coordinate system. */
export interface GameViewport {
  width: number;
  height: number;
  dpr: number;
  safeArea: { top: number; right: number; bottom: number; left: number };
}

export interface GamePresentation {
  toggleFullscreen(): void;
  isFullscreen(): boolean;
  /** Games may link to the shared guide; they do not own its layout. */
  openControls?(): void;
  isControlsOpen?(): boolean;
}

export interface Game {
  init(): void;
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
  prepare(): void;
  start(): void;
  restart(): void;
  stop(): void;
  renderFrame(): void;
  /** Re-fit the canvas to a shell-chosen CSS width (backing store stays sharp). */
  setDisplayScale?(cssWidth: number): void;
  setViewport?(viewport: GameViewport): void;
  onShellOverlayChange?(open: boolean): void;
  getShellSnapshot(): GameShellSnapshot;
  getFrameTelemetry(): GameFrameTelemetry | null;
  startDemo?(): void;
  selectLevel?(index: number): void;
  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent): void;
  destroy(): void;
}

export interface GameHost {
  canvas: HTMLCanvasElement;
  logicalWidth: number;
  logicalHeight: number;
  isDarkTheme(): boolean;
  isZhLang(): boolean;
  isPixelMode(): boolean;
  getRecord(gameId: string): number | null;
  reportScore(score: number): void;
  requestShellRender(): void;
  presentation?: GamePresentation;
}

export const MAX_FRAME_DELTA_SECONDS = 0.05;

export function clampFrameDelta(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.min(seconds, MAX_FRAME_DELTA_SECONDS);
}

export function shellSnapshotKey(snapshot: GameShellSnapshot): string {
  const levels = snapshot.levelSelect;
  return JSON.stringify({
    score: snapshot.score,
    levels: levels ? {
      currentLevel: levels.currentLevel,
      bestLevel: levels.bestLevel,
      unlockedLevel: levels.unlockedLevel,
      selectedLevel: levels.selectedLevel,
      gameState: levels.gameState,
    } : undefined,
  });
}

export function isDarkTheme(): boolean {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit === 'dark') return true;
  if (explicit === 'light') return false;
  if (!window.matchMedia) return true;
  return !window.matchMedia('(prefers-color-scheme: light)').matches;
}

export function isZhLang(): boolean {
  return document.documentElement.getAttribute('data-lang') === 'zh';
}

export function createDefaultGameHost(
  canvasId: string,
  logicalWidth: number,
  logicalHeight: number,
): GameHost {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) throw new Error(`Canvas #${canvasId} not found`);
  return {
    canvas,
    logicalWidth,
    logicalHeight,
    isDarkTheme,
    isZhLang,
    isPixelMode,
    getRecord: getStoredRecord,
    reportScore: () => undefined,
    requestShellRender: () => undefined,
  };
}

export abstract class BaseGame implements Game {
  protected canvas: HTMLCanvasElement;
  protected ctx: CanvasRenderingContext2D;
  protected running = false;
  protected lastTime = 0;
  protected animationId = 0;
  protected pixelRatio = 1;
  private readonly boundHandleInput: (e: KeyboardEvent | TouchEvent | MouseEvent) => void;
  private inputBound = false;
  private baseScoreAlreadyReported = false;
  private prepared = false;
  private readonly managedTimeouts = new Set<number>();
  private readonly managedCleanups = new Set<() => void>();
  private lastShellSnapshotKey = '';

  constructor(protected readonly host: GameHost) {
    this.canvas = host.canvas;
    this.width = host.logicalWidth;
    this.height = host.logicalHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D context not available');
    this.ctx = ctx;
    this.pixelRatio = configureHiDpiCanvas(this.canvas, this.ctx, this.width, this.height);
    this.canvas.dataset.gamePrepareCount = '0';
    this.boundHandleInput = this.handleInput.bind(this);
  }

  protected width: number;
  protected height: number;
  protected viewport: GameViewport | null = null;

  /** Fixed-layout games contain their complete board in the visible viewport. */
  setViewport(viewport: GameViewport) {
    if (![viewport.width, viewport.height].every(n => Number.isFinite(n) && n > 0)) return;
    this.viewport = viewport;
    const { top, right, bottom, left } = viewport.safeArea;
    const width = Math.max(1, viewport.width - left - right);
    const height = Math.max(1, viewport.height - top - bottom);
    this.setDisplayScale(Math.min(width, height * this.width / this.height));
    // Responsive fixed-layout adapters (Gacha) may have changed their aspect.
    const cssWidth = parseFloat(this.canvas.style.width);
    const cssHeight = parseFloat(this.canvas.style.height);
    this.canvas.style.left = `${left + (width - cssWidth) / 2}px`;
    this.canvas.style.top = `${top + (height - cssHeight) / 2}px`;
    this.canvas.dataset.viewportMode = 'contain';
  }

  /** Opt-in for 3D/UI games: resize drawing coordinates, never reset game state. */
  protected resizeLogicalViewport(viewport: GameViewport) {
    if (![viewport.width, viewport.height].every(n => Number.isFinite(n) && n > 0)) return;
    this.viewport = viewport;
    this.width = viewport.width;
    this.height = viewport.height;
    this.canvas.dataset.logicalWidth = String(this.width);
    this.canvas.dataset.logicalHeight = String(this.height);
    this.canvas.dataset.viewportMode = 'responsive';
    this.canvas.style.left = '0px';
    this.canvas.style.top = '0px';
    this.pixelRatio = setCanvasDisplaySize(this.canvas, this.ctx, this.width, this.height, this.width, viewport.dpr);
    // Height-only and logical-size changes clear the buffer even at identical DPR.
    this.renderFrame();
  }

  protected bindInput() {
    if (this.inputBound) return;
    window.addEventListener('keydown', this.boundHandleInput);
    window.addEventListener('keyup', this.boundHandleInput);
    this.canvas.addEventListener('touchstart', this.boundHandleInput, { passive: false });
    this.canvas.addEventListener('touchend', this.boundHandleInput, { passive: false });
    this.canvas.addEventListener('touchmove', this.boundHandleInput, { passive: false });
    this.canvas.addEventListener('mousedown', this.boundHandleInput);
    this.canvas.addEventListener('mouseup', this.boundHandleInput);
    this.canvas.addEventListener('mousemove', this.boundHandleInput);
    window.addEventListener('mouseup', this.boundHandleInput);
    this.inputBound = true;
  }

  protected unbindInput() {
    if (!this.inputBound) return;
    window.removeEventListener('keydown', this.boundHandleInput);
    window.removeEventListener('keyup', this.boundHandleInput);
    this.canvas.removeEventListener('touchstart', this.boundHandleInput);
    this.canvas.removeEventListener('touchend', this.boundHandleInput);
    this.canvas.removeEventListener('touchmove', this.boundHandleInput);
    this.canvas.removeEventListener('mousedown', this.boundHandleInput);
    this.canvas.removeEventListener('mouseup', this.boundHandleInput);
    this.canvas.removeEventListener('mousemove', this.boundHandleInput);
    window.removeEventListener('mouseup', this.boundHandleInput);
    this.inputBound = false;
  }

  prepare() {
    this.stop();
    this.resetScoreReport();
    this.init();
    this.canvas.dataset.gamePrepareCount = String(
      (Number(this.canvas.dataset.gamePrepareCount) || 0) + 1,
    );
    this.prepared = true;
    this.renderFrame();
    this.lastShellSnapshotKey = '';
    this.syncShellState();
  }

  start() {
    if (!this.prepared) this.prepare();
    this.stopRuntime();
    this.bindInput();
    this.running = true;
    this.lastTime = performance.now();
    this.onStart();
    this.loop(this.lastTime);
  }

  restart() {
    this.prepare();
    this.start();
  }

  stop() {
    this.stopRuntime();
    this.clearManagedResources();
  }

  private stopRuntime() {
    this.running = false;
    cancelAnimationFrame(this.animationId);
    this.unbindInput();
  }

  destroy() {
    this.stop();
    this.prepared = false;
  }

  protected onStart() {}

  protected isDarkTheme(): boolean {
    return this.host.isDarkTheme();
  }

  protected isZhLang(): boolean {
    return this.host.isZhLang();
  }

  protected isPixelMode(): boolean {
    return this.host.isPixelMode();
  }

  protected canvasPoint(clientX: number, clientY: number): CanvasPoint {
    return getCanvasPoint(this.canvas, this.width, this.height, clientX, clientY);
  }

  protected isRestartInput(e: KeyboardEvent | TouchEvent | MouseEvent): boolean {
    if (e instanceof KeyboardEvent) {
      return e.type === 'keydown' && !e.repeat && (e.key === ' ' || e.key === 'Enter');
    }
    if (e instanceof TouchEvent) {
      return e.type === 'touchstart';
    }
    return e.type === 'mousedown';
  }

  renderFrame() {
    delete this.canvas.dataset.gameResult;
    delete this.canvas.dataset.gameResultTitle;
    this.ctx.save();
    this.draw(this.ctx);
    this.ctx.restore();
  }

  /**
   * Shell-driven display fit: the canvas is shown at `cssWidth` CSS pixels
   * wide while the backing store is re-sized to stay sharp. Logical
   * coordinates and input mapping are unaffected.
   */
  setDisplayScale(cssWidth: number) {
    if (!Number.isFinite(cssWidth) || cssWidth <= 0) return;
    const next = setCanvasDisplaySize(this.canvas, this.ctx, this.width, this.height, cssWidth, this.viewport?.dpr);
    if (Math.abs(next - this.pixelRatio) > 0.001) {
      this.pixelRatio = next;
      this.renderFrame();
    } else {
      // Scale unchanged but the CSS size may still have been refreshed.
      this.pixelRatio = next;
    }
  }

  /** Publish the shared result contract without imposing a second visual panel. */
  protected publishResult(options: Pick<GameResultOverlayOptions, 'tone' | 'title'>) {
    this.canvas.dataset.gameResult = options.tone || 'neutral';
    this.canvas.dataset.gameResultTitle = options.title;
  }

  protected drawResultOverlay(
    ctx: CanvasRenderingContext2D,
    options: GameResultOverlayOptions
  ) {
    this.publishResult(options);
    drawGameResultOverlay(
      ctx,
      this.width,
      this.height,
      getRetroPalette(this.isDarkTheme()),
      options
    );
  }

  protected resetScoreReport() {
    this.baseScoreAlreadyReported = false;
  }

  protected submitScore(score: number) {
    this.host.reportScore(score);
  }

  protected submitScoreOnce(score: number) {
    if (this.baseScoreAlreadyReported) return;
    this.baseScoreAlreadyReported = true;
    this.submitScore(score);
  }

  protected notifyShellStateChanged() {
    this.lastShellSnapshotKey = shellSnapshotKey(this.getShellSnapshot());
    this.host.requestShellRender();
  }

  private syncShellState() {
    const nextKey = shellSnapshotKey(this.getShellSnapshot());
    if (nextKey === this.lastShellSnapshotKey) return;
    this.lastShellSnapshotKey = nextKey;
    this.host.requestShellRender();
  }

  getShellSnapshot(): GameShellSnapshot {
    return {};
  }

  getFrameTelemetry(): GameFrameTelemetry | null {
    return null;
  }

  protected setManagedTimeout(callback: () => void, delay: number): number {
    const id = window.setTimeout(() => {
      this.managedTimeouts.delete(id);
      callback();
    }, delay);
    this.managedTimeouts.add(id);
    return id;
  }

  protected clearManagedTimeout(id: number | null) {
    if (id == null) return;
    clearTimeout(id);
    this.managedTimeouts.delete(id);
  }

  protected registerCleanup(cleanup: () => void) {
    this.managedCleanups.add(cleanup);
    return () => this.managedCleanups.delete(cleanup);
  }

  private clearManagedResources() {
    for (const id of this.managedTimeouts) clearTimeout(id);
    this.managedTimeouts.clear();
    for (const cleanup of this.managedCleanups) cleanup();
    this.managedCleanups.clear();
  }

  private loop = (now: number) => {
    if (!this.running) return;
    const dt = clampFrameDelta((now - this.lastTime) / 1000);
    this.lastTime = now;
    this.update(dt);
    this.syncShellState();
    this.renderFrame();
    this.animationId = requestAnimationFrame(this.loop);
  };

  abstract init(): void;
  abstract update(dt: number): void;
  abstract draw(ctx: CanvasRenderingContext2D): void;
  abstract handleInput(e: KeyboardEvent | TouchEvent | MouseEvent): void;
}
