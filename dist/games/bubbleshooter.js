import { BaseGame } from '../core/game.js';
const W = 420;
const H = 620;
const BUBBLE_RADIUS = 18;
const BUBBLE_DIAMETER = BUBBLE_RADIUS * 2;
const ROW_HEIGHT = 31;
const COLS = 10;
const START_ROWS = 5;
const TOP_MARGIN = 28;
const LEFT_MARGIN = 20;
const SHOOTER_X = W / 2;
const SHOOTER_Y = H - 44;
const LOSE_LINE_Y = H - 92;
const SHOT_SPEED = 520;
const SHOTS_PER_ROW = 5;
const AIM_MIN = -Math.PI + 0.18;
const AIM_MAX = -0.18;
const MAX_ROWS = 20;
const BUBBLE_COLORS = ['#39C5BB', '#f97316', '#facc15', '#60a5fa', '#f472b6'];
export class BubbleShooterGame extends BaseGame {
    constructor() {
        super('gameCanvas', W, H);
        this.grid = [];
        this.activeBubble = null;
        this.currentColor = BUBBLE_COLORS[0];
        this.nextColor = BUBBLE_COLORS[1];
        this.aimAngle = -Math.PI / 2;
        this.score = 0;
        this.shotsSinceRow = 0;
        this.gameOver = false;
        this.scoreReported = false;
        this.boundMouseMove = (e) => {
            const point = this.toCanvasPoint(e.clientX, e.clientY);
            this.setAim(point.x, point.y);
        };
        this.canvas.addEventListener('mousemove', this.boundMouseMove);
    }
    init() {
        this.grid = [];
        for (let row = 0; row < START_ROWS; row++) {
            this.grid.push(this.makeRow(BUBBLE_COLORS.slice(0, 4)));
        }
        this.activeBubble = null;
        this.currentColor = this.pickBubbleColor();
        this.nextColor = this.pickBubbleColor();
        this.aimAngle = -Math.PI / 2;
        this.score = 0;
        this.shotsSinceRow = 0;
        this.gameOver = false;
        this.scoreReported = false;
    }
    update(dt) {
        if (this.gameOver || !this.activeBubble)
            return;
        this.activeBubble.x += this.activeBubble.vx * dt;
        this.activeBubble.y += this.activeBubble.vy * dt;
        const minX = LEFT_MARGIN + BUBBLE_RADIUS;
        const maxX = W - LEFT_MARGIN - BUBBLE_RADIUS;
        if (this.activeBubble.x <= minX) {
            this.activeBubble.x = minX + (minX - this.activeBubble.x);
            this.activeBubble.vx = Math.abs(this.activeBubble.vx);
        }
        else if (this.activeBubble.x >= maxX) {
            this.activeBubble.x = maxX - (this.activeBubble.x - maxX);
            this.activeBubble.vx = -Math.abs(this.activeBubble.vx);
        }
        if (this.activeBubble.y <= TOP_MARGIN + BUBBLE_RADIUS) {
            this.activeBubble.y = TOP_MARGIN + BUBBLE_RADIUS;
            this.attachBubble(this.activeBubble);
            return;
        }
        const hit = this.findCollision(this.activeBubble.x, this.activeBubble.y);
        if (hit) {
            this.attachBubble(this.activeBubble, hit);
        }
    }
    draw(ctx) {
        const isDark = !document.documentElement.hasAttribute('data-theme') ||
            document.documentElement.getAttribute('data-theme') === 'dark';
        const zh = document.documentElement.getAttribute('data-lang') === 'zh';
        const bg = isDark ? '#0b0f19' : '#fafafa';
        const panel = isDark ? '#111827' : '#edf7f5';
        const panelBorder = isDark ? 'rgba(57,197,187,0.26)' : 'rgba(13,148,136,0.22)';
        const primary = isDark ? '#39C5BB' : '#0d9488';
        const text = isDark ? '#e0e0e0' : '#1a1a2e';
        const subtext = isDark ? 'rgba(224,224,224,0.65)' : 'rgba(26,26,46,0.68)';
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.fillStyle = panel;
        ctx.fillRect(LEFT_MARGIN - 10, TOP_MARGIN - 10, this.width - (LEFT_MARGIN - 10) * 2, LOSE_LINE_Y - TOP_MARGIN + 20);
        ctx.strokeStyle = panelBorder;
        ctx.lineWidth = 2;
        ctx.strokeRect(LEFT_MARGIN - 10, TOP_MARGIN - 10, this.width - (LEFT_MARGIN - 10) * 2, LOSE_LINE_Y - TOP_MARGIN + 20);
        ctx.strokeStyle = isDark ? 'rgba(57,197,187,0.1)' : 'rgba(13,148,136,0.08)';
        ctx.lineWidth = 1;
        for (let row = 0; row < MAX_ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const center = this.getCellCenter(row, col);
                if (center.y > LOSE_LINE_Y - BUBBLE_RADIUS)
                    continue;
                ctx.beginPath();
                ctx.arc(center.x, center.y, BUBBLE_RADIUS - 2, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        this.drawAimGuide(ctx, primary);
        for (let row = 0; row < this.grid.length; row++) {
            for (let col = 0; col < COLS; col++) {
                const bubble = this.grid[row]?.[col];
                if (!bubble)
                    continue;
                const center = this.getCellCenter(row, col);
                this.drawBubble(ctx, center.x, center.y, bubble.color);
            }
        }
        if (this.activeBubble) {
            this.drawBubble(ctx, this.activeBubble.x, this.activeBubble.y, this.activeBubble.color);
        }
        ctx.strokeStyle = 'rgba(239,68,68,0.75)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.moveTo(LEFT_MARGIN - 4, LOSE_LINE_Y);
        ctx.lineTo(this.width - LEFT_MARGIN + 4, LOSE_LINE_Y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = primary;
        ctx.beginPath();
        ctx.arc(SHOOTER_X, SHOOTER_Y, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = text;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(SHOOTER_X, SHOOTER_Y);
        ctx.lineTo(SHOOTER_X + Math.cos(this.aimAngle) * 36, SHOOTER_Y + Math.sin(this.aimAngle) * 36);
        ctx.stroke();
        this.drawBubble(ctx, SHOOTER_X, SHOOTER_Y - 2, this.currentColor, 0.95);
        this.drawBubble(ctx, SHOOTER_X + 56, SHOOTER_Y + 2, this.nextColor, 0.72);
        ctx.fillStyle = text;
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`SCORE ${this.score}`, 12, 20);
        ctx.fillText(`${zh ? '下行' : 'ROW'} ${SHOTS_PER_ROW - this.shotsSinceRow}`, 12, 42);
        ctx.textAlign = 'right';
        ctx.fillStyle = subtext;
        ctx.fillText(zh ? '下一颗' : 'NEXT', this.width - 12, SHOOTER_Y + 6);
        if (!this.running && !this.gameOver) {
            this.drawOverlay(ctx, zh ? '点击开始' : 'PRESS START', zh ? '鼠标瞄准 点击发射' : 'AIM WITH MOUSE  CLICK TO FIRE', primary, text);
            return;
        }
        if (this.gameOver) {
            this.reportScore();
            this.drawOverlay(ctx, zh ? '游戏结束' : 'GAME OVER', zh ? '点击或空格重新开始' : 'CLICK OR PRESS SPACE', primary, text, `${zh ? '得分' : 'SCORE'} ${this.score}`);
        }
    }
    handleInput(e) {
        if (e instanceof KeyboardEvent) {
            if (e.type !== 'keydown')
                return;
            if ((e.key === ' ' || e.key === 'Enter') && this.gameOver) {
                this.init();
                return;
            }
            if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
                this.adjustAim(-0.12);
            }
            else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
                this.adjustAim(0.12);
            }
            else if (e.key === ' ' || e.key === 'Enter') {
                this.fireBubble();
            }
            return;
        }
        if (e instanceof MouseEvent) {
            const point = this.toCanvasPoint(e.clientX, e.clientY);
            this.setAim(point.x, point.y);
            if (e.type === 'mousedown') {
                if (this.gameOver) {
                    this.init();
                    return;
                }
                this.fireBubble();
            }
            return;
        }
        if (e instanceof TouchEvent) {
            e.preventDefault();
            const touch = e.touches[0] || e.changedTouches[0];
            if (!touch)
                return;
            const point = this.toCanvasPoint(touch.clientX, touch.clientY);
            this.setAim(point.x, point.y);
            if (e.type === 'touchstart') {
                if (this.gameOver) {
                    this.init();
                    return;
                }
                this.fireBubble();
            }
        }
    }
    destroy() {
        this.canvas.removeEventListener('mousemove', this.boundMouseMove);
        super.destroy();
    }
    fireBubble() {
        if (!this.running || this.gameOver || this.activeBubble)
            return;
        this.activeBubble = {
            x: SHOOTER_X,
            y: SHOOTER_Y - BUBBLE_RADIUS - 6,
            vx: Math.cos(this.aimAngle) * SHOT_SPEED,
            vy: Math.sin(this.aimAngle) * SHOT_SPEED,
            color: this.currentColor,
        };
        this.currentColor = this.nextColor;
        this.nextColor = this.pickBubbleColor();
    }
    attachBubble(projectile, hit) {
        const target = this.findAttachmentSlot(projectile.x, projectile.y, hit);
        this.activeBubble = null;
        if (!target) {
            this.triggerGameOver();
            return;
        }
        this.ensureRows(target.row + 1);
        this.grid[target.row][target.col] = { color: projectile.color };
        this.resolveMatches(target);
        this.shotsSinceRow += 1;
        if (!this.gameOver && this.shotsSinceRow >= SHOTS_PER_ROW) {
            this.shotsSinceRow = 0;
            this.addTopRow();
        }
        this.normalizeQueue();
        this.checkBottomReached();
    }
    resolveMatches(origin) {
        const bubble = this.grid[origin.row]?.[origin.col];
        if (!bubble)
            return;
        const cluster = this.collectCluster(origin.row, origin.col, bubble.color);
        if (cluster.length < 3)
            return;
        let removed = this.removePositions(cluster);
        removed += this.removeFloatingBubbles();
        this.score += removed * 10;
        this.trimEmptyRows();
    }
    removeFloatingBubbles() {
        const visited = new Set();
        const queue = [];
        for (let col = 0; col < COLS; col++) {
            if (this.grid[0]?.[col]) {
                queue.push({ row: 0, col });
            }
        }
        while (queue.length) {
            const current = queue.shift();
            if (!current)
                continue;
            const key = `${current.row}:${current.col}`;
            if (visited.has(key) || !this.grid[current.row]?.[current.col])
                continue;
            visited.add(key);
            for (const neighbor of this.getNeighbors(current.row, current.col)) {
                if (this.grid[neighbor.row]?.[neighbor.col]) {
                    queue.push(neighbor);
                }
            }
        }
        let removed = 0;
        for (let row = 0; row < this.grid.length; row++) {
            for (let col = 0; col < COLS; col++) {
                if (!this.grid[row]?.[col])
                    continue;
                const key = `${row}:${col}`;
                if (!visited.has(key)) {
                    this.grid[row][col] = null;
                    removed++;
                }
            }
        }
        return removed;
    }
    removePositions(positions) {
        let removed = 0;
        for (const pos of positions) {
            if (!this.grid[pos.row]?.[pos.col])
                continue;
            this.grid[pos.row][pos.col] = null;
            removed++;
        }
        return removed;
    }
    collectCluster(row, col, color) {
        const found = [];
        const queue = [{ row, col }];
        const visited = new Set();
        while (queue.length) {
            const current = queue.shift();
            if (!current)
                continue;
            const key = `${current.row}:${current.col}`;
            if (visited.has(key))
                continue;
            visited.add(key);
            const bubble = this.grid[current.row]?.[current.col];
            if (!bubble || bubble.color !== color)
                continue;
            found.push(current);
            for (const neighbor of this.getNeighbors(current.row, current.col)) {
                queue.push(neighbor);
            }
        }
        return found;
    }
    findCollision(x, y) {
        let best = null;
        for (let row = 0; row < this.grid.length; row++) {
            for (let col = 0; col < COLS; col++) {
                if (!this.grid[row]?.[col])
                    continue;
                const center = this.getCellCenter(row, col);
                const dist = Math.hypot(center.x - x, center.y - y);
                if (dist > BUBBLE_DIAMETER - 2)
                    continue;
                if (!best || dist < best.dist) {
                    best = { pos: { row, col }, dist };
                }
            }
        }
        return best?.pos ?? null;
    }
    findAttachmentSlot(x, y, hit) {
        const candidateMap = new Map();
        const maxSearchRow = Math.min(MAX_ROWS - 1, Math.max(this.grid.length + 2, 6));
        const addCandidate = (row, col) => {
            if (row < 0 || row > maxSearchRow || col < 0 || col >= COLS)
                return;
            if (this.grid[row]?.[col])
                return;
            if (row > 0 && !this.hasOccupiedNeighbor(row, col))
                return;
            candidateMap.set(`${row}:${col}`, { row, col });
        };
        if (hit) {
            addCandidate(hit.row, hit.col);
            for (const neighbor of this.getNeighbors(hit.row, hit.col)) {
                addCandidate(neighbor.row, neighbor.col);
            }
        }
        for (const nearby of this.getNearbyCells(x, y)) {
            addCandidate(nearby.row, nearby.col);
            for (const neighbor of this.getNeighbors(nearby.row, nearby.col)) {
                addCandidate(neighbor.row, neighbor.col);
            }
        }
        const estimatedRow = Math.max(0, Math.round((y - (TOP_MARGIN + BUBBLE_RADIUS)) / ROW_HEIGHT));
        for (let row = Math.max(0, estimatedRow - 2); row <= Math.min(maxSearchRow, estimatedRow + 2); row++) {
            const estimatedCol = this.getNearestCol(row, x);
            for (let col = estimatedCol - 2; col <= estimatedCol + 2; col++) {
                addCandidate(row, col);
            }
        }
        if (y <= TOP_MARGIN + BUBBLE_DIAMETER || candidateMap.size === 0) {
            for (let row = 0; row <= 2; row++) {
                const estimatedCol = this.getNearestCol(row, x);
                for (let col = estimatedCol - 2; col <= estimatedCol + 2; col++) {
                    addCandidate(row, col);
                }
            }
        }
        let best = null;
        for (const candidate of candidateMap.values()) {
            const center = this.getCellCenter(candidate.row, candidate.col);
            const dist = Math.hypot(center.x - x, center.y - y);
            if (!best || dist < best.dist) {
                best = { pos: candidate, dist };
            }
        }
        if (best)
            return best.pos;
        for (let row = 0; row <= maxSearchRow; row++) {
            for (let col = 0; col < COLS; col++) {
                if (this.grid[row]?.[col])
                    continue;
                if (row > 0 && !this.hasOccupiedNeighbor(row, col))
                    continue;
                return { row, col };
            }
        }
        return null;
    }
    getNearbyCells(x, y) {
        const nearby = [];
        for (let row = 0; row < this.grid.length; row++) {
            for (let col = 0; col < COLS; col++) {
                if (!this.grid[row]?.[col])
                    continue;
                const center = this.getCellCenter(row, col);
                if (Math.hypot(center.x - x, center.y - y) <= BUBBLE_DIAMETER * 1.35) {
                    nearby.push({ row, col });
                }
            }
        }
        return nearby;
    }
    getNeighbors(row, col) {
        const offsets = row % 2 === 0
            ? [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]]
            : [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]];
        const neighbors = [];
        for (const [dr, dc] of offsets) {
            const nextRow = row + dr;
            const nextCol = col + dc;
            if (nextRow >= 0 && nextRow < MAX_ROWS && nextCol >= 0 && nextCol < COLS) {
                neighbors.push({ row: nextRow, col: nextCol });
            }
        }
        return neighbors;
    }
    hasOccupiedNeighbor(row, col) {
        if (row === 0)
            return true;
        return this.getNeighbors(row, col).some((neighbor) => Boolean(this.grid[neighbor.row]?.[neighbor.col]));
    }
    addTopRow() {
        this.grid.unshift(this.makeRow(this.availableColors()));
        if (this.grid.length > MAX_ROWS) {
            this.grid.length = MAX_ROWS;
        }
    }
    makeRow(sourceColors) {
        return Array.from({ length: COLS }, () => ({
            color: this.randomFrom(sourceColors.length ? sourceColors : BUBBLE_COLORS),
        }));
    }
    availableColors() {
        const colors = new Set();
        for (const row of this.grid) {
            for (const bubble of row) {
                if (bubble)
                    colors.add(bubble.color);
            }
        }
        return [...colors];
    }
    pickBubbleColor() {
        const colors = this.availableColors();
        return this.randomFrom(colors.length ? colors : BUBBLE_COLORS);
    }
    normalizeQueue() {
        const colors = this.availableColors();
        if (!colors.length) {
            this.currentColor = this.randomFrom(BUBBLE_COLORS);
            this.nextColor = this.randomFrom(BUBBLE_COLORS);
            return;
        }
        if (!colors.includes(this.currentColor)) {
            this.currentColor = this.randomFrom(colors);
        }
        if (!colors.includes(this.nextColor)) {
            this.nextColor = this.randomFrom(colors);
        }
    }
    randomFrom(colors) {
        return colors[Math.floor(Math.random() * colors.length)] ?? BUBBLE_COLORS[0];
    }
    getNearestCol(row, x) {
        const offset = row % 2 === 1 ? BUBBLE_RADIUS : 0;
        const raw = Math.round((x - LEFT_MARGIN - BUBBLE_RADIUS - offset) / BUBBLE_DIAMETER);
        return Math.max(0, Math.min(COLS - 1, raw));
    }
    getCellCenter(row, col) {
        const offset = row % 2 === 1 ? BUBBLE_RADIUS : 0;
        return {
            x: LEFT_MARGIN + BUBBLE_RADIUS + offset + col * BUBBLE_DIAMETER,
            y: TOP_MARGIN + BUBBLE_RADIUS + row * ROW_HEIGHT,
        };
    }
    ensureRows(count) {
        while (this.grid.length < count) {
            this.grid.push(Array.from({ length: COLS }, () => null));
        }
    }
    trimEmptyRows() {
        while (this.grid.length > 0 && this.grid[this.grid.length - 1].every((bubble) => bubble === null)) {
            this.grid.pop();
        }
    }
    checkBottomReached() {
        for (let row = 0; row < this.grid.length; row++) {
            for (let col = 0; col < COLS; col++) {
                if (!this.grid[row]?.[col])
                    continue;
                const center = this.getCellCenter(row, col);
                if (center.y + BUBBLE_RADIUS >= LOSE_LINE_Y) {
                    this.triggerGameOver();
                    return;
                }
            }
        }
    }
    triggerGameOver() {
        this.gameOver = true;
        this.activeBubble = null;
        this.reportScore();
    }
    reportScore() {
        if (this.scoreReported)
            return;
        this.scoreReported = true;
        window.reportScore?.(this.score);
    }
    drawBubble(ctx, x, y, color, scale = 1) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        const gradient = ctx.createRadialGradient(-6, -8, 4, 0, 0, BUBBLE_RADIUS);
        gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
        gradient.addColorStop(0.18, 'rgba(255,255,255,0.5)');
        gradient.addColorStop(0.22, color);
        gradient.addColorStop(1, 'rgba(15,23,42,0.92)');
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, BUBBLE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, BUBBLE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.beginPath();
        ctx.arc(0, 0, BUBBLE_RADIUS - 1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.48)';
        ctx.beginPath();
        ctx.arc(-6, -7, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    drawAimGuide(ctx, primary) {
        if (this.activeBubble)
            return;
        let x = SHOOTER_X;
        let y = SHOOTER_Y - 8;
        let dx = Math.cos(this.aimAngle);
        let dy = Math.sin(this.aimAngle);
        let remaining = 260;
        const minX = LEFT_MARGIN + BUBBLE_RADIUS;
        const maxX = W - LEFT_MARGIN - BUBBLE_RADIUS;
        const topY = TOP_MARGIN + BUBBLE_RADIUS;
        ctx.strokeStyle = `${primary}88`;
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 7]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        while (remaining > 0 && dy < 0) {
            const distToWall = dx < 0
                ? (x - minX) / -dx
                : dx > 0
                    ? (maxX - x) / dx
                    : Number.POSITIVE_INFINITY;
            const distToTop = (topY - y) / dy;
            const step = Math.max(0, Math.min(remaining, distToWall, distToTop));
            x += dx * step;
            y += dy * step;
            ctx.lineTo(x, y);
            remaining -= step;
            if (distToTop <= distToWall)
                break;
            dx *= -1;
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }
    drawOverlay(ctx, title, subtitle, primary, text, scoreLine) {
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.textAlign = 'center';
        ctx.fillStyle = primary;
        ctx.font = '16px "Press Start 2P", monospace';
        ctx.fillText(title, this.width / 2, this.height / 2 - 34);
        if (scoreLine) {
            ctx.font = '10px "Press Start 2P", monospace';
            ctx.fillText(scoreLine, this.width / 2, this.height / 2 - 2);
        }
        ctx.fillStyle = text;
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillText(subtitle, this.width / 2, this.height / 2 + 28);
        ctx.textAlign = 'left';
    }
    setAim(x, y) {
        const targetY = Math.min(y, SHOOTER_Y - 12);
        const angle = Math.atan2(targetY - SHOOTER_Y, x - SHOOTER_X);
        this.aimAngle = Math.max(AIM_MIN, Math.min(AIM_MAX, angle));
    }
    adjustAim(delta) {
        this.aimAngle = Math.max(AIM_MIN, Math.min(AIM_MAX, this.aimAngle + delta));
    }
    toCanvasPoint(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY,
        };
    }
}
//# sourceMappingURL=bubbleshooter.js.map