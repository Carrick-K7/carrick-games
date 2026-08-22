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
import { GAME_ICONS } from './ui/game-icons.js';
import { normalizeKey } from './ui/keyboard-input.js';
import { renderVirtualKeyboard } from './ui/virtual-keyboard.js';
import { initializeSidebar } from './app/sidebar.js';

import {
  renderLevelGridHTML,
  renderDrivingStateHTML,
  renderMenuHint,
  renderParkingSteeringHTML,
  type LevelSelectState,
} from './core/levelselect.js';

let currentGameName: string | null = null;
let currentGameInstance: GameInstance | null = null;
let isRunning = false;
let isLoadingGame = false;
let prepareGameToken = 0;
let selectedGameGroup = 'all';
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
  const btn = document.getElementById('actionBtn') as HTMLButtonElement | null;
  if (!btn) {
    updateDemoButton();
    return;
  }
  const zh = document.documentElement.getAttribute('data-lang') === 'zh';
  if (isLoadingGame) {
    btn.textContent = zh ? '加载中...' : 'Loading...';
    btn.disabled = true;
    updateDemoButton();
    return;
  }
  if (!currentGameInstance) {
    btn.textContent = zh ? '选择游戏' : 'Select a game';
    btn.disabled = true;
    updateDemoButton();
    return;
  }
  btn.disabled = false;
  if (!isRunning) {
    btn.textContent = zh ? '开始游戏' : 'Start Game';
  } else {
    btn.textContent = zh ? '重新开始' : 'Restart';
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
  const titleEl = document.getElementById('gameTitle');
  const zh = document.documentElement.getAttribute('data-lang') === 'zh';
  const meta = GAMES.find((g) => g.id === currentGameName);
  if (titleEl) titleEl.textContent = meta ? (zh ? meta.nameZh : meta.name) : '';
  const libraryEyebrow = document.getElementById('libraryEyebrow');
  if (libraryEyebrow) {
    libraryEyebrow.textContent = zh ? `游戏库 · ${GAMES.length} 款` : `GAME LIBRARY · ${GAMES.length}`;
  }
  const selectedGameLabel = document.getElementById('selectedGameLabel');
  if (selectedGameLabel) {
    const group = meta ? GAME_GROUPS.find((item) => item.id === GAME_GROUP_MAP[meta.id]) : null;
    const gameName = meta ? (zh ? meta.nameZh : meta.name) : (zh ? '选择游戏' : 'Select a game');
    const groupName = group ? (zh ? group.nameZh : group.name) : '';
    selectedGameLabel.textContent = groupName ? `${groupName} / ${gameName}` : gameName;
  }
  const canvas = document.getElementById('gameCanvas');
  if (canvas && meta) {
    const gameName = zh ? meta.nameZh : meta.name;
    canvas.setAttribute('aria-label', zh ? `${gameName}游戏画布` : `${gameName} game canvas`);
  }
}

function updateGameDesc() {
  const descEl = document.getElementById('gameDesc');
  const zh = document.documentElement.getAttribute('data-lang') === 'zh';
  const meta = GAMES.find((g) => g.id === currentGameName);
  if (descEl) descEl.textContent = meta ? (zh ? meta.descZh : meta.desc) : '';
}

function updateVirtualKeyboardHighlight(pressedSet: Set<string>) {
  document.querySelectorAll('.vkey').forEach((el) => {
    const k = el.getAttribute('data-key') || '';
    el.classList.toggle('pressed', pressedSet.has(k));
  });
}

