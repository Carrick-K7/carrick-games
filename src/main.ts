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
} from './core/game.js';
import { saveStoredRecord } from './core/storage.js';
import { isPixelMode } from './core/render.js';
import { normalizeKey } from './ui/keyboard-input.js';
import { renderVirtualKeyboard } from './ui/virtual-keyboard.js';
import { renderLevelGridHTML, type LevelSelectState } from './core/levelselect.js';

let currentGameName: string | null = null;
let currentGameInstance: GameInstance | null = null;
let isRunning = false;
let isLoadingGame = false;
let prepareGameToken = 0;
const gameClassCache = new Map<string, Promise<GameCtor>>();

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
  if (hintEl) hintEl.textContent = zh ? '点击开始' : 'Click to start';
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
  container.innerHTML = renderVirtualKeyboard(meta.controls, zh);
  bindVirtualKeyboard();
}

function renderControls() {
  renderStats();
  renderKeyboard();
}

// Debug hook for automated visual checks (?cs3d=force is separate). E2E and
// humans alike should never rely on this — it is not part of the game API.
if (typeof window !== 'undefined') {
  (window as unknown as { __CS_DEBUG__?: unknown }).__CS_DEBUG__ = {
    look(angle: number, pitch = 0) {
      const g = currentGameInstance as unknown as { angle: number; pitch: number } | null;
      if (!g || currentGameName !== 'counterstrike') return;
      g.angle = angle;
      g.pitch = pitch;
    },
    tp(x: number, y: number) {
      const g = currentGameInstance as unknown as {
        px: number;
        py: number;
        fighters?: { x: number; y: number }[];
      } | null;
      if (!g || currentGameName !== 'counterstrike') return;
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
      if (!g || currentGameName !== 'counterstrike' || !g.fighters || !g.activeWeapon) return null;
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
      if (!g || currentGameName !== 'counterstrike' || !g.fighters || !g.fireShot) return;
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
      if (!g || currentGameName !== 'counterstrike' || !p || !g.makeWeapon) return;
      p.primary = g.makeWeapon(weaponId);
      p.slot = 'primary';
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
  };
}

function bindVirtualKeyboard() {
  const vk = document.getElementById('vkeyboard');
  if (!vk) return;
  let activeVirtualKey: string | null = null;
  const releaseKey = () => {
    if (!activeVirtualKey) return;
    const event = new KeyboardEvent('keyup', {
      key: activeVirtualKey,
      code: activeVirtualKey === ' ' ? 'Space' : undefined,
      bubbles: true,
    });
    window.dispatchEvent(event);
    getKeysFromEvent(event).forEach((k) => pressedKeys.delete(k));
    updateVirtualKeyboardHighlight(pressedKeys);
    activeVirtualKey = null;
  };

  vk.addEventListener('mousedown', (e) => {
    const target = (e.target as HTMLElement).closest('.vkey[data-key]') as HTMLElement | null;
    const key = target?.getAttribute('data-key');
    if (!key) return;
    e.preventDefault();
    activeVirtualKey = key;
    const keyboardEvent = new KeyboardEvent('keydown', {
      key,
      code: key === ' ' ? 'Space' : undefined,
      bubbles: true,
    });
    window.dispatchEvent(keyboardEvent);
    getKeysFromEvent(keyboardEvent).forEach((k) => pressedKeys.add(k));
    updateVirtualKeyboardHighlight(pressedKeys);
  });
  vk.addEventListener('mouseup', () => {
    releaseKey();
  });
  vk.addEventListener('mouseleave', () => {
    releaseKey();
  });
  vk.addEventListener('touchstart', (e) => {
    const target = (e.target as HTMLElement).closest('.vkey[data-key]') as HTMLElement | null;
    const key = target?.getAttribute('data-key');
    if (!key) return;
    e.preventDefault();
    activeVirtualKey = key;
    const keyboardEvent = new KeyboardEvent('keydown', {
      key,
      code: key === ' ' ? 'Space' : undefined,
      bubbles: true,
    });
    window.dispatchEvent(keyboardEvent);
    getKeysFromEvent(keyboardEvent).forEach((k) => pressedKeys.add(k));
    updateVirtualKeyboardHighlight(pressedKeys);
  });
  vk.addEventListener('touchend', releaseKey);
  vk.addEventListener('touchcancel', releaseKey);
}

export async function prepareGame(name: string) {
  const meta = GAMES.find((g) => g.id === name);
  if (!meta) return;
  const token = ++prepareGameToken;

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
  setLoadingOverlay(true);
  updateGameTitle();

  document.querySelectorAll('.game-list-item').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-id') === name);
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
  updateFullscreenToggle(meta);
  setStartOverlay(true);
  lastFittedCanvasWidth = 0;
  requestAnimationFrame(fitGameCanvas);
}

/** Some games opt out of the shell fullscreen control (e.g. kiosk-style UX). */
function updateFullscreenToggle(meta: GameMeta) {
  const btn = document.getElementById('fullscreenBtn');
  if (!btn) return;
  // Inline style: .icon-btn's display:flex would otherwise override [hidden].
  btn.style.display = meta.fullscreen === false ? 'none' : '';
}

/**
 * Fit the game canvas to the available stage space. Wide fine-pointer layouts
 * reserve quiet side rails for contextual controls; compact layouts keep the
 * controls below. Height remains inside the first viewport. The backing store is re-sized by
 * `setDisplayScale`, so the upscaled picture stays sharp.
 */
let lastFittedCanvasWidth = 0;

function fitGameCanvas() {
  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement | null;
  const wrapper = document.getElementById('canvasWrapper');
  if (!canvas || !wrapper || !currentGameInstance) return;
  if (wrapper.classList.contains('fullscreen')) return;
  const meta = GAMES.find((g) => g.id === currentGameName);
  if (!meta) return;
  const { width: lw, height: lh } = meta.canvasSize;
  const aspect = lh / lw;
  const stage = wrapper.parentElement;
  if (!stage) return;
  const useSideRails = window.matchMedia('(min-width: 960px) and (pointer: fine)').matches;
  const stageW = stage.clientWidth;
  const railReserve = Math.max(460, Math.min(600, stageW * 0.4));
  const colW = useSideRails ? stageW - railReserve : wrapper.clientWidth;
  if (colW <= 0) return;
  const top = wrapper.getBoundingClientRect().top;
  const availH = useSideRails
    ? stage.clientHeight - 8
    : window.innerHeight - top - 14 - 44 - 12;
  const cssW = Math.round(Math.max(280, Math.min(colW, availH / aspect, lw * 2.5)));
  const cssWidth = `${cssW}px`;
  stage.style.setProperty('--canvas-css-width', cssWidth);
  wrapper.style.setProperty('--canvas-css-width', cssWidth);
  if (cssW === lastFittedCanvasWidth) return;
  lastFittedCanvasWidth = cssW;
  currentGameInstance.setDisplayScale?.(cssW);
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
  setHashGame(name);
}

function setGameLibraryOpen(open: boolean) {
  const library = document.getElementById('gameLibrary');
  const trigger = document.getElementById('gamePickerBtn');
  if (!library || !trigger) return;
  library.classList.toggle('open', open);
  library.setAttribute('aria-hidden', String(!open));
  trigger.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('library-open', open);
  if (open) {
    renderGameList((document.getElementById('searchInput') as HTMLInputElement | null)?.value || '');
    window.setTimeout(() => (document.getElementById('searchInput') as HTMLInputElement | null)?.focus(), 0);
  }
}

function closeGameLibrary() {
  setGameLibraryOpen(false);
}

function setOverflowOpen(open: boolean) {
  const menu = document.getElementById('overflowMenu');
  const trigger = document.getElementById('overflowBtn');
  if (!menu || !trigger) return;
  menu.hidden = !open;
  trigger.setAttribute('aria-expanded', String(open));
}

function renderLibraryFilters(zh: boolean) {
  const heading = document.getElementById('libraryHeadingTitle');
  if (heading) heading.textContent = zh ? '选择游戏' : 'Choose a game';
  const summary = document.getElementById('librarySummary');
  if (summary) summary.textContent = zh ? '搜索或从列表中选择。' : 'Search or choose from the list.';
  const search = document.getElementById('searchInput') as HTMLInputElement | null;
  if (search) search.placeholder = zh ? '搜索游戏' : 'Search games';
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

  if (filtered.length === 0) {
    list.innerHTML = `<div class="search-empty">${zh ? '没有匹配的游戏' : 'No games found'}</div>`;
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
        html += `<div class="game-list-group" data-group="${group.id}">${zh ? group.nameZh : group.name}</div>`;
      }
      lastGroup = groupId;
    }
    html += `
      <button class="game-list-item ${g.id === currentGameName ? 'active' : ''}" data-id="${g.id}" title="${zh ? g.nameZh : g.name}">
        <span class="game-list-name">${zh ? g.nameZh : g.name}</span>
        <span class="game-list-desc">${zh ? g.descZh : g.desc}</span>
      </button>
    `;
  }

  list.innerHTML = html;

}

