import {
  GAME_GROUPS,
  GAME_LIST_ORDER,
  GAMES,
  refreshCatalog,
  type GameInstance,
  type GameMeta,
} from './catalog.js';
export { GAMES } from './catalog.js';
import { assetResolver, prepareRelease, validateGame, ReleaseReloadRequiredError, type PreparedRelease } from './release-loader.js';
import { readPreference, savePreference } from './preferences.js';
import { version as shellVersion } from '../package.json';
import {
  getStoredRecord,
  isDarkTheme,
  isZhLang,
  type GameHost,
  type GameMenuAction,
  type GameViewport,
} from '@carrick/game-sdk/game';
import { saveStoredRecord } from '@carrick/game-sdk/storage';
import { isPixelMode } from '@carrick/game-sdk/render';
import { normalizeKey } from './ui/keyboard-input.js';
import { guideHasMode, renderGuideMode, renderGuideNoteDisclosure, type GuideMode } from './ui/control-guide.js';
import { nextGridIndex, renderGameCard, settleArtworkImage } from './ui/catalog-presentation.js';
import { escapeHtml } from './ui/html.js';
import { renderLevelGridHTML, type LevelSelectState } from '@carrick/game-sdk/levelselect';

let currentGameName: string | null = null;
let currentGameInstance: GameInstance | null = null;
let currentRelease: GameMeta | null = null;
let currentStyles: (() => void) | undefined;
let currentActions: readonly GameMenuAction[] = [];
let activeHostToken = 0;
let loadController: AbortController | undefined;
let pendingGameName: string | null = null;
let previousGameName: string | null = null;
let loadOverlayActive = false;
let isRunning = false;
let isLoadingGame = false;
let prepareGameToken = 0;
const getCurrentMeta = () => currentRelease ?? GAMES.find(game => game.id === currentGameName);
let shellOverlayOpen = false;
let gameOverlayOpen = false;
let overlayCaptureOwner: GameInstance | null = null;
const guideSheetQuery = '(max-width: 720px), (max-height: 480px), (pointer: coarse)';
const isHelpOpen = () => document.getElementById('helpOverlay')?.hidden === false;
const isGuideSheet = () => window.matchMedia(guideSheetQuery).matches
  || (window.visualViewport?.width ?? window.innerWidth) <= 720
  || (window.visualViewport?.height ?? window.innerHeight) <= 480;
let guideModePreference: GuideMode | null = null;
let libraryCategory = 'all';
let previousLibraryQuery = '';
let libraryMarkup = '';
let libraryFilterMarkup = '';

