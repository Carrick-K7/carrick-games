import { BaseGame } from '../core/game.js';
export class InvadersGame extends BaseGame {
    constructor() {
        super('gameCanvas', 640, 480);
        this.playerWidth = 36;
        this.playerHeight = 20;
        this.playerX = 0;
        this.playerY = 0;
        this.playerSpeed = 280;
        this.bullets = [];
        this.bulletWidth = 4;
        this.bulletHeight = 10;
        this.bulletSpeed = 420;
        this.enemyRows = 5;
        this.enemyCols = 8;
        this.enemyWidth = 28;
        this.enemyHeight = 20;
        this.enemyGapX = 12;
        this.enemyGapY = 14;
        this.enemies = [];
        this.enemyDir = 1; // 1 = right, -1 = left
        this.enemySpeed = 30;
        this.enemyBaseY = 40;
        this.enemyMoveTimer = 0;
        this.enemyMoveInterval = 0.5;
        this.enemyStepX = 6;
        this.enemyStepY = 10;
        this.enemyBullets = [];
        this.enemyBulletSpeed = 160;
        this.enemyFireTimer = 0;
        this.enemyFireInterval = 1.2;
        this.score = 0;
        this.wave = 1;
        this.gameOver = false;
        this.rightPressed = false;
        this.leftPressed = false;
        this.spacePressed = false;
        this.lastFireTime = 0;
        this.fireCooldown = 0.35;
    }
    init() {
        this.playerX = (this.width - this.playerWidth) / 2;
        this.playerY = this.height - this.playerHeight - 24;
        this.bullets = [];
        this.enemyBullets = [];
        this.score = 0;
        this.wave = 1;
        this.gameOver = false;
        this.rightPressed = false;
        this.leftPressed = false;
        this.spacePressed = false;
        this.lastFireTime = 0;
        this.enemyDir = 1;
        this.enemySpeed = 30;
        this.enemyMoveInterval = 0.5;
        this.enemyMoveTimer = 0;
        this.enemyFireTimer = 0;
        this.spawnEnemies();
    }
    spawnEnemies() {
        this.enemies = [];
        const totalWidth = this.enemyCols * this.enemyWidth + (this.enemyCols - 1) * this.enemyGapX;
        const startX = (this.width - totalWidth) / 2;
        for (let r = 0; r < this.enemyRows; r++) {
            for (let c = 0; c < this.enemyCols; c++) {
                this.enemies.push({
                    x: startX + c * (this.enemyWidth + this.enemyGapX),
                    y: this.enemyBaseY + r * (this.enemyHeight + this.enemyGapY),
                    alive: true,
                });
            }
        }
    }
    isZh() {
        return document.documentElement.getAttribute('data-lang') === 'zh';
    }
    get aliveEnemies() {
        return this.enemies.filter(e => e.alive);
    }
    update(dt) {
        if (this.gameOver)
            return;
        // Player movement
        if (this.rightPressed) {
            this.playerX += this.playerSpeed * dt;
        }
        else if (this.leftPressed) {
            this.playerX -= this.playerSpeed * dt;
        }
        this.playerX = Math.max(8, Math.min(this.width - this.playerWidth - 8, this.playerX));
        // Player fire
        if (this.spacePressed) {
            const now = performance.now() / 1000;
            if (now - this.lastFireTime >= this.fireCooldown) {
                this.lastFireTime = now;
                this.bullets.push({
                    x: this.playerX + this.playerWidth / 2 - this.bulletWidth / 2,
                    y: this.playerY,
                    active: true,
                });
            }
        }
        // Update player bullets
        for (const b of this.bullets) {
            if (!b.active)
                continue;
            b.y -= this.bulletSpeed * dt;
            if (b.y + this.bulletHeight < 0)
                b.active = false;
        }
        // Enemy movement
        this.enemyMoveTimer += dt;
        let movedDown = false;
        if (this.enemyMoveTimer >= this.enemyMoveInterval) {
            this.enemyMoveTimer = 0;
            const alive = this.aliveEnemies;
            if (alive.length > 0) {
                const minX = Math.min(...alive.map(e => e.x));
                const maxX = Math.max(...alive.map(e => e.x + this.enemyWidth));
                if ((this.enemyDir === 1 && maxX + this.enemyStepX > this.width - 8) ||
                    (this.enemyDir === -1 && minX - this.enemyStepX < 8)) {
                    this.enemyDir *= -1;
                    for (const e of alive) {
                        e.y += this.enemyStepY;
                    }
                    movedDown = true;
                }
                else {
                    for (const e of alive) {
                        e.x += this.enemyDir * this.enemyStepX;
                    }
                }
            }
        }
        // Enemy fire
        this.enemyFireTimer += dt;
        if (this.enemyFireTimer >= this.enemyFireInterval) {
            this.enemyFireTimer = 0;
            const alive = this.aliveEnemies;
            if (alive.length > 0) {
                const shooter = alive[Math.floor(Math.random() * alive.length)];
                this.enemyBullets.push({
                    x: shooter.x + this.enemyWidth / 2 - 3,
                    y: shooter.y + this.enemyHeight,
                    active: true,
                });
            }
        }
        // Update enemy bullets
        for (const b of this.enemyBullets) {
            if (!b.active)
                continue;
            b.y += this.enemyBulletSpeed * dt;
            if (b.y > this.height)
                b.active = false;
        }
        // Collisions: player bullet vs enemy
        for (const b of this.bullets) {
            if (!b.active)
                continue;
            for (const e of this.enemies) {
                if (!e.alive)
                    continue;
                if (b.x < e.x + this.enemyWidth &&
                    b.x + this.bulletWidth > e.x &&
                    b.y < e.y + this.enemyHeight &&
                    b.y + this.bulletHeight > e.y) {
                    b.active = false;
                    e.alive = false;
                    this.score += 10;
                    break;
                }
            }
        }
        // Speed up enemies as count drops
        const aliveCount = this.aliveEnemies.length;
        if (aliveCount > 0) {
            const factor = (this.enemyRows * this.enemyCols) / aliveCount;
            this.enemyMoveInterval = Math.max(0.08, 0.5 / Math.min(factor, 4));
        }
        // Check enemy bullets hitting player
        const playerRect = { x: this.playerX, y: this.playerY, w: this.playerWidth, h: this.playerHeight };
        for (const b of this.enemyBullets) {
            if (!b.active)
                continue;
            if (b.x < playerRect.x + playerRect.w &&
                b.x + 6 > playerRect.x &&
                b.y < playerRect.y + playerRect.h &&
                b.y + 8 > playerRect.y) {
                this.gameOver = true;
                window.reportScore?.(this.score);
                return;
            }
        }
        // Check enemies reaching bottom or touching player
        for (const e of this.aliveEnemies) {
            if (e.y + this.enemyHeight >= this.playerY) {
                this.gameOver = true;
                window.reportScore?.(this.score);
                return;
            }
        }
        // Next wave
        if (aliveCount === 0) {
            this.wave++;
            this.enemySpeed += 6;
            this.enemyFireInterval = Math.max(0.4, this.enemyFireInterval - 0.08);
            this.spawnEnemies();
        }
        // Cleanup
        this.bullets = this.bullets.filter(b => b.active);
        this.enemyBullets = this.enemyBullets.filter(b => b.active);
    }
    draw(ctx) {
        const isDark = !document.documentElement.hasAttribute('data-theme') ||
            document.documentElement.getAttribute('data-theme') === 'dark';
        // Background
        ctx.fillStyle = isDark ? '#0b0f19' : '#fafafa';
        ctx.fillRect(0, 0, this.width, this.height);
        // Draw ground line
        ctx.strokeStyle = isDark ? '#334155' : '#9ca3af';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, this.height - 8);
        ctx.lineTo(this.width, this.height - 8);
        ctx.stroke();
        // Draw player
        ctx.fillStyle = '#39C5BB';
        ctx.beginPath();
        ctx.moveTo(this.playerX + this.playerWidth / 2, this.playerY);
        ctx.lineTo(this.playerX + this.playerWidth, this.playerY + this.playerHeight);
        ctx.lineTo(this.playerX + this.playerWidth - 6, this.playerY + this.playerHeight - 4);
        ctx.lineTo(this.playerX + 6, this.playerY + this.playerHeight - 4);
        ctx.lineTo(this.playerX, this.playerY + this.playerHeight);
        ctx.closePath();
        ctx.fill();
        // Draw player bullets
        ctx.fillStyle = '#facc15';
        for (const b of this.bullets) {
            if (!b.active)
                continue;
            ctx.fillRect(b.x, b.y, this.bulletWidth, this.bulletHeight);
        }
        // Draw enemies
        for (const e of this.enemies) {
            if (!e.alive)
                continue;
            ctx.fillStyle = '#f472b6';
            ctx.fillRect(e.x + 2, e.y + 4, this.enemyWidth - 4, this.enemyHeight - 8);
            ctx.fillStyle = '#be185d';
            ctx.fillRect(e.x + 6, e.y + 8, this.enemyWidth - 12, this.enemyHeight - 14);
            // Eyes
            ctx.fillStyle = '#fff';
            ctx.fillRect(e.x + 6, e.y + 4, 4, 4);
            ctx.fillRect(e.x + this.enemyWidth - 10, e.y + 4, 4, 4);
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(e.x + 8, e.y + 6, 2, 2);
            ctx.fillRect(e.x + this.enemyWidth - 8, e.y + 6, 2, 2);
            // Antennae / legs wiggle
            const wiggle = (Date.now() % 600 < 300) ? 2 : -2;
            ctx.strokeStyle = '#f472b6';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(e.x + 2, e.y + 4);
            ctx.lineTo(e.x + 2 + wiggle, e.y - 2);
            ctx.moveTo(e.x + this.enemyWidth - 2, e.y + 4);
            ctx.lineTo(e.x + this.enemyWidth - 2 - wiggle, e.y - 2);
            ctx.stroke();
        }
        // Draw enemy bullets
        ctx.fillStyle = '#fb7185';
        for (const b of this.enemyBullets) {
            if (!b.active)
                continue;
            ctx.fillRect(b.x, b.y, 6, 8);
        }
        // HUD
        const zh = this.isZh();
        ctx.fillStyle = isDark ? '#e0e0e0' : '#1a1a2e';
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(zh ? `得分 ${this.score}` : `SCORE ${this.score}`, 12, 22);
        ctx.fillText(zh ? `波次 ${this.wave}` : `WAVE ${this.wave}`, this.width - 110, 22);
        // Game Over overlay
        if (this.gameOver) {
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(0, 0, this.width, this.height);
            ctx.fillStyle = isDark ? '#e0e0e0' : '#1a1a2e';
            ctx.font = '20px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.fillText('GAME OVER', this.width / 2, this.height / 2 - 30);
            ctx.font = '10px "Press Start 2P", monospace';
            ctx.fillText(zh ? `得分 ${this.score}` : `SCORE ${this.score}`, this.width / 2, this.height / 2 + 10);
            ctx.fillText(zh ? '按空格重新开始' : 'PRESS SPACE', this.width / 2, this.height / 2 + 40);
            ctx.textAlign = 'left';
        }
    }
    handleInput(e) {
        if (e instanceof KeyboardEvent) {
            const isDown = e.type === 'keydown';
            if (e.key === 'Right' || e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
                this.rightPressed = isDown;
            }
            else if (e.key === 'Left' || e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
                this.leftPressed = isDown;
            }
            else if (e.key === ' ') {
                this.spacePressed = isDown;
                if (this.gameOver && isDown) {
                    this.init();
                }
            }
            return;
        }
        if (e instanceof TouchEvent) {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const touch = e.touches[0] ?? e.changedTouches[0];
            if (!touch)
                return;
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            if (this.gameOver) {
                if (e.type === 'touchstart') {
                    this.init();
                }
                return;
            }
            if (e.type === 'touchstart' || e.type === 'touchmove') {
                this.leftPressed = false;
                this.rightPressed = false;
                this.spacePressed = false;
                if (y < rect.height * 0.35) {
                    this.spacePressed = true;
                }
                else {
                    if (x < rect.width / 2) {
                        this.leftPressed = true;
                    }
                    else {
                        this.rightPressed = true;
                    }
                }
            }
            else if (e.type === 'touchend') {
                this.leftPressed = false;
                this.rightPressed = false;
                this.spacePressed = false;
            }
        }
    }
}
//# sourceMappingURL=invaders.js.map