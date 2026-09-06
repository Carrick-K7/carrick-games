import {
  GAME_GROUPS,
  GAME_GROUP_MAP,
  GAME_LIST_ORDER,
  GAME_LIST_ORDER_INDEX,
  GAMES,
  type GameCtor,
  type GameInstance,
  type GameMeta,
} from './games/catalog.js';
export { GAMES } from './games/catalog.js';
import {
  getStoredRecord,
  isDarkTheme,
  isZhLang,
  type GameHost,
  type GameViewport,
} from './core/game.js';
import { saveStoredRecord } from './core/storage.js';
import { isPixelMode } from './core/render.js';
import { normalizeKey } from './ui/keyboard-input.js';
import { renderVirtualKeyboard } from './ui/virtual-keyboard.js';
import { renderTouchGuide, renderGuideNotes } from './ui/control-guide.js';
import { renderGameIcon } from './ui/game-icons.js';
import { renderLevelGridHTML, type LevelSelectState } from './core/levelselect.js';

let currentGameName: string | null = null;
let currentGameInstance: GameInstance | null = null;
let isRunning = false;
let isLoadingGame = false;
let prepareGameToken = 0;
const gameClassCache = new Map<string, Promise<GameCtor>>();
let shellOverlayOpen = false;
let gameOverlayOpen = false;
let overlayCaptureOwner: GameInstance | null = null;
const guideSheetQuery = '(max-width: 720px), (max-height: 480px), (pointer: coarse)';
const isHelpOpen = () => document.getElementById('helpOverlay')?.hidden === false;
const isGuideSheet = () => window.matchMedia(guideSheetQuery).matches;

function updatePresentationControls() {
  const zh = isZhLang();
  const helpTrigger = document.getElementById('helpBtn');
  const helpLabel = isHelpOpen() ? (zh ? '收起操作指南' : 'Close controls') : (zh ? '操作指南' : 'Controls');
  helpTrigger?.setAttribute('aria-label', helpLabel);
  helpTrigger?.setAttribute('title', `${helpLabel} (?)`);
  const labels: Record<string, string> = { helpTitle: zh ? '操作指南' : 'Controls' };
  for (const [id, label] of Object.entries(labels)) {
    const element = document.getElementById(id);
    if (element) element.textContent = label;
  }
  document.getElementById('menuCloseBtn')?.setAttribute('aria-label', zh ? '关闭菜单' : 'Close menu');
  document.getElementById('shellBackdrop')?.setAttribute('aria-label', zh ? '关闭菜单' : 'Close menu');
  for (const id of ['helpCloseBtn', 'guideBackdrop']) document.getElementById(id)?.setAttribute('aria-label', zh ? '关闭操作指南' : 'Close controls');
  document.getElementById('guideBody')?.setAttribute('aria-label', zh ? '游戏操作指南，可滚动' : 'Game controls, scroll to read');
  document.getElementById('helpCloseBtn')?.setAttribute('title', zh ? '关闭 (Esc)' : 'Close (Esc)');
}

function syncShellOverlayState() {
  const library = !!document.getElementById('gameLibrary')?.classList.contains('open');
  const menu = !!document.getElementById('overflowMenu') && !document.getElementById('overflowMenu')!.hidden;
  const guide = isHelpOpen();
  const open = library || menu || guide;
  if (open && !gameOverlayOpen) {
    overlayCaptureOwner = document.pointerLockElement === document.getElementById('gameCanvas') ? currentGameInstance : null;
  }
  const stage = document.querySelector('main');
  if (stage) stage.inert = open;
  const help = document.getElementById('helpOverlay');
  if (help) help.inert = library || menu;
  const actions = document.querySelector<HTMLElement>('.header-actions');
  if (actions) actions.inert = library;
  const helpTrigger = document.getElementById('helpBtn');
  if (helpTrigger) helpTrigger.inert = menu;
  shellOverlayOpen = open;
  if (open !== gameOverlayOpen) {
    if (open) releaseHeldInputs(); else overlayCaptureOwner = null;
    gameOverlayOpen = open;
    currentGameInstance?.setPresentationPaused?.(open);
    currentGameInstance?.onShellOverlayChange?.(open);
    if (open && document.pointerLockElement === document.getElementById('gameCanvas')) document.exitPointerLock?.();
    // Flush game-owned DOM affordances (for example Villa's Use button) once
    // before suspending frames, without advancing the simulation.
    repaintCurrentFrame();
  }
}


function focusGameSurface() {
  if (gameOverlayOpen) return;
  const start = document.getElementById('startOverlay');
  const target = start?.classList.contains('active') ? start : document.getElementById('gameCanvas');
  target?.focus({ preventScroll: true });
}

/** Close is the continuation action; no extra Return button or gameplay click. */
function closeUiFromUser(close: () => void, event?: Event) {
  const captureOwner = overlayCaptureOwner;
  close();
  if (gameOverlayOpen) return;
  focusGameSurface();
  // Escape deliberately leaves the cursor free. Only an explicit click/? can
  // restore a capture that this same game owned before opening the overlay.
  const canRecapture = event?.isTrusted && (event.type === 'click' || (event instanceof KeyboardEvent && event.key === '?'));
  if (!canRecapture || !captureOwner || captureOwner !== currentGameInstance || !isRunning) return;
  // Game-owned capture guards must be re-armed, not bypassed with a raw DOM call.
  currentGameInstance.restorePointerCapture?.();
}

function loadGameClass(meta: GameMeta): Promise<GameCtor> {
  const cached = gameClassCache.get(meta.id);
  if (cached) return cached;

  const pending = meta.loader();
  gameClassCache.set(meta.id, pending);
  void pending.catch(() => {
    if (gameClassCache.get(meta.id) === pending) {
      gameClassCache.delete(meta.id);
    }
  });
  return pending;
}

