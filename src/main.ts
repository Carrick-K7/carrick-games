import {
  GAME_GROUPS,
  GAME_GROUP_MAP,
  GAME_LIST_ORDER_INDEX,
  GAMES,
  type GameCtor,
  type GameInstance,
  type VirtualKeySpec,
} from './games/catalog.js';
export { GAMES } from './games/catalog.js';
import { getStoredRecord, readStoredRecords } from './core/game.js';
import { getLogicalCanvasSize } from './core/render.js';
import {
  renderLevelGridHTML,
  renderDrivingStateHTML,
  renderMenuHint,
  renderParkingSteeringHTML,
  type LevelSelectState,
} from './core/levelselect.js';

declare global {
  interface Window {
    setLang?: (lang: 'en' | 'zh') => void;
    setTheme?: (mode: 'light' | 'dark' | 'system') => void;
    startPreparedGame?: () => void;
  }
}

let currentGameName: string | null = null;
let currentGameInstance: GameInstance | null = null;
let isRunning = false;
let isLoadingGame = false;
let prepareGameToken = 0;

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

function renderTouchIcon(icon: string): string {
  const icons: Record<string, string> = {
    tap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" opacity="0.2"/><path d="M12 8v8M9 11l3-3 3 3"/></svg>',
    'swipe-left': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 8l-4 4 4 4M6 12h12"/></svg>',
    'swipe-right': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 8l4 4-4 4M18 12H6"/></svg>',
    'swipe-up': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 14l4-4 4 4M12 6v12"/></svg>',
    'swipe-down': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 10l4 4 4-4M12 6v12"/></svg>',
    hold: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="2" opacity="0.2"/><path d="M12 8v8M9 12h6"/></svg>',
    swipe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16M14 8l4 4-4 4"/></svg>',
  };
  return icons[icon] || icons.tap;
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
  const canDemo = !!currentGameInstance && typeof (currentGameInstance as any).startDemo === 'function' && !isLoadingGame;
  btn.hidden = !canDemo;
  btn.disabled = !canDemo;
  btn.textContent = zh ? '示例' : 'Demo';
}

