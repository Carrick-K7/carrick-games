// cs.ts — shell adapter for the migrated carrick-cs v13 engine.
//
// CsGame hosts CsEngine (a faithful port of the standalone app's game.js)
// inside the BaseGame contract: the engine renders Three.js into an offscreen
// WebGL canvas that is blitted into the shell's 2D canvas each frame, and all
// HUD/menus are canvas-drawn by CsHud. Pointer lock, focus events and score
// reporting are bridged through engine hooks.
//
// The game is viewport-responsive: the shell delivers GameViewport updates
// through setViewport(), the engine re-sizes its cameras/renderer first, and
// only then does resizeLogicalViewport() repaint the 2D canvas so no frame is
// presented with a stale aspect. Shell overlays release held input and pause
// the match; browser fullscreen stays browser-owned (F11).

import {
  BaseGame,
  createDefaultGameHost,
  type GameHost,
  type GameShellSnapshot,
  type GameViewport,
} from '@carrick/game-sdk/game';
import { CsEngine } from './csEngine.js';
import { installGameDebug } from '@carrick/game-sdk/debug';
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
  /** Vertical finger travel (px) that turns a deferred tap into a scroll. */
  private static readonly TAP_SCROLL_THRESHOLD = 10;
  private readonly engine: CsEngine;
  private readonly hudView: CsHud;
  private booted = false;
  private activeRegion: HudRegion | null = null;
  private lastMatchEnd: MatchEndResult | null = null;
  private pausedByShellOverlay = false;
  private readonly touchLook = new Map<number, { x: number; y: number }>();
  private readonly touchRegions = new Map<number, { region: HudRegion; sy: number; scrolling: boolean }>();

  private readonly onPointerLockChange = () => {
    this.engine.onPointerLockChange(document.pointerLockElement === this.canvas);
  };
  private readonly onPointerLockError = () => this.engine.onPointerLockError();
  private readonly onTouchCancel = (event: TouchEvent) => {
    event.preventDefault();
    for (const entry of this.touchRegions.values()) {
      if (entry.scrolling) entry.region.scroll?.endDrag();
      else if (!entry.region.deferTap) entry.region.up?.();
    }
    this.touchRegions.clear();
    this.touchLook.clear();
    this.engine.clearHeldInput();
  };
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
  /** Wheel: scrollable HUD panels consume it; otherwise it switches weapons. */
  private readonly onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (this.hudView.wantsWheel()) { this.hudView.onWheel(e.deltaY); return; }
    this.engine.onWheel(e.deltaY);
  };

  constructor(host?: GameHost) {
    super(host ?? createDefaultGameHost('gameCanvas', W, H));
    this.engine = new CsEngine({
      width: W,
      height: H,
      isZh: () => this.isZhLang(),
      assetUrl: this.host.assetUrl,
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

    // Any path that starts a fresh match (Enter key, HUD replay button, pause
    // menu restart, menu start after a completed match) must re-arm one-shot
    // score reporting — the engine alone cannot see BaseGame's guard.
    const engineStartMatch = this.engine.startMatch.bind(this.engine);
    this.engine.startMatch = () => {
      this.resetScoreReport();
      this.lastMatchEnd = null;
      engineStartMatch();
    };

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

  /**
   * Edge-to-edge viewport from the shell: the engine re-sizes its world/gun
   * camera aspect and WebGL renderer BEFORE the base class repaints the 2D
   * canvas, so the first presented frame already matches the new shape.
   */
  override setViewport(viewport: GameViewport) {
    this.engine.resize(viewport.width, viewport.height);
    this.hudView.setSafeArea(viewport.safeArea);
    this.resizeLogicalViewport(viewport);
  }

  /**
   * Shell overlay (picker, menu) coordination: released held keys/fire/touch
   * regions, pause the match while the overlay is up, and resume only when
   * this adapter caused the pause. The shell alone may restore prior pointer
   * capture on a trusted dismissal; programmatic closes never request it.
   */
  onShellOverlayChange(open: boolean) {
    for (const entry of this.touchRegions.values()) {
      if (entry.scrolling) entry.region.scroll?.endDrag();
      else if (!entry.region.deferTap) entry.region.up?.();
    }
    this.touchRegions.clear();
    this.touchLook.clear();
    this.activeRegion?.up?.();
    this.activeRegion = null;
    if (open) {
      this.engine.clearHeldInput();
      if (!this.pausedByShellOverlay
        && this.engine.matchActive
        && ['active', 'freeze', 'round-end', 'spectate'].includes(this.engine.phase)) {
        this.engine.pauseGame();
        this.pausedByShellOverlay = true;
      }
    } else if (this.pausedByShellOverlay) {
      this.pausedByShellOverlay = false;
      if (this.engine.phase === 'paused') this.engine.resumeGame(false);
    }
  }

  restorePointerCapture() {
    if (this.running && !this.presentationPaused && this.engine.matchActive && !this.engine.overlayOpen()) this.engine.requestCapture();
  }

  protected override bindInput() {
    super.bindInput();
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('touchcancel', this.onTouchCancel, { passive: false });
  }

  protected override unbindInput() {
    super.unbindInput();
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('touchcancel', this.onTouchCancel);
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
    this.pausedByShellOverlay = false;
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
    // Engine-specific QA stays in this release, not in a shell that can outlive it.
    this.registerCleanup(installGameDebug('__CSX_DEBUG__', {
      info: () => {
        const engine = this.engine;
        return {
          phase: engine.phase, mode: engine.mode, map: engine.selectedMap, ready: engine.ready,
          round: engine.round, scores: { ...engine.scores }, playerAlive: !!engine.player?.alive,
          playerPos: engine.player ? { x: engine.player.pos.x, y: engine.player.pos.y, z: engine.player.pos.z } : null,
          kills: engine.player?.kills ?? 0,
          weapon: engine.player?.inventory?.[engine.player.slot]?.id ?? null,
          mag: engine.player?.inventory?.[engine.player.slot]?.ammo ?? null,
          reserve: engine.player?.inventory?.[engine.player.slot]?.reserve ?? null,
          bots: engine.bots?.filter(bot => bot.alive).length ?? 0,
          bomb: engine.bomb?.status ?? null, matchEnd: !!engine.hud.matchEnd,
        };
      },
      forceMatchEnd: (won = true) => {
        const engine = this.engine;
        if (!engine.matchActive || engine.phase === 'match-end') return;
        engine.scores = won ? { ct: 7, t: 3 } : { ct: 3, t: 7 };
        if (engine.player) engine.player.kills = Math.max(engine.player.kills, 9);
        engine.finishMatch();
      },
      skipFreeze: () => { if (this.engine.phase === 'freeze') this.engine.freezeTime = Math.min(this.engine.freezeTime, .01); },
    }));
  }

  getDiagnostics() {
    return {
      cameraAspect: this.engine.camera?.aspect,
      gunCameraAspect: this.engine.gunCamera?.aspect,
      renderWidth: this.engine.canvas3d?.width,
      renderHeight: this.engine.canvas3d?.height,
      buyOpen: this.engine.buyOpen, paused: this.engine.phase === 'paused',
    };
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
    this.hudView.draw(ctx, this.width, this.height, this.presentationPaused);
    const end = engine.hud.matchEnd;
    if (end) {
      // The HUD match-end panel is the single visible terminal overlay (it
      // owns the replay/menu buttons); the adapter only mirrors the shared
      // result marker the shell and tests read. No duplicate overlay here.
      this.publishResult({ title: end.title, tone: end.won ? 'success' : 'danger' });
    }
  }

  private engineFromMatchEndRestart(): boolean {
    if (this.engine.hud.matchEnd) {
      this.engine.startMatch(); // wrapped in the constructor: resets one-shot scoring
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
        this.engine.onMouseDown(e.button, e.clientX, e.clientY);
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
              this.touchRegions.set(touch.identifier, { region, sy: point.y, scrolling: false });
              // Scrollable-panel rows defer activation to touchend so a
              // swipe gesture can become a scroll instead of a mis-tap.
              if (!region.deferTap) region.down?.(point.x, point.y);
            }
          }
          continue;
        }
        if (e.type === 'touchmove') {
          const entry = this.touchRegions.get(touch.identifier);
          if (entry) {
            if (entry.scrolling) {
              entry.region.scroll?.drag(point.y);
            } else if (entry.region.deferTap) {
              if (Math.abs(point.y - entry.sy) > CsGame.TAP_SCROLL_THRESHOLD) {
                entry.scrolling = true;
                const scroll = entry.region.scroll;
                if (scroll) { scroll.beginDrag(); scroll.drag(entry.sy); scroll.drag(point.y); }
              }
            } else if (entry.region.drag) {
              entry.region.drag(point.x, point.y);
            }
          }
          const look = this.touchLook.get(touch.identifier);
          if (look) {
            this.engine.touchLook(touch.clientX - look.x, touch.clientY - look.y);
            look.x = touch.clientX;
            look.y = touch.clientY;
          }
          continue;
        }
        // touchend / touchcancel
        const entry = this.touchRegions.get(touch.identifier);
        if (entry) {
          if (entry.scrolling) {
            entry.region.scroll?.endDrag();
          } else if (entry.region.deferTap) {
            // A held-still finger is a tap: activate on release (never on cancel).
            if (e.type === 'touchend') entry.region.down?.(point.x, point.y);
            entry.region.up?.();
          } else {
            entry.region.up?.();
          }
        }
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