function warmGameClass(name: string) {
  const meta = GAMES.find((game) => game.id === name);
  if (meta) void loadGameClass(meta).catch(() => {});
}

// Routing helpers
function getHashGame(): string | null {
  const hash = window.location.hash;
  if (!hash) return null;
  const match = hash.match(/^#\/([a-z0-9-]+)$/);
  return match ? match[1] : null;
}

function setHashGame(name: string) {
  const target = `#/${name}`;
  if (window.location.hash !== target) {
    window.location.hash = target;
  }
}

function updateActionButton() {
  const restart = document.getElementById('restartBtn') as HTMLButtonElement | null;
  if (restart) {
    restart.hidden = !currentGameInstance || !isRunning || isLoadingGame;
    restart.textContent = isZhLang() ? '重新开始' : 'Restart';
  }
  updateDemoButton();
}

function updateDemoButton() {
  const btn = document.getElementById('demoBtn') as HTMLButtonElement | null;
  if (!btn) return;
  const zh = document.documentElement.getAttribute('data-lang') === 'zh';
  const canDemo = !!currentGameInstance && typeof currentGameInstance.startDemo === 'function' && !isLoadingGame;
  btn.hidden = !canDemo;
  btn.disabled = !canDemo;
  btn.textContent = zh ? '示例' : 'Demo';
}

function updateGameTitle() {
  const zh = document.documentElement.getAttribute('data-lang') === 'zh';
  const meta = GAMES.find((g) => g.id === currentGameName);
  const selectedGameLabel = document.getElementById('selectedGameLabel');
  if (selectedGameLabel) {
    selectedGameLabel.textContent = meta ? (zh ? meta.nameZh : meta.name) : (zh ? '选择游戏' : 'Select a game');
  }
  const picker = document.getElementById('gamePickerBtn');
  const gameName = meta ? (zh ? meta.nameZh : meta.name) : '';
  if (picker) {
    picker.setAttribute('aria-label', zh ? `切换游戏${gameName ? `：${gameName}` : ''}` : `Switch game${gameName ? `: ${gameName}` : ''}`);
    picker.title = zh ? '打开游戏库' : 'Open game library';
  }
  const canvas = document.getElementById('gameCanvas');
  if (canvas && meta) {
    const gameName = zh ? meta.nameZh : meta.name;
    canvas.setAttribute('aria-label', zh ? `${gameName}游戏画布` : `${gameName} game canvas`);
  }
}

function updateVirtualKeyboardHighlight(pressedSet: Set<string>) {
  document.querySelectorAll('.vkey').forEach((el) => {
    const k = el.getAttribute('data-key') || '';
    el.classList.toggle('pressed', pressedSet.has(k));
  });
}

function releaseHeldInputs() {
  for (const key of [...pressedKeys]) window.dispatchEvent(new KeyboardEvent('keyup', { key }));
  pressedKeys.clear();
  for (const button of [0, 1, 2]) window.dispatchEvent(new MouseEvent('mouseup', { button }));
  if (typeof TouchEvent !== 'undefined') document.getElementById('gameCanvas')?.dispatchEvent(new TouchEvent('touchcancel', { changedTouches: [] }));
  updateVirtualKeyboardHighlight(pressedKeys);
}

function getLevelSelectState(): LevelSelectState | null {
  if (!currentGameInstance) return null;
  return currentGameInstance.getFrameTelemetry()?.levelSelect
    ?? currentGameInstance.getShellSnapshot().levelSelect
    ?? null;
}

function renderStats() {
  const container = document.getElementById('statsPanel');
  if (!container) return;
  const ls = getLevelSelectState();
  if (!ls) {
    container.hidden = true;
    container.innerHTML = '';
    return;
  }

  const zh = document.documentElement.getAttribute('data-lang') === 'zh';
  const driving = ls.gameState === 'playing' || ls.gameState === 'demo';
  const current = ls.currentLevel + 1;
  const selected = ls.selectedLevel + 1;
  container.hidden = false;
  container.innerHTML = `
    <details class="level-picker">
      <summary>
        <span>${zh ? '关卡' : 'Level'} ${driving ? current : selected}</span>
        <span class="level-picker-meta">${zh ? '最佳' : 'Best'} ${ls.bestLevel}</span>
      </summary>
      <div class="level-picker-grid">${renderLevelGridHTML(ls, ls.selectedLevel, zh)}</div>
    </details>
  `;

  container.querySelectorAll('.level-cell').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-level') || '', 10);
      if (isNaN(idx)) return;
      currentGameInstance?.selectLevel?.(idx);
      const details = container.querySelector('details');
      if (details instanceof HTMLDetailsElement) details.open = false;
    });
  });
}

function updateLiveScoreDisplay() {
  const ls = getLevelSelectState();
  if (!ls) return;
  const snapshot = `${ls.currentLevel},${ls.bestLevel},${ls.unlockedLevel},${ls.selectedLevel},${ls.gameState}`;
  if (snapshot !== lastLevelSelectSnapshot) {
    lastLevelSelectSnapshot = snapshot;
    renderStats();
  }
}

function setLoadingOverlay(active: boolean) {
  const el = document.getElementById('loadingOverlay');
  if (el) el.classList.toggle('active', active);
}

function setLoadError(message: string | null) {
  const error = document.getElementById('loadError');
  const spinner = document.getElementById('loadingSpinner');
  const messageEl = document.getElementById('loadErrorMessage');
  const retry = document.getElementById('retryLoadBtn');
  if (error) error.hidden = message == null;
  if (spinner) spinner.hidden = message != null;
  if (messageEl) messageEl.textContent = message ?? '';
  if (retry) retry.textContent = isZhLang() ? '重试' : 'Retry';
}

