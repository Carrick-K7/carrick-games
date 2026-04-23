import { BaseGame } from '../core/game.js';
// ─── Constants ───────────────────────────────────────────────────────────────
const W = 480;
const H = 480;
const PLAYER_SIZE = 14;
const ROBOT_SIZE = 16;
const OTTO_SIZE = 20;
const BULLET_SPEED = 360;
const PLAYER_SPEED = 130;
const ROBOT_SPEED = 45;
const OTTO_SPEED_BASE = 70;
const WALL_THICK = 4;
// ─── Game ─────────────────────────────────────────────────────────────────────
export class BerzerkGame extends BaseGame {
    constructor() {
        super('gameCanvas', W, H);
        this.state = 'waiting';
        this.score = 0;
        this.lives = 3;
        this.room = 1;
        this.hiScore = 0;
        this.px = W / 2;
        this.py = H - 60;
        this.pDirX = 0;
        this.pDirY = -1;
        this.invTimer = 0;
        this.walls = [];
        this.exitOpen = false;
        this.exitX = W / 2 - 20;
        this.exitY = 0;
        this.exitW = 40;
        this.robots = [];
        this.bullets = [];
        this.otto = { x: -100, y: -100, active: false, vx: 0, vy: 0, bounce: 0 };
        this.ottoTimer = 0;
        this.ottoBaseTime = 8;
        this.keysDown = new Set();
        this.shootCooldown = 0;
        this.deathTimer = 0;
        this.roomClearTimer = 0;
    }
    init() {
        this.score = 0;
        this.lives = 3;
        this.room = 1;
        this.hiScore = 0;
        this.state = 'waiting';
        this.resetRoom();
    }
    resetRoom() {
        this.px = W / 2;
        this.py = H - 60;
        this.pDirX = 0;
        this.pDirY = -1;
        this.invTimer = 1.5;
        this.bullets = [];
        this.otto = { x: -100, y: -100, active: false, vx: 0, vy: 0, bounce: 0 };
        this.ottoTimer = Math.max(3, this.ottoBaseTime - this.room * 0.3);
        this.exitOpen = false;
        this.roomClearTimer = 0;
        this.keysDown.clear();
        this.generateWalls();
        this.spawnRobots();
    }
    nextRoom() {
        this.room++;
        this.score += 50; // room bonus
        this.resetRoom();
        this.state = 'playing';
    }
    generateWalls() {
        this.walls = [];
        // Outer walls (inset slightly so player can move along edge)
        const m = 8;
        this.walls.push({ x: m, y: m, w: W - m * 2, h: WALL_THICK }); // top
        this.walls.push({ x: m, y: H - m - WALL_THICK, w: W - m * 2, h: WALL_THICK }); // bottom
        this.walls.push({ x: m, y: m, w: WALL_THICK, h: H - m * 2 }); // left
        this.walls.push({ x: W - m - WALL_THICK, y: m, w: WALL_THICK, h: H - m * 2 }); // right
        // Random inner walls
        const rng = this.seededRandom(this.room);
        const count = 6 + Math.floor(rng() * 6);
        for (let i = 0; i < count; i++) {
            const wx = 40 + Math.floor(rng() * (W - 80));
            const wy = 40 + Math.floor(rng() * (H - 80));
            const vertical = rng() > 0.5;
            const len = 30 + Math.floor(rng() * 60);
            if (vertical) {
                this.walls.push({ x: wx, y: wy, w: WALL_THICK, h: len });
            }
            else {
                this.walls.push({ x: wx, y: wy, w: len, h: WALL_THICK });
            }
        }
        // Ensure exit area is clear
        this.exitX = W / 2 - 20;
        this.exitY = m;
        this.exitW = 40;
    }
    spawnRobots() {
        this.robots = [];
        const count = Math.min(2 + this.room, 12);
        let attempts = 0;
        while (this.robots.length < count && attempts < 200) {
            attempts++;
            const rx = 40 + Math.random() * (W - 80);
            const ry = 40 + Math.random() * (H / 2 - 40);
            if (this.distToPlayer(rx, ry) < 120)
                continue;
            if (this.wallAt(rx, ry, ROBOT_SIZE))
                continue;
            this.robots.push({
                x: rx, y: ry, alive: true, deathTimer: 0,
                dirX: 0, dirY: 0, moveTimer: 0,
            });
        }
    }
    seededRandom(seed) {
        let s = seed;
        return () => {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
        };
    }
    distToPlayer(x, y) {
        return Math.hypot(x - this.px, y - this.py);
    }
    wallAt(x, y, size) {
        const half = size / 2;
        for (const w of this.walls) {
            if (x + half > w.x &&
                x - half < w.x + w.w &&
                y + half > w.y &&
                y - half < w.y + w.h) {
                return true;
            }
        }
        return false;
    }
    lineHitsWall(x1, y1, x2, y2) {
        for (const w of this.walls) {
            if (this.lineRectIntersect(x1, y1, x2, y2, w.x, w.y, w.w, w.h)) {
                return true;
            }
        }
        return false;
    }
    lineRectIntersect(x1, y1, x2, y2, rx, ry, rw, rh) {
        const left = rx;
        const right = rx + rw;
        const top = ry;
        const bottom = ry + rh;
        // Check if either endpoint is inside
        if (x1 >= left && x1 <= right && y1 >= top && y1 <= bottom)
            return true;
        if (x2 >= left && x2 <= right && y2 >= top && y2 <= bottom)
            return true;
        // Check line against each edge
        const lines = [
            [left, top, right, top],
            [left, bottom, right, bottom],
            [left, top, left, bottom],
            [right, top, right, bottom],
        ];
        for (const [x3, y3, x4, y4] of lines) {
            if (this.segmentsIntersect(x1, y1, x2, y2, x3, y4, x4, y4))
                return true;
        }
        return false;
    }
    segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
        const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (d === 0)
            return false;
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / d;
        return t > 0 && t < 1 && u > 0 && u < 1;
    }
    moveEntity(x, y, vx, vy, size, dt) {
        let nx = x + vx * dt;
        let ny = y + vy * dt;
        const half = size / 2;
        // Clamp to canvas
        nx = Math.max(half + 8, Math.min(W - half - 8, nx));
        ny = Math.max(half + 8, Math.min(H - half - 8, ny));
        // Wall collision (try sliding)
        if (!this.wallAt(nx, y, size))
            x = nx;
        if (!this.wallAt(x, ny, size))
            y = ny;
        return { x, y };
    }
    update(dt) {
        if (this.state === 'waiting' || this.state === 'gameover') {
            return;
        }
        if (this.state === 'dying') {
            this.deathTimer -= dt;
            if (this.deathTimer <= 0) {
                if (this.lives <= 0) {
                    this.state = 'gameover';
                    this.hiScore = Math.max(this.hiScore, this.score);
                    window.reportScore?.(this.score);
                }
                else {
                    this.resetRoom();
                    this.state = 'playing';
                }
            }
            this.updateBullets(dt);
            return;
        }
        if (this.state === 'roomclear') {
            this.roomClearTimer -= dt;
            if (this.roomClearTimer <= 0) {
                this.nextRoom();
            }
            return;
        }
        // Playing
        this.shootCooldown -= dt;
        if (this.invTimer > 0)
            this.invTimer -= dt;
        // Player movement
        let mvx = 0;
        let mvy = 0;
        if (this.keysDown.has('ArrowLeft') || this.keysDown.has('a')) {
            mvx = -1;
        }
        if (this.keysDown.has('ArrowRight') || this.keysDown.has('d')) {
            mvx = 1;
        }
        if (this.keysDown.has('ArrowUp') || this.keysDown.has('w')) {
            mvy = -1;
        }
        if (this.keysDown.has('ArrowDown') || this.keysDown.has('s')) {
            mvy = 1;
        }
        if (mvx !== 0 || mvy !== 0) {
            const len = Math.hypot(mvx, mvy);
            mvx /= len;
            mvy /= len;
            this.pDirX = mvx;
            this.pDirY = mvy;
            const res = this.moveEntity(this.px, this.py, mvx * PLAYER_SPEED, mvy * PLAYER_SPEED, PLAYER_SIZE, dt);
            this.px = res.x;
            this.py = res.y;
        }
        // Shoot
        if (this.keysDown.has(' ') && this.shootCooldown <= 0) {
            this.shootCooldown = 0.35;
            this.bullets.push({
                x: this.px,
                y: this.py,
                vx: this.pDirX * BULLET_SPEED,
                vy: this.pDirY * BULLET_SPEED,
                active: true,
                player: true,
            });
        }
        // Update bullets
        this.updateBullets(dt);
        // Update robots
        for (const r of this.robots) {
            if (!r.alive)
                continue;
            r.moveTimer -= dt;
            if (r.moveTimer <= 0) {
                r.moveTimer = 0.4 + Math.random() * 0.3;
                // Pick direction toward player
                const dx = this.px - r.x;
                const dy = this.py - r.y;
                const adx = Math.abs(dx);
                const ady = Math.abs(dy);
                let rdx = 0;
                let rdy = 0;
                if (adx > ady) {
                    rdx = Math.sign(dx);
                }
                else {
                    rdy = Math.sign(dy);
                }
                // 30% chance to pick the other axis (less predictable)
                if (Math.random() < 0.3) {
                    if (rdx !== 0) {
                        rdy = Math.sign(dy);
                        rdx = 0;
                    }
                    else {
                        rdx = Math.sign(dx);
                        rdy = 0;
                    }
                }
                r.dirX = rdx;
                r.dirY = rdy;
            }
            const res = this.moveEntity(r.x, r.y, r.dirX * ROBOT_SPEED, r.dirY * ROBOT_SPEED, ROBOT_SIZE, dt);
            r.x = res.x;
            r.y = res.y;
            // Robot-robot collision: die
            for (const other of this.robots) {
                if (other !== r && other.alive && Math.hypot(r.x - other.x, r.y - other.y) < ROBOT_SIZE) {
                    r.alive = false;
                    r.deathTimer = 0.4;
                    other.alive = false;
                    other.deathTimer = 0.4;
                    this.score += 20;
                }
            }
            // Robot-player collision
            if (this.invTimer <= 0 && Math.hypot(r.x - this.px, r.y - this.py) < (PLAYER_SIZE + ROBOT_SIZE) / 2) {
                this.playerHit();
            }
        }
        // Check robot bullet hits
        for (const b of this.bullets) {
            if (!b.active || !b.player)
                continue;
            for (const r of this.robots) {
                if (!r.alive)
                    continue;
                if (Math.hypot(b.x - r.x, b.y - r.y) < ROBOT_SIZE / 2 + 3) {
                    b.active = false;
                    r.alive = false;
                    r.deathTimer = 0.4;
                    this.score += 10;
                }
            }
        }
        // Check all robots dead
        if (!this.exitOpen && this.robots.every(r => !r.alive)) {
            this.exitOpen = true;
            this.roomClearTimer = 0.1; // tiny delay
        }
        // Exit
        if (this.exitOpen) {
            if (this.px > this.exitX &&
                this.px < this.exitX + this.exitW &&
                this.py < this.exitY + 20) {
                this.score += 50;
                this.nextRoom();
            }
        }
        // Otto
        if (!this.otto.active) {
            this.ottoTimer -= dt;
            if (this.ottoTimer <= 0) {
                this.otto.active = true;
                this.otto.x = Math.random() < 0.5 ? 30 : W - 30;
                this.otto.y = Math.random() < 0.5 ? 30 : H - 30;
            }
        }
        else {
            const ottoSpd = OTTO_SPEED_BASE + this.room * 4;
            const odx = this.px - this.otto.x;
            const ody = this.py - this.otto.y;
            const olen = Math.hypot(odx, ody) || 1;
            this.otto.vx = (odx / olen) * ottoSpd;
            this.otto.vy = (ody / olen) * ottoSpd;
            this.otto.bounce += dt * 12;
            const res = this.moveEntity(this.otto.x, this.otto.y, this.otto.vx, this.otto.vy, OTTO_SIZE, dt);
            this.otto.x = res.x;
            this.otto.y = res.y;
            if (this.invTimer <= 0 && Math.hypot(this.otto.x - this.px, this.otto.y - this.py) < (PLAYER_SIZE + OTTO_SIZE) / 2) {
                this.playerHit();
            }
        }
        this.draw(this.ctx);
    }
    updateBullets(dt) {
        for (const b of this.bullets) {
            if (!b.active)
                continue;
            const nx = b.x + b.vx * dt;
            const ny = b.y + b.vy * dt;
            if (this.lineHitsWall(b.x, b.y, nx, ny)) {
                b.active = false;
                continue;
            }
            b.x = nx;
            b.y = ny;
            if (b.x < 0 || b.x > W || b.y < 0 || b.y > H) {
                b.active = false;
            }
        }
        this.bullets = this.bullets.filter(b => b.active);
    }
    playerHit() {
        this.lives--;
        this.state = 'dying';
        this.deathTimer = 1.0;
    }
    draw(ctx) {
        const isDark = !document.documentElement.hasAttribute('data-theme') ||
            document.documentElement.getAttribute('data-theme') === 'dark';
        const bg = isDark ? '#0b0f19' : '#fafafa';
        const wallColor = isDark ? '#334155' : '#94a3b8';
        const primary = isDark ? '#39C5BB' : '#0d9488';
        const robotColor = '#ef4444';
        const ottoColor = '#facc15';
        const textColor = isDark ? '#e0e0e0' : '#1a1a2e';
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        // Walls
        ctx.strokeStyle = wallColor;
        ctx.lineWidth = WALL_THICK;
        ctx.lineCap = 'square';
        for (const w of this.walls) {
            ctx.strokeRect(w.x + WALL_THICK / 2, w.y + WALL_THICK / 2, w.w - WALL_THICK, w.h - WALL_THICK);
        }
        // Exit
        if (this.exitOpen) {
            ctx.fillStyle = primary;
            ctx.fillRect(this.exitX, this.exitY, this.exitW, 6);
            ctx.fillStyle = textColor;
            ctx.font = '8px "Press Start 2P", monospace';
            const zh = document.documentElement.getAttribute('data-lang') === 'zh';
            ctx.textAlign = 'center';
            ctx.fillText(zh ? '出口' : 'EXIT', this.exitX + this.exitW / 2, this.exitY + 18);
        }
        // Robots
        for (const r of this.robots) {
            if (!r.alive) {
                if (r.deathTimer > 0) {
                    this.drawRobotExplosion(ctx, r.x, r.y, r.deathTimer, isDark);
                    r.deathTimer -= 0.016;
                }
                continue;
            }
            this.drawRobot(ctx, r.x, r.y, robotColor, isDark);
        }
        // Player
        if (this.state !== 'dying' || Math.floor(this.deathTimer * 10) % 2 === 0) {
            this.drawPlayer(ctx, this.px, this.py, primary, isDark);
        }
        // Bullets
        ctx.fillStyle = isDark ? '#fff' : '#1e293b';
        for (const b of this.bullets) {
            ctx.beginPath();
            ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
        // Otto
        if (this.otto.active) {
            this.drawOtto(ctx, this.otto.x, this.otto.y, ottoColor, this.otto.bounce);
        }
        // HUD
        ctx.fillStyle = textColor;
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`SCORE ${this.score}`, 10, 22);
        ctx.textAlign = 'right';
        ctx.fillText(`ROOM ${this.room}`, W - 10, 22);
        ctx.textAlign = 'center';
        const livesText = '❤'.repeat(Math.max(0, this.lives));
        ctx.fillText(livesText, W / 2, 22);
        // Overlays
        if (this.state === 'waiting') {
            ctx.fillStyle = isDark ? 'rgba(11,15,25,0.85)' : 'rgba(250,250,250,0.85)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = primary;
            ctx.font = '16px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            const zh = document.documentElement.getAttribute('data-lang') === 'zh';
            ctx.fillText(zh ? 'BERZERK' : 'BERZERK', W / 2, H / 2 - 20);
            ctx.font = '10px "Press Start 2P", monospace';
            ctx.fillStyle = textColor;
            ctx.fillText(zh ? '按空格或点击开始' : 'PRESS SPACE OR TAP', W / 2, H / 2 + 10);
        }
        if (this.state === 'gameover') {
            ctx.fillStyle = isDark ? 'rgba(11,15,25,0.85)' : 'rgba(250,250,250,0.85)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#ef4444';
            ctx.font = '16px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            const zh = document.documentElement.getAttribute('data-lang') === 'zh';
            ctx.fillText(zh ? '游戏结束' : 'GAME OVER', W / 2, H / 2 - 20);
            ctx.fillStyle = textColor;
            ctx.font = '10px "Press Start 2P", monospace';
            ctx.fillText(`${zh ? '得分' : 'SCORE'} ${this.score}`, W / 2, H / 2 + 10);
            ctx.fillText(zh ? '按 R 重新开始' : 'PRESS R TO RESTART', W / 2, H / 2 + 30);
        }
    }
    drawPlayer(ctx, x, y, color, _isDark) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const s = PLAYER_SIZE;
        // Head
        ctx.beginPath();
        ctx.arc(x, y - s * 0.35, s * 0.25, 0, Math.PI * 2);
        ctx.stroke();
        // Body
        ctx.beginPath();
        ctx.moveTo(x, y - s * 0.1);
        ctx.lineTo(x, y + s * 0.3);
        ctx.stroke();
        // Arms
        ctx.beginPath();
        ctx.moveTo(x - s * 0.25, y);
        ctx.lineTo(x + s * 0.25, y);
        ctx.stroke();
        // Legs
        ctx.beginPath();
        ctx.moveTo(x, y + s * 0.3);
        ctx.lineTo(x - s * 0.2, y + s * 0.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y + s * 0.3);
        ctx.lineTo(x + s * 0.2, y + s * 0.5);
        ctx.stroke();
    }
    drawRobot(ctx, x, y, color, isDark) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        const s = ROBOT_SIZE;
        // Body box
        ctx.strokeRect(x - s / 2, y - s / 2, s, s);
        // Eyes
        ctx.fillStyle = isDark ? '#fff' : '#7f1d1d';
        ctx.fillRect(x - s * 0.22, y - s * 0.15, s * 0.15, s * 0.15);
        ctx.fillRect(x + s * 0.07, y - s * 0.15, s * 0.15, s * 0.15);
        // Mouth
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(x - s * 0.15, y + s * 0.15);
        ctx.lineTo(x + s * 0.15, y + s * 0.15);
        ctx.stroke();
        // Legs
        ctx.beginPath();
        ctx.moveTo(x - s * 0.2, y + s / 2);
        ctx.lineTo(x - s * 0.2, y + s * 0.65);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + s * 0.2, y + s / 2);
        ctx.lineTo(x + s * 0.2, y + s * 0.65);
        ctx.stroke();
    }
    drawRobotExplosion(ctx, x, y, timer, isDark) {
        const maxR = ROBOT_SIZE * 1.2;
        const r = maxR * (1 - timer / 0.4);
        ctx.strokeStyle = isDark ? '#fbbf24' : '#d97706';
        ctx.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + timer * 4;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
            ctx.stroke();
        }
    }
    drawOtto(ctx, x, y, color, bounce) {
        const s = OTTO_SIZE;
        const bounceY = Math.sin(bounce) * 4;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        // Bouncing smiley
        ctx.beginPath();
        ctx.arc(x, y + bounceY, s / 2, 0, Math.PI * 2);
        ctx.stroke();
        // Eyes
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x - s * 0.12, y + bounceY - s * 0.08, s * 0.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + s * 0.12, y + bounceY - s * 0.08, s * 0.08, 0, Math.PI * 2);
        ctx.fill();
        // Smile
        ctx.beginPath();
        ctx.arc(x, y + bounceY + s * 0.05, s * 0.2, 0.2, Math.PI - 0.2);
        ctx.stroke();
    }
    handleInput(e) {
        if (e instanceof KeyboardEvent) {
            const k = e.key;
            if (e.type === 'keydown') {
                this.keysDown.add(k);
                if (k === ' ' || k === 'Space') {
                    e.preventDefault();
                    if (this.state === 'waiting') {
                        this.state = 'playing';
                        return;
                    }
                }
                if ((k === 'r' || k === 'R') && this.state === 'gameover') {
                    this.init();
                    this.state = 'playing';
                    return;
                }
            }
            if (e.type === 'keyup') {
                this.keysDown.delete(k);
            }
        }
        if (e instanceof TouchEvent) {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const sx = this.canvas.width / rect.width;
            const sy = this.canvas.height / rect.height;
            if (e.type === 'touchstart') {
                if (this.state === 'waiting') {
                    this.state = 'playing';
                    return;
                }
                if (this.state === 'gameover') {
                    this.init();
                    this.state = 'playing';
                    return;
                }
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const t = e.changedTouches[i];
                    const tx = (t.clientX - rect.left) * sx;
                    const ty = (t.clientY - rect.top) * sy;
                    // Center tap = shoot
                    const cx = Math.abs(tx - this.px);
                    const cy = Math.abs(ty - this.py);
                    if (cx < 60 && cy < 60) {
                        if (this.shootCooldown <= 0) {
                            this.shootCooldown = 0.35;
                            this.bullets.push({
                                x: this.px,
                                y: this.py,
                                vx: this.pDirX * BULLET_SPEED,
                                vy: this.pDirY * BULLET_SPEED,
                                active: true,
                                player: true,
                            });
                        }
                        continue;
                    }
                    // Directional tap
                    this.keysDown.clear();
                    if (tx < W / 3)
                        this.keysDown.add('ArrowLeft');
                    else if (tx > (W * 2) / 3)
                        this.keysDown.add('ArrowRight');
                    else if (ty < H / 3)
                        this.keysDown.add('ArrowUp');
                    else if (ty > (H * 2) / 3)
                        this.keysDown.add('ArrowDown');
                }
            }
            if (e.type === 'touchend' || e.type === 'touchcancel') {
                this.keysDown.clear();
            }
        }
        if (e instanceof MouseEvent) {
            if (e.type === 'mousedown') {
                if (this.state === 'waiting') {
                    this.state = 'playing';
                    return;
                }
                if (this.state === 'gameover') {
                    this.init();
                    this.state = 'playing';
                    return;
                }
            }
        }
    }
    destroy() {
        this.stop();
        this.unbindInput();
    }
}
//# sourceMappingURL=berzerk.js.map