function updateGameTitle() {
  const titleEl = document.getElementById('gameTitle');
  const zh = document.documentElement.getAttribute('data-lang') === 'zh';
  const meta = GAMES.find((g) => g.id === currentGameName);
  if (titleEl) titleEl.textContent = meta ? (zh ? meta.nameZh : meta.name) : '';
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

function renderVirtualKeyboard(activeKeys: string[], panelKeys?: VirtualKeySpec[]) {
  const enabledKeys = new Set(activeKeys);

  if (panelKeys?.length) {
    return `
      <div class="vkeyboard vkeyboard-compact" id="vkeyboard">
        <div class="vkeyboard-row">
          ${panelKeys.map((key) => {
            const normalizedKey = normalizeKey(key.key);
            return `<div class="vkey ${key.classes || ''}" data-key="${normalizedKey}">${key.label}</div>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  const mk = (label: string, key: string, wClass: string, enabled: boolean) => {
    const normalizedKey = normalizeKey(key);
    const dataAttr = enabled ? ` data-key="${normalizedKey}"` : '';
    const cls = `${wClass} ${enabled ? '' : ' inactive'}`;
    return `<div class="vkey ${cls}"${dataAttr}>${label}</div>`;
  };

  const a = (key: string) => enabledKeys.has(normalizeKey(key));

  // Standard ANSI 60% layout (no numpad)
  return `
    <div class="vkeyboard" id="vkeyboard">
      <!-- Row 1: Numbers -->
      <div class="vkeyboard-row">
        ${mk('`', '`', 'w-1', a('`'))}
        ${mk('1', '1', 'w-1', a('1'))}
        ${mk('2', '2', 'w-1', a('2'))}
        ${mk('3', '3', 'w-1', a('3'))}
        ${mk('4', '4', 'w-1', a('4'))}
        ${mk('5', '5', 'w-1', a('5'))}
        ${mk('6', '6', 'w-1', a('6'))}
        ${mk('7', '7', 'w-1', a('7'))}
        ${mk('8', '8', 'w-1', a('8'))}
        ${mk('9', '9', 'w-1', a('9'))}
        ${mk('0', '0', 'w-1', a('0'))}
        ${mk('-', '-', 'w-1', a('-'))}
        ${mk('=', '=', 'w-1', a('='))}
        ${mk('←', 'Backspace', 'w-2', a('Backspace'))}
      </div>
      <!-- Row 2: QWERTY -->
      <div class="vkeyboard-row">
        ${mk('Tab', 'Tab', 'w-1-5', a('Tab'))}
        ${mk('Q', 'q', 'w-1', a('q'))}
        ${mk('W', 'w', 'w-1', a('w'))}
        ${mk('E', 'e', 'w-1', a('e'))}
        ${mk('R', 'r', 'w-1', a('r'))}
        ${mk('T', 't', 'w-1', a('t'))}
        ${mk('Y', 'y', 'w-1', a('y'))}
        ${mk('U', 'u', 'w-1', a('u'))}
        ${mk('I', 'i', 'w-1', a('i'))}
        ${mk('O', 'o', 'w-1', a('o'))}
        ${mk('P', 'p', 'w-1', a('p'))}
        ${mk('[', '[', 'w-1', a('['))}
        ${mk(']', ']', 'w-1', a(']'))}
        ${mk('\\', '\\', 'w-1-5', a('\\'))}
      </div>
      <!-- Row 3: ASDF -->
      <div class="vkeyboard-row">
        ${mk('Caps', 'CapsLock', 'w-1-75', a('CapsLock'))}
        ${mk('A', 'a', 'w-1', a('a'))}
        ${mk('S', 's', 'w-1', a('s'))}
        ${mk('D', 'd', 'w-1', a('d'))}
        ${mk('F', 'f', 'w-1', a('f'))}
        ${mk('G', 'g', 'w-1', a('g'))}
        ${mk('H', 'h', 'w-1', a('h'))}
        ${mk('J', 'j', 'w-1', a('j'))}
        ${mk('K', 'k', 'w-1', a('k'))}
        ${mk('L', 'l', 'w-1', a('l'))}
        ${mk(';', ';', 'w-1', a(';'))}
        ${mk("'", "'", 'w-1', a("'"))}
        ${mk('Enter', 'Enter', 'w-2-25', a('Enter'))}
      </div>
      <!-- Row 4: ZXCV + ↑ -->
      <div class="vkeyboard-row">
        ${mk('Shift', 'Shift', 'w-2-25', a('Shift'))}
        ${mk('Z', 'z', 'w-1', a('z'))}
        ${mk('X', 'x', 'w-1', a('x'))}
        ${mk('C', 'c', 'w-1', a('c'))}
        ${mk('V', 'v', 'w-1', a('v'))}
        ${mk('B', 'b', 'w-1', a('b'))}
        ${mk('N', 'n', 'w-1', a('n'))}
        ${mk('M', 'm', 'w-1', a('m'))}
        ${mk(',', ',', 'w-1', a(','))}
        ${mk('.', '.', 'w-1', a('.'))}
        ${mk('/', '/', 'w-1', a('/'))}
        ${mk('↑', 'ArrowUp', 'w-1', a('ArrowUp'))}
        ${mk('Shift', 'ShiftRight', 'w-1-75', a('Shift'))}
      </div>
      <!-- Row 5: Bottom row + ←↓→ -->
      <div class="vkeyboard-row">
        ${mk('Ctrl', 'Control', 'w-1-25', a('Control'))}
        ${mk('Win', 'Meta', 'w-1-25', a('Meta'))}
        ${mk('Alt', 'Alt', 'w-1-25', a('Alt'))}
        ${mk('Space', ' ', 'w-5-25', a(' '))}
        ${mk('Alt', 'AltGraph', 'w-1', a('AltGraph'))}
        ${mk('Fn', 'Fn', 'w-1', a('Fn'))}
        ${mk('Ctrl', 'ControlRight', 'w-1', a('Control'))}
        ${mk('←', 'ArrowLeft', 'w-1', a('ArrowLeft'))}
        ${mk('↓', 'ArrowDown', 'w-1', a('ArrowDown'))}
        ${mk('→', 'ArrowRight', 'w-1', a('ArrowRight'))}
      </div>
    </div>
  `;
}

function getRecord(gameId: string): number | null {
  return getStoredRecord(gameId);
}

function getLevelSelectState(): LevelSelectState | null {
  const g = currentGameInstance as any;
  if (!g || typeof g.totalLevels !== 'number') return null;
  return {
    totalLevels: g.totalLevels,
    currentLevel: typeof g.levelIndexEx === 'number' ? g.levelIndexEx : 0,
    bestLevel: typeof g.bestLevelEx === 'number' ? g.bestLevelEx : 0,
    unlockedLevel: typeof g.unlockedLevelEx === 'number' ? g.unlockedLevelEx : 0,
    speed: typeof g.speed === 'number' ? g.speed : 0,
    maxSpeed: typeof g.maxSpeed === 'number' ? g.maxSpeed : 200,
    gear: typeof g.gear === 'string' ? g.gear : 'N',
    gameState: typeof g.gameStateEx === 'string' ? g.gameStateEx : 'menu',
    steerAngle: typeof g.steerAngle === 'number' ? g.steerAngle : undefined,
    maxSteerAngle: typeof g.maxSteerAngle === 'number' ? g.maxSteerAngle : undefined,
    steeringActive: typeof g.mouseSteeringActiveEx === 'boolean' ? g.mouseSteeringActiveEx : undefined,
  };
}

function getSelectedLevel(): number {
  const g = currentGameInstance as any;
  if (g && typeof g.selectedLevelEx === 'number') return g.selectedLevelEx;
  return 0;
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

  // Title
  html += `<div class="stats-section">`;
  html += `<div class="stats-title">${zh ? meta.nameZh : meta.name}</div>`;
  if (best != null) {
    const bestLabel = currentGameName === 'parking' ? (zh ? '最高关卡' : 'Best Level') : (zh ? '最高记录' : 'Best');
    html += `<div class="stats-row"><span>${bestLabel}</span><span class="stats-value">${best}</span></div>`;
  }
  html += `</div>`;

  // Driving state (replaces in-canvas dashboard)
  if (ls && ls.gameState !== 'menu') {
    html += renderDrivingStateHTML(ls, zh);
  }

  // Level grid
  if (ls) {
    const selected = getSelectedLevel();
    html += `<div class="stats-section"><div class="stats-section-title">${zh ? '关卡' : 'LEVELS'}</div>`;
    html += renderLevelGridHTML(ls, selected, zh);
    html += `</div>`;

    if (ls.gameState === 'menu') {
      html += renderMenuHint(zh);
    }
  }

  container.innerHTML = html;

  // Bind level cell clicks
  if (ls) {
    container.querySelectorAll('.level-cell').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-level') || '', 10);
        if (isNaN(idx)) return;
        const g = currentGameInstance as any;
        if (g && typeof g.selectLevel === 'function') {
          g.selectLevel(idx);
        }
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

  if (speedEl) speedEl.textContent = String(Math.round(ls.speed));
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

  // Re-render level grid when progress changes (e.g. after completing a level)
  const snapshot = `${ls.currentLevel},${ls.bestLevel},${ls.unlockedLevel},${ls.gameState}`;
  if (snapshot !== lastLevelSelectSnapshot) {
    lastLevelSelectSnapshot = snapshot;
    renderStats();
  }
}

function setLoadingOverlay(active: boolean) {
  const el = document.getElementById('loadingOverlay');
  if (el) el.classList.toggle('active', active);
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
  const raw = (currentGameInstance as any).score;
  if (typeof raw === 'number') return raw;
  return null;
}

let scorePollTimer: number | null = null;
let lastLevelSelectSnapshot = '';

function startScorePolling() {
  stopScorePolling();
  lastLevelSelectSnapshot = '';
  updateLiveScoreDisplay();
  scorePollTimer = window.setInterval(() => {
    updateLiveScoreDisplay();
  }, 200);
}

function stopScorePolling() {
  if (scorePollTimer != null) {
    clearInterval(scorePollTimer);
    scorePollTimer = null;
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
  container.innerHTML = steeringPanel + renderVirtualKeyboard(activeKeys, meta.controls.keyboardPanel);
  bindVirtualKeyboard();
}

function renderControlsInfo() {
  const container = document.getElementById('controlsPanel');
  if (!container) return;
  const meta = GAMES.find((g) => g.id === currentGameName);
  if (!meta) {
    container.innerHTML = '';
    return;
  }
  const zh = document.documentElement.getAttribute('data-lang') === 'zh';
  let html = '';

  if (meta.controls.keyboard?.length) {
    html += `<div class="control-section"><div class="control-section-title">${zh ? '键盘' : 'KEYBOARD'}</div>`;
    for (const row of meta.controls.keyboard) {
      const keysHtml = row.keys.map((k) => `<span class="keycap">${k}</span>`).join('');
      html += `<div class="control-row"><div class="control-keys">${keysHtml}</div><div class="control-label">${zh ? row.actionZh : row.action}</div></div>`;
    }
    html += `</div>`;
  }

  if (meta.controls.touch?.length) {
    html += `<div class="control-section"><div class="control-section-title">${zh ? '触摸' : 'TOUCH'}</div>`;
    for (const row of meta.controls.touch) {
      html += `<div class="control-row"><div class="control-icon">${renderTouchIcon(row.icon)}</div><div class="control-label">${zh ? row.actionZh : row.action}</div></div>`;
    }
    html += `</div>`;
  }

  container.innerHTML = html;
}

function renderControls() {
  renderStats();
  renderKeyboard();
  renderControlsInfo();
}

function normalizeKey(label: string): string {
  const map: Record<string, string> = {
    '←': 'ArrowLeft',
    '↑': 'ArrowUp',
    '→': 'ArrowRight',
    '↓': 'ArrowDown',
    'Space': ' ',
  };
  if (map[label]) return map[label];
  return label.length === 1 ? label.toLowerCase() : label;
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
  const records = readStoredRecords();
  const shouldUpdate = records[gameId] == null || score > records[gameId];
  if (shouldUpdate) {
    records[gameId] = score;
    try {
      localStorage.setItem('cg-records', JSON.stringify(records));
    } catch {
      // Scores are a convenience feature; storage failures should not break play.
    }
  }
}
window.saveRecord = saveRecord;
window.reportScore = (score: number) => {
  if (!currentGameName) return;
  saveRecord(currentGameName, score);
};

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
    if (currentGameInstance.destroy) {
      currentGameInstance.destroy();
    } else {
      currentGameInstance.stop();
    }
    currentGameInstance = null;
  }
  isRunning = false;
  isLoadingGame = true;
  currentGameName = name;
  updateActionButton();
  setLoadingOverlay(true);
  updateGameTitle();
  updateGameDesc();
  renderControls();

  document.querySelectorAll('.game-list-item').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-id') === name);
  });

  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

  canvas.width = meta.canvasSize.width;
  canvas.height = meta.canvasSize.height;
  canvas.dataset.logicalWidth = String(meta.canvasSize.width);
  canvas.dataset.logicalHeight = String(meta.canvasSize.height);
  canvas.dataset.pixelRatio = '1';

  // Re-apply zoom so the displayed size matches the new canvas dimensions
  const savedZoom = parseInt(localStorage.getItem('cg-zoom') || '100', 10);
  applyCanvasZoom(savedZoom);

  let GameClass: GameCtor;
  try {
    GameClass = await meta.loader();
  } catch (e) {
    if (token === prepareGameToken) {
      isLoadingGame = false;
      setLoadingOverlay(false);
      updateActionButton();
    }
    // eslint-disable-next-line no-console
    console.error(e);
    return;
  }

  const nextGameInstance = new GameClass();
  applyCanvasZoom(savedZoom);
  if (token !== prepareGameToken) {
    nextGameInstance.destroy?.();
    return;
  }
  currentGameInstance = nextGameInstance;
  isLoadingGame = false;
  setLoadingOverlay(false);

  // Draw initial frame so canvas isn't blank
  try {
    nextGameInstance.init();
    const ctx2 = canvas.getContext('2d');
    if (nextGameInstance.renderFrame) {
      nextGameInstance.renderFrame();
    } else if (ctx2) {
      nextGameInstance.draw(ctx2);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
  }

  startScorePolling();
  updateActionButton();
  updateGameTitle();
  updateGameDesc();
  renderControls();
  setStartOverlay(true);
}

function startPreparedGame() {
  if (!currentGameInstance || isLoadingGame) return;
  try {
    setStartOverlay(false);
    currentGameInstance.start();
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
  const demoStarter = (currentGameInstance as any).startDemo;
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

function renderGameList(filter = '') {
  const list = document.getElementById('gameList');
  if (!list) return;
  const zh = document.documentElement.getAttribute('data-lang') === 'zh';
  const term = filter.trim().toLowerCase();
  const isSearching = term.length > 0;

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
      if (!isSearching && group) {
        html += `<div class="game-list-group">${zh ? group.nameZh : group.name}</div>`;
      }
      lastGroup = groupId;
    }
    html += `
      <button class="game-list-item ${g.id === currentGameName ? 'active' : ''}" data-id="${g.id}">
        <div class="game-list-name">${zh ? g.nameZh : g.name}</div>
        <div class="game-list-desc">${zh ? g.descZh : g.desc}</div>
      </button>
    `;
  }

  list.innerHTML = html;

  list.querySelectorAll('.game-list-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id')!;
      void loadGame(id);
    });
  });
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
  });
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
    b.classList.toggle('active', b.getAttribute('data-set') === mode);
  });
}

window.setLang = setLang;
window.setTheme = setTheme;
window.startPreparedGame = startPreparedGame;

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

// Canvas zoom logic
function applyCanvasZoom(percent: number) {
  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement | null;
  const label = document.getElementById('zoomLabel');
  if (!canvas) return;
  const scale = percent / 100;
  const size = getLogicalCanvasSize(canvas);
  // Use width/height instead of transform so document flow adjusts correctly
  canvas.style.width = `${size.width * scale}px`;
  canvas.style.height = `${size.height * scale}px`;
  if (label) label.textContent = `${percent}%`;
  localStorage.setItem('cg-zoom', String(percent));
}

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
  const savedLang = (localStorage.getItem('cg-lang') as 'en' | 'zh') || 'zh';
  const savedTheme = (localStorage.getItem('cg-theme') as 'light' | 'dark' | 'system') || 'system';
  setLang(savedLang);
  setTheme(savedTheme);

  renderGameList();

  const search = document.getElementById('searchInput') as HTMLInputElement | null;
  if (search) {
    search.addEventListener('input', () => renderGameList(search.value));
  }

  const actionBtn = document.getElementById('actionBtn') as HTMLButtonElement | null;
  if (actionBtn) {
    actionBtn.addEventListener('click', startPreparedGame);
  }

  const demoBtn = document.getElementById('demoBtn') as HTMLButtonElement | null;
  if (demoBtn) {
    demoBtn.addEventListener('click', startDemoForCurrentGame);
  }

  // Zoom slider
  const zoomSlider = document.getElementById('zoomSlider') as HTMLInputElement | null;
  if (zoomSlider) {
    const savedZoom = parseInt(localStorage.getItem('cg-zoom') || '100', 10);
    zoomSlider.value = String(savedZoom);
    applyCanvasZoom(savedZoom);
    zoomSlider.addEventListener('input', () => {
      applyCanvasZoom(parseInt(zoomSlider.value, 10));
    });
  }

  // Fullscreen button
  const fsBtn = document.getElementById('fullscreenBtn');
  if (fsBtn) {
    fsBtn.addEventListener('click', toggleFullscreen);
  }

  // Hash-based routing
  window.addEventListener('hashchange', () => {
    const hashGame = getHashGame();
    if (hashGame && hashGame !== currentGameName && GAMES.some((g) => g.id === hashGame)) {
      void loadGame(hashGame);
    }
  });

  const hashGame = getHashGame();
  const initialGame = hashGame && GAMES.some((g) => g.id === hashGame) ? hashGame : GAMES[0]?.id;
  if (initialGame) {
    void prepareGame(initialGame);
    if (!hashGame) {
      setHashGame(initialGame);
    }
  }
})();