function setStartOverlay(active: boolean) {
  const el = document.getElementById('startOverlay');
  if (!el) return;
  el.classList.toggle('active', active);
  const zh = document.documentElement.getAttribute('data-lang') === 'zh';
  const meta = GAMES.find((g) => g.id === currentGameName);
  const titleEl = el.querySelector('.start-overlay-title') as HTMLElement | null;
  const hintEl = el.querySelector('.start-overlay-hint') as HTMLElement | null;
  if (titleEl) titleEl.textContent = meta ? (zh ? meta.nameZh : meta.name) : '';
  // Control teaching stays in the compact desktop input strip.
  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (hintEl) hintEl.textContent = zh ? '点击开始' : (touch ? 'Tap to start' : 'Click to start');
}

let scorePollFrame: number | null = null;
let lastLevelSelectSnapshot = '';

function startScorePolling() {
  stopScorePolling();
  lastLevelSelectSnapshot = '';
  updateLiveScoreDisplay();

  if (currentGameInstance?.getFrameTelemetry()) {
    const tick = () => {
      updateLiveScoreDisplay();
      scorePollFrame = window.requestAnimationFrame(tick);
    };
    scorePollFrame = window.requestAnimationFrame(tick);
    return;
  }

}

function stopScorePolling() {
  if (scorePollFrame != null) {
    cancelAnimationFrame(scorePollFrame);
    scorePollFrame = null;
  }
}

function renderKeyboard() {
  const container = document.getElementById('keyboardPanel');
  if (!container) return;
  const meta = GAMES.find((g) => g.id === currentGameName);
  if (!meta) {
    container.innerHTML = '';
    return;
  }

  const zh = document.documentElement.getAttribute('data-lang') === 'zh';
  container.innerHTML = renderVirtualKeyboard(meta.controls, zh, false);
  const touch = document.getElementById('touchHelp');
  if (touch) touch.innerHTML = renderTouchGuide(meta.controls, zh);
  const notes = document.getElementById('guideNotes');
  if (notes) notes.innerHTML = renderGuideNotes(meta.controls, zh);
  const name = document.getElementById('helpGameName');
  if (name) name.textContent = zh ? meta.nameZh : meta.name;
}

function renderControls() {
  renderStats();
  renderKeyboard();
}

