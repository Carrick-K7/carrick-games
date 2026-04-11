import { SnakeGame } from './games/snake.js';
import { BreakoutGame } from './games/breakout.js';
import { TetrisGame } from './games/tetris.js';
export const GAMES = [
    {
        id: 'snake',
        name: 'Snake',
        nameZh: '贪吃蛇',
        desc: 'Classic arcade snake. Eat, grow, and avoid the walls.',
        descZh: '经典街机贪吃蛇。吃东西、变长、别撞墙。',
        cls: SnakeGame,
        canvasSize: { width: 400, height: 400 },
        controls: {
            keyboard: [
                { keys: ['←', '↑', '→', '↓'], action: 'Move', actionZh: '移动' },
                { keys: ['W', 'A', 'S', 'D'], action: 'Move', actionZh: '移动' },
                { keys: ['Space'], action: 'Restart', actionZh: '重新开始' },
            ],
            touch: [
                { icon: 'tap', action: 'Tap sides to turn', actionZh: '点击边缘转向' },
            ],
        },
    },
    {
        id: 'breakout',
        name: 'Breakout',
        nameZh: '打砖块',
        desc: 'Bounce the ball and break all bricks.',
        descZh: '弹球击碎所有砖块。',
        cls: BreakoutGame,
        canvasSize: { width: 480, height: 360 },
        controls: {
            keyboard: [
                { keys: ['←', '→'], action: 'Move paddle', actionZh: '移动挡板' },
                { keys: ['A', 'D'], action: 'Move paddle', actionZh: '移动挡板' },
                { keys: ['Space'], action: 'Restart', actionZh: '重新开始' },
            ],
            touch: [
                { icon: 'swipe-left', action: 'Swipe left / right', actionZh: '左右滑动' },
                { icon: 'tap', action: 'Tap to restart', actionZh: '点击重新开始' },
            ],
        },
    },
    {
        id: 'tetris',
        name: 'Tetris',
        nameZh: '俄罗斯方块',
        desc: 'The legendary falling blocks puzzle.',
        descZh: '传奇下落方块益智游戏。',
        cls: TetrisGame,
        canvasSize: { width: 300, height: 600 },
        controls: {
            keyboard: [
                { keys: ['←', '→'], action: 'Move', actionZh: '移动' },
                { keys: ['↓'], action: 'Soft drop', actionZh: '软降' },
                { keys: ['↑', 'X'], action: 'Rotate CW', actionZh: '顺时针旋转' },
                { keys: ['Z'], action: 'Rotate CCW', actionZh: '逆时针旋转' },
                { keys: ['Space'], action: 'Hard drop / Restart', actionZh: '硬降 / 重新开始' },
            ],
            touch: [
                { icon: 'swipe-left', action: 'Swipe left / right', actionZh: '左右滑动移动' },
                { icon: 'swipe-up', action: 'Swipe up', actionZh: '上滑硬降' },
                { icon: 'swipe-down', action: 'Swipe down', actionZh: '下滑软降' },
                { icon: 'tap', action: 'Tap to rotate', actionZh: '点击旋转' },
            ],
        },
    },
];
let currentGameName = null;
let currentGameInstance = null;
let isRunning = false;
function renderTouchIcon(icon) {
    const icons = {
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
    const btn = document.getElementById('actionBtn');
    if (!btn)
        return;
    const zh = document.documentElement.getAttribute('data-lang') === 'zh';
    if (!currentGameInstance) {
        btn.textContent = zh ? '选择游戏' : 'Select a game';
        btn.disabled = true;
        return;
    }
    btn.disabled = false;
    if (!isRunning) {
        btn.textContent = zh ? '开始游戏' : 'Start Game';
    }
    else {
        btn.textContent = zh ? '重新开始' : 'Restart';
    }
}
function updateGameTitle() {
    const titleEl = document.getElementById('gameTitle');
    const descEl = document.getElementById('gameDesc');
    const zh = document.documentElement.getAttribute('data-lang') === 'zh';
    const meta = GAMES.find((g) => g.id === currentGameName);
    if (titleEl)
        titleEl.textContent = meta ? (zh ? meta.nameZh : meta.name) : '';
    if (descEl)
        descEl.textContent = meta ? (zh ? meta.descZh : meta.desc) : '';
}
function updateVirtualKeyboardHighlight(pressedSet) {
    document.querySelectorAll('.vkey').forEach((el) => {
        const k = el.getAttribute('data-key') || '';
        el.classList.toggle('pressed', pressedSet.has(k));
    });
}
function renderVirtualKeyboard(activeKeys) {
    const mk = (label, key, classes = '', hint = '') => {
        const active = activeKeys.includes(key) ? ` data-key="${key}"` : '';
        return `<div class="vkey ${classes}${active ? '' : ' hidden'}"${active}>${label}${hint ? `<span class="vkey-hint">${hint}</span>` : ''}</div>`;
    };
    return `
    <div class="vkeyboard" id="vkeyboard">
      <div class="vkeyboard-row">
        ${mk('Esc', 'Escape', 'wide-1')}
        <div class="vkey hidden"></div>
        ${mk('←', 'ArrowLeft', '', 'M')}
        ${mk('↑', 'ArrowUp', '', 'M')}
        ${mk('↓', 'ArrowDown', '', 'M')}
        ${mk('→', 'ArrowRight', '', 'M')}
        <div class="vkey hidden"></div>
        ${mk('Space', 'Space', 'grow', 'RST')}
      </div>
      <div class="vkeyboard-row">
        ${mk('Q', 'q')} ${mk('W', 'w', '', 'M')} ${mk('E', 'e')} ${mk('R', 'r')} ${mk('T', 't')} ${mk('Y', 'y')} ${mk('U', 'u')} ${mk('I', 'i')} ${mk('O', 'o')} ${mk('P', 'p')}
      </div>
      <div class="vkeyboard-row">
        ${mk('A', 'a', '', 'M')} ${mk('S', 's', '', 'M')} ${mk('D', 'd', '', 'M')} ${mk('F', 'f')} ${mk('G', 'g')} ${mk('H', 'h')} ${mk('J', 'j')} ${mk('K', 'k')} ${mk('L', 'l')}
      </div>
      <div class="vkeyboard-row">
        ${mk('Z', 'z', '', 'CCW')} ${mk('X', 'x', '', 'CW')} ${mk('C', 'c')} ${mk('V', 'v')} ${mk('B', 'b')} ${mk('N', 'n')} ${mk('M', 'm')}
      </div>
    </div>
  `;
}
function renderControls() {
    const container = document.getElementById('controlsPanel');
    if (!container)
        return;
    const zh = document.documentElement.getAttribute('data-lang') === 'zh';
    const meta = GAMES.find((g) => g.id === currentGameName);
    if (!meta) {
        container.innerHTML = '';
        return;
    }
    const activeKeys = meta.controls.keyboard?.flatMap((k) => k.keys.map(normalizeKey)) || [];
    let html = '<div class="control-section">';
    html += `<div class="control-section-title">${zh ? '操作说明' : 'Controls'}</div>`;
    if (meta.controls.keyboard && meta.controls.keyboard.length) {
        html += `<div class="control-group-title">${zh ? '键盘' : 'Keyboard'}</div>`;
        for (const row of meta.controls.keyboard) {
            const keysHtml = row.keys.map((k) => `<span class="keycap">${k}</span>`).join('');
            html += `<div class="control-row"><div class="control-keys">${keysHtml}</div><div class="control-label">${zh ? row.actionZh : row.action}</div></div>`;
        }
        html += renderVirtualKeyboard(activeKeys);
    }
    if (meta.controls.touch && meta.controls.touch.length) {
        html += `<div class="control-group-title" style="margin-top:14px">${zh ? '触屏' : 'Touch'}</div>`;
        for (const row of meta.controls.touch) {
            html += `<div class="control-row"><div class="control-icon">${renderTouchIcon(row.icon)}</div><div class="control-label">${zh ? row.actionZh : row.action}</div></div>`;
        }
    }
    html += '</div>';
    container.innerHTML = html;
}
function normalizeKey(label) {
    const map = {
        '←': 'ArrowLeft',
        '↑': 'ArrowUp',
        '→': 'ArrowRight',
        '↓': 'ArrowDown',
        'Space': ' ',
    };
    if (map[label])
        return map[label];
    return label.length === 1 ? label.toLowerCase() : label;
}
function getKeysFromEvent(e) {
    const keys = [e.key];
    if (e.code === 'Space')
        keys.push(' ');
    if (e.key.length === 1)
        keys.push(e.key.toLowerCase());
    // Deduplicate
    return [...new Set(keys)];
}
export function prepareGame(name) {
    const meta = GAMES.find((g) => g.id === name);
    if (!meta)
        return;
    if (currentGameInstance) {
        currentGameInstance.stop?.();
        currentGameInstance = null;
    }
    isRunning = false;
    currentGameName = name;
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    if (ctx)
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = meta.canvasSize.width;
    canvas.height = meta.canvasSize.height;
    currentGameInstance = new meta.cls();
    updateActionButton();
    updateGameTitle();
    renderControls();
    document.querySelectorAll('.game-list-item').forEach((el) => {
        el.classList.toggle('active', el.getAttribute('data-id') === name);
    });
}
function startPreparedGame() {
    if (!currentGameInstance)
        return;
    try {
        currentGameInstance.stop?.();
        currentGameInstance.start();
        isRunning = true;
        updateActionButton();
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
    }
}
export function loadGame(name) {
    prepareGame(name);
    startPreparedGame();
}
function renderGameList(filter = '') {
    const list = document.getElementById('gameList');
    if (!list)
        return;
    const zh = document.documentElement.getAttribute('data-lang') === 'zh';
    const term = filter.trim().toLowerCase();
    const filtered = GAMES.filter((g) => {
        if (!term)
            return true;
        return (g.name.toLowerCase().includes(term) ||
            g.nameZh.includes(term) ||
            g.desc.toLowerCase().includes(term) ||
            g.descZh.includes(term));
    });
    list.innerHTML = filtered
        .map((g) => `
      <button class="game-list-item ${g.id === currentGameName ? 'active' : ''}" data-id="${g.id}">
        <div class="game-list-name">${zh ? g.nameZh : g.name}</div>
        <div class="game-list-desc">${zh ? g.descZh : g.desc}</div>
      </button>
    `)
        .join('');
    list.querySelectorAll('.game-list-item').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            prepareGame(id);
        });
    });
}
function setLang(lang) {
    document.documentElement.setAttribute('data-lang', lang);
    localStorage.setItem('cg-lang', lang);
    updateActionButton();
    updateGameTitle();
    renderControls();
    renderGameList(document.getElementById('searchInput')?.value || '');
    document.querySelectorAll('.lang-btn').forEach((b) => {
        const target = b.getAttribute('data-lang');
        b.classList.toggle('active', target === lang);
    });
}
function setTheme(mode) {
    const root = document.documentElement;
    if (mode === 'light' || mode === 'dark') {
        root.setAttribute('data-theme', mode);
    }
    else {
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
const pressedKeys = new Set();
window.addEventListener('keydown', (e) => {
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
// Init UI
(function init() {
    const savedLang = localStorage.getItem('cg-lang') || 'zh';
    const savedTheme = localStorage.getItem('cg-theme') || 'system';
    setLang(savedLang);
    setTheme(savedTheme);
    renderGameList();
    const search = document.getElementById('searchInput');
    if (search) {
        search.addEventListener('input', () => renderGameList(search.value));
    }
    const actionBtn = document.getElementById('actionBtn');
    if (actionBtn) {
        actionBtn.addEventListener('click', startPreparedGame);
    }
    if (GAMES.length) {
        prepareGame(GAMES[0].id);
    }
})();
//# sourceMappingURL=main.js.map