function getRecord(gameId: string): number | null {
  return getStoredRecord(gameId);
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
  const zh = document.documentElement.getAttribute('data-lang') === 'zh';
  const meta = GAMES.find((g) => g.id === currentGameName);
  if (!meta) {
    container.innerHTML = `<div class="stats-empty">${zh ? '选择游戏' : 'Select a game'}</div>`;
    return;
  }

  if (!currentGameName) return;
  const best = getRecord(currentGameName);
  const ls = getLevelSelectState();
  let html = '';

  // Game info card
  html += `<div class="game-info-card">`;
  html += `<div class="gic-name">${zh ? meta.nameZh : meta.name}</div>`;
  html += `<div class="gic-desc">${zh ? (meta.descZh || meta.desc) : meta.desc}</div>`;
  const liveScore = readGameScore();
  if (liveScore != null) {
    html += `<div class="gic-record"><span>${zh ? '当前分数' : 'Score'}</span><span class="gic-value" id="liveScore">${liveScore}</span></div>`;
  }
  if (best != null) {
    const bestLabel = currentGameName === 'parking' ? (zh ? '最高关卡' : 'Best Level') : (zh ? '最高记录' : 'Best');
    html += `<div class="gic-record"><span>${bestLabel}</span><span class="gic-value">${best}</span></div>`;
  }
  html += `</div>`;

  // Level grid
  if (ls) {
    html += `<div class="stats-section"><div class="stats-section-title">${zh ? '关卡' : 'LEVELS'}</div>`;
    html += renderLevelGridHTML(ls, ls.selectedLevel, zh);
    html += `</div>`;

    if (ls.gameState === 'menu') {
      html += renderMenuHint(zh);
    }
  }

  container.innerHTML = html;

  if (ls) {
    container.querySelectorAll('.level-cell').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-level') || '', 10);
        if (isNaN(idx)) return;
        currentGameInstance?.selectLevel?.(idx);
      });
    });
  }
}

