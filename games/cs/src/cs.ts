// cs.ts — shell adapter for the migrated carrick-cs v28 engine.
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

interface HudTouchCapture {
  region: HudRegion;
  sx: number;
  sy: number;
  mode: 'pending' | 'drag' | 'scroll' | 'cancelled';
}

export class CsGame extends BaseGame {
  /** Logical finger travel that resolves a deferred tap's gesture axis. */
  private static readonly TAP_SCROLL_THRESHOLD = 10;
  private readonly engine: CsEngine;
  private readonly hudView: CsHud;
  private booted = false;
  private activeRegion: HudRegion | null = null;
  private lastMatchEnd: MatchEndResult | null = null;
  private pausedByShellOverlay = false;
  private shellOverlayOpen = false;
  private hudInputContext: string | null = null;
  private readonly touchLook = new Map<number, { x: number; y: number }>();
  private readonly touchRegions = new Map<number, HudTouchCapture>();

  private readonly onPointerLockChange = () => {
    this.engine.onPointerLockChange(document.pointerLockElement === this.canvas);
  };
  private readonly onPointerLockError = () => this.engine.onPointerLockError();
  private readonly onTouchCancel = (event: TouchEvent) => {
    event.preventDefault();
    this.releaseHudInput();
  };
  private readonly onWindowBlur = () => {
    this.releaseHudInput();
    this.engine.onWindowBlur();
  };
  private readonly onWindowFocus = () => this.engine.onWindowFocus();
  private readonly onVisibility = () => {
    if (document.hidden) this.releaseHudInput();
    this.engine.onVisibilityChange();
  };
  private readonly onContextLost = (e: Event) => {
    e.preventDefault();
    this.releaseHudInput();
    this.engine.onContextLost();
  };
  private readonly onWindowMouseMove = (event: MouseEvent) => {
    // BaseGame forwards canvas moves and window mouseup; complete the capture
    // for a slider/scrollbar dragged beyond the canvas without double delivery.
    if (event.target !== this.canvas) {
      if (this.activeRegion) this.handleInput(event);
      else this.hudView.setPointer(null);
    }
  };
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
    if (this.presentationPaused || this.shellOverlayOpen) return;
    this.syncHudInputContext();
    if (this.hudView.wantsWheel()) {
      this.releaseHudInput(true);
      this.hudView.onWheel(e.deltaY);
      // Wheel offsets apply on the next draw, not to the old hit rectangles.
      this.hudView.regions = [];
      return;
    }
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
    const previous = this.viewport;
    if (!previous || previous.width !== viewport.width || previous.height !== viewport.height
      || previous.dpr !== viewport.dpr
      || (['top', 'right', 'bottom', 'left'] as const).some(edge => previous.safeArea[edge] !== viewport.safeArea[edge])) {
      this.releaseHudInput(true);
    }
    this.engine.resize(viewport.width, viewport.height, viewport.dpr);
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
    this.shellOverlayOpen = open;
    this.releaseHudInput();
    this.hudView.regions = [];
    if (open) {
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
    if (this.running && !this.presentationPaused && !this.shellOverlayOpen && this.engine.matchActive && !this.engine.overlayOpen()) this.engine.requestCapture();
  }

  override setPresentationPaused(paused: boolean) {
    if (paused) this.releaseHudInput();
    super.setPresentationPaused(paused);
  }

  protected override bindInput() {
    super.bindInput();
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('touchcancel', this.onTouchCancel, { passive: false });
    window.addEventListener('mousemove', this.onWindowMouseMove);
  }

