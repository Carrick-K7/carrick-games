export interface Game {
  init(): void;
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent): void;
  destroy?(): void;
}

export abstract class BaseGame implements Game {
  protected canvas: HTMLCanvasElement;
  protected ctx: CanvasRenderingContext2D;
  protected running = false;
  protected lastTime = 0;
  protected animationId = 0;
  private readonly boundHandleInput: (e: KeyboardEvent | TouchEvent | MouseEvent) => void;
  private inputBound = false;

  constructor(canvasId: string, protected width = 640, protected height = 480) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) throw new Error(`Canvas #${canvasId} not found`);
    this.canvas = canvas;
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D context not available');
    this.ctx = ctx;
    this.boundHandleInput = this.handleInput.bind(this);
    this.bindInput();
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
    this.inputBound = false;
  }

  start() {
    this.bindInput();
    this.running = true;
    this.lastTime = performance.now();
    this.init();
    this.loop(this.lastTime);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.animationId);
  }

  destroy() {
    this.stop();
    this.unbindInput();
  }

  private loop = (now: number) => {
    if (!this.running) return;
    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    this.update(dt);
    this.draw(this.ctx);
    this.animationId = requestAnimationFrame(this.loop);
  };

  abstract init(): void;
  abstract update(dt: number): void;
  abstract draw(ctx: CanvasRenderingContext2D): void;
  abstract handleInput(e: KeyboardEvent | TouchEvent | MouseEvent): void;
}
