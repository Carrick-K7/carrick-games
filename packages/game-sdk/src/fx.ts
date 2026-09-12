/**
 * fx.ts — shared visual-craft toolkit for modern-mode game canvases.
 *
 * Pure Canvas 2D, zero dependencies. Everything here is theme-agnostic:
 * games pass colors (usually derived from getRetroPalette()) and these
 * helpers derive shading, glow, and motion from them.
 *
 * Design intent: directional light from the top, soft shadows, additive
 * glow, eased motion. Restraint beats noise — these are instruments for
 * readability-first polish, not screenspace clutter.
 */

import { isPixelMode } from './render.js';

export const TAU = Math.PI * 2;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ------------------------------------------------------------------ */
/* Color                                                               */
/* ------------------------------------------------------------------ */

function parseColor(color: string): { r: number; g: number; b: number; a: number } | null {
  const hex = color.trim();
  if (hex.startsWith('#')) {
    const h = hex.slice(1);
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    if (full.length === 6 || full.length === 8) {
      const n = parseInt(full, 16);
      if (Number.isNaN(n)) return null;
      if (full.length === 6) {
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
      }
      return { r: (n >> 24) & 255, g: (n >> 16) & 255, b: (n >> 8) & 255, a: (n & 255) / 255 };
    }
    return null;
  }
  const m = hex.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const parts = m[1].split(',').map((s) => parseFloat(s));
    if (parts.length >= 3 && parts.every((v) => !Number.isNaN(v))) {
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    }
  }
  return null;
}