function updatePresentationControls() {
  const zh = isZhLang();
  const brandLabel = `Carrick Games — ${zh ? '选择游戏' : 'Choose a game'}`;
  const brand = document.getElementById('siteBrand');
  brand?.setAttribute('aria-label', brandLabel);
  brand?.setAttribute('title', brandLabel);
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
  const open = library || menu || guide || loadOverlayActive;
  if (open && !gameOverlayOpen) {
    overlayCaptureOwner = document.pointerLockElement === document.getElementById('gameCanvas') ? currentGameInstance : null;
  }
  const stage = document.querySelector('main');
  if (stage) stage.inert = library || menu || guide;
  const canvas = document.getElementById('gameCanvas');
  if (canvas) canvas.inert = open;
  const help = document.getElementById('helpOverlay');
  if (help) help.inert = library || menu;
  const actions = document.querySelector<HTMLElement>('.header-actions');
  if (actions) actions.inert = library;
  // Both protected reading panels keep the shared tools usable for direct switching.
  for (const id of ['helpBtn', 'siteBrand']) {
    const trigger = document.getElementById(id);
    if (trigger) trigger.inert = false;
  }
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
  // Games play immediately on entry, so keyboard focus returns to the canvas.
  document.getElementById('gameCanvas')?.focus({ preventScroll: true });
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

// Routing helpers
function getHashGame(): string | null {
  const hash = window.location.hash;
  if (!hash) return null;
  const match = hash.match(/^#\/?([a-z0-9-]+)$/);
  return match ? match[1] : null;
}

function setHashGame(name: string) {
  const target = `#/${name}`;
  if (window.location.hash !== target) {
    // Commit successful play without synthesizing a new navigation intent.
    // Back/forward still emits hashchange; this write must not close newer UI.
    window.history.pushState(null, '', target);
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
  const meta = getCurrentMeta();
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
  // Some engines (WPE WebKit) expose TouchEvent yet throw when constructing
  // one; releasing held touches is best-effort and must never break a load.
  try {
    if (typeof TouchEvent !== 'undefined') document.getElementById('gameCanvas')?.dispatchEvent(new TouchEvent('touchcancel', { changedTouches: [] }));
  } catch {
    // best-effort only
  }
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
  loadOverlayActive = active;
  const el = document.getElementById('loadingOverlay');
  if (el) {
    el.classList.toggle('active', active);
    el.setAttribute('aria-busy', String(active && isLoadingGame));
  }
  syncShellOverlayState();
}

function setLoadError(message: string | null, reloadRequired = false) {
  const error = document.getElementById('loadError');
  const spinner = document.getElementById('loadingSpinner');
  const messageEl = document.getElementById('loadErrorMessage');
  const retry = document.getElementById('retryLoadBtn');
  if (error) error.hidden = message == null;
  if (spinner) spinner.hidden = message != null;
  if (messageEl) messageEl.textContent = message ?? '';
  if (retry instanceof HTMLButtonElement) {
    retry.textContent = isZhLang() ? '重试' : 'Retry';
    retry.disabled = reloadRequired;
  }
  const resume = document.getElementById('resumePreviousBtn');
  if (resume) {
    resume.hidden = !message || (!currentGameInstance && !previousGameName);
    resume.textContent = currentGameInstance && isRunning
      ? (isZhLang() ? '继续之前的游戏' : 'Resume previous game')
      : (isZhLang() ? '重新打开之前的游戏' : 'Restart previous game');
  }
  const choose = document.getElementById('chooseAnotherBtn');
  if (choose) { choose.hidden = !message; choose.textContent = isZhLang() ? '选择其他游戏' : 'Choose another game'; }
  const reload = document.getElementById('reloadAppBtn');
  if (reload) { reload.hidden = !message; reload.textContent = isZhLang() ? '重新加载页面' : 'Reload application'; }
  if (message) document.getElementById('loadingStatus')?.replaceChildren();
}

/** Live state marker for automated checks; not part of the game API. */
function setGameRunningFlag(running: boolean) {
  document.getElementById('gameCanvas')?.setAttribute('data-game-running', String(running));
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
  // Help describes the pinned running release, never a newer catalog candidate.
  const meta = getCurrentMeta();
  const zh = isZhLang();
  if (!meta) {
    container.hidden = false;
    container.innerHTML = `<p class="guide-section-notes">${zh ? '选择游戏后，这里会显示操作说明。' : 'Choose a game to see its controls.'}</p>`;
    for (const id of ['touchHelp', 'guideNotes', 'helpGameName']) {
      const element = document.getElementById(id);
      if (element) element.textContent = '';
    }
    const modes = document.getElementById('guideModes');
    if (modes) modes.hidden = true;
    return;
  }
  const preferred = guideModePreference ?? (window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard');
  const keyboardAvailable = guideHasMode(meta.controls, 'keyboard');
  const touchAvailable = guideHasMode(meta.controls, 'touch');
  const mode = guideHasMode(meta.controls, preferred) ? preferred : touchAvailable ? 'touch' : 'keyboard';
  const guide = document.getElementById('helpOverlay');
  if (guide) guide.dataset.inputMode = mode;
  container.innerHTML = renderGuideMode(meta.controls, zh, 'keyboard');
  container.hidden = mode !== 'keyboard';
  const touch = document.getElementById('touchHelp');
  if (touch) {
    touch.innerHTML = renderGuideMode(meta.controls, zh, 'touch');
    touch.hidden = mode !== 'touch';
  }
  const notes = document.getElementById('guideNotes');
  if (notes) notes.innerHTML = renderGuideNoteDisclosure(meta.controls, zh, mode);
  const modes = document.getElementById('guideModes');
  if (modes) {
    modes.hidden = !(keyboardAvailable && touchAvailable);
    modes.setAttribute('aria-label', zh ? '操作方式' : 'Input method');
    modes.querySelectorAll<HTMLButtonElement>('[data-guide-mode]').forEach(button => {
      const keyboard = button.dataset.guideMode === 'keyboard';
      button.textContent = keyboard ? (zh ? '键盘与鼠标' : 'Keyboard & mouse') : (zh ? '触屏' : 'Touch');
      button.setAttribute('aria-pressed', String(button.dataset.guideMode === mode));
    });
  }
  const name = document.getElementById('helpGameName');
  if (name) name.textContent = zh ? meta.nameZh : meta.name;
}

function renderControls() {
  renderStats();
  renderKeyboard();
  renderGameActions();
}

// The shell reports host geometry only. Renderer details and QA commands live
// with their game, so a pinned shell never reaches into a newer game's internals.
(window as unknown as { __GAME_VIEWPORT_DEBUG__?: unknown }).__GAME_VIEWPORT_DEBUG__ = {
  info() {
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement | null;
    if (!currentGameInstance || !canvas) return null;
    return {
      ...currentGameInstance.getDiagnostics?.(),
      id: currentGameName,
      width: Number(canvas.dataset.logicalWidth),
      height: Number(canvas.dataset.logicalHeight),
      shellOverlayOpen,
    };
  },
};

function getKeysFromEvent(e: KeyboardEvent): string[] {
  const keys: string[] = [e.key];
  if (e.code === 'Space') keys.push(' ');
  if (e.key.length === 1) keys.push(e.key.toLowerCase());
  const meta = getCurrentMeta();
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

function createGameHost(meta: GameMeta, canvas: HTMLCanvasElement, token: number): GameHost {
  const ownsHost = () => activeHostToken === token;
  return {
    canvas,
    logicalWidth: meta.canvasSize.width,
    logicalHeight: meta.canvasSize.height,
    assetUrl: assetResolver(meta),
    isDarkTheme,
    isZhLang,
    isPixelMode,
    getRecord: getStoredRecord,
    reportScore(score) {
      if (!ownsHost()) return;
      saveRecord(meta.id, score);
      window.dispatchEvent(new CustomEvent('carrick:score', { detail: score }));
      renderStats();
    },
    requestShellRender: () => { if (ownsHost()) renderControls(); },
    presentation: {
      openControls: () => { if (ownsHost()) setHelpOpen(true); },
      isControlsOpen: () => ownsHost() && isHelpOpen(),
      setActions(actions) {
        if (!ownsHost()) return;
        currentActions = actions.filter(action => action && typeof action.id === 'string' && typeof action.label === 'string' && typeof action.labelZh === 'string' && typeof action.run === 'function').slice(0, 16);
        renderGameActions();
      },
    },
  };
}

function renderGameActions() {
  const container = document.getElementById('currentGameActions');
  if (container) {
    const focusedAction = document.activeElement instanceof HTMLElement && container.contains(document.activeElement)
      && !document.getElementById('overflowMenu')?.hidden ? document.activeElement.dataset.actionId : undefined;
    container.replaceChildren();
    for (const action of currentActions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-action';
      button.dataset.actionId = action.id;
      button.textContent = isZhLang() ? action.labelZh : action.label;
      button.setAttribute('aria-label', button.textContent);
      button.disabled = !!action.disabled || isLoadingGame;
      if (action.checked !== undefined) button.setAttribute('aria-pressed', String(action.checked));
      const owner = activeHostToken;
      button.addEventListener('click', () => {
        if (owner !== activeHostToken || button.disabled) return;
        // Opening a game-owned panel must not briefly re-capture the pointer.
        if (action.checked === undefined) setOverflowOpen(false);
        try { action.run(); renderGameActions(); }
        catch (error) { failCurrentGame(error); }
      });
      container.append(button);
    }
    container.hidden = currentActions.length === 0;
    if (focusedAction) Array.from(container.querySelectorAll<HTMLButtonElement>('button:not([disabled])'))
      .find(button => button.dataset.actionId === focusedAction)?.focus({ preventScroll: true });
  }
  for (const id of ['menuGameVersion', 'helpGameVersion']) {
    const element = document.getElementById(id);
    if (element) { element.textContent = currentRelease ? `v${currentRelease.version}` : ''; element.hidden = !currentRelease; }
  }
  const shell = document.getElementById('shellVersion');
  if (shell) { shell.textContent = `Carrick Games ${shellVersion}`; shell.hidden = false; }
  const update = document.getElementById('updateGameBtn') as HTMLButtonElement | null;
  const latest = GAMES.find(game => game.id === currentGameName);
  if (update) {
    update.hidden = !currentRelease || !latest || latest.entry === currentRelease.entry;
    update.disabled = isLoadingGame;
    if (latest) update.textContent = isZhLang() ? `更新到 v${latest.version}（重新开始）` : `Update to v${latest.version} (restart)`;
  }
}

function discardCurrentGame() {
  const instance = currentGameInstance;
  currentGameInstance = null;
  currentGameName = null;
  currentRelease = null;
  currentActions = [];
  activeHostToken = -1;
  isRunning = false;
  stopScorePolling();
  setGameRunningFlag(false);
  try { instance?.destroy(); }
  catch (error) { try { instance?.stop(); } catch { /* explicit reload remains available */ } throw error; }
  finally { currentStyles?.(); currentStyles = undefined; }
}

function cancelPendingLoad() {
  ++prepareGameToken;
  loadController?.abort();
  loadController = undefined;
  pendingGameName = null;
  isLoadingGame = false;
  setLoadError(null);
  setLoadingOverlay(false);
  updateActionButton();
  renderGameActions();
}

export async function prepareGame(name: string, preserveUi = false): Promise<boolean> {
  const token = ++prepareGameToken;
  loadController?.abort();
  const controller = new AbortController();
  loadController = controller;
  pendingGameName = name;
  isLoadingGame = true;
  setLoadingOverlay(true);
  if (!preserveUi) setHelpOpen(false, false);
  setLoadError(null);
  updateActionButton();
  renderGameActions();
  const meta = GAMES.find(game => game.id === name);
  const title = meta ? (isZhLang() ? meta.nameZh : meta.name) : name;
  const status = document.getElementById('loadingStatus');
  if (status) status.textContent = isZhLang() ? `正在加载 ${title}…` : `Loading ${title}…`;
  let prepared: PreparedRelease | undefined;
  let mounting = false;
  const slow = window.setTimeout(() => {
    if (token === prepareGameToken && isLoadingGame && status) status.textContent = isZhLang() ? `仍在加载 ${title}，也可以选择其他游戏。` : `Still loading ${title}. You can choose another game.`;
  }, 5000);
  const timeout = window.setTimeout(() => controller.abort(), 45_000);
  try {
    if (!meta) throw new Error('Game is not available in the current catalog');
    // The old simulation remains paused and intact until the complete ESM/CSS preflight succeeds.
    prepared = await prepareRelease(meta, controller.signal);
    if (token !== prepareGameToken) { prepared.releaseStyles(); return false; }
    previousGameName = currentGameName ?? previousGameName;
    mounting = true;
    discardCurrentGame();
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    canvas.tabIndex = 0;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    delete canvas.dataset.parkingState;
    canvas.dataset.gameId = meta.id;
    canvas.dataset.gameVersion = meta.version;
    canvas.dataset.gameRevision = meta.revision;
    canvas.dataset.gameAssetBase = meta.assetBase;
    activeHostToken = token;
    currentRelease = meta;
    currentStyles = prepared.releaseStyles;
    const next = validateGame(prepared.module.create(createGameHost(meta, canvas, token)));
    currentGameInstance = next;
    next.prepare();
    lastViewportKey = '';
    fitGameCanvas();
    next.setPresentationPaused?.(gameOverlayOpen);
    next.onShellOverlayChange?.(gameOverlayOpen);
    next.start();
    currentGameName = name;
    isRunning = true;
    isLoadingGame = false;
    pendingGameName = null;
    setGameRunningFlag(true);
    savePreference('cg-last-game', name);
    setLoadingOverlay(false);
    startScorePolling();
    updateActionButton();
    updateGameTitle();
    renderControls();
    document.querySelectorAll('.game-list-item').forEach(element => {
      const active = element.getAttribute('data-id') === name;
      element.classList.toggle('active', active);
      element.setAttribute('aria-current', String(active));
    });
    fitGameCanvas();
    focusGameSurface();
    return true;
  } catch (error) {
    if (token !== prepareGameToken) { prepared?.releaseStyles(); return false; }
    if (mounting) {
      try { discardCurrentGame(); } catch (cleanupError) { console.error('Game cleanup failed', cleanupError); }
      prepared?.releaseStyles();
    }
    isLoadingGame = false;
    const unavailable = !meta;
    const reloadRequired = error instanceof ReleaseReloadRequiredError;
    setLoadError(reloadRequired
      ? (isZhLang() ? '浏览器未能恢复此游戏资源。请重新加载页面，或返回之前的游戏。' : 'The browser could not recover this game resource. Reload the application or return to your previous game.')
      : isZhLang()
        ? (unavailable ? '此游戏暂不可用，请选择其他游戏。' : '游戏加载失败，可以重试或选择其他游戏。')
        : (unavailable ? 'This game is unavailable. Please choose another game.' : 'The game could not load. Retry or choose another game.'), reloadRequired);
    setLoadingOverlay(true);
    updateActionButton();
    renderGameActions();
    console.error('Game load failed:', error);
    return false;
  } finally {
    window.clearTimeout(slow);
    window.clearTimeout(timeout);
    if (loadController === controller) loadController = undefined;
  }
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
  const meta = getCurrentMeta();
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

function failCurrentGame(error: unknown) {
  const failedName = currentGameName;
  ++prepareGameToken;
  loadController?.abort();
  loadController = undefined;
  pendingGameName = failedName;
  previousGameName = failedName ?? previousGameName;
  try { discardCurrentGame(); } catch (cleanupError) { console.error('Game cleanup failed', cleanupError); }
  setOverflowOpen(false);
  setHelpOpen(false, false);
  closeGameLibrary();
  isLoadingGame = false;
  setLoadError(isZhLang()
    ? '游戏操作未能完成。可以重新打开游戏，或选择其他游戏。'
    : 'The game action could not finish. Restart the game or choose another game.');
  setLoadingOverlay(true);
  updateActionButton();
  renderControls();
  console.error('Game action failed', error);
}

function startPreparedGame() {
  if (!currentGameInstance || isLoadingGame) return;
  try {
    if (isRunning) {
      currentGameInstance.restart();
    } else {
      currentGameInstance.start();
    }
    isRunning = true;
    setGameRunningFlag(true);
    updateActionButton();
    startScorePolling();
  } catch (error) {
    failCurrentGame(error);
  }
}

function startDemoForCurrentGame() {
  if (!currentGameInstance || isLoadingGame) return;
  const demoStarter = currentGameInstance.startDemo;
  if (typeof demoStarter !== 'function') return;
  try {
    demoStarter.call(currentGameInstance);
    isRunning = true;
    setGameRunningFlag(true);
    updateActionButton();
    startScorePolling();
  } catch (error) {
    failCurrentGame(error);
  }
}

export async function loadGame(name: string, replace = false, preserveUi = false) {
  if (!replace && name === currentGameName && currentGameInstance && isRunning) {
    cancelPendingLoad();
    closeGameLibrary();
    focusGameSurface();
    return;
  }
  if (!preserveUi) closeGameLibrary();
  if (await prepareGame(name, preserveUi)) {
    setHashGame(name);
    focusGameSurface();
  }
}

/** Refresh discovery in the background without replacing the running release. */
async function refreshLibraryCatalog() {
  const before = JSON.stringify(GAMES);
  try {
    await refreshCatalog();
    renderGameActions();
    if (before !== JSON.stringify(GAMES) && document.getElementById('gameLibrary')?.classList.contains('open')) {
      renderGameList((document.getElementById('searchInput') as HTMLInputElement | null)?.value || '');
    }
  } catch (error) {
    // Discovery is optional while cached entries remain usable; never turn it into a game failure.
    console.warn('Could not refresh the game library; keeping cached entries.', error);
  }
}

function setGameLibraryOpen(open: boolean) {
  const library = document.getElementById('gameLibrary');
  const trigger = document.getElementById('gamePickerBtn');
  if (!library || !trigger) return;
  const wasOpen = library.classList.contains('open');
  if (wasOpen === open) return;
  library.classList.toggle('open', open);
  trigger.setAttribute('aria-expanded', String(open));
  document.getElementById('siteBrand')?.setAttribute('aria-expanded', String(open));
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
    void refreshLibraryCatalog();
  } else {
    focusGameSurface();
    library.setAttribute('aria-hidden', 'true');
  }
  syncShellOverlayState();
}

function closeGameLibrary() {
  setGameLibraryOpen(false);
}

/** Reveal focused panel controls without scrolling or refitting the game viewport. */
function focusOverlayTarget(target: HTMLElement | undefined, scroller: HTMLElement | null) {
  if (!target) return;
  target.focus({ preventScroll: true });
  if (!scroller?.contains(target) || target === scroller) return;
  const bounds = scroller.getBoundingClientRect();
  const item = target.getBoundingClientRect();
  if (item.top < bounds.top) scroller.scrollTop += item.top - bounds.top;
  else if (item.bottom > bounds.bottom) scroller.scrollTop += item.bottom - bounds.bottom;
}

function setOverflowOpen(open: boolean) {
  const menu = document.getElementById('overflowMenu');
  const trigger = document.getElementById('overflowBtn');
  if (!menu || !trigger) return;
  const wasOpen = !menu.hidden;
  const hadFocus = menu.contains(document.activeElement);
  menu.hidden = !open;
  menu.dataset.presentation = isGuideSheet() ? 'sheet' : 'reference';
  if (open) menu.setAttribute('aria-owns', 'siteBrand helpBtn overflowBtn'); else menu.removeAttribute('aria-owns');
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
  const menu = document.getElementById('overflowMenu');
  if (menu) menu.dataset.presentation = sheet ? 'sheet' : 'reference';
  help.setAttribute('role', 'dialog');
  help.setAttribute('aria-modal', 'true');
  // Keep the visible toggle in the modal's accessibility and keyboard scope.
  if (isHelpOpen()) help.setAttribute('aria-owns', 'siteBrand helpBtn overflowBtn'); else help.removeAttribute('aria-owns');
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

function renderLibraryFilters(zh: boolean, matches: GameMeta[]) {
  const heading = document.getElementById('libraryHeadingTitle');
  if (heading) heading.textContent = zh ? '选择游戏' : 'Choose a game';
  const summary = document.getElementById('librarySummary');
  if (summary) summary.textContent = zh ? '留一点时间，玩点喜欢的。' : 'A little space to play.';
  const search = document.getElementById('searchInput') as HTMLInputElement | null;
  if (search) {
    search.placeholder = zh ? '找一款想玩的游戏…' : 'Find your next game…';
    search.setAttribute('aria-label', zh ? '搜索游戏' : 'Search games');
  }
  const filters = document.getElementById('libraryFilters');
  if (filters) {
    const focusedCategory = document.activeElement instanceof HTMLElement && filters.contains(document.activeElement) ? document.activeElement.dataset.category : undefined;
    // A removed category remains selectable until the player deliberately clears it.
    const groups = [{ id: 'all', name: 'All games', nameZh: '全部' }, ...GAME_GROUPS.filter(group => group.id === libraryCategory || GAMES.some(game => game.group === group.id))];
    filters.setAttribute('aria-label', zh ? '游戏分类' : 'Game category');
    const markup = groups.map(group => {
      const count = group.id === 'all' ? matches.length : matches.filter(game => game.group === group.id).length;
      return `<button class="library-filter" type="button" data-category="${escapeHtml(group.id)}" aria-pressed="${libraryCategory === group.id}" aria-controls="gameList"><span${group.id === 'all' ? '' : ' class="game-list-group"'}>${escapeHtml(zh ? group.nameZh : group.name)}</span><span class="game-group-count" aria-hidden="true">${count}</span></button>`;
    }).join('');
    if (markup !== libraryFilterMarkup) {
      filters.innerHTML = markup;
      libraryFilterMarkup = markup;
      if (focusedCategory) Array.from(filters.querySelectorAll<HTMLButtonElement>('[data-category]')).find(button => button.dataset.category === focusedCategory)?.focus({ preventScroll: true });
    }
  }
  const hints = document.getElementById('libraryKeyboardHints');
  const hintMarkup = `<span><kbd>↑</kbd><kbd>↓</kbd> ${zh ? '浏览' : 'Browse'}</span><span><kbd>↵</kbd> ${zh ? '开始玩' : 'Play'}</span><span><kbd>Esc</kbd> ${zh ? '关闭' : 'Close'}</span>`;
  if (hints && hints.innerHTML !== hintMarkup) hints.innerHTML = hintMarkup;
}

function renderGameList(filter = '') {
  const list = document.getElementById('gameList');
  if (!list) return;
  const zh = isZhLang();
  const term = filter.trim().toLowerCase();
  const scrollTop = term === previousLibraryQuery ? list.scrollTop : 0;
  const content = list.parentElement;
  const contentScrollTop = term === previousLibraryQuery ? content?.scrollTop ?? 0 : 0;
  previousLibraryQuery = term;
  const oldCards = Array.from(list.querySelectorAll<HTMLButtonElement>('.game-list-item'));
  const focused = document.activeElement instanceof HTMLElement && list.contains(document.activeElement) ? document.activeElement : null;
  const focusedId = focused?.closest<HTMLButtonElement>('.game-list-item')?.dataset.id;
  const focusedIndex = oldCards.findIndex(card => card.dataset.id === focusedId);
  const matches = GAMES.filter(game => !term || [game.name, game.nameZh, game.desc, game.descZh].some(text => text.toLowerCase().includes(term)));
  renderLibraryFilters(zh, matches);
  const filtered = matches.filter(game => libraryCategory === 'all' || game.group === libraryCategory).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const count = document.getElementById('libraryResultCount');
  const countText = zh ? `${filtered.length} 款游戏` : `${filtered.length} ${filtered.length === 1 ? 'game' : 'games'}`;
  if (count && count.textContent !== countText) count.textContent = countText;
  const markup = filtered.length ? filtered.map(game => renderGameCard(game, currentGameName, zh)).join('')
    : `<div class="search-empty"><strong>${zh ? '暂时没有找到' : 'No games found'}</strong><span>${zh ? '换个关键词，或者看看全部游戏。' : 'Try another name, or make room for something different.'}</span><button type="button" class="quiet-button" data-clear-search>${zh ? '查看全部游戏' : 'Show all games'}</button></div>`;
  // Preserve image readiness and actual focused DOM nodes when discovery is unchanged.
  if (markup !== libraryMarkup) {
    list.innerHTML = markup;
    libraryMarkup = markup;
    if (focused) {
      const cards = Array.from(list.querySelectorAll<HTMLButtonElement>('.game-list-item'));
      const target = cards.find(card => card.dataset.id === focusedId)
        ?? cards[Math.min(Math.max(focusedIndex, 0), cards.length - 1)]
        ?? list.querySelector<HTMLElement>('[data-clear-search]');
      target?.focus({ preventScroll: true });
    }
  }
  list.scrollTop = scrollTop;
  if (content) content.scrollTop = contentScrollTop;
}

function setLang(lang: 'en' | 'zh') {
  document.documentElement.setAttribute('data-lang', lang);
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  savePreference('cg-lang', lang);
  updateActionButton();
  updateGameTitle();
  renderControls();
  renderGameList((document.getElementById('searchInput') as HTMLInputElement)?.value || '');
  const languageLabel = document.getElementById('languageMenuLabel');
  const themeLabel = document.getElementById('themeMenuLabel');
  const pickerLabel = document.getElementById('pickerMenuLabel');
  const overflowButton = document.getElementById('overflowBtn');
  if (languageLabel) languageLabel.textContent = lang === 'zh' ? '语言' : 'Language';
  if (themeLabel) themeLabel.textContent = lang === 'zh' ? '主题' : 'Theme';
  if (pickerLabel) pickerLabel.textContent = lang === 'zh' ? '选择游戏' : 'Choose a game';
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
  repaintCurrentFrame();
}

function setTheme(mode: 'light' | 'dark' | 'system') {
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') {
    root.setAttribute('data-theme', mode);
  } else {
    root.removeAttribute('data-theme');
  }
  savePreference('cg-theme', mode);
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
(async function init() {
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

  for (const id of ['siteBrand', 'gamePickerBtn']) {
    document.getElementById(id)?.addEventListener('click', () => {
      const open = !document.getElementById('gameLibrary')?.classList.contains('open');
      setGameLibraryOpen(open);
    });
  }
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
    // A game action may synchronously replace its own button while bubbling.
    // The dispatch path, unlike target.closest(), retains the original menu.
    if (!event.composedPath().some(node => node instanceof Element && node.matches('.header-actions'))) setOverflowOpen(false);
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
      const searching = event.target === document.getElementById('searchInput');
      const cardNavigation = activeIndex >= 0 && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key);
      if (cardNavigation || (searching && ['ArrowDown', 'ArrowUp'].includes(event.key))) {
        event.preventDefault();
        const firstTop = rows[0]?.offsetTop;
        const columns = rows.filter(row => row.offsetTop === firstTop).length || 1;
        const next = nextGridIndex(activeIndex, rows.length, columns, event.key);
        rows[next]?.focus({ preventScroll: true });
        rows[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } else if (event.key === 'Enter' && searching) {
        event.preventDefault();
        rows[0]?.click();
      } else if (event.key === 'Tab') {
        const focusable = Array.from(library.querySelectorAll<HTMLElement>('.library-dialog button:not([disabled]), .library-dialog input')).filter(element => element.getClientRects().length > 0);
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
        const buttons = [...menu.querySelectorAll<HTMLElement>('button:not([disabled]), summary'), document.getElementById('siteBrand')!, document.getElementById('helpBtn')!, document.getElementById('overflowBtn')!]
          .filter(el => el.getClientRects().length > 0);
        const index = buttons.indexOf(document.activeElement as HTMLElement);
        const next = index < 0 ? (event.shiftKey ? buttons.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        event.preventDefault();
        focusOverlayTarget(buttons[next], menu.querySelector<HTMLElement>('.menu-body'));
      }
    } else if (isHelpOpen() && event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); closeUiFromUser(() => setHelpOpen(false), event);
    } else if (isHelpOpen()) {
      event.stopPropagation();
      if (event.key === 'Tab') {
        const help = document.getElementById('helpOverlay')!;
        const targets = [...help.querySelectorAll<HTMLElement>('button:not([disabled]), summary, [tabindex="0"]'), document.getElementById('siteBrand')!, document.getElementById('helpBtn')!, document.getElementById('overflowBtn')!].filter(el => el.getClientRects().length > 0);
        const index = targets.indexOf(document.activeElement as HTMLElement);
        const next = index < 0 ? (event.shiftKey ? targets.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length;
        event.preventDefault();
        focusOverlayTarget(targets[next], document.getElementById('guideBody'));
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

  window.visualViewport?.addEventListener('resize', updateGuidePresentation);
  document.getElementById('guideModes')?.addEventListener('click', event => {
    const mode = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-guide-mode]')?.dataset.guideMode : undefined;
    if (mode !== 'keyboard' && mode !== 'touch') return;
    guideModePreference = mode;
    renderKeyboard();
    document.getElementById('guideBody')?.scrollTo(0, 0);
  });
  document.querySelectorAll<HTMLElement>('.lang-btn').forEach((button) => {
    button.addEventListener('click', () => {
      setLang(button.dataset.lang === 'en' ? 'en' : 'zh');
    });
  });
  document.querySelectorAll<HTMLElement>('.theme-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.set;
      if (mode === 'light' || mode === 'dark' || mode === 'system') setTheme(mode);
    });
  });
  const savedLang = readPreference('cg-lang');
  const savedTheme = readPreference('cg-theme');
  setLang(savedLang === 'en' ? 'en' : 'zh');
  setTheme(savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'system');
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!document.documentElement.hasAttribute('data-theme')) repaintCurrentFrame();
  });

  const search = document.getElementById('searchInput') as HTMLInputElement | null;
  if (search) {
    search.addEventListener('input', () => renderGameList(search.value));
  }

  document.getElementById('libraryFilters')?.addEventListener('click', event => {
    const category = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-category]')?.dataset.category : undefined;
    if (!category || category === libraryCategory) return;
    libraryCategory = category;
    document.getElementById('gameList')?.scrollTo(0, 0);
    document.querySelector('.library-content')?.scrollTo(0, 0);
    renderGameList(search?.value || '');
  });
  const gameList = document.getElementById('gameList');
  if (gameList) {
    const getGameId = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLButtonElement>('.game-list-item')?.dataset.id : undefined;
    for (const type of ['load', 'error']) gameList.addEventListener(type, event => {
      const target = event.target;
      if (target instanceof HTMLImageElement) settleArtworkImage(target, type === 'load' && target.naturalWidth > 0);
    }, true);
    // Discovery never imports game code; selection alone enters the release preflight.
    gameList.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('[data-clear-search]')) {
        libraryCategory = 'all';
        if (search) search.value = '';
        gameList.scrollTo(0, 0);
        document.querySelector('.library-content')?.scrollTo(0, 0);
        renderGameList();
        search?.focus({ preventScroll: true });
        return;
      }
      const id = getGameId(event.target);
      if (!id) return;
      if (id === currentGameName && currentGameInstance && isRunning) {
        closeUiFromUser(() => { cancelPendingLoad(); closeGameLibrary(); }, event);
      } else void loadGame(id);
    });
  }

  document.getElementById('restartBtn')?.addEventListener('click', () => {
    setOverflowOpen(false);
    startPreparedGame();
  });
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

  const demoBtn = document.getElementById('demoBtn') as HTMLButtonElement | null;
  if (demoBtn) {
    demoBtn.addEventListener('click', () => {
      setOverflowOpen(false);
      startDemoForCurrentGame();
    });
  }

  const initialChoice = () => {
    const hash = getHashGame();
    if (hash) return hash;
    if (window.location.hash) return null;
    const last = readPreference('cg-last-game');
    return (last && GAMES.some(game => game.id === last) ? last : null)
      ?? (GAMES.some(game => game.id === 'gacha') ? 'gacha' : GAME_LIST_ORDER[0]);
  };
  const catalogFailure = (error: unknown) => {
    isLoadingGame = false;
    setLoadError(isZhLang() ? '暂时无法获取游戏库，请重试。' : 'The game library is unavailable. Please retry.');
    setLoadingOverlay(true);
    console.error(error);
  };
  const loadFromCatalog = (requested: string | null, replace = false) => {
    // Reserve intent before discovery, not after it: a slow refresh must never
    // undo a newer card, hash, retry, or explicit current-game resume.
    const token = ++prepareGameToken;
    loadController?.abort();
    loadController = undefined;
    pendingGameName = requested;
    isLoadingGame = true;
    setLoadError(null);
    setLoadingOverlay(true);
    void refreshCatalog().then(async () => {
      if (token !== prepareGameToken) return;
      const target = requested ?? initialChoice();
      if (!target) throw new Error('No available game for this link');
      await loadGame(target, replace);
    }).catch(error => { if (token === prepareGameToken) catalogFailure(error); });
  };
  document.getElementById('retryLoadBtn')?.addEventListener('click', () => loadFromCatalog(pendingGameName, true));
  document.getElementById('chooseAnotherBtn')?.addEventListener('click', () => setGameLibraryOpen(true));
  document.getElementById('reloadAppBtn')?.addEventListener('click', () => window.location.reload());
  document.getElementById('resumePreviousBtn')?.addEventListener('click', event => {
    if (currentGameInstance && isRunning) {
      closeUiFromUser(cancelPendingLoad, event);
      if (currentGameName) setHashGame(currentGameName);
    } else if (previousGameName) void loadGame(previousGameName, true);
  });
  document.getElementById('updateGameBtn')?.addEventListener('click', () => {
    if (!currentGameName) return;
    setOverflowOpen(false);
    void loadGame(currentGameName, true);
  });

  window.addEventListener('hashchange', () => {
    const target = getHashGame();
    if (target && target === currentGameName && currentGameInstance && isRunning) {
      cancelPendingLoad(); closeGameLibrary();
      return; // Hash/history navigation is never a pointer-capture gesture.
    }
    loadFromCatalog(target);
  });

  const initialToken = ++prepareGameToken;
  isLoadingGame = true;
  setLoadingOverlay(true);
  const status = document.getElementById('loadingStatus');
  if (status) status.textContent = isZhLang() ? '正在获取游戏库…' : 'Loading the game library…';
  try {
    await refreshCatalog();
    if (initialToken !== prepareGameToken) return;
    renderGameList((document.getElementById('searchInput') as HTMLInputElement | null)?.value || '');
    const initialGame = initialChoice();
    if (!initialGame) throw new Error('No available game for this link');
    // A library/help panel opened during discovery is a newer user choice.
    // Prepare default play beneath it, paused, rather than dismissing that UI.
    await loadGame(initialGame, false, true);
  } catch (error) { if (initialToken === prepareGameToken) catalogFailure(error); }
})().catch(error => {
  isLoadingGame = false;
  setLoadError(isZhLang() ? '暂时无法打开游戏，请重试或选择其他游戏。' : 'The game could not open. Retry or choose another game.');
  setLoadingOverlay(true);
  console.error(error);
});