  protected override unbindInput() {
    this.releaseHudInput();
    super.unbindInput();
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('touchcancel', this.onTouchCancel);
    window.removeEventListener('mousemove', this.onWindowMouseMove);
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
    this.shellOverlayOpen = false;
    this.releaseHudInput();
    this.hudInputContext = null;
    this.hudView.regions = [];
    if (!this.booted) {
      this.booted = true;
      if (isSoftwareGL()) {
        this.engine.softwareRendering = true;
        // Keep the effective setting in sync: changing a knife or sensitivity
        // must not silently re-enable expensive shadows on software rendering.
        this.engine.quality = this.engine.controlSettings.quality = 'low';
      }
      void this.engine.init();
    } else {
      this.engine.toMenu();
    }
    // Engine-specific QA stays in this release, not in a shell that can outlive it.
    this.registerCleanup(installGameDebug('__CSX_DEBUG__', {
      ui: () => {
        this.syncHudInputContext();
        return {
          width: this.width,
          height: this.height,
          regions: (this.presentationPaused || this.shellOverlayOpen ? [] : this.hudView.regions).map(region => ({
            id: region.id ?? null,
            x: region.x, y: region.y, w: region.w, h: region.h,
            disabled: !!region.disabled,
          })),
        };
      },
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
          settingsOpen: engine.settingsOpen, settings: { ...engine.controlSettings },
          knifeModel: engine.gun?.userData.rig?.knifeModel ?? null,
          skinnedBots: engine.bots.filter(bot => !!bot.mesh?.userData.skinned).length,
          clock: engine.clock, gunFov: engine.gunCamera.fov,
          inspectAt: engine.player?.inspectAt ?? -99,
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
    this.syncHudInputContext();
  }

  draw(ctx: CanvasRenderingContext2D) {
    this.syncHudInputContext();
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

  /** End captures without activating a deferred choice or a primed weapon. */
  private releaseHudInput(preserveScoreboard = false) {
    const scoreboardOpen = this.engine.hud.scoreboardOpen;
    const active = this.activeRegion;
    const touches = [...this.touchRegions.values()];
    this.activeRegion = null;
    this.touchRegions.clear();
    this.touchLook.clear();
    this.hudView.setPointer(null);
    this.engine.clearHeldInput();
    active?.up?.();
    for (const entry of touches) {
      if (entry.mode === 'scroll') entry.region.scroll?.endDrag();
      else if (entry.mode === 'drag') entry.region.up?.();
    }
    if (preserveScoreboard) this.engine.hud.scoreboardOpen = scoreboardOpen;
  }

  private syncHudInputContext() {
    const e = this.engine;
    // Round transitions are gameplay, not a new input surface. Modal/menu
    // transitions, on the other hand, must retire every captured HUD closure.
    const phase = ['menu', 'paused', 'match-end'].includes(e.phase) ? e.phase : 'play';
    const next = JSON.stringify([
      phase, e.settingsOpen, e.buyOpen, e.buyOpen ? e.buyCategory : null,
      e.mapOpen, !!e.hud.matchEnd, !!e.hud.scoreboardOpen,
      phase === 'menu' ? [e.selectedMap, e.selectedMode, e.bootLoading, e.mapLoading] : null,
    ]);
    if (this.hudInputContext !== null && this.hudInputContext !== next) {
      // clearHeldInput also hides the scoreboard. Preserve the newly requested
      // panel while ending the previous surface's held keys/fire/touch state.
      this.releaseHudInput(true);
      this.hudView.regions = [];
    }
    this.hudInputContext = next;
  }

  private currentHudRegion(region: HudRegion): HudRegion | null {
    return this.hudView.regions.find(current => !current.disabled
      && (region.id ? current.id === region.id : current === region)
      && (['x', 'y', 'w', 'h'] as const).every(key => current[key] === region[key])) ?? null;
  }

  private pressHudRegion(region: HudRegion, x: number, y: number) {
    region.down?.(x, y);
    this.syncHudInputContext();
  }

  private moveHudTouch(entry: HudTouchCapture, x: number, y: number) {
    if (entry.mode === 'scroll') {
      entry.region.scroll?.drag(y);
      return;
    }
    if (entry.mode === 'cancelled') return;
    if (entry.mode === 'drag') {
      if (entry.region.deferTap && !this.currentHudRegion(entry.region)) {
        entry.region.up?.();
        entry.mode = 'cancelled';
        return;
      }
      entry.region.drag?.(x, y);
      return;
    }
    const dx = Math.abs(x - entry.sx), dy = Math.abs(y - entry.sy);
    if (Math.max(dx, dy) <= CsGame.TAP_SCROLL_THRESHOLD) return;
    const region = this.currentHudRegion(entry.region);
    if (!region) { entry.mode = 'cancelled'; return; }
    if (region.dragAxis === 'x' && region.drag && dx > dy) {
      entry.mode = 'drag';
      entry.region = region;
      this.pressHudRegion(region, entry.sx, entry.sy);
      if ([...this.touchRegions.values()].includes(entry)) region.drag(x, y);
    } else if (dy >= dx && region.scroll) {
      entry.mode = 'scroll';
      region.scroll.beginDrag();
      region.scroll.drag(entry.sy);
      region.scroll.drag(y);
    } else {
      // Horizontal swipes across choices are not taps on the release target.
      entry.mode = 'cancelled';
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (e.type === 'touchcancel') {
      this.onTouchCancel(e as TouchEvent);
      return;
    }
    if (this.presentationPaused || this.shellOverlayOpen) return;
    this.syncHudInputContext();
    this.routeInput(e);
    this.syncHudInputContext();
  }

  private routeInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
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
      if (e.type === 'mousemove' || e.type === 'mousedown') this.hudView.setPointer(this.canvasPoint(e.clientX, e.clientY));
      if (e.type === 'mousedown') {
        const point = this.canvasPoint(e.clientX, e.clientY);
        const region = this.hudView.hitTest(point.x, point.y);
        // Look bands capture touch only; a mouse attached to a coarse-pointer
        // device must still reach the engine's fire/drag-look handlers.
        if (region && region.id !== 'look') {
          if (e.button === 0 && region.down) {
            this.activeRegion?.up?.();
            this.activeRegion = region;
            this.pressHudRegion(region, point.x, point.y);
          }
          return;
        }
        this.engine.onMouseDown(e.button, e.clientX, e.clientY);
        return;
      }
      if (e.type === 'mousemove') {
        if (this.activeRegion?.drag) {
          if (this.activeRegion.deferTap && !this.currentHudRegion(this.activeRegion)) {
            const region = this.activeRegion;
            this.activeRegion = null;
            region.up?.();
            return;
          }
          const point = this.canvasPoint(e.clientX, e.clientY);
          this.activeRegion.drag(point.x, point.y);
          return;
        }
        this.engine.onMouseMove(e);
        return;
      }
      if (e.type === 'mouseup') {
        if (e.button === 0) {
          const region = this.activeRegion;
          this.activeRegion = null;
          region?.up?.();
        }
        this.engine.onMouseUp(e.button);
      }
      return;
    }

    if (e instanceof TouchEvent) {
      this.hudView.setPointer(null);
      e.preventDefault();
      for (const touch of Array.from(e.changedTouches)) {
        const point = this.canvasPoint(touch.clientX, touch.clientY);
        if (e.type === 'touchstart') {
          const region = this.hudView.hitTest(point.x, point.y);
          if (region) {
            if (region.id === 'look') {
              this.touchLook.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
            } else {
              // A control/scroll container has one owner until release. A
              // second finger must not reset its drag baseline or release it.
              if ([...this.touchRegions.values()].some(entry =>
                (region.id ? entry.region.id === region.id : entry.region === region)
                || (region.scroll && entry.region.scroll === region.scroll))) continue;
              this.touchRegions.set(touch.identifier, {
                region, sx: point.x, sy: point.y, mode: region.deferTap ? 'pending' : 'drag',
              });
              if (!region.deferTap) this.pressHudRegion(region, point.x, point.y);
            }
          }
          continue;
        }
        if (e.type === 'touchmove') {
          const entry = this.touchRegions.get(touch.identifier);
          if (entry) this.moveHudTouch(entry, point.x, point.y);
          const look = this.touchLook.get(touch.identifier);
          if (look) {
            this.engine.touchLook(touch.clientX - look.x, touch.clientY - look.y);
            look.x = touch.clientX;
            look.y = touch.clientY;
          }
          continue;
        }
        if (e.type !== 'touchend') continue;
        const entry = this.touchRegions.get(touch.identifier);
        if (entry) {
          // Some browsers coalesce the final move into touchend. Resolve that
          // travel before deciding whether this was really a held-still tap.
          this.moveHudTouch(entry, point.x, point.y);
          if (this.touchRegions.get(touch.identifier) !== entry) continue;
          this.touchRegions.delete(touch.identifier);
          if (entry.mode === 'scroll') {
            entry.region.scroll?.endDrag();
          } else if (entry.mode === 'pending') {
            const region = this.currentHudRegion(entry.region);
            const hit = this.hudView.hitTest(point.x, point.y);
            if (region && hit === region) {
              this.pressHudRegion(region, point.x, point.y);
              region.up?.();
            }
          } else if (entry.mode === 'drag') {
            entry.region.up?.();
          }
        }
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
    this.stop();
    this.hudView.dispose();
    this.engine.dispose();
  }
}