/** Mix a hex/rgb color toward white (amount > 0) or black (amount < 0). */
export function shade(color: string, amount: number): string {
  const c = parseColor(color);
  if (!c) return color;
  const t = clamp(Math.abs(amount), 0, 1);
  const target = amount >= 0 ? 255 : 0;
  const r = Math.round(lerp(c.r, target, t));
  const g = Math.round(lerp(c.g, target, t));
  const b = Math.round(lerp(c.b, target, t));
  return c.a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${c.a})`;
}

/** Return the color with a replaced alpha channel. */
export function withAlpha(color: string, alpha: number): string {
  const c = parseColor(color);
  if (!c) return color;
  return `rgba(${c.r},${c.g},${c.b},${clamp(alpha, 0, 1)})`;
}

/* ------------------------------------------------------------------ */
/* Easing & tweens                                                     */
/* ------------------------------------------------------------------ */

export type EaseName =
  | 'linear'
  | 'inQuad'
  | 'outQuad'
  | 'inOutQuad'
  | 'outCubic'
  | 'inOutCubic'
  | 'outQuart'
  | 'outExpo'
  | 'outBack'
  | 'outElastic';

export function ease(name: EaseName, t: number): number {
  const x = clamp(t, 0, 1);
  switch (name) {
    case 'linear': return x;
    case 'inQuad': return x * x;
    case 'outQuad': return 1 - (1 - x) * (1 - x);
    case 'inOutQuad': return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    case 'outCubic': return 1 - Math.pow(1 - x, 3);
    case 'inOutCubic': return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case 'outQuart': return 1 - Math.pow(1 - x, 4);
    case 'outExpo': return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
    case 'outBack': { const c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); }
    case 'outElastic': {
      if (x === 0 || x === 1) return x;
      const c4 = TAU / 3;
      return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
    }
  }
}

export interface TweenOptions {
  from?: number;
  to: number;
  duration: number;
  ease?: EaseName;
  delay?: number;
}

/** A single scalar tween, ticked by the game loop. */
export class Tween {
  private readonly from: number;
  private readonly to: number;
  private readonly duration: number;
  private readonly easeName: EaseName;
  private elapsed: number;
  value: number;

  constructor(opts: TweenOptions) {
    this.from = opts.from ?? 0;
    this.to = opts.to;
    this.duration = Math.max(0.0001, opts.duration);
    this.easeName = opts.ease ?? 'outCubic';
    this.elapsed = -(opts.delay ?? 0);
    this.value = this.from;
  }

  update(dt: number): number {
    if (this.done) return this.value;
    this.elapsed += dt;
    if (this.elapsed < 0) return this.value;
    const t = clamp(this.elapsed / this.duration, 0, 1);
    this.value = lerp(this.from, this.to, ease(this.easeName, t));
    return this.value;
  }

  get done(): boolean {
    return this.elapsed >= this.duration;
  }

  get progress(): number {
    return clamp(this.elapsed / this.duration, 0, 1);
  }
}

/* ------------------------------------------------------------------ */
/* Particles                                                           */
/* ------------------------------------------------------------------ */

export type ParticleShape = 'circle' | 'rect' | 'spark' | 'glow' | 'ring';

export interface ParticleEmit {
  x: number;
  y: number;
  count: number;
  /** Base travel direction in radians; particles spread around it. Default 0. */
  angle?: number;
  /** Spread in radians around `angle`. Default TAU (omnidirectional). */
  spread?: number;
  /** px/s, number or [min, max]. Default 60. */
  speed?: number | [number, number];
  /** seconds, number or [min, max]. Default 0.6. */
  life?: number | [number, number];
  /** px, number or [min, max]. Default 3. */
  size?: number | [number, number];
  colors: readonly string[];
  /** px/s^2 applied downward. Default 0. */
  gravity?: number;
  /** velocity damping factor per second (0..1 per frame at 60fps feel). Default 0. */
  drag?: number;
  shape?: ParticleShape;
  /** Composite op; 'lighter' gives additive glow. Default 'lighter'. */
  blend?: GlobalCompositeOperation;
  /** Scale multiplier at end of life. Default 0 (shrink out). Use 1 for rings. */
  endScale?: number;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number;
  color: string; gravity: number; drag: number;
  shape: ParticleShape; blend: GlobalCompositeOperation; endScale: number;
}

function span(v: number | [number, number] | undefined, fallback: number): [number, number] {
  if (v === undefined) return [fallback, fallback];
  return Array.isArray(v) ? v : [v, v];
}

export class Particles {
  private list: Particle[] = [];

  emit(cfg: ParticleEmit): void {
    const [speedMin, speedMax] = span(cfg.speed, 60);
    const [lifeMin, lifeMax] = span(cfg.life, 0.6);
    const [sizeMin, sizeMax] = span(cfg.size, 3);
    const spread = cfg.spread ?? TAU;
    const base = cfg.angle ?? 0;
    for (let i = 0; i < cfg.count; i++) {
      const a = base + (Math.random() - 0.5) * spread;
      const sp = rand(speedMin, speedMax);
      const life = Math.max(0.05, rand(lifeMin, lifeMax));
      this.list.push({
        x: cfg.x,
        y: cfg.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life,
        maxLife: life,
        size: Math.max(0.5, rand(sizeMin, sizeMax)),
        color: pick(cfg.colors),
        gravity: cfg.gravity ?? 0,
        drag: cfg.drag ?? 0,
        shape: cfg.shape ?? 'circle',
        blend: cfg.blend ?? 'lighter',
        endScale: cfg.endScale ?? 0,
      });
    }
  }

  update(dt: number): void {
    for (const p of this.list) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      if (p.drag > 0) {
        const d = Math.max(0, 1 - p.drag * dt);
        p.vx *= d;
        p.vy *= d;
      }
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.list.length === 0) return;
    ctx.save();
    let currentBlend: GlobalCompositeOperation | null = null;
    for (const p of this.list) {
      if (p.blend !== currentBlend) {
        ctx.globalCompositeOperation = p.blend;
        currentBlend = p.blend;
      }
      const t = clamp(p.life / p.maxLife, 0, 1);
      const scale = lerp(p.endScale, 1, t);
      const size = Math.max(0.1, p.size * scale);
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      switch (p.shape) {
        case 'circle':
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, TAU);
          ctx.fill();
          break;
        case 'rect':
          ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
          break;
        case 'spark': {
          const len = size * 3;
          const mag = Math.hypot(p.vx, p.vy) || 1;
          const nx = (p.vx / mag) * len;
          const ny = (p.vy / mag) * len;
          ctx.lineWidth = Math.max(1, size * 0.5);
          ctx.beginPath();
          ctx.moveTo(p.x - nx, p.y - ny);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          break;
        }
        case 'glow': {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
          g.addColorStop(0, p.color);
          g.addColorStop(1, withAlpha(p.color, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, TAU);
          ctx.fill();
          break;
        }
        case 'ring': {
          ctx.globalAlpha = t * 0.9;
          ctx.lineWidth = Math.max(1, p.size * 0.14 * t);
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, TAU);
          ctx.stroke();
          break;
        }
      }
    }
    ctx.restore();
  }

  clear(): void {
    this.list = [];
  }

  get count(): number {
    return this.list.length;
  }
}

/** Particle recipe helpers for common moments. */
export const fx = {
  explosion(x: number, y: number, colors: readonly string[]): ParticleEmit[] {
    return [
      { x, y, count: 26, speed: [40, 220], life: [0.35, 0.8], size: [1.5, 3.5], colors, shape: 'spark', drag: 2.2 },
      { x, y, count: 10, speed: [10, 70], life: [0.3, 0.6], size: [8, 18], colors, shape: 'glow', drag: 3 },
      { x, y, count: 1, speed: 0, life: 0.45, size: [10, 14], colors: ['#ffffff'], shape: 'ring', endScale: 8 },
    ];
  },
  sparks(x: number, y: number, angle: number, colors: readonly string[]): ParticleEmit {
    return { x, y, count: 8, angle, spread: 0.9, speed: [80, 260], life: [0.15, 0.4], size: [1, 2.5], colors, shape: 'spark', drag: 3 };
  },
  confetti(x: number, y: number, colors: readonly string[]): ParticleEmit {
    return { x, y, count: 42, angle: -Math.PI / 2, spread: 1.6, speed: [120, 340], life: [0.8, 1.6], size: [2.5, 5], colors, shape: 'rect', gravity: 420, drag: 1.2, blend: 'source-over' };
  },
  thruster(x: number, y: number, angle: number, colors: readonly string[]): ParticleEmit {
    return { x, y, count: 2, angle, spread: 0.5, speed: [30, 90], life: [0.15, 0.35], size: [1.5, 3.5], colors, shape: 'glow', drag: 2 };
  },
  pop(x: number, y: number, colors: readonly string[]): ParticleEmit[] {
    return [
      { x, y, count: 12, speed: [60, 160], life: [0.25, 0.5], size: [1.5, 3], colors, shape: 'circle', drag: 2.5 },
      { x, y, count: 1, speed: 0, life: 0.3, size: [6, 9], colors, shape: 'ring', endScale: 5 },
    ];
  },
};

/* ------------------------------------------------------------------ */
/* Screen shake (trauma-based)                                         */
/* ------------------------------------------------------------------ */

export class ScreenShake {
  private trauma = 0;
  private time = 0;
  /** Max pixel offset at full trauma. */
  maxOffset = 14;
  /** Max rotation in radians at full trauma. */
  maxRotation = 0.02;

  /** Add shake energy; amount in 0..1. */
  add(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  update(dt: number): void {
    this.time += dt * 34;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
  }

  get x(): number {
    const s = this.trauma * this.trauma * this.maxOffset;
    return s * (Math.sin(this.time * 1.3) + Math.sin(this.time * 3.7) * 0.5);
  }

  get y(): number {
    const s = this.trauma * this.trauma * this.maxOffset;
    return s * (Math.cos(this.time * 1.7) + Math.sin(this.time * 4.3) * 0.5);
  }

  get rotation(): number {
    return this.trauma * this.trauma * this.maxRotation * Math.sin(this.time * 2.3);
  }

  get active(): boolean {
    return this.trauma > 0.001;
  }

  /** Wrap a draw pass with the current shake offset. */
  apply(ctx: CanvasRenderingContext2D, draw: () => void): void {
    if (!this.active) {
      draw();
      return;
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    draw();
    ctx.restore();
  }

  reset(): void {
    this.trauma = 0;
  }
}

/* ------------------------------------------------------------------ */
/* Floating texts                                                      */
/* ------------------------------------------------------------------ */

export interface FloatTextOptions {
  color?: string;
  size?: number;
  life?: number;
  /** px/s upward drift. */
  rise?: number;
  weight?: string;
  font?: string;
}

interface FloatText {
  x: number; y: number; text: string;
  color: string; size: number; life: number; maxLife: number;
  rise: number; weight: string; font: string;
}

export class FloatTexts {
  private list: FloatText[] = [];

  add(x: number, y: number, text: string, opts: FloatTextOptions = {}): void {
    const life = opts.life ?? 0.9;
    this.list.push({
      x, y, text,
      color: opts.color ?? '#ffffff',
      size: opts.size ?? 14,
      life,
      maxLife: life,
      rise: opts.rise ?? 46,
      weight: opts.weight ?? 'bold',
      font: opts.font ?? 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    });
  }

  update(dt: number): void {
    for (const t of this.list) {
      t.life -= dt;
      t.y -= t.rise * dt;
    }
    this.list = this.list.filter((t) => t.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.list.length === 0) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.list) {
      const k = clamp(t.life / t.maxLife, 0, 1);
      const alpha = k < 0.7 ? k / 0.7 : 1;
      const scale = k > 0.85 ? lerp(1.25, 1, (1 - k) / 0.15) : 1;
      ctx.globalAlpha = alpha;
      ctx.font = `${t.weight} ${Math.round(t.size * scale)}px ${t.font}`;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  clear(): void {
    this.list = [];
  }
}

/* ------------------------------------------------------------------ */
/* Lit shapes                                                          */
/* ------------------------------------------------------------------ */

/**
 * Additive radial glow. Cheap substitute for bloom; stack 2-3 radii
 * for a richer falloff.
 */
export function drawGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  intensity = 1,
): void {
  if (radius <= 0 || intensity <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp(intensity, 0, 1);
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, withAlpha(color, 0.55));
  g.addColorStop(0.45, withAlpha(color, 0.18));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export interface SphereOptions {
  /** Light direction as normalized-ish vector; default top-left. */
  lightX?: number;
  lightY?: number;
  /** Rim-light alpha on the shadow side. 0 disables. Default 0.25. */
  rim?: number;
  rimColor?: string;
}

/** A shaded orb: radial body gradient, specular highlight, subtle rim. */
export function fillSphere(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  base: string,
  opts: SphereOptions = {},
): void {
  const lx = opts.lightX ?? -0.45;
  const ly = opts.lightY ?? -0.65;
  const hx = x + lx * r * 0.4;
  const hy = y + ly * r * 0.4;

  const body = ctx.createRadialGradient(hx, hy, r * 0.1, x, y, r);
  body.addColorStop(0, shade(base, 0.55));
  body.addColorStop(0.55, base);
  body.addColorStop(1, shade(base, -0.45));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();

  const rim = opts.rim ?? 0.25;
  if (rim > 0) {
    const rimColor = opts.rimColor ?? shade(base, 0.7);
    const rimGrad = ctx.createRadialGradient(x, y, r * 0.62, x, y, r);
    rimGrad.addColorStop(0, withAlpha(rimColor, 0));
    rimGrad.addColorStop(1, withAlpha(rimColor, clamp(rim, 0, 1)));
    ctx.fillStyle = rimGrad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  // Specular dot
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(hx, hy, r * 0.16, r * 0.11, Math.atan2(ly, lx), 0, TAU);
  ctx.fill();
}

export interface BevelTileOptions {
  /** Add a glossy top sheen. Default true. */
  gloss?: boolean;
  /** Border color; default a darker shade of base. */
  border?: string;
  borderWidth?: number;
}

/**
 * A beveled tile: vertical gradient body, top edge highlight, bottom
 * edge shade, hairline border. The workhorse for blocks, bricks, keys.
 */
export function fillBevelTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  base: string,
  opts: BevelTileOptions = {},
): void {
  const gloss = opts.gloss ?? true;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);

  const body = ctx.createLinearGradient(x, y, x, y + h);
  body.addColorStop(0, shade(base, 0.28));
  body.addColorStop(0.5, base);
  body.addColorStop(1, shade(base, -0.3));
  ctx.fillStyle = body;
  ctx.fill();

  if (gloss) {
    const sheen = ctx.createLinearGradient(x, y, x, y + h * 0.55);
    sheen.addColorStop(0, 'rgba(255,255,255,0.32)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fill();
  }

  // Top highlight / bottom shade edges
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x, y, w, Math.max(1, h * 0.06));
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x, y + h - Math.max(1, h * 0.09), w, Math.max(1, h * 0.09));
  ctx.restore();

  ctx.strokeStyle = opts.border ?? withAlpha(shade(base, -0.55), 0.8);
  ctx.lineWidth = opts.borderWidth ?? 1;
  ctx.stroke();
  ctx.restore();
}

export interface GlassPanelOptions {
  fill: string;
  fill2?: string;
  border?: string;
  /** Accent edge glow color; subtle by design. */
  glow?: string;
  shadow?: string;
}

/**
 * Premium translucent panel: vertical gradient, inner top highlight,
 * hairline border, soft drop shadow. Shell-glass language for canvas.
 */
export function fillGlassPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  opts: GlassPanelOptions,
): void {
  const pixel = isPixelMode();
  const radius = pixel ? Math.min(r, 4) : r;
  ctx.save();
  if (!pixel) {
    ctx.shadowColor = opts.shadow ?? 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
  } else {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 4;
  }
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, opts.fill);
  g.addColorStop(1, opts.fill2 ?? opts.fill);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  if (!pixel) {
    // Inner top highlight
    ctx.save();
    ctx.clip();
    const sheen = ctx.createLinearGradient(x, y, x, y + Math.min(h, 56));
    sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(x, y, w, Math.min(h, 56));
    ctx.restore();
  }

  ctx.strokeStyle = opts.border ?? 'rgba(148,163,184,0.25)';
  ctx.lineWidth = pixel ? 2 : 1;
  ctx.stroke();

  if (opts.glow && !pixel) {
    ctx.strokeStyle = withAlpha(opts.glow, 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - 0.5, y - 0.5, w + 1, h + 1, radius + 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

/** Soft fullscreen vignette to seat the scene. Strength 0..0.6. */
export function drawVignette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  strength = 0.28,
): void {
  if (isPixelMode() || strength <= 0) return;
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.78);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${clamp(strength, 0, 0.6)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/* ------------------------------------------------------------------ */
/* Starfield (parallax, twinkle, nebula)                               */
/* ------------------------------------------------------------------ */

interface Star {
  x: number; y: number; size: number; layer: number; phase: number;
}

export interface StarfieldOptions {
  /** stars per 100x100 px. Default 0.9. */
  density?: number;
  dark?: boolean;
  nebulaColors?: readonly string[];
}

/**
 * Three-layer parallax starfield with twinkle and a pre-rendered
 * nebula backdrop. Scroll by passing velocity to update().
 */
export class Starfield {
  private stars: Star[] = [];
  private time = 0;
  private nebula: HTMLCanvasElement | null = null;
  private nebulaKey = '';
  private w = 0;
  private h = 0;
  private dark: boolean;
  private readonly density: number;
  private readonly nebulaColors: readonly string[];

  constructor(opts: StarfieldOptions = {}) {
    this.density = opts.density ?? 0.9;
    this.dark = opts.dark ?? true;
    this.nebulaColors = opts.nebulaColors ?? ['#39C5BB', '#3b82f6', '#8b5cf6'];
  }

  setTheme(dark: boolean): void {
    if (dark !== this.dark) {
      this.dark = dark;
      this.nebulaKey = '';
    }
  }

  resize(w: number, h: number): void {
    if (w === this.w && h === this.h && this.stars.length > 0) return;
    this.w = w;
    this.h = h;
    const count = Math.round(((w * h) / 10000) * this.density);
    this.stars = [];
    for (let i = 0; i < count; i++) {
      const layer = i % 3;
      this.stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: layer === 2 ? rand(1.4, 2.2) : layer === 1 ? rand(0.9, 1.5) : rand(0.5, 1),
        layer,
        phase: Math.random() * TAU,
      });
    }
  }

  private static readonly LAYER_SPEED = [0.3, 0.7, 1.3];

  /** Scroll velocity in px/s (e.g. positive vy for a vertical shooter). */
  update(dt: number, vy = 0): void {
    this.time += dt;
    for (let i = 0; i < 3; i++) {
      this.acc[i] = (this.acc[i] + vy * Starfield.LAYER_SPEED[i] * dt) % Math.max(1, this.h);
    }
  }

  private acc = [0, 0, 0];

  private ensureNebula(): void {
    const key = `${this.w}x${this.h}:${this.dark ? 'd' : 'l'}`;
    if (this.nebula && this.nebulaKey === key) return;
    this.nebulaKey = key;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(this.w));
    c.height = Math.max(1, Math.round(this.h));
    const nctx = c.getContext('2d');
    if (!nctx) return;
    const blobs = 5;
    for (let i = 0; i < blobs; i++) {
      const bx = rand(0, this.w);
      const by = rand(0, this.h);
      const br = rand(this.w * 0.25, this.w * 0.6);
      const color = this.nebulaColors[i % this.nebulaColors.length];
      const g = nctx.createRadialGradient(bx, by, 0, bx, by, br);
      const alpha = this.dark ? 0.10 : 0.08;
      g.addColorStop(0, withAlpha(color, alpha));
      g.addColorStop(1, withAlpha(color, 0));
      nctx.fillStyle = g;
      nctx.fillRect(0, 0, this.w, this.h);
    }
    this.nebula = c;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.resize(w, h);
    this.ensureNebula();

    if (this.nebula && !isPixelMode()) {
      ctx.drawImage(this.nebula, 0, 0, w, h);
    }

    ctx.save();
    for (const s of this.stars) {
      const y = (((s.y + this.acc[s.layer]) % h) + h) % h;
      const tw = 0.55 + 0.45 * Math.sin(this.time * (1.2 + s.layer * 0.6) + s.phase);
      const alpha = (this.dark ? 0.5 + s.layer * 0.2 : 0.3 + s.layer * 0.12) * tw;
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.fillStyle = this.dark ? '#e2e8f0' : '#64748b';
      const size = s.size;
      ctx.beginPath();
      ctx.arc(s.x, y, size, 0, TAU);
      ctx.fill();
      if (s.layer === 2 && tw > 0.85 && !isPixelMode()) {
        drawGlow(ctx, s.x, y, size * 5, this.dark ? '#bae6fd' : '#94a3b8', 0.5 * tw);
      }
    }
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* Sprites (pre-rendered, HiDPI-crisp)                                 */
/* ------------------------------------------------------------------ */

/**
 * Render a detailed drawing once into an offscreen canvas at `scale`
 * supersampling, then blit it each frame. The quality/perf backbone
 * for ships, cars, and props.
 */
export function makeSprite(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  scale = 2,
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = true;
    draw(ctx, w, h);
  }
  return c;
}

export interface DrawSpriteOptions {
  rotation?: number;
  scale?: number;
  alpha?: number;
  flipX?: boolean;
  flipY?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
}

/** Blit a sprite centered at (cx, cy) in logical coordinates. */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  cx: number,
  cy: number,
  w: number,
  h: number,
  opts: DrawSpriteOptions = {},
): void {
  ctx.save();
  ctx.translate(cx, cy);
  if (opts.rotation) ctx.rotate(opts.rotation);
  if (opts.flipX || opts.flipY) ctx.scale(opts.flipX ? -1 : 1, opts.flipY ? -1 : 1);
  if (opts.alpha !== undefined) ctx.globalAlpha = clamp(opts.alpha, 0, 1);
  if (opts.shadowColor) {
    ctx.shadowColor = opts.shadowColor;
    ctx.shadowBlur = opts.shadowBlur ?? 12;
  }
  const scale = opts.scale ?? 1;
  ctx.drawImage(sprite, (-w / 2) * scale, (-h / 2) * scale, w * scale, h * scale);
  ctx.restore();
}
