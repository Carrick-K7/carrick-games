import {
  configureHiDpiCanvas,
  getCanvasPoint,
  type CanvasPoint,
} from './render.js';

export interface Game {
  init(): void;
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
  renderFrame?(): void;
  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent): void;
  destroy?(): void;
}

declare global {
  interface Window {
    reportScore?: (score: number) => void;
    saveRecord?: (gameId: string, score: number) => void;
  }
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

export function readStoredRecords(): Record<string, number> {
  try {
    const raw = localStorage.getItem('cg-records');
    if (!raw) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const records: Record<string, number> = {};
    for (const [gameId, score] of Object.entries(parsed)) {
      if (typeof score === 'number' && Number.isFinite(score)) {
        records[gameId] = score;
      }
    }
    return records;
  } catch {
    return {};
  }
}

export function getStoredRecord(gameId: string): number | null {
  return readStoredRecords()[gameId] ?? null;
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

  constructor(canvasId: string, protected width = 640, protected height = 480) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) throw new Error(`Canvas #${canvasId} not found`);
    this.canvas = canvas;
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D context not available');
    this.ctx = ctx;
    this.pixelRatio = configureHiDpiCanvas(this.canvas, this.ctx, width, height);
    this.boundHandleInput = this.handleInput.bind(this);
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

  start() {
    this.stop();
    this.resetScoreReport();
    this.bindInput();
    this.running = true;
    this.lastTime = performance.now();
    this.init();
    this.loop(this.lastTime);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.animationId);
    this.unbindInput();
  }

  destroy() {
    this.stop();
  }

  protected isDarkTheme(): boolean {
    return isDarkTheme();
  }

  protected isZhLang(): boolean {
    return isZhLang();
  }

  protected canvasPoint(clientX: number, clientY: number): CanvasPoint {
    return getCanvasPoint(this.canvas, this.width, this.height, clientX, clientY);
  }

  renderFrame() {
    this.ctx.save();
    this.draw(this.ctx);
    this.ctx.restore();
  }

  protected resetScoreReport() {
    this.baseScoreAlreadyReported = false;
  }

  protected submitScore(score: number) {
    window.reportScore?.(score);
  }

  protected submitScoreOnce(score: number) {
    if (this.baseScoreAlreadyReported) return;
    this.baseScoreAlreadyReported = true;
    this.submitScore(score);
  }

  private loop = (now: number) => {
    if (!this.running) return;
    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    this.update(dt);
    this.renderFrame();
    this.animationId = requestAnimationFrame(this.loop);
  };

  abstract init(): void;
  abstract update(dt: number): void;
  abstract draw(ctx: CanvasRenderingContext2D): void;
  abstract handleInput(e: KeyboardEvent | TouchEvent | MouseEvent): void;
}
