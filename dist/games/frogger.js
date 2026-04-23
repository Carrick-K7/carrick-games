import { BaseGame } from '../core/game.js';
const GRID = 40;
const COLS = 12; // 480 / 40
const ROWS = 13; // 520 / 40
const CANVAS_W = 480;
const CANVAS_H = 560; // 520 + 40 HUD
const HUD_H = 40;
const FROG_W = 28;
const FROG_H = 28;
const HOMES = 5;
const SLOT_W = 56;
const SLOT_GAP = (CANVAS_W - HOMES * SLOT_W) / (HOMES + 1);
function getThemeColor(name, fallback) {
    if (typeof window === 'undefined')
        return fallback;
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
}
export class FroggerGame extends BaseGame {
    constructor() {
        super('gameCanvas', CANVAS_W, CANVAS_H);
        // Game state
        this.state = 'waiting';
        this.score = 0;
        this.lives = 3;
        this.level = 1;
        // Frog
        this.frogX = 0;
        this.frogY = 0;
        this.frogCol = 0;
        this.frogRow = 0;
        this.frogDir = 'UP';
        this.hopPhase = 0; // 0=idle, >0=hopping (0..1)
        this.hopStartX = 0;
        this.hopStartY = 0;
        this.hopTargetX = 0;
        this.hopTargetY = 0;
        this.hopDur = 0.12; // seconds
        this.isDead = false;
        this.deathTimer = 0;
        this.deathDur = 0.8;
        // Lanes
        this.lanes = [];
        // Home slots
        this.homeSlots = [];
        this.homesFilled = 0;
        // Level complete timer
        this.levelCompleteTimer = 0;
        this.levelCompleteDur = 1.5;
        // Speed multiplier
        this.speedMult = 1;
    }
    init() {
        this.state = 'waiting';
        this.score = 0;
        this.lives = 3;
        this.level = 1;
        this.speedMult = 1;
        this.resetFrog();
    }
    resetFrog() {
        this.frogCol = Math.floor(COLS / 2);
        this.frogRow = ROWS - 1;
        this.commitFrogPos();
        this.frogDir = 'UP';
        this.hopPhase = 0;
        this.isDead = false;
    }
    commitFrogPos() {
        this.frogX = this.frogCol * GRID + (GRID - FROG_W) / 2;
        this.frogY = HUD_H + this.frogRow * GRID + (GRID - FROG_H) / 2;
        this.hopStartX = this.frogX;
        this.hopStartY = this.frogY;
        this.hopTargetX = this.frogX;
        this.hopTargetY = this.frogY;
    }
    buildLanes() {
        this.lanes = [];
        this.homeSlots = [];
        // Row 0 = HUD (skip, drawn separately)
        // Rows 1-5 = Water lanes
        const waterColors = ['#1565c0', '#1976d2', '#1e88e5', '#1565c0', '#1976d2'];
        const roadColors = ['#424242', '#616161', '#424242', '#616161', '#424242'];
        for (let r = 1; r <= 5; r++) {
            const lane = { type: 'water', y: HUD_H + r * GRID, objects: [] };
            // Alternate directions, speed varies by row
            const dir = r % 2 === 0 ? 1 : -1;
            const baseSpeed = (50 + r * 15) * this.speedMult;
            const n = r % 2 === 0 ? 3 : 4;
            const objW = r % 2 === 0 ? 110 : 80;
            const gap = CANVAS_W / n;
            for (let i = 0; i < n; i++) {
                const isLog = Math.random() > 0.35;
                lane.objects.push({
                    x: i * gap + Math.random() * 20,
                    y: lane.y + 4,
                    w: isLog ? (r % 2 === 0 ? 130 : 100) : 56,
                    h: GRID - 8,
                    speed: baseSpeed * dir,
                });
            }
            this.lanes.push(lane);
        }
        // Row 6 = Safe median
        this.lanes.push({ type: 'safe', y: HUD_H + 6 * GRID, objects: [] });
        // Rows 7-11 = Road lanes
        for (let r = 7; r <= 11; r++) {
            const lane = { type: 'road', y: HUD_H + r * GRID, objects: [] };
            const dir = r % 2 === 0 ? -1 : 1;
            const baseSpeed = (70 + (r - 7) * 20) * this.speedMult;
            const n = r % 2 === 0 ? 3 : 4;
            const gap = CANVAS_W / n;
            for (let i = 0; i < n; i++) {
                const isTruck = Math.random() > 0.55;
                lane.objects.push({
                    x: i * gap + Math.random() * 15,
                    y: lane.y + 5,
                    w: isTruck ? (r % 2 === 0 ? 100 : 80) : (r % 2 === 0 ? 44 : 36),
                    h: GRID - 10,
                    speed: baseSpeed * dir,
                });
            }
            this.lanes.push(lane);
        }
        // Row 12 = Safe start zone (drawn separately)
        // Build home slots (row 0, between water lanes and top)
        const goalY = HUD_H + 0 * GRID;
        for (let i = 0; i < HOMES; i++) {
            const sx = SLOT_GAP + i * (SLOT_W + SLOT_GAP);
            this.homeSlots.push({ x: sx + SLOT_W / 2, y: goalY + GRID / 2, filled: false });
        }
    }
    start() {
        super.start();
        if (this.state === 'gameover') {
            this.score = 0;
            this.lives = 3;
            this.level = 1;
            this.speedMult = 1;
        }
        this.state = 'playing';
        this.buildLanes();
        this.resetFrog();
    }
    stop() {
        super.stop();
        this.state = 'waiting';
        this.isDead = false;
    }
    tryHop(dir) {
        if (this.state !== 'playing' || this.isDead || this.hopPhase > 0)
            return;
        let newCol = this.frogCol;
        let newRow = this.frogRow;
        switch (dir) {
            case 'UP':
                newRow--;
                break;
            case 'DOWN':
                newRow++;
                break;
            case 'LEFT':
                newCol--;
                break;
            case 'RIGHT':
                newCol++;
                break;
        }
        if (newCol < 0 || newCol >= COLS)
            return;
        if (newRow < 0)
            return; // Can't go above home row
        if (newRow >= ROWS)
            return; // Can't go below start row
        this.frogDir = dir;
        this.frogCol = newCol;
        this.frogRow = newRow;
        this.hopStartX = this.frogX;
        this.hopStartY = this.frogY;
        this.hopTargetX = newCol * GRID + (GRID - FROG_W) / 2;
        this.hopTargetY = HUD_H + newRow * GRID + (GRID - FROG_H) / 2;
        this.hopPhase = 0.001;
        // Score for forward hop
        if (dir === 'UP')
            this.score += 10;
    }
    die() {
        if (this.isDead)
            return;
        this.isDead = true;
        this.deathTimer = 0;
        this.lives--;
        if (this.lives < 0)
            this.lives = 0;
    }
    fillHome(col) {
        // Match frog col to nearest unfilled home slot
        let best = -1;
        let bestDist = Infinity;
        for (let i = 0; i < this.homeSlots.length; i++) {
            const s = this.homeSlots[i];
            if (s.filled)
                continue;
            const slotCol = Math.floor((s.x - SLOT_W / 2) / (CANVAS_W / COLS));
            const dist = Math.abs(slotCol - col);
            if (dist < bestDist) {
                bestDist = dist;
                best = i;
            }
        }
        if (best >= 0) {
            this.homeSlots[best].filled = true;
            this.homesFilled++;
            this.score += 50;
        }
        if (this.homesFilled >= HOMES) {
            this.state = 'levelcomplete';
            this.levelCompleteTimer = 0;
            this.score += 100;
        }
    }
    rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
        return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }
    update(dt) {
        if (this.state === 'waiting')
            return;
        if (this.state === 'levelcomplete') {
            this.levelCompleteTimer += dt;
            if (this.levelCompleteTimer >= this.levelCompleteDur) {
                this.level++;
                this.speedMult = 1 + (this.level - 1) * 0.15;
                this.homesFilled = 0;
                this.homeSlots.forEach(s => s.filled = false);
                this.buildLanes();
                this.resetFrog();
                this.state = 'playing';
            }
            return;
        }
        if (this.state === 'gameover')
            return;
        // Hop animation
        if (this.hopPhase > 0) {
            this.hopPhase += dt / this.hopDur;
            if (this.hopPhase >= 1) {
                this.hopPhase = 0;
                this.frogX = this.hopTargetX;
                this.frogY = this.hopTargetY;
                this.hopStartX = this.frogX;
                this.hopStartY = this.frogY;
            }
            else {
                // Ease out
                const t = 1 - Math.pow(1 - this.hopPhase, 3);
                this.frogX = this.hopStartX + (this.hopTargetX - this.hopStartX) * t;
                this.frogY = this.hopStartY + (this.hopTargetY - this.hopStartY) * t;
            }
        }
        // Death animation
        if (this.isDead) {
            this.deathTimer += dt;
            if (this.deathTimer >= this.deathDur) {
                if (this.lives <= 0) {
                    this.state = 'gameover';
                    this.isDead = false;
                    window.reportScore?.(this.score);
                }
                else {
                    this.resetFrog();
                }
            }
            return;
        }
        // Move objects
        for (const lane of this.lanes) {
            for (const obj of lane.objects) {
                obj.x += obj.speed * dt;
                if (obj.speed > 0 && obj.x > CANVAS_W)
                    obj.x = -obj.w;
                if (obj.speed < 0 && obj.x + obj.w < 0)
                    obj.x = CANVAS_W;
            }
        }
        // Frog riding on water objects
        const fgx = this.frogX + FROG_W / 2;
        const fgy = this.frogY + FROG_H / 2;
        // Determine frog's current lane type and check collisions
        const frogLaneIdx = this.frogRow - 1; // lanes[0] = row1, lanes[4] = row5
        const safeLaneIdx = 5; // row6 median
        const roadLaneIdx = this.frogRow - 7; // lanes[6..10] = rows7..11
        if (this.frogRow >= 1 && this.frogRow <= 5) {
            // Water lanes
            const laneIdx = this.frogRow - 1;
            const lane = this.lanes[laneIdx];
            let onObj = false;
            for (const obj of lane.objects) {
                if (this.rectsOverlap(this.frogX + 4, this.frogY + 4, FROG_W - 8, FROG_H - 8, obj.x, obj.y, obj.w, obj.h)) {
                    onObj = true;
                    // Carry frog with object
                    if (!this.isDead && this.hopPhase === 0) {
                        this.frogX += obj.speed * dt;
                        this.frogY = obj.y + (GRID - FROG_H) / 2;
                        this.hopStartX = this.frogX;
                        this.hopStartY = this.frogY;
                        this.hopTargetX = this.frogX;
                        this.hopTargetY = this.frogY;
                    }
                    break;
                }
            }
            if (!onObj && this.state === 'playing') {
                this.die();
            }
            // Check if carried off screen
            if (this.frogX + FROG_W < 0 || this.frogX > CANVAS_W) {
                this.die();
            }
        }
        else if (this.frogRow >= 7 && this.frogRow <= 11) {
            // Road lanes
            const laneIdx = (this.frogRow - 7) + 6;
            const lane = this.lanes[laneIdx];
            for (const obj of lane.objects) {
                if (this.rectsOverlap(this.frogX + 4, this.frogY + 4, FROG_W - 8, FROG_H - 8, obj.x, obj.y, obj.w, obj.h)) {
                    this.die();
                    break;
                }
            }
        }
        else if (this.frogRow === 0) {
            // Home row — check if landing in a home slot
            this.fillHome(this.frogCol);
            this.resetFrog();
        }
        // Row 6 (median) and row 12 (start) are safe — no checks needed
    }
    draw(ctx) {
        const isDark = !document.documentElement.hasAttribute('data-theme') ||
            getComputedStyle(document.documentElement).getPropertyValue('--bg') !== '#f0f0f0';
        // Background
        ctx.fillStyle = isDark ? '#1a1a2e' : '#e8e8e8';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        // HUD background
        ctx.fillStyle = isDark ? '#0d0d1a' : '#d0d0d0';
        ctx.fillRect(0, 0, CANVAS_W, HUD_H);
        // Home slots (goal row)
        const goalY = HUD_H;
        ctx.fillStyle = isDark ? '#1b5e20' : '#a5d6a7';
        ctx.fillRect(0, goalY, CANVAS_W, GRID);
        for (const slot of this.homeSlots) {
            const sx = slot.x - SLOT_W / 2;
            if (slot.filled) {
                ctx.fillStyle = isDark ? '#2e7d32' : '#81c784';
                ctx.fillRect(sx, goalY + 2, SLOT_W, GRID - 4);
                // Draw frog icon in slot
                this.drawFrogShape(ctx, slot.x, goalY + GRID / 2, isDark, true);
            }
            else {
                ctx.strokeStyle = isDark ? '#4caf50' : '#388e3c';
                ctx.lineWidth = 2;
                ctx.strokeRect(sx + 2, goalY + 4, SLOT_W - 4, GRID - 8);
                // Lily pad hint
                ctx.fillStyle = isDark ? '#2e7d32' : '#a5d6a7';
                ctx.beginPath();
                ctx.arc(slot.x, goalY + GRID / 2, 14, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        // Water lanes (rows 1-5)
        const waterColors = isDark
            ? ['#0d47a1', '#1565c0', '#1976d2', '#0d47a1', '#1565c0']
            : ['#bbdefb', '#90caf9', '#64b5f6', '#bbdefb', '#90caf9'];
        for (let r = 1; r <= 5; r++) {
            const ly = HUD_H + r * GRID;
            ctx.fillStyle = waterColors[r - 1];
            ctx.fillRect(0, ly, CANVAS_W, GRID);
        }
        // Lane labels / lane contents
        for (let li = 0; li < this.lanes.length; li++) {
            const lane = this.lanes[li];
            if (lane.type === 'safe') {
                ctx.fillStyle = isDark ? '#2e7d32' : '#a5d6a7';
                ctx.fillRect(0, lane.y, CANVAS_W, GRID);
            }
            if (lane.type === 'road') {
                const ri = li - 6; // road index 0-4
                ctx.fillStyle = isDark
                    ? (ri % 2 === 0 ? '#424242' : '#616161')
                    : (ri % 2 === 0 ? '#e0e0e0' : '#d0d0d0');
                ctx.fillRect(0, lane.y, CANVAS_W, GRID);
                // Road markings
                if (ri % 2 === 0) {
                    ctx.fillStyle = isDark ? '#f9a825' : '#f9a825';
                    for (let cx = 0; cx < CANVAS_W; cx += 48) {
                        ctx.fillRect(cx, lane.y + GRID / 2 - 1, 24, 2);
                    }
                }
            }
            // Draw objects
            for (const obj of lane.objects) {
                if (lane.type === 'water') {
                    // Log
                    ctx.fillStyle = isDark ? '#6d4c41' : '#a1887f';
                    ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
                    ctx.fillStyle = isDark ? '#8d6e63' : '#bcaaa4';
                    ctx.fillRect(obj.x + 4, obj.y + 2, obj.w - 8, 4);
                    ctx.fillRect(obj.x + 4, obj.y + obj.h - 6, obj.w - 8, 4);
                }
                if (lane.type === 'road') {
                    const ri = li - 6;
                    const colors = isDark
                        ? ['#c62828', '#1565c0', '#f57f17', '#6a1b9a', '#2e7d32']
                        : ['#ef9a9a', '#90caf9', '#fff59d', '#ce93d8', '#a5d6a7'];
                    const col = colors[ri % colors.length];
                    ctx.fillStyle = col;
                    if (obj.w > 70) {
                        // Truck: cab + body
                        ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
                        ctx.fillStyle = isDark ? '#111' : '#555';
                        ctx.fillRect(obj.x + (obj.speed > 0 ? obj.w - 18 : 0), obj.y + 2, 16, obj.h - 4);
                        // Windows
                        ctx.fillStyle = isDark ? '#4fc3f7' : '#b3e5fc';
                        ctx.fillRect(obj.x + (obj.speed > 0 ? obj.w - 14 : 2), obj.y + 3, 10, 8);
                    }
                    else {
                        // Car
                        ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
                        // Windshield
                        ctx.fillStyle = isDark ? '#4fc3f7' : '#b3e5fc';
                        ctx.fillRect(obj.x + (obj.speed > 0 ? obj.w - 10 : 2), obj.y + 3, 8, obj.h - 6);
                    }
                }
            }
        }
        // Safe start zone
        const startY = HUD_H + (ROWS - 1) * GRID;
        ctx.fillStyle = isDark ? '#2e7d32' : '#a5d6a7';
        ctx.fillRect(0, startY, CANVAS_W, GRID);
        // Grid lines (subtle)
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
        ctx.lineWidth = 1;
        for (let r = 0; r <= ROWS; r++) {
            ctx.beginPath();
            ctx.moveTo(0, HUD_H + r * GRID);
            ctx.lineTo(CANVAS_W, HUD_H + r * GRID);
            ctx.stroke();
        }
        for (let c = 0; c <= COLS; c++) {
            ctx.beginPath();
            ctx.moveTo(c * GRID, HUD_H);
            ctx.lineTo(c * GRID, HUD_H + ROWS * GRID);
            ctx.stroke();
        }
        // Draw frog
        if (!this.isDead || Math.floor(this.deathTimer * 8) % 2 === 0) {
            this.drawFrogShape(ctx, this.frogX + FROG_W / 2, this.frogY + FROG_H / 2, isDark, false);
        }
        // HUD text
        this.drawHUD(ctx, isDark);
        // Overlay states
        if (this.state === 'waiting') {
            this.drawOverlay(ctx, isDark, 'PRESS SPACE TO START', 'PRESS SPACE TO START');
        }
        else if (this.state === 'gameover') {
            this.drawOverlay(ctx, isDark, `GAME OVER  SCORE: ${this.score}`, `游戏结束  得分: ${this.score}`);
        }
        else if (this.state === 'levelcomplete') {
            const zh = document.documentElement.getAttribute('data-lang') === 'zh';
            const t = zh ? `第 ${this.level} 关完成!` : `LEVEL ${this.level} CLEAR!`;
            this.drawOverlay(ctx, isDark, `SCORE: ${this.score}`, t);
        }
    }
    drawFrogShape(ctx, cx, cy, isDark, small) {
        const r = small ? 10 : 12;
        const bodyCol = isDark ? '#43a047' : '#66bb6a';
        const eyeCol = isDark ? '#fff' : '#fff';
        const pupilCol = isDark ? '#111' : '#111';
        ctx.fillStyle = bodyCol;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        // Eyes
        ctx.fillStyle = eyeCol;
        ctx.beginPath();
        ctx.arc(cx - 4, cy - 4, 3, 0, Math.PI * 2);
        ctx.arc(cx + 4, cy - 4, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = pupilCol;
        ctx.beginPath();
        ctx.arc(cx - 4, cy - 4, 1.5, 0, Math.PI * 2);
        ctx.arc(cx + 4, cy - 4, 1.5, 0, Math.PI * 2);
        ctx.fill();
        // Legs hint
        ctx.fillStyle = isDark ? '#2e7d32' : '#4caf50';
        if (!small) {
            ctx.fillRect(cx - r - 4, cy + 2, 6, 4);
            ctx.fillRect(cx + r - 2, cy + 2, 6, 4);
        }
    }
    drawHUD(ctx, isDark) {
        ctx.font = "10px 'Press Start 2P', monospace";
        const scoreCol = isDark ? '#fff' : '#111';
        const livesCol = isDark ? '#ef5350' : '#c62828';
        const levelCol = isDark ? '#f9a825' : '#e65100';
        ctx.fillStyle = scoreCol;
        ctx.fillText(`SCORE:${this.score}`, 8, 26);
        ctx.fillStyle = livesCol;
        ctx.fillText(`LIVES:${this.lives}`, 180, 26);
        ctx.fillStyle = levelCol;
        ctx.fillText(`LV:${this.level}`, 340, 26);
    }
    drawOverlay(ctx, isDark, en, zh) {
        ctx.fillStyle = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.font = "11px 'Press Start 2P', monospace";
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(en, CANVAS_W / 2, CANVAS_H / 2 - 10);
        ctx.fillText(zh, CANVAS_W / 2, CANVAS_H / 2 + 12);
        ctx.textAlign = 'left';
    }
    handleAction() {
        if (this.state === 'waiting') {
            this.start();
            return;
        }
        if (this.state === 'gameover') {
            this.start();
            return;
        }
    }
    handleInput(e) {
        if (e instanceof KeyboardEvent) {
            if (e.type !== 'keydown')
                return;
            const key = e.key;
            if (this.state === 'waiting' || this.state === 'gameover') {
                if (key === ' ' || e.code === 'Space') {
                    e.preventDefault();
                    this.handleAction();
                }
                return;
            }
            if (this.state !== 'playing')
                return;
            switch (key) {
                case 'ArrowUp':
                case 'w':
                case 'W':
                    e.preventDefault();
                    this.tryHop('UP');
                    break;
                case 'ArrowDown':
                case 's':
                case 'S':
                    e.preventDefault();
                    this.tryHop('DOWN');
                    break;
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    e.preventDefault();
                    this.tryHop('LEFT');
                    break;
                case 'ArrowRight':
                case 'd':
                case 'D':
                    e.preventDefault();
                    this.tryHop('RIGHT');
                    break;
            }
            return;
        }
        if (e instanceof TouchEvent) {
            e.preventDefault();
            if (e.type !== 'touchstart')
                return;
            if (this.state === 'waiting' || this.state === 'gameover') {
                this.handleAction();
                return;
            }
            if (this.state !== 'playing')
                return;
            const rect = this.canvas.getBoundingClientRect();
            const t = e.touches[0];
            const x = (t.clientX - rect.left) * (this.width / rect.width);
            const y = (t.clientY - rect.top) * (this.height / rect.height);
            const cx = this.width / 2;
            const cy = this.height / 2;
            if (Math.abs(x - cx) > Math.abs(y - cy)) {
                if (x > cx)
                    this.tryHop('RIGHT');
                else
                    this.tryHop('LEFT');
            }
            else {
                if (y > cy)
                    this.tryHop('DOWN');
                else
                    this.tryHop('UP');
            }
            return;
        }
        if (e instanceof MouseEvent) {
            if (e.type !== 'mousedown')
                return;
            if (this.state === 'waiting' || this.state === 'gameover') {
                this.handleAction();
                return;
            }
            if (this.state !== 'playing')
                return;
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (this.width / rect.width);
            const y = (e.clientY - rect.top) * (this.height / rect.height);
            const cx = this.width / 2;
            const cy = this.height / 2;
            if (Math.abs(x - cx) > Math.abs(y - cy)) {
                if (x > cx)
                    this.tryHop('RIGHT');
                else
                    this.tryHop('LEFT');
            }
            else {
                if (y > cy)
                    this.tryHop('DOWN');
                else
                    this.tryHop('UP');
            }
            return;
        }
    }
}
//# sourceMappingURL=frogger.js.map