function setLang(lang: 'en' | 'zh') {
  document.documentElement.setAttribute('data-lang', lang);
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
  if (overflowButton) overflowButton.setAttribute('aria-label', lang === 'zh' ? '更多设置' : 'More settings');
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

// Fullscreen toggle
function toggleFullscreen() {
  const wrapper = document.getElementById('canvasWrapper');
  if (!wrapper) return;
  wrapper.classList.toggle('fullscreen');
  const isFullscreen = wrapper.classList.contains('fullscreen');
  const btn = document.getElementById('fullscreenBtn');
  if (btn) {
    btn.title = isFullscreen ? 'Exit fullscreen' : 'Fullscreen';
    btn.innerHTML = isFullscreen
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
  }
  if (!isFullscreen) {
    lastFittedCanvasWidth = 0;
    requestAnimationFrame(fitGameCanvas);
  }
}

// Refit the canvas whenever the centered stage changes size (window resize or
// responsive breakpoint switches). Debounced via rAF.
let fitCanvasScheduled = false;
const canvasFitObserver = new ResizeObserver(() => {
  if (fitCanvasScheduled) return;
  fitCanvasScheduled = true;
  requestAnimationFrame(() => {
    fitCanvasScheduled = false;
    fitGameCanvas();
  });
});

// Init UI
(function init() {
  const canvasWrapperEl = document.getElementById('canvasWrapper');
  if (canvasWrapperEl) canvasFitObserver.observe(canvasWrapperEl);
  window.addEventListener('resize', () => {
    if (fitCanvasScheduled) return;
    fitCanvasScheduled = true;
    requestAnimationFrame(() => {
      fitCanvasScheduled = false;
      fitGameCanvas();
    });
  });

  document.getElementById('gamePickerBtn')?.addEventListener('click', () => {
    const open = !document.getElementById('gameLibrary')?.classList.contains('open');
    setOverflowOpen(false);
    setGameLibraryOpen(open);
  });
  document.getElementById('libraryCloseBtn')?.addEventListener('click', closeGameLibrary);
  document.querySelector('[data-library-close]')?.addEventListener('click', closeGameLibrary);
  document.getElementById('overflowBtn')?.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = document.getElementById('overflowMenu')?.hidden ?? true;
    closeGameLibrary();
    setOverflowOpen(open);
  });
  document.addEventListener('click', (event) => {
    const target = event.target as Element;
    if (!target.closest('.header-actions')) setOverflowOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeGameLibrary();
    setOverflowOpen(false);
  });

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
    const wheel = document.querySelector('#vmouse .vmouse-wheel');
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

  const search = document.getElementById('searchInput') as HTMLInputElement | null;
  if (search) {
    search.addEventListener('input', () => renderGameList(search.value));
  }

  const gameList = document.getElementById('gameList');
  if (gameList) {
    const getGameId = (target: EventTarget | null) =>
      (target as Element | null)?.closest<HTMLButtonElement>('.game-list-item')?.dataset.id;
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

  // Fullscreen button
  const fsBtn = document.getElementById('fullscreenBtn');
  if (fsBtn) {
    fsBtn.addEventListener('click', toggleFullscreen);
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
