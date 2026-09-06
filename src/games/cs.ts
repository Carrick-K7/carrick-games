// cs.ts — shell adapter for the migrated carrick-cs v13 engine.
//
// CsGame hosts CsEngine (a faithful port of the standalone app's game.js)
// inside the BaseGame contract: the engine renders Three.js into an offscreen
// WebGL canvas that is blitted into the shell's 2D canvas each frame, and all
// HUD/menus are canvas-drawn by CsHud. Pointer lock, focus events and score
// reporting are bridged through engine hooks.

import {
  BaseGame,
  createDefaultGameHost,
  type GameHost,
  type GameShellSnapshot,
} from '../core/game.js';
import { CsEngine } from './csEngine.js';
import { CsHud, type HudRegion } from './csHud.js';

const W = 1280;
const H = 720;

/** Probe whether WebGL is software-rendered before creating the real context. */
function isSoftwareGL(): boolean {
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  try {
    const probe = document.createElement('canvas');
    gl = (probe.getContext('webgl2') ?? probe.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
    return /swiftshader|llvmpipe|software/i.test(name);
  } catch {
    return false;
  } finally {
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

interface MatchEndResult {
  won: boolean;
  kills: number;
  deaths: number;
  headshots: number;
  ctScore: number;
  tScore: number;
  mode: string;
}

export class CsGame extends BaseGame {
  private readonly engine: CsEngine;
  private readonly hudView: CsHud;
  private booted = false;
  private activeRegion: HudRegion | null = null;
  private lastMatchEnd: MatchEndResult | null = null;
  private readonly touchLook = new Map<number, { x: number; y: number }>();
  private readonly touchRegions = new Map<number, HudRegion>();

  private readonly onPointerLockChange = () => {
    this.engine.onPointerLockChange(document.pointerLockElement === this.canvas);
  };
  private readonly onPointerLockError = () => this.engine.onPointerLockError();
  private readonly onWindowBlur = () => this.engine.onWindowBlur();
  private readonly onWindowFocus = () => this.engine.onWindowFocus();
  private readonly onVisibility = () => this.engine.onVisibilityChange();
  private readonly onContextLost = (e: Event) => { e.preventDefault(); this.engine.onContextLost(); };
  private readonly onContextMenu = (e: Event) => {
    if (this.engine.matchActive) e.preventDefault();
  };
  private readonly onSecondaryButton = (e: Event) => {
    const me = e as MouseEvent;
    if (!this.engine.matchActive) return;
    if (me.button === 1 || me.button === 2) me.preventDefault();
  };

  constructor(host?: GameHost) {
    super(host ?? createDefaultGameHost('gameCanvas', W, H));
    this.engine = new CsEngine({
      width: W,
      height: H,
      isZh: () => this.isZhLang(),
      hooks: {
        requestCapture: () => {
          try {
            this.canvas.focus({ preventScroll: true });
            const lock = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
            lock?.catch?.(() => undefined);
          } catch { /* pointer lock unavailable (touch / test env) */ }
        },
        releaseCapture: () => {
          if (document.pointerLockElement === this.canvas) document.exitPointerLock();
        },
        pointerLocked: () => document.pointerLockElement === this.canvas,
        onMatchEnd: (result: MatchEndResult) => this.handleMatchEnd(result),
      },
    });
    this.hudView = new CsHud(this.engine);

    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
    window.addEventListener('blur', this.onWindowBlur);
    window.addEventListener('focus', this.onWindowFocus);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('contextmenu', this.onContextMenu, { capture: true });
    for (const type of ['pointerdown', 'mousedown', 'auxclick']) {
      window.addEventListener(type, this.onSecondaryButton, { capture: true });
    }
    this.engine.canvas3d?.addEventListener('webglcontextlost', this.onContextLost);
  }

  override getShellSnapshot(): GameShellSnapshot {
    return { score: this.liveScore() };
  }

  private liveScore(): number {
    const p = this.engine.player;
    if (!p) return 0;
    return p.kills * 100 + p.headshots * 25 + (this.lastMatchEnd?.won ? 500 : 0);
  }

  private handleMatchEnd(result: MatchEndResult) {
    this.lastMatchEnd = result;
    this.submitScoreOnce(this.liveScore());
  }

  init() {
    this.resetScoreReport();
    this.lastMatchEnd = null;
    this.activeRegion = null;
    this.touchLook.clear();
    this.touchRegions.clear();
    if (!this.booted) {
      this.booted = true;
      if (isSoftwareGL()) this.engine.quality = 'low';
      void this.engine.init();
    } else {
      this.engine.toMenu();
    }
  }

  update(dt: number) {
    this.engine.update(dt);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const engine = this.engine;
    if (engine.renderer && engine.world) {
      engine.render();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(engine.canvas3d!, 0, 0, this.width, this.height);
    } else {
      ctx.fillStyle = '#0c141c';
      ctx.fillRect(0, 0, this.width, this.height);
    }
    this.hudView.draw(ctx, this.width, this.height);
    const end = engine.hud.matchEnd;
    if (end) {
      this.drawResultOverlay(ctx, {
        tone: end.won ? 'success' : 'danger',
        title: end.title,
        details: [
          this.isZhLang() ? `比分 ${end.score}` : `Score ${end.score}`,
          end.stats,
        ],
        hint: this.isZhLang() ? 'Enter 再来一局 · 点击按钮返回主菜单' : 'Enter to play again · use the button for the menu',
      });
    }
  }

  private engineFromMatchEndRestart(): boolean {
    if (this.engine.hud.matchEnd) {
      this.resetScoreReport();
      this.lastMatchEnd = null;
      this.engine.startMatch();
      return true;
    }
    return false;
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (e instanceof KeyboardEvent) {
      if (e.type === 'keydown' && this.engine.hud.matchEnd && this.isRestartInput(e)) {
        this.engineFromMatchEndRestart();
        return;
      }
      if (e.type === 'keydown') this.engine.onKeyDown(e);
      else if (e.type === 'keyup') this.engine.onKeyUp(e);
      return;
    }

    if (e instanceof MouseEvent) {
      if (e.type === 'mousedown') {
        const point = this.canvasPoint(e.clientX, e.clientY);
        const region = this.hudView.hitTest(point.x, point.y);
        if (region?.down) {
          this.activeRegion = region;
          region.down(point.x, point.y);
          return;
        }
        this.engine.onMouseDown(e.button);
        return;
      }
      if (e.type === 'mousemove') {
        if (this.activeRegion?.drag) {
          const point = this.canvasPoint(e.clientX, e.clientY);
          this.activeRegion.drag(point.x, point.y);
          return;
        }
        this.engine.onMouseMove(e);
        return;
      }
      if (e.type === 'mouseup') {
        const region = this.activeRegion;
        this.activeRegion = null;
        region?.up?.();
        this.engine.onMouseUp(e.button);
      }
      return;
    }

    if (e instanceof TouchEvent) {
      e.preventDefault();
      for (const touch of Array.from(e.changedTouches)) {
        const point = this.canvasPoint(touch.clientX, touch.clientY);
        if (e.type === 'touchstart') {
          const region = this.hudView.hitTest(point.x, point.y);
          if (region) {
            if (region.id === 'look') {
              this.touchLook.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
            } else {
              this.touchRegions.set(touch.identifier, region);
              region.down?.(point.x, point.y);
            }
          }
          continue;
        }
        if (e.type === 'touchmove') {
          const region = this.touchRegions.get(touch.identifier);
          if (region?.drag) region.drag(point.x, point.y);
          const look = this.touchLook.get(touch.identifier);
          if (look) {
            this.engine.touchLook(touch.clientX - look.x, touch.clientY - look.y);
            look.x = touch.clientX;
            look.y = touch.clientY;
          }
          continue;
        }
        // touchend / touchcancel
        const region = this.touchRegions.get(touch.identifier);
        region?.up?.();
        this.touchRegions.delete(touch.identifier);
        this.touchLook.delete(touch.identifier);
      }
    }
  }

  destroy() {
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
    window.removeEventListener('blur', this.onWindowBlur);
    window.removeEventListener('focus', this.onWindowFocus);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('contextmenu', this.onContextMenu, { capture: true } as EventListenerOptions);
    for (const type of ['pointerdown', 'mousedown', 'auxclick']) {
      window.removeEventListener(type, this.onSecondaryButton, { capture: true } as EventListenerOptions);
    }
    this.engine.canvas3d?.removeEventListener('webglcontextlost', this.onContextLost);
    this.engine.dispose();
    this.stop();
  }
}