function updateLiveScoreDisplay() {
  // Update score if game has it
  const scoreEl = document.getElementById('liveScore');
  if (scoreEl) {
    const score = readGameScore();
    if (score != null) scoreEl.textContent = String(score);
  }

  // Update driving state if applicable
  const ls = getLevelSelectState();
  if (!ls || ls.gameState === 'menu') return;

  const speedEl = document.getElementById('ds-speed-val');
  const gearEl = document.getElementById('ds-gear-val');

  const speedRatio = Math.max(0, Math.min(1, Math.abs(ls.speed) / Math.max(1, ls.maxSpeed)));
  const roundedSpeed = String(Math.round(ls.speed));
  if (speedEl && speedEl.textContent !== roundedSpeed) speedEl.textContent = roundedSpeed;
  const speedArcEl = document.getElementById('ds-speed-arc') as SVGPathElement | null;
  if (speedArcEl) speedArcEl.setAttribute('stroke-dasharray', `${251 * speedRatio} 251`);
  if (gearEl) {
    gearEl.textContent = ls.gear;
    gearEl.style.color = ls.gear === 'R' ? '#ef4444' : ls.gear === 'D' ? 'var(--accent)' : 'var(--text-secondary)';
  }

  const steeringWheel = document.getElementById('parkingSteeringWheel') as HTMLElement | null;
  if (steeringWheel && typeof ls.steerAngle === 'number' && typeof ls.maxSteerAngle === 'number') {
    const ratio = Math.max(-1, Math.min(1, ls.steerAngle / ls.maxSteerAngle));
    steeringWheel.style.setProperty('--wheel-rotation', `${ratio * 220}deg`);
    const percentEl = document.getElementById('parkingSteerPercent');
    if (percentEl) percentEl.textContent = `${Math.round(ratio * 100)}%`;
    const modeEl = document.getElementById('parkingSteerMode');
    if (modeEl) modeEl.textContent = ls.steeringActive
      ? (document.documentElement.getAttribute('data-lang') === 'zh' ? '鼠标' : 'MOUSE')
      : (document.documentElement.getAttribute('data-lang') === 'zh' ? '键盘' : 'KEYS');
  }

  // Re-render level grid when progress changes
  const snapshot = `${ls.currentLevel},${ls.bestLevel},${ls.unlockedLevel},${ls.gameState}`;
  if (snapshot !== lastLevelSelectSnapshot) {
    lastLevelSelectSnapshot = snapshot;
    renderStats();
    renderKeyboard();
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
  if (hintEl) hintEl.textContent = zh ? '点击「开始游戏」按钮开始' : 'Click Start Game to begin';
}

function readGameScore(): number | null {
  if (!currentGameInstance) return null;
  const raw = currentGameInstance.getShellSnapshot().score;
  if (typeof raw === 'number') return raw;
  return null;
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

  const activeKeys = meta.controls.keyboard?.flatMap((k) => k.keys.map(normalizeKey)) || [];
  if (!activeKeys.length) {
    container.innerHTML = '';
    return;
  }

  const zh = document.documentElement.getAttribute('data-lang') === 'zh';
  const ls = getLevelSelectState();
  const steeringPanel = ls ? renderParkingSteeringHTML(ls, zh) : '';
  const drivingPanel = (ls && ls.gameState !== 'menu') ? renderDrivingStateHTML(ls, zh) : '';
  container.innerHTML = steeringPanel + drivingPanel + renderVirtualKeyboard(activeKeys, meta.controls.keyboardPanel);
  bindVirtualKeyboard();
}

function renderControls() {
  renderStats();
  renderKeyboard();
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
  updateGameDesc();

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
  updateGameDesc();
  renderControls();
  updateFullscreenToggle(meta);
  setStartOverlay(true);
}

/** Some games opt out of the shell fullscreen control (e.g. kiosk-style UX). */
function updateFullscreenToggle(meta: GameMeta) {
  const btn = document.getElementById('fullscreenBtn');
  if (!btn) return;
  // Inline style: .icon-btn's display:flex would otherwise override [hidden].
  btn.style.display = meta.fullscreen === false ? 'none' : '';
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
  await prepareGame(name);
  setHashGame(name);
}

function renderLibraryFilters(zh: boolean) {
  const heading = document.getElementById('libraryHeadingTitle');
  if (heading) heading.textContent = zh ? '游戏库' : 'Game Library';
  const summary = document.getElementById('librarySummary');
  if (summary) {
    summary.textContent = zh ? `${GAMES.length} 款游戏 · ${GAME_GROUPS.length} 个分类` : `${GAMES.length} games · ${GAME_GROUPS.length} categories`;
  }

  const filters = document.getElementById('categoryFilters');
  if (!filters) return;
  const items = [
    { id: 'all', name: 'All', nameZh: '全部', count: GAMES.length },
    ...GAME_GROUPS.map((group) => ({
      ...group,
      count: GAMES.filter((game) => GAME_GROUP_MAP[game.id] === group.id).length,
    })),
  ];

  filters.innerHTML = items.map((item) => {
    const active = item.id === selectedGameGroup;
    return `
      <button class="category-chip${active ? ' active' : ''}" data-group="${item.id}" aria-pressed="${active}">
        <span class="category-chip-dot" aria-hidden="true"></span>
        <span>${zh ? item.nameZh : item.name}</span>
        <span class="category-chip-count">${item.count}</span>
      </button>
    `;
  }).join('');

  filters.querySelectorAll<HTMLButtonElement>('.category-chip').forEach((button) => {
    button.addEventListener('click', () => {
      selectedGameGroup = button.dataset.group || 'all';
      const search = document.getElementById('searchInput') as HTMLInputElement | null;
      renderGameList(search?.value || '');
    });
  });
}

function renderGameList(filter = '') {
  const list = document.getElementById('gameList');
  if (!list) return;
  const zh = document.documentElement.getAttribute('data-lang') === 'zh';
  const term = filter.trim().toLowerCase();
  renderLibraryFilters(zh);

  const filtered = GAMES.filter((g) => {
    if (selectedGameGroup !== 'all' && GAME_GROUP_MAP[g.id] !== selectedGameGroup) return false;
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
  let itemIndex = 0;
  const visibleGroupCounts = filtered.reduce((counts, game) => {
    const groupId = GAME_GROUP_MAP[game.id] || '';
    counts.set(groupId, (counts.get(groupId) || 0) + 1);
    return counts;
  }, new Map<string, number>());
  for (const g of filtered) {
    const groupId = GAME_GROUP_MAP[g.id] || '';
    if (groupId && groupId !== lastGroup) {
      const group = GAME_GROUPS.find((gr) => gr.id === groupId);
      if (group) {
        html += `
          <div class="game-list-group" data-group="${group.id}">
            <span class="game-list-group-label"><span class="game-list-group-dot" aria-hidden="true"></span>${zh ? group.nameZh : group.name}</span>
            <span class="game-list-group-count">${visibleGroupCounts.get(group.id) || 0}</span>
          </div>
        `;
      }
      lastGroup = groupId;
    }
    html += `
      <button class="game-list-item ${g.id === currentGameName ? 'active' : ''}" data-id="${g.id}" style="--i:${itemIndex}" title="${zh ? g.nameZh : g.name}">
        <span class="game-list-icon">${GAME_ICONS[g.id] || GAME_ICONS._default}</span>
        <div class="game-list-name">${zh ? g.nameZh : g.name}</div>
        <div class="game-list-desc">${zh ? g.descZh : g.desc}</div>
      </button>
    `;
    itemIndex += 1;
  }

  list.innerHTML = html;

}

function setLang(lang: 'en' | 'zh') {
  document.documentElement.setAttribute('data-lang', lang);
  localStorage.setItem('cg-lang', lang);
  updateActionButton();
  updateGameTitle();
  updateGameDesc();
  renderControls();
  renderGameList((document.getElementById('searchInput') as HTMLInputElement)?.value || '');
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

// Repaint the current frame so static (non-looping) scenes follow theme,
// language, and style-mode changes immediately.
function repaintCurrentFrame() {
  try {
    currentGameInstance?.renderFrame?.();
  } catch {
    // A failed repaint is harmless; the next frame will pick the change up.
  }
}

function setStyleMode(mode: 'modern' | 'pixel') {
  document.documentElement.setAttribute('data-style-mode', mode);
  try {
    localStorage.setItem('cg-style-mode', mode);
  } catch {
    // Style mode is a convenience; storage failures should not break the shell.
  }
  document.querySelectorAll('.style-btn').forEach((b) => {
    const active = b.getAttribute('data-mode') === mode;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
  repaintCurrentFrame();
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
}

// Init UI
(function init() {
  const sidebar = initializeSidebar();
  document.querySelectorAll<HTMLElement>('.lang-btn').forEach((button) => {
    button.addEventListener('click', () => setLang(button.dataset.lang === 'en' ? 'en' : 'zh'));
  });
  document.querySelectorAll<HTMLElement>('.theme-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.set;
      if (mode === 'light' || mode === 'dark' || mode === 'system') setTheme(mode);
    });
  });
  document.querySelectorAll<HTMLElement>('.style-btn').forEach((button) => {
    button.addEventListener('click', () => setStyleMode(button.dataset.mode === 'pixel' ? 'pixel' : 'modern'));
  });
  const savedLang = (localStorage.getItem('cg-lang') as 'en' | 'zh') || 'zh';
  const savedTheme = (localStorage.getItem('cg-theme') as 'light' | 'dark' | 'system') || 'system';
  let savedStyleMode: 'modern' | 'pixel' = 'modern';
  try {
    if (localStorage.getItem('cg-style-mode') === 'pixel') savedStyleMode = 'pixel';
  } catch {
    // Ignore storage failures; the default modern mode applies.
  }
  setLang(savedLang);
  setTheme(savedTheme);
  setStyleMode(savedStyleMode);

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
      sidebar.closeOnMobile();
    });
  }

  const actionBtn = document.getElementById('actionBtn') as HTMLButtonElement | null;
  if (actionBtn) {
    actionBtn.addEventListener('click', startPreparedGame);
  }

  const demoBtn = document.getElementById('demoBtn') as HTMLButtonElement | null;
  if (demoBtn) {
    demoBtn.addEventListener('click', startDemoForCurrentGame);
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