// Debug hook for automated visual checks (?cs3d=force is separate). E2E and
// humans alike should never rely on this — it is not part of the game API.
if (typeof window !== 'undefined') {
  (window as unknown as { __GAME_VIEWPORT_DEBUG__?: unknown }).__GAME_VIEWPORT_DEBUG__ = {
    info() {
      const g = currentGameInstance as any;
      const camera = g?.engine?.camera ?? g?.scene3d?.camera ?? g?.scene?.camera;
      const gl = g?.engine?.canvas3d ?? g?.scene3d?.canvas ?? g?.scene?.renderer?.domElement;
      return { id: currentGameName, width: g?.width, height: g?.height, cameraAspect: camera?.aspect,
        gunCameraAspect: g?.engine?.gunCamera?.aspect,
        renderWidth: gl?.width, renderHeight: gl?.height, shellOverlayOpen,
        buyOpen: !!(g?.engine?.buyOpen ?? g?.buyOpen),
        paused: !!(g?.paused ?? (g?.engine?.phase === 'paused')),
        raycastWidth: g?.rw, raycastHeight: g?.rh,
        projectionHalfFov: typeof g?.halfFovTan === 'function' ? g.halfFovTan() : undefined };
    },
  };
  (window as unknown as { __CS_DEBUG__?: unknown }).__CS_DEBUG__ = {
    look(angle: number, pitch = 0) {
      const g = currentGameInstance as unknown as { angle: number; pitch: number } | null;
      if (!g || currentGameName !== 'cs-kimi') return;
      g.angle = angle;
      g.pitch = pitch;
    },
    tp(x: number, y: number) {
      const g = currentGameInstance as unknown as {
        px: number;
        py: number;
        fighters?: { x: number; y: number }[];
      } | null;
      if (!g || currentGameName !== 'cs-kimi') return;
      // The fighter body is authoritative (shots, collision); px/py is the
      // camera synced from it — move both.
      const p = g.fighters?.[0];
      if (p) {
        p.x = x;
        p.y = y;
      }
      g.px = x;
      g.py = y;
    },
    info() {
      const g = currentGameInstance as unknown as {
        fighters?: { x: number; y: number; hp: number; slot: string; primary?: { def: { id: string }; mag: number }; pistols?: { def: { id: string } }[] }[];
        phase?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        activeWeapon?: (f: any) => { def: { id: string }; mag: number } | null;
      } | null;
      if (!g || currentGameName !== 'cs-kimi' || !g.fighters || !g.activeWeapon) return null;
      const p = g.fighters[0];
      const w = g.activeWeapon(p);
      return { weapon: w?.def.id ?? null, mag: w?.mag ?? -1, slot: p.slot, phase: g.phase, x: p.x, y: p.y };
    },
    /** Fire one shot along the current view angle (bypasses DOM events —
     *  used to verify hit registration against exact aim). */
    shoot() {
      const g = currentGameInstance as unknown as {
        fighters?: { alive: boolean }[];
        phase?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fireShot?: (f: any, angle: number) => void;
        angle: number;
      } | null;
      if (!g || currentGameName !== 'cs-kimi' || !g.fighters || !g.fireShot) return;
      const p = g.fighters[0];
      if (!p?.alive) return;
      g.fireShot(p, g.angle);
    },
    /** Give the player a primary weapon by id (debug/QA only). */
    give(weaponId: string) {
      const g = currentGameInstance as unknown as {
        fighters?: { alive: boolean; slot: string; primary?: unknown }[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        makeWeapon?: (id: any) => unknown;
      } | null;
      const p = g?.fighters?.[0];
      if (!g || currentGameName !== 'cs-kimi' || !p || !g.makeWeapon) return;
      p.primary = g.makeWeapon(weaponId);
      p.slot = 'primary';
    },
  };

  // Same-purpose debug surface for the migrated `cs` engine. Lets e2e inspect
  // match state and force terminal transitions without minutes of realtime play.
  (window as unknown as { __CSX_DEBUG__?: unknown }).__CSX_DEBUG__ = {
    info() {
      const g = currentGameInstance as unknown as { engine?: any } | null;
      const e = g?.engine;
      if (!e || currentGameName !== 'cs') return null;
      return {
        phase: e.phase,
        mode: e.mode,
        map: e.selectedMap,
        ready: e.ready,
        round: e.round,
        scores: { ...e.scores },
        playerAlive: !!e.player?.alive,
        playerPos: e.player ? { x: e.player.pos.x, y: e.player.pos.y, z: e.player.pos.z } : null,
        kills: e.player?.kills ?? 0,
        weapon: e.player?.inventory?.[e.player.slot]?.id ?? null,
        mag: e.player?.inventory?.[e.player.slot]?.ammo ?? null,
        reserve: e.player?.inventory?.[e.player.slot]?.reserve ?? null,
        bots: e.bots?.filter((b: any) => b.alive).length ?? 0,
        bomb: e.bomb?.status ?? null,
        matchEnd: !!e.hud.matchEnd,
      };
    },
    /** Force the current match to end (debug/QA only). */
    forceMatchEnd(won = true) {
      const g = currentGameInstance as unknown as { engine?: any } | null;
      const e = g?.engine;
      if (!e || currentGameName !== 'cs' || !e.matchActive || e.phase === 'match-end') return;
      e.scores = won ? { ct: 7, t: 3 } : { ct: 3, t: 7 };
      if (e.player) e.player.kills = Math.max(e.player.kills, 9);
      e.finishMatch();
    },
    /** Skip the freeze phase (debug/QA only). */
    skipFreeze() {
      const g = currentGameInstance as unknown as { engine?: any } | null;
      const e = g?.engine;
      if (!e || currentGameName !== 'cs') return;
      if (e.phase === 'freeze') e.freezeTime = Math.min(e.freezeTime, 0.01);
    },
  };
}

function getKeysFromEvent(e: KeyboardEvent): string[] {
  const keys: string[] = [e.key];
  if (e.code === 'Space') keys.push(' ');
  if (e.key.length === 1) keys.push(e.key.toLowerCase());
  const meta = GAMES.find((g) => g.id === currentGameName);
  for (const panelKey of meta?.controls.keyboardPanel || []) {
    const aliases = [panelKey.key, ...(panelKey.aliases || [])].map(normalizeKey);
    if (aliases.some((alias) => keys.includes(alias))) {
      keys.push(normalizeKey(panelKey.key));
    }
  }
  // Deduplicate
  return [...new Set(keys)];
}

function saveRecord(gameId: string, score: number) {
  saveStoredRecord(gameId, score);
}

function reportCurrentScore(score: number) {
  if (!currentGameName) return;
  saveRecord(currentGameName, score);
  window.dispatchEvent(new CustomEvent('carrick:score', { detail: score }));
  renderStats();
}

function createGameHost(meta: GameMeta, canvas: HTMLCanvasElement): GameHost {
  return {
    canvas,
    logicalWidth: meta.canvasSize.width,
    logicalHeight: meta.canvasSize.height,
    isDarkTheme,
    isZhLang,
    isPixelMode,
    getRecord: getStoredRecord,
    reportScore: reportCurrentScore,
    requestShellRender: renderControls,
    presentation: {
      openControls: () => setHelpOpen(true),
      isControlsOpen: isHelpOpen,
    },
  };
}

export async function prepareGame(name: string) {
  const meta = GAMES.find((g) => g.id === name);
  if (!meta) return;
  const token = ++prepareGameToken;
  setHelpOpen(false, false);

  stopScorePolling();
  if (currentGameInstance) {
    currentGameInstance.destroy();
    currentGameInstance = null;
  }
  isRunning = false;
  isLoadingGame = true;
  currentGameName = name;
  updateActionButton();
  setLoadError(null);
  setStartOverlay(false);
  setLoadingOverlay(true);
  updateGameTitle();

  document.querySelectorAll('.game-list-item').forEach((el) => {
    const active = el.getAttribute('data-id') === name;
    el.classList.toggle('active', active);
    el.setAttribute('aria-current', String(active));
  });

  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  canvas.tabIndex = 0;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  delete canvas.dataset.parkingState;

  let GameClass: GameCtor;
  try {
    GameClass = await loadGameClass(meta);
  } catch (e) {
    if (token === prepareGameToken) {
      isLoadingGame = false;
      setLoadError(isZhLang() ? '游戏加载失败，请重试。' : 'Game failed to load. Please retry.');
      setLoadingOverlay(true);
      updateActionButton();
    }
    // eslint-disable-next-line no-console
    console.error(e);
    return;
  }

  if (token !== prepareGameToken) {
    return;
  }

  const nextGameInstance = new GameClass(createGameHost(meta, canvas));
  if (token !== prepareGameToken) {
    nextGameInstance.destroy();
    return;
  }
  currentGameInstance = nextGameInstance;
  isLoadingGame = false;
  setLoadingOverlay(false);

  // Draw initial frame so canvas isn't blank
  try {
    nextGameInstance.prepare();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
  }

  startScorePolling();
  updateActionButton();
  updateGameTitle();
  renderControls();
  setStartOverlay(true);
  lastViewportKey = '';
  currentGameInstance.setPresentationPaused?.(gameOverlayOpen);
  currentGameInstance.onShellOverlayChange?.(gameOverlayOpen);
  fitGameCanvas();
}

/** Viewport ownership belongs to the app; no shell controls reserve game space. */
let lastViewportKey = '';

function fitGameCanvas() {
  const root = document.getElementById('gameApp');
  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement | null;
  if (!root || !canvas) return;
  // Browser chrome fullscreen (F11) is just another viewport resize.
  const visual = window.visualViewport;
  const width = visual?.width ?? window.innerWidth;
  const height = visual?.height ?? window.innerHeight;
  if (!(width > 0 && height > 0)) return;
  root.style.width = `${width}px`;
  root.style.height = `${height}px`;
  root.style.left = `${visual?.offsetLeft ?? 0}px`;
  root.style.top = `${visual?.offsetTop ?? 0}px`;
  const style = getComputedStyle(root);
  const inset = (edge: string) => Math.max(0, parseFloat(style.getPropertyValue(`--safe-${edge}`)) || 0);
  const viewport: GameViewport = {
    width, height, dpr: window.devicePixelRatio || 1,
    safeArea: { top: inset('top'), right: inset('right'), bottom: inset('bottom'), left: inset('left') },
  };
  const meta = GAMES.find(g => g.id === currentGameName);
  const key = JSON.stringify([currentGameName, viewport, meta?.canvasSize]);
  if (key === lastViewportKey || !currentGameInstance || !meta) return;
  lastViewportKey = key;
  if (currentGameInstance.setViewport) currentGameInstance.setViewport(viewport);
  else currentGameInstance.setDisplayScale?.(Math.min(width, height * meta.canvasSize.width / meta.canvasSize.height));
}

function scheduleViewportFit() {
  if (fitCanvasScheduled) return;
  fitCanvasScheduled = true;
  requestAnimationFrame(() => { fitCanvasScheduled = false; fitGameCanvas(); });
}

function startPreparedGame() {
  if (!currentGameInstance || isLoadingGame) return;
  try {
    setStartOverlay(false);
    if (isRunning) {
      currentGameInstance.restart();
    } else {
      currentGameInstance.start();
    }
    isRunning = true;
    updateActionButton();
    startScorePolling();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
  }
}

function startDemoForCurrentGame() {
  if (!currentGameInstance || isLoadingGame) return;
  const demoStarter = currentGameInstance.startDemo;
  if (typeof demoStarter !== 'function') return;
  try {
    setStartOverlay(false);
    demoStarter.call(currentGameInstance);
    isRunning = true;
    updateActionButton();
    startScorePolling();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
  }
}

export async function loadGame(name: string) {
  closeGameLibrary();
  await prepareGame(name);
  if (currentGameName !== name) return;
  setHashGame(name);
  if (!isLoadingGame) focusGameSurface();
}

function setGameLibraryOpen(open: boolean) {
  const library = document.getElementById('gameLibrary');
  const trigger = document.getElementById('gamePickerBtn');
  if (!library || !trigger) return;
  const wasOpen = library.classList.contains('open');
  if (wasOpen === open) return;
  library.classList.toggle('open', open);
  trigger.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('library-open', open);
  syncShellOverlayState();
  if (open) {
    setHelpOpen(false, false);
    setOverflowOpen(false);
    library.setAttribute('aria-hidden', 'false');
    // Release held movement keys before modal input is isolated.
    releaseHeldInputs();
    renderGameList((document.getElementById('searchInput') as HTMLInputElement | null)?.value || '');
    // Keep the full touch grid visible: focusing search would open the phone's
    // software keyboard before the player has chosen to type.
    const focusTarget = window.matchMedia('(pointer: coarse)').matches
      ? library.querySelector<HTMLElement>('.library-dialog')
      : document.getElementById('searchInput');
    focusTarget?.focus({ preventScroll: true });
  } else {
    focusGameSurface();
    library.setAttribute('aria-hidden', 'true');
  }
  syncShellOverlayState();
}

function closeGameLibrary() {
  setGameLibraryOpen(false);
}

function setOverflowOpen(open: boolean) {
  const menu = document.getElementById('overflowMenu');
  const trigger = document.getElementById('overflowBtn');
  if (!menu || !trigger) return;
  const wasOpen = !menu.hidden;
  const hadFocus = menu.contains(document.activeElement);
  menu.hidden = !open;
  const backdrop = document.getElementById('shellBackdrop');
  if (backdrop) backdrop.hidden = !open;
  trigger.setAttribute('aria-expanded', String(open));
  if (open) setHelpOpen(false, false);
  syncShellOverlayState();
  if (open && !wasOpen) document.getElementById('gamePickerBtn')?.focus({ preventScroll: true });
  if (!open && hadFocus) focusGameSurface();
}

function updateGuidePresentation() {
  const help = document.getElementById('helpOverlay');
  if (!help) return;
  const sheet = isGuideSheet();
  help.dataset.presentation = sheet ? 'sheet' : 'reference';
  help.setAttribute('role', 'dialog');
  help.setAttribute('aria-modal', 'true');
  // Keep the visible toggle in the modal's accessibility and keyboard scope.
  if (isHelpOpen()) help.setAttribute('aria-owns', 'helpBtn overflowBtn'); else help.removeAttribute('aria-owns');
  const backdrop = document.getElementById('guideBackdrop');
  if (backdrop) backdrop.hidden = !isHelpOpen();
  syncShellOverlayState();
}

function setHelpOpen(open: boolean, restoreFocus = true) {
  const help = document.getElementById('helpOverlay');
  if (!help) return;
  const wasOpen = !help.hidden;
  if (wasOpen && !open) releaseHeldInputs();
  help.hidden = !open;
  document.getElementById('helpBtn')?.setAttribute('aria-expanded', String(open));
  document.getElementById('gameApp')?.classList.toggle('controls-open', open);
  if (open) {
    // Set the guide state first: swapping menu → guide must not briefly resume
    // the game or reacquire the pointer between the two overlays.
    setOverflowOpen(false);
    renderKeyboard();
    if (!wasOpen) document.getElementById('guideBody')?.scrollTo(0, 0);
  }
  updateGuidePresentation();
  updatePresentationControls();
  if (open) document.getElementById('helpCloseBtn')?.focus({ preventScroll: true });
  else if (wasOpen && restoreFocus) focusGameSurface();
}

function renderLibraryFilters(zh: boolean) {
  const heading = document.getElementById('libraryHeadingTitle');
  if (heading) heading.textContent = zh ? '选择游戏' : 'Choose a game';
  const summary = document.getElementById('librarySummary');
  if (summary) summary.textContent = zh ? '搜索或从列表中选择。' : 'Search or choose from the list.';
  const search = document.getElementById('searchInput') as HTMLInputElement | null;
  if (search) {
    search.placeholder = zh ? '搜索你的下一场游戏…' : 'Find your next game…';
    search.setAttribute('aria-label', zh ? '搜索游戏' : 'Search games');
  }
  const hints = document.getElementById('libraryKeyboardHints');
  if (hints) hints.innerHTML = `<span><kbd>↑</kbd><kbd>↓</kbd> ${zh ? '浏览' : 'Navigate'}</span><span><kbd>↵</kbd> ${zh ? '选择' : 'Select'}</span><span><kbd>Esc</kbd> ${zh ? '关闭' : 'Close'}</span>`;
}

function renderGameList(filter = '') {
  const list = document.getElementById('gameList');
  if (!list) return;
  const zh = document.documentElement.getAttribute('data-lang') === 'zh';
  const term = filter.trim().toLowerCase();
  renderLibraryFilters(zh);

  const filtered = GAMES.filter((g) => {
    if (!term) return true;
    return (
      g.name.toLowerCase().includes(term) ||
      g.nameZh.includes(term) ||
      g.desc.toLowerCase().includes(term) ||
      g.descZh.includes(term)
    );
  });

  // Sort by group order, then by list order within each group
  const groupOrder = new Map(GAME_GROUPS.map((g, i) => [g.id, i]));
  filtered.sort((a, b) => {
    const ga = groupOrder.get(GAME_GROUP_MAP[a.id]) ?? 999;
    const gb = groupOrder.get(GAME_GROUP_MAP[b.id]) ?? 999;
    if (ga !== gb) return ga - gb;
    const aIndex = GAME_LIST_ORDER_INDEX.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bIndex = GAME_LIST_ORDER_INDEX.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return aIndex - bIndex || a.name.localeCompare(b.name);
  });

  const count = document.getElementById('libraryResultCount');
  if (count) count.textContent = zh ? `${filtered.length} 款游戏` : `${filtered.length} ${filtered.length === 1 ? 'game' : 'games'}`;
  if (filtered.length === 0) {
    list.innerHTML = `<div class="search-empty"><strong>${zh ? '没有匹配的游戏' : 'No games found'}</strong><span>${zh ? '试试其他名称，或清空搜索再看看。' : 'Try another name, or clear your search to explore.'}</span></div>`;
    return;
  }

  // Build grouped HTML
  let lastGroup = '';
  let html = '';
  for (const g of filtered) {
    const groupId = GAME_GROUP_MAP[g.id] || '';
    if (groupId && groupId !== lastGroup) {
      const group = GAME_GROUPS.find((gr) => gr.id === groupId);
      if (group) {
        const groupCount = filtered.filter((game) => game.group === group.id).length;
        if (lastGroup) html += '</div></section>';
        html += `<section class="game-list-section" aria-labelledby="library-group-${group.id}"><h2 class="game-list-group" id="library-group-${group.id}" data-group="${group.id}">${zh ? group.nameZh : group.name}<span class="game-group-count" data-count="${groupCount}" aria-hidden="true"></span></h2><div class="game-group-games">`;
      }
      lastGroup = groupId;
    }
    html += `
      <button class="game-list-item ${g.id === currentGameName ? 'active' : ''}" type="button" data-id="${g.id}" aria-current="${g.id === currentGameName}" title="${zh ? g.nameZh : g.name}">
        <span class="game-list-icon">${renderGameIcon(g.icon)}</span>
        <span class="game-list-copy">
          <span class="game-list-name">${zh ? g.nameZh : g.name}</span>
          <span class="game-list-desc">${zh ? g.descZh : g.desc}</span>
        </span>
        <span class="game-list-status" aria-hidden="true">${g.id === currentGameName ? '✓' : ''}</span>
      </button>
    `;
  }

  list.innerHTML = `${html}</div></section>`;
}

function setLang(lang: 'en' | 'zh') {
  document.documentElement.setAttribute('data-lang', lang);
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  localStorage.setItem('cg-lang', lang);
  updateActionButton();
  updateGameTitle();
  renderControls();
  renderGameList((document.getElementById('searchInput') as HTMLInputElement)?.value || '');
  const languageLabel = document.getElementById('languageMenuLabel');
  const themeLabel = document.getElementById('themeMenuLabel');
  const overflowButton = document.getElementById('overflowBtn');
  if (languageLabel) languageLabel.textContent = lang === 'zh' ? '语言' : 'Language';
  if (themeLabel) themeLabel.textContent = lang === 'zh' ? '主题' : 'Theme';
  if (overflowButton) overflowButton.setAttribute('aria-label', lang === 'zh' ? '游戏菜单与设置' : 'Game menu and settings');
  updatePresentationControls();
  document.getElementById('libraryCloseBtn')?.setAttribute('aria-label', lang === 'zh' ? '关闭' : 'Close');
  document.querySelector('[data-library-close]')?.setAttribute('aria-label', lang === 'zh' ? '关闭游戏库' : 'Close game library');
  document.getElementById('keyboardPanel')?.setAttribute('aria-label', lang === 'zh' ? '键盘与鼠标操作' : 'Keyboard and mouse mapping');
  document.querySelectorAll<HTMLButtonElement>('.theme-btn').forEach((button) => {
    const labels = lang === 'zh' ? { light: '浅色', dark: '深色', system: '跟随系统' } : { light: 'Light', dark: 'Dark', system: 'System' };
    button.textContent = labels[button.dataset.set as keyof typeof labels];
  });
  document.querySelectorAll('.lang-btn').forEach((b) => {
    const target = b.getAttribute('data-lang');
    b.classList.toggle('active', target === lang);
    b.setAttribute('aria-pressed', String(target === lang));
  });
  // Refresh the start overlay copy when it is currently displayed.
  const startOverlay = document.getElementById('startOverlay');
  if (startOverlay?.classList.contains('active')) setStartOverlay(true);
  repaintCurrentFrame();
}

function setTheme(mode: 'light' | 'dark' | 'system') {
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') {
    root.setAttribute('data-theme', mode);
  } else {
    root.removeAttribute('data-theme');
  }
  localStorage.setItem('cg-theme', mode);
  document.querySelectorAll('.theme-btn').forEach((b) => {
    const active = b.getAttribute('data-set') === mode;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
  repaintCurrentFrame();
}

// Repaint static (non-looping) scenes after theme or language changes.
function repaintCurrentFrame() {
  try {
    currentGameInstance?.renderFrame?.();
  } catch {
    // A failed repaint is harmless; the next frame will pick the change up.
  }
}

// Global keyboard highlight listener
const pressedKeys = new Set<string>();
window.addEventListener('keydown', (e) => {
  const target = e.target instanceof Element ? e.target : null;
  if (target?.closest('input, [contenteditable="true"]')) return;
  if (target?.closest('button, summary') && (e.key === ' ' || e.key === 'Enter')) return;
  // Prevent page scrolling from arrow keys and Space
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
    e.preventDefault();
  }
  getKeysFromEvent(e).forEach((k) => pressedKeys.add(k));
  updateVirtualKeyboardHighlight(pressedKeys);
});
window.addEventListener('keyup', (e) => {
  getKeysFromEvent(e).forEach((k) => pressedKeys.delete(k));
  updateVirtualKeyboardHighlight(pressedKeys);
});
window.addEventListener('blur', () => {
  pressedKeys.clear();
  updateVirtualKeyboardHighlight(pressedKeys);
});

let fitCanvasScheduled = false;
const canvasFitObserver = new ResizeObserver(scheduleViewportFit);

// Init UI
(function init() {
  const root = document.getElementById('gameApp');
  if (root) canvasFitObserver.observe(root);
  window.matchMedia(guideSheetQuery).addEventListener('change', () => {
    updateGuidePresentation();
    renderKeyboard();
  });
  window.addEventListener('resize', scheduleViewportFit);
  window.visualViewport?.addEventListener('resize', scheduleViewportFit);
  window.visualViewport?.addEventListener('scroll', scheduleViewportFit);
  const watchDensity = () => {
    const query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    query.addEventListener('change', () => { scheduleViewportFit(); watchDensity(); }, { once: true });
  };
  watchDensity();
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === document.getElementById('gameCanvas');
    // A pending game capture must not steal the cursor after a menu opened.
    if (locked && gameOverlayOpen) { document.exitPointerLock?.(); return; }
    root?.classList.toggle('pointer-locked', locked);
  });
  fitGameCanvas();

  document.getElementById('gamePickerBtn')?.addEventListener('click', () => {
    const open = !document.getElementById('gameLibrary')?.classList.contains('open');
    setGameLibraryOpen(open);
  });
  document.getElementById('libraryCloseBtn')?.addEventListener('click', event => closeUiFromUser(closeGameLibrary, event));
  document.querySelector('[data-library-close]')?.addEventListener('click', event => closeUiFromUser(closeGameLibrary, event));
  document.getElementById('overflowBtn')?.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = document.getElementById('overflowMenu')?.hidden ?? true;
    closeGameLibrary();
    if (open) setOverflowOpen(true);
    else closeUiFromUser(() => setOverflowOpen(false), event);
  });
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('.header-actions')) setOverflowOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    const library = document.getElementById('gameLibrary');
    const open = library?.classList.contains('open');
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      event.stopPropagation();
      if (open) closeUiFromUser(closeGameLibrary, event); else setGameLibraryOpen(true);
      return;
    }
    if (open && library) {
      // Palette typing/navigation must never reach the active game's window
      // input listeners. Native button activation and search editing still work.
      event.stopPropagation();
      // IME candidate confirmation/navigation is editing, not game selection.
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeUiFromUser(closeGameLibrary, event);
        return;
      }
      const rows = Array.from(library.querySelectorAll<HTMLButtonElement>('.game-list-item'));
      const activeIndex = rows.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const next = activeIndex < 0 ? (event.key === 'ArrowDown' ? 0 : rows.length - 1)
          : (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
        rows[next]?.focus({ preventScroll: true });
        rows[next]?.scrollIntoView({ block: 'nearest' });
      } else if (event.key === 'Enter' && event.target === document.getElementById('searchInput')) {
        event.preventDefault();
        rows[0]?.click();
      } else if (event.key === 'Tab') {
        const focusable = Array.from(library.querySelectorAll<HTMLElement>('.library-dialog button, .library-dialog input'));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (document.activeElement === library.querySelector('.library-dialog')) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
      return;
    }
    const editing = event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"]');
    if (event.key === '?' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat) {
        if (isHelpOpen()) closeUiFromUser(() => setHelpOpen(false), event); else setHelpOpen(true);
      }
      return;
    }
    const menu = document.getElementById('overflowMenu');
    if (menu && !menu.hidden) {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); closeUiFromUser(() => setOverflowOpen(false), event); }
      else if (event.key === 'Tab') {
        const buttons = Array.from(menu.querySelectorAll<HTMLElement>('button:not([disabled]), summary'))
          .filter(el => el.getClientRects().length > 0);
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === menu)) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    } else if (isHelpOpen() && event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); closeUiFromUser(() => setHelpOpen(false), event);
    } else if (isHelpOpen()) {
      event.stopPropagation();
      if (event.key === 'Tab') {
        const help = document.getElementById('helpOverlay')!;
        const targets = [...help.querySelectorAll<HTMLElement>('button, [tabindex="0"]'), document.getElementById('helpBtn')!, document.getElementById('overflowBtn')!].filter(el => el.getClientRects().length > 0);
        const index = targets.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();
        targets[(index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length]?.focus({ preventScroll: true });
      }
    } else if (event.target instanceof Element && event.target.closest('.header-actions, .help-overlay')) {
      // Arrow/Space scrolling inside the guide is native, never game input.
      event.stopPropagation();
    }
  });
  document.addEventListener('keyup', (event) => {
    if (shellOverlayOpen || (event.target instanceof Element && event.target.closest('.header-actions, .help-overlay'))) {
      event.stopPropagation();
    }
  });
  const shortcut = document.getElementById('pickerShortcut');
  if (shortcut) shortcut.textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';

  // Mouse simulation: mirror real button presses and wheel ticks on the
  // little mouse next to the keyboard.
  const mouseEls = (btn: number) => document.querySelectorAll(`#vmouse [data-mbtn="${btn}"]`);
  document.addEventListener('mousedown', (e) => {
    mouseEls(e.button).forEach((el) => el.classList.add('pressed'));
  });
  document.addEventListener('mouseup', (e) => {
    mouseEls(e.button).forEach((el) => el.classList.remove('pressed'));
  });
  let wheelTimer = 0;
  document.addEventListener('wheel', () => {
    const wheel = document.querySelector('#vmouse .compact-mouse-wheel');
    if (!wheel) return;
    wheel.classList.add('scrolling');
    window.clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(() => wheel.classList.remove('scrolling'), 140);
  }, { passive: true });
  document.querySelectorAll<HTMLElement>('.lang-btn').forEach((button) => {
    button.addEventListener('click', () => {
      setLang(button.dataset.lang === 'en' ? 'en' : 'zh');
      setOverflowOpen(false);
    });
  });
  document.querySelectorAll<HTMLElement>('.theme-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.set;
      if (mode === 'light' || mode === 'dark' || mode === 'system') setTheme(mode);
      setOverflowOpen(false);
    });
  });
  const savedLang = (localStorage.getItem('cg-lang') as 'en' | 'zh') || 'zh';
  const savedTheme = (localStorage.getItem('cg-theme') as 'light' | 'dark' | 'system') || 'system';
  setLang(savedLang);
  setTheme(savedTheme);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!document.documentElement.hasAttribute('data-theme')) repaintCurrentFrame();
  });

  const search = document.getElementById('searchInput') as HTMLInputElement | null;
  if (search) {
    search.addEventListener('input', () => renderGameList(search.value));
  }

  const gameList = document.getElementById('gameList');
  if (gameList) {
    const getGameId = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLButtonElement>('.game-list-item')?.dataset.id : undefined;
    const warmFromEvent = (event: Event) => {
      const id = getGameId(event.target);
      if (id) warmGameClass(id);
    };

    gameList.addEventListener('pointerover', warmFromEvent);
    gameList.addEventListener('pointerdown', warmFromEvent);
    gameList.addEventListener('focusin', warmFromEvent);
    gameList.addEventListener('click', (event) => {
      const id = getGameId(event.target);
      if (!id) return;
      void loadGame(id);
    });
  }

  document.getElementById('startOverlay')?.addEventListener('click', startPreparedGame);
  for (const id of ['menuCloseBtn', 'shellBackdrop']) {
    document.getElementById(id)?.addEventListener('click', event => closeUiFromUser(() => setOverflowOpen(false), event));
  }
  document.getElementById('helpBtn')?.addEventListener('click', event => {
    event.stopPropagation();
    if (isHelpOpen()) closeUiFromUser(() => setHelpOpen(false), event); else setHelpOpen(true);
  });
  for (const id of ['helpCloseBtn', 'guideBackdrop']) {
    document.getElementById(id)?.addEventListener('click', event => closeUiFromUser(() => setHelpOpen(false), event));
  }
  document.getElementById('restartBtn')?.addEventListener('click', () => {
    setOverflowOpen(false);
    startPreparedGame();
  });

  const demoBtn = document.getElementById('demoBtn') as HTMLButtonElement | null;
  if (demoBtn) {
    demoBtn.addEventListener('click', () => {
      setOverflowOpen(false);
      startDemoForCurrentGame();
    });
  }

  const retryLoadBtn = document.getElementById('retryLoadBtn');
  if (retryLoadBtn) {
    retryLoadBtn.addEventListener('click', () => {
      window.location.reload();
    });
  }

  // Hash-based routing
  window.addEventListener('hashchange', () => {
    const hashGame = getHashGame();
    if (hashGame && hashGame !== currentGameName && GAMES.some((g) => g.id === hashGame)) {
      void loadGame(hashGame);
    }
  });

  const hashGame = getHashGame();
  const firstListedGame = GAME_LIST_ORDER.find((id) => GAMES.some((g) => g.id === id));
  const initialGame = hashGame && GAMES.some((g) => g.id === hashGame) ? hashGame : firstListedGame ?? GAMES[0]?.id;
  if (initialGame) {
    void prepareGame(initialGame);
    if (!hashGame) {
      setHashGame(initialGame);
    }
  }
})();
