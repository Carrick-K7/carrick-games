import { BaseGame } from '../core/game.js';
const W = 400;
const H = 520;
const ROWS = 6;
const COLS = 5;
const CELL_SIZE = 54;
const CELL_GAP = 6;
const GRID_TOP = 12;
const GRID_LEFT = (W - (COLS * CELL_SIZE + (COLS - 1) * CELL_GAP)) / 2;
const KEYBOARD_TOP = GRID_TOP + ROWS * CELL_SIZE + (ROWS - 1) * CELL_GAP + 16;
const KEY_HEIGHT = 32;
const KEY_GAP = 4;
const WORDS = [
    'ABOUT', 'ABOVE', 'APPLE', 'BEACH', 'BRAIN', 'BREAD', 'BRING', 'BROWN', 'CANDY', 'CHAIR',
    'CHART', 'CLEAN', 'CLOCK', 'CLOUD', 'DANCE', 'DEPTH', 'DREAM', 'DRIVE', 'EARTH', 'FEAST',
    'FIELD', 'FLAME', 'FRUIT', 'GHOST', 'GLASS', 'GRAPE', 'GREEN', 'HEART', 'HOUSE', 'LEMON',
    'LIGHT', 'MONEY', 'MUSIC', 'NIGHT', 'OCEAN', 'PAINT', 'PAPER', 'PEACH', 'PIANO', 'PLANE',
    'PLANT', 'QUEEN', 'RIVER', 'ROBOT', 'SHARP', 'SHEEP', 'SLEEP', 'SMILE', 'SNAKE', 'SPACE',
    'SPEAK', 'SPEED', 'SPOON', 'SPORT', 'START', 'STEAM', 'STICK', 'STONE', 'STORM', 'STORY',
    'SUGAR', 'SWEET', 'TABLE', 'TASTE', 'THEME', 'THING', 'THINK', 'TIGER', 'TOUCH', 'TOWER',
    'TRACK', 'TRAIN', 'TREAT', 'TRUST', 'UNCLE', 'VIDEO', 'VOICE', 'WATCH', 'WATER', 'WHALE',
    'WHITE', 'WHOLE', 'WORLD', 'YOUTH', 'ZEBRA',
];
const KEY_ROWS = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Enter', 'Backspace'],
];
export class WordleGame extends BaseGame {
    constructor() {
        super('gameCanvas', W, H);
        this.grid = [];
        this.currentRow = 0;
        this.currentCol = 0;
        this.targetWord = '';
        this.gameOver = false;
        this.won = false;
        this.score = 0;
        this.shakeRow = -1;
        this.shakeTimer = 0;
        this.flips = [];
        this.animating = false;
        this.message = '';
        this.messageTimer = 0;
        this.keyRects = [];
        this.keyStates = new Map();
        this.reported = false;
        this.activeKey = null;
        this.activeKeyTimer = 0;
    }
    init() {
        this.targetWord = WORDS[Math.floor(Math.random() * WORDS.length)];
        this.grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({ letter: '', state: 'empty' })));
        this.currentRow = 0;
        this.currentCol = 0;
        this.gameOver = false;
        this.won = false;
        this.score = 0;
        this.shakeRow = -1;
        this.shakeTimer = 0;
        this.flips = [];
        this.animating = false;
        this.message = '';
        this.messageTimer = 0;
        this.keyStates = new Map();
        this.reported = false;
        this.activeKey = null;
        this.activeKeyTimer = 0;
    }
    update(dt) {
        const deltaMs = dt * 1000;
        if (this.shakeTimer > 0) {
            this.shakeTimer -= deltaMs;
            if (this.shakeTimer <= 0) {
                this.shakeTimer = 0;
                this.shakeRow = -1;
            }
        }
        if (this.messageTimer > 0) {
            this.messageTimer -= deltaMs;
            if (this.messageTimer <= 0) {
                this.messageTimer = 0;
                this.message = '';
            }
        }
        if (this.activeKeyTimer > 0) {
            this.activeKeyTimer -= deltaMs;
            if (this.activeKeyTimer <= 0) {
                this.activeKeyTimer = 0;
                this.activeKey = null;
            }
        }
        if (this.flips.length > 0) {
            this.animating = true;
            let allDone = true;
            for (const f of this.flips) {
                f.t += dt * 2.5; // flip speed
                if (f.t < 1)
                    allDone = false;
                else
                    f.t = 1;
            }
            if (allDone) {
                this.flips = [];
                this.animating = false;
                if (this.gameOver && !this.reported) {
                    this.reported = true;
                    window.reportScore?.(this.score);
                }
            }
        }
    }
    draw(ctx) {
        const theme = this.getTheme();
        const zh = this.isZh();
        ctx.fillStyle = theme.bg;
        ctx.fillRect(0, 0, W, H);
        this.drawGrid(ctx, theme);
        this.drawKeyboard(ctx, theme);
        if (this.message) {
            this.drawMessage(ctx, theme, this.message);
        }
        if (this.gameOver && !this.animating && this.flips.length === 0) {
            this.drawOverlay(ctx, theme, zh);
        }
    }
    handleInput(e) {
        if (this.gameOver && this.flips.length === 0 && !this.animating) {
            if (e instanceof KeyboardEvent && e.type === 'keydown') {
                if (e.key === 'Enter' || e.key === ' ') {
                    this.init();
                    return;
                }
            }
            if (e instanceof MouseEvent && e.type === 'mousedown') {
                this.init();
                return;
            }
            if (e instanceof TouchEvent && e.type === 'touchstart') {
                e.preventDefault();
                this.init();
                return;
            }
        }
        if (this.animating)
            return;
        if (e instanceof KeyboardEvent) {
            if (e.type !== 'keydown')
                return;
            const key = e.key;
            if (key === 'Enter') {
                this.submitGuess();
            }
            else if (key === 'Backspace') {
                this.deleteLetter();
            }
            else if (/^[a-zA-Z]$/.test(key)) {
                this.addLetter(key.toUpperCase());
            }
            return;
        }
        if (e instanceof TouchEvent) {
            if (e.type !== 'touchstart')
                return;
            e.preventDefault();
            const touch = e.touches[0] || e.changedTouches[0];
            if (!touch)
                return;
            this.handlePointer(touch.clientX, touch.clientY);
            return;
        }
        if (e instanceof MouseEvent) {
            if (e.type !== 'mousedown')
                return;
            this.handlePointer(e.clientX, e.clientY);
        }
    }
    handlePointer(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;
        for (const kr of this.keyRects) {
            if (x >= kr.x && x <= kr.x + kr.w && y >= kr.y && y <= kr.y + kr.h) {
                this.activeKey = kr.key;
                this.activeKeyTimer = 150;
                if (kr.key === 'Enter') {
                    this.submitGuess();
                }
                else if (kr.key === 'Backspace') {
                    this.deleteLetter();
                }
                else if (kr.key.length === 1 && /^[A-Z]$/.test(kr.key)) {
                    this.addLetter(kr.key);
                }
                return;
            }
        }
    }
    addLetter(letter) {
        if (this.currentCol < COLS && this.currentRow < ROWS) {
            this.grid[this.currentRow][this.currentCol].letter = letter;
            this.currentCol++;
        }
    }
    deleteLetter() {
        if (this.currentCol > 0) {
            this.currentCol--;
            this.grid[this.currentRow][this.currentCol].letter = '';
        }
    }
    submitGuess() {
        const zh = this.isZh();
        if (this.currentCol < COLS) {
            this.shakeRow = this.currentRow;
            this.shakeTimer = 400;
            this.message = zh ? '字母不够' : 'NOT ENOUGH';
            this.messageTimer = 1200;
            return;
        }
        const guess = this.grid[this.currentRow].map((t) => t.letter).join('');
        const result = this.evaluateGuess(guess);
        for (let c = 0; c < COLS; c++) {
            this.grid[this.currentRow][c].state = result[c];
        }
        // Start flip animations staggered by column
        for (let c = 0; c < COLS; c++) {
            this.flips.push({ row: this.currentRow, col: c, t: -c * 0.18 });
        }
        // Update keyboard key states
        for (let c = 0; c < COLS; c++) {
            const letter = guess[c];
            const state = result[c];
            const current = this.keyStates.get(letter);
            const rank = { empty: 0, gray: 1, yellow: 2, green: 3 };
            if (!current || rank[state] > rank[current]) {
                this.keyStates.set(letter, state);
            }
        }
        if (guess === this.targetWord) {
            this.won = true;
            this.gameOver = true;
            this.score = (7 - (this.currentRow + 1)) * 100;
        }
        else if (this.currentRow >= ROWS - 1) {
            this.gameOver = true;
            this.score = (7 - ROWS) * 100;
        }
        else {
            this.currentRow++;
            this.currentCol = 0;
        }
    }
    evaluateGuess(guess) {
        const result = Array(COLS).fill('gray');
        const targetChars = this.targetWord.split('');
        const used = Array(COLS).fill(false);
        // First pass: greens
        for (let i = 0; i < COLS; i++) {
            if (guess[i] === targetChars[i]) {
                result[i] = 'green';
                used[i] = true;
            }
        }
        // Second pass: yellows
        for (let i = 0; i < COLS; i++) {
            if (result[i] === 'green')
                continue;
            for (let j = 0; j < COLS; j++) {
                if (used[j])
                    continue;
                if (guess[i] === targetChars[j]) {
                    result[i] = 'yellow';
                    used[j] = true;
                    break;
                }
            }
        }
        return result;
    }
    drawGrid(ctx, theme) {
        for (let r = 0; r < ROWS; r++) {
            const shakeOffset = r === this.shakeRow && this.shakeTimer > 0
                ? Math.sin(this.shakeTimer * 0.05) * 6
                : 0;
            for (let c = 0; c < COLS; c++) {
                const tile = this.grid[r][c];
                const x = GRID_LEFT + c * (CELL_SIZE + CELL_GAP) + shakeOffset;
                const y = GRID_TOP + r * (CELL_SIZE + CELL_GAP);
                // Check if this tile is flipping
                const flip = this.flips.find((f) => f.row === r && f.col === c);
                let scaleY = 1;
                let drawState = tile.state;
                let drawLetter = tile.letter;
                if (flip) {
                    const t = Math.max(0, flip.t);
                    if (t < 0.5) {
                        scaleY = 1 - t * 2;
                        drawState = 'empty';
                    }
                    else {
                        scaleY = (t - 0.5) * 2;
                    }
                }
                ctx.save();
                ctx.translate(x + CELL_SIZE / 2, y + CELL_SIZE / 2);
                ctx.scale(1, scaleY);
                ctx.translate(-(x + CELL_SIZE / 2), -(y + CELL_SIZE / 2));
                let fill;
                let stroke;
                let textColor;
                switch (drawState) {
                    case 'green':
                        fill = theme.green;
                        stroke = theme.green;
                        textColor = '#ffffff';
                        break;
                    case 'yellow':
                        fill = theme.yellow;
                        stroke = theme.yellow;
                        textColor = '#ffffff';
                        break;
                    case 'gray':
                        fill = theme.gray;
                        stroke = theme.gray;
                        textColor = '#ffffff';
                        break;
                    default:
                        fill = theme.bg;
                        stroke = theme.border;
                        textColor = theme.text;
                }
                ctx.fillStyle = fill;
                ctx.strokeStyle = stroke;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(x, y, CELL_SIZE, CELL_SIZE, 4);
                ctx.fill();
                ctx.stroke();
                if (drawLetter) {
                    ctx.fillStyle = textColor;
                    ctx.font = 'bold 28px "Press Start 2P", monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(drawLetter, x + CELL_SIZE / 2, y + CELL_SIZE / 2 + 2);
                }
                ctx.restore();
            }
        }
    }
    drawKeyboard(ctx, theme) {
        this.keyRects = [];
        const baseWidth = 32;
        const wideWidth = 48;
        for (let rowIdx = 0; rowIdx < KEY_ROWS.length; rowIdx++) {
            const keys = KEY_ROWS[rowIdx];
            let totalWidth = 0;
            for (const key of keys) {
                totalWidth += (key === 'Enter' || key === 'Backspace') ? wideWidth : baseWidth;
            }
            totalWidth += (keys.length - 1) * KEY_GAP;
            let x = (W - totalWidth) / 2;
            const y = KEYBOARD_TOP + rowIdx * (KEY_HEIGHT + KEY_GAP);
            for (const key of keys) {
                const w = (key === 'Enter' || key === 'Backspace') ? wideWidth : baseWidth;
                const isActive = this.activeKey === key && this.activeKeyTimer > 0;
                this.drawKey(ctx, key, x, y, w, KEY_HEIGHT, theme, isActive);
                this.keyRects.push({ key, x, y, w, h: KEY_HEIGHT });
                x += w + KEY_GAP;
            }
        }
    }
    drawKey(ctx, key, x, y, w, h, theme, active) {
        const state = this.keyStates.get(key);
        let bg;
        let textColor;
        if (active) {
            bg = theme.accent;
            textColor = '#ffffff';
        }
        else if (state === 'green') {
            bg = theme.green;
            textColor = '#ffffff';
        }
        else if (state === 'yellow') {
            bg = theme.yellow;
            textColor = '#ffffff';
        }
        else if (state === 'gray') {
            bg = theme.gray;
            textColor = '#ffffff';
        }
        else {
            bg = theme.keyBg;
            textColor = theme.keyText;
        }
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 4);
        ctx.fill();
        ctx.fillStyle = textColor;
        ctx.font = `10px "Press Start 2P", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let label = key;
        if (key === 'Enter')
            label = 'ENT';
        if (key === 'Backspace')
            label = 'DEL';
        ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    }
    drawMessage(ctx, theme, message) {
        const padding = 12;
        ctx.font = '12px "Press Start 2P", monospace';
        const textWidth = ctx.measureText(message).width;
        const boxW = textWidth + padding * 2;
        const boxH = 32;
        const boxX = (W - boxW) / 2;
        const boxY = GRID_TOP + ROWS * (CELL_SIZE + CELL_GAP) / 2 - boxH / 2;
        ctx.fillStyle = theme.text;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 6);
        ctx.fill();
        ctx.fillStyle = theme.bg;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(message, W / 2, boxY + boxH / 2 + 1);
    }
    drawOverlay(ctx, theme, zh) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = theme.overlay;
        ctx.beginPath();
        ctx.roundRect(40, 180, W - 80, 160, 12);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (this.won) {
            ctx.fillStyle = theme.green;
            ctx.font = '16px "Press Start 2P", monospace';
            ctx.fillText(zh ? '恭喜!' : 'YOU WIN!', W / 2, 220);
            ctx.fillStyle = theme.text;
            ctx.font = '12px "Press Start 2P", monospace';
            ctx.fillText(`${zh ? '分数' : 'SCORE'} ${this.score}`, W / 2, 252);
        }
        else {
            ctx.fillStyle = theme.gray;
            ctx.font = '16px "Press Start 2P", monospace';
            ctx.fillText(zh ? '游戏结束' : 'GAME OVER', W / 2, 220);
            ctx.fillStyle = theme.text;
            ctx.font = '12px "Press Start 2P", monospace';
            ctx.fillText(`${zh ? '单词' : 'WORD'}: ${this.targetWord}`, W / 2, 252);
        }
        ctx.fillStyle = theme.accent;
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.fillText(zh ? '按 Enter 重新开始' : 'PRESS ENTER', W / 2, 290);
    }
    getTheme() {
        const isDark = !document.documentElement.hasAttribute('data-theme') ||
            document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
            return {
                bg: '#0b0f19',
                text: '#ffffff',
                accent: '#39C5BB',
                border: '#3a3a3c',
                green: '#538d4e',
                yellow: '#b59f3b',
                gray: '#3a3a3c',
                keyBg: '#818384',
                keyText: '#ffffff',
                overlay: 'rgba(11,15,25,0.95)',
            };
        }
        return {
            bg: '#fafafa',
            text: '#1a1a2e',
            accent: '#0d9488',
            border: '#d3d6da',
            green: '#6aaa64',
            yellow: '#c9b458',
            gray: '#787c7e',
            keyBg: '#d3d6da',
            keyText: '#1a1a2e',
            overlay: 'rgba(250,250,250,0.95)',
        };
    }
    isZh() {
        return document.documentElement.getAttribute('data-lang') === 'zh';
    }
}
//# sourceMappingURL=wordle.js.map