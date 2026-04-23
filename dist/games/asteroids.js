import { BaseGame } from '../core/game.js';
export class AsteroidsGame extends BaseGame {
    // Screen wrap helper
    wrap(v, margin = 20) {
        if (v.x < -margin)
            v.x = this.width + margin;
        if (v.x > this.width + margin)
            v.x = -margin;
        if (v.y < -margin)
            v.y = this.height + margin;
        if (v.y > this.height + margin)
            v.y = -margin;
        return v;
    }
    makeAsteroid(x, y, size, inheritVx, inheritVy) {
        const speed = size === 2 ? 40 : size === 1 ? 70 : 100;
        const radius = size === 2 ? 50 : size === 1 ? 25 : 13;
        const numVerts = 8 + Math.floor(Math.random() * 5);
        const vertices = [];
        for (let i = 0; i < numVerts; i++) {
            const a = (i / numVerts) * Math.PI * 2;
            const r = radius * (0.7 + Math.random() * 0.6);
            vertices.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
        }
        let vx = inheritVx !== undefined ? inheritVx * 0.5 : (Math.random() - 0.5) * speed * 2;
        let vy = inheritVy !== undefined ? inheritVy * 0.5 : (Math.random() - 0.5) * speed * 2;
        const len = Math.sqrt(vx * vx + vy * vy) || 1;
        vx = (vx / len) * speed;
        vy = (vy / len) * speed;
        return {
            x, y, vx, vy,
            radius, rotation: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 2,
            vertices, size, active: true,
        };
    }
    spawnWave(count) {
        for (let i = 0; i < count; i++) {
            let x, y;
            // Spawn away from ship
            do {
                x = Math.random() * this.width;
                y = Math.random() * this.height;
            } while (Math.hypot(x - this.ship.x, y - this.ship.y) < 120);
            this.asteroids.push(this.makeAsteroid(x, y, 2));
        }
    }
    spawnSaucer() {
        if (this.saucer)
            return;
        const large = this.level < 3;
        const sx = Math.random() < 0.5 ? -30 : this.width + 30;
        const saucer = {
            x: sx,
            y: 40 + Math.random() * (this.height - 80),
            vx: (sx < 0 ? 1 : -1) * (large ? 80 : 120),
            vy: 0,
            shootTimer: large ? 1.5 : 0.6,
            active: true,
            large,
        };
        const s = saucer;
        if (Math.random() < 0.5)
            s.vy = (Math.random() - 0.5) * 30;
        this.saucer = s;
    }
    shipVertices() {
        const a = this.ship.angle;
        const c = Math.cos(a);
        const s = Math.sin(a);
        return [
            { x: 18 * c, y: 18 * s },
            { x: -12 * c + 8 * s, y: -12 * s - 8 * c },
            { x: -6 * c, y: -6 * s },
            { x: -12 * c - 8 * s, y: -12 * s + 8 * c },
        ];
    }
    respawnShip() {
        this.ship.x = this.width / 2;
        this.ship.y = this.height / 2;
        this.ship.vx = 0;
        this.ship.vy = 0;
        this.ship.angle = -Math.PI / 2;
        this.ship.alive = true;
        this.ship.invincible = true;
        this.ship.invTimer = 3;
        this.ship.blinkTimer = 0;
    }
    constructor() {
        super('gameCanvas', 600, 600);
        this.ship = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, alive: true, blinkTimer: 0, invincible: true, invTimer: 3 };
        this.asteroids = [];
        this.bullets = [];
        this.saucer = null;
        this.saucerTimer = 0;
        this.score = 0;
        this.lives = 3;
        this.level = 1;
        this.gameOver = false;
        this.waveCleared = false;
        this.waveTimer = 0;
        // Input state
        this.rotateLeft = false;
        this.rotateRight = false;
        this.thrust = false;
        this.shootPending = false;
        this.shootCooldown = 0;
        this.maxBullets = 4;
    }
    init() {
        this.ship.x = this.width / 2;
        this.ship.y = this.height / 2;
        this.ship.vx = 0;
        this.ship.vy = 0;
        this.ship.angle = -Math.PI / 2;
        this.ship.alive = true;
        this.ship.invincible = true;
        this.ship.invTimer = 3;
        this.ship.blinkTimer = 0;
        this.asteroids = [];
        this.bullets = [];
        this.saucer = null;
        this.saucerTimer = 8 + Math.random() * 7;
        this.score = 0;
        this.lives = 3;
        this.level = 1;
        this.gameOver = false;
        this.waveCleared = false;
        this.waveTimer = 0;
        this.rotateLeft = false;
        this.rotateRight = false;
        this.thrust = false;
        this.shootPending = false;
        this.shootCooldown = 0;
        this.spawnWave(4);
        this._recorded = false;
    }
    shoot() {
        if (this.shootCooldown > 0)
            return;
        const a = this.ship.angle;
        const tipX = this.ship.x + Math.cos(a) * 18;
        const tipY = this.ship.y + Math.sin(a) * 18;
        const speed = 400;
        this.bullets.push({
            x: tipX,
            y: tipY,
            vx: Math.cos(a) * speed + this.ship.vx * 0.3,
            vy: Math.sin(a) * speed + this.ship.vy * 0.3,
            life: 0.8,
            active: true,
        });
        this.shootCooldown = 0.15;
        if (this.bullets.length > this.maxBullets) {
            // remove oldest
            const oldest = this.bullets.find(b => b.active);
            if (oldest)
                oldest.active = false;
        }
    }
    update(dt) {
        if (this.gameOver)
            return;
        // Wave cleared check
        const activeAsteroids = this.asteroids.filter(a => a.active);
        if (activeAsteroids.length === 0 && !this.waveCleared) {
            this.waveCleared = true;
            this.waveTimer = 2;
        }
        if (this.waveCleared) {
            this.waveTimer -= dt;
            if (this.waveTimer <= 0) {
                this.level++;
                this.waveCleared = false;
                this.spawnWave(4 + this.level);
                this.saucer = null;
                this.saucerTimer = 8 + Math.random() * 7;
            }
        }
        // Ship
        if (this.ship.alive) {
            // Rotation
            if (this.rotateLeft)
                this.ship.angle -= 4 * dt;
            if (this.rotateRight)
                this.ship.angle += 4 * dt;
            // Thrust
            if (this.thrust) {
                const thrust = 250;
                this.ship.vx += Math.cos(this.ship.angle) * thrust * dt;
                this.ship.vy += Math.sin(this.ship.angle) * thrust * dt;
            }
            // Drag
            this.ship.vx *= Math.pow(0.99, dt * 60);
            this.ship.vy *= Math.pow(0.99, dt * 60);
            // Speed cap
            const sp = Math.hypot(this.ship.vx, this.ship.vy);
            if (sp > 300) {
                this.ship.vx = (this.ship.vx / sp) * 300;
                this.ship.vy = (this.ship.vy / sp) * 300;
            }
            this.ship.x += this.ship.vx * dt;
            this.ship.y += this.ship.vy * dt;
            this.wrap(this.ship, 0);
            // Invincibility
            if (this.ship.invincible) {
                this.ship.invTimer -= dt;
                this.ship.blinkTimer += dt;
                if (this.ship.invTimer <= 0) {
                    this.ship.invincible = false;
                }
            }
            if (this.shootPending) {
                this.shootPending = false;
                this.shoot();
            }
        }
        else {
            // Respawn blink logic
            this.ship.blinkTimer += dt;
            if (this.ship.blinkTimer > 1.5) {
                this.lives--;
                if (this.lives <= 0) {
                    this.gameOver = true;
                    return;
                }
                this.respawnShip();
            }
        }
        this.shootCooldown = Math.max(0, this.shootCooldown - dt);
        // Bullets
        for (const b of this.bullets) {
            if (!b.active)
                continue;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.life -= dt;
            if (b.life <= 0 || b.x < -10 || b.x > this.width + 10 || b.y < -10 || b.y > this.height + 10) {
                b.active = false;
            }
        }
        // Asteroids
        for (const a of this.asteroids) {
            if (!a.active)
                continue;
            a.x += a.vx * dt;
            a.y += a.vy * dt;
            a.rotation += a.rotSpeed * dt;
            this.wrap(a);
            // Ship collision
            if (this.ship.alive && !this.ship.invincible) {
                const dx = a.x - this.ship.x;
                const dy = a.y - this.ship.y;
                const dist = Math.hypot(dx, dy);
                if (dist < a.radius + 10) {
                    this.ship.alive = false;
                    this.ship.blinkTimer = 0;
                    this.ship.invincible = false;
                    a.active = false;
                }
            }
            // Bullet collision
            for (const b of this.bullets) {
                if (!b.active)
                    continue;
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                if (Math.hypot(dx, dy) < a.radius) {
                    b.active = false;
                    a.active = false;
                    const pts = a.size === 2 ? 20 : a.size === 1 ? 50 : 100;
                    this.score += pts;
                    // Split into smaller
                    if (a.size < 2) {
                        const count = a.size === 2 ? 2 : 2;
                        for (let i = 0; i < count; i++) {
                            const angle = Math.random() * Math.PI * 2;
                            const spd = 60 + Math.random() * 60;
                            const child = this.makeAsteroid(a.x + Math.cos(angle) * 10, a.y + Math.sin(angle) * 10, a.size + 1, a.vx, a.vy);
                            this.asteroids.push(child);
                        }
                    }
                }
            }
        }
        // Saucer
        this.saucerTimer -= dt;
        if (!this.saucer && this.saucerTimer <= 0) {
            this.spawnSaucer();
        }
        if (this.saucer) {
            const s = this.saucer;
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.shootTimer -= dt;
            // Wrap vertically, despawn off horizontal edges
            if (s.y < 30)
                s.y = 30;
            if (s.y > this.height - 30)
                s.y = this.height - 30;
            if (s.x < -60 || s.x > this.width + 60) {
                this.saucer = null;
                this.saucerTimer = 6 + Math.random() * 5;
            }
            else {
                if (s.shootTimer <= 0) {
                    s.shootTimer = s.large ? 1.5 : 0.6;
                    // Shoot toward ship (with inaccuracy)
                    const angle = Math.atan2(this.ship.y - s.y, this.ship.x - s.x) + (Math.random() - 0.5) * 0.4;
                    const bspeed = s.large ? 200 : 300;
                    this.bullets.push({
                        x: s.x, y: s.y,
                        vx: Math.cos(angle) * bspeed,
                        vy: Math.sin(angle) * bspeed,
                        life: 1.2,
                        active: true,
                    });
                }
                // Ship collision
                if (this.ship.alive && !this.ship.invincible) {
                    const dx = s.x - this.ship.x;
                    const dy = s.y - this.ship.y;
                    if (Math.hypot(dx, dy) < 20) {
                        this.ship.alive = false;
                        this.ship.blinkTimer = 0;
                        this.ship.invincible = false;
                        this.saucer = null;
                        this.saucerTimer = 6 + Math.random() * 5;
                    }
                }
                // Bullet collision with saucer
                for (const b of this.bullets) {
                    if (!b.active)
                        continue;
                    const dx = s.x - b.x;
                    const dy = s.y - b.y;
                    if (Math.hypot(dx, dy) < 15) {
                        b.active = false;
                        this.saucer = null;
                        this.saucerTimer = 6 + Math.random() * 5;
                        this.score += s.large ? 50 : 200;
                    }
                }
            }
        }
        // Cleanup
        this.asteroids = this.asteroids.filter(a => a.active);
        this.bullets = this.bullets.filter(b => b.active);
    }
    draw(ctx) {
        const isDark = !document.documentElement.hasAttribute('data-theme') ||
            document.documentElement.getAttribute('data-theme') === 'dark';
        ctx.fillStyle = isDark ? '#0b0f19' : '#fafafa';
        ctx.fillRect(0, 0, this.width, this.height);
        // Stars
        ctx.fillStyle = isDark ? '#334155' : '#cbd5e1';
        for (let i = 0; i < 60; i++) {
            const sx = (i * 97 + 31) % this.width;
            const sy = (i * 53 + 17) % this.height;
            ctx.fillRect(sx, sy, 1, 1);
        }
        // Bullets
        ctx.fillStyle = '#facc15';
        for (const b of this.bullets) {
            if (!b.active)
                continue;
            ctx.beginPath();
            ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        // Asteroids
        for (const a of this.asteroids) {
            if (!a.active)
                continue;
            ctx.save();
            ctx.translate(a.x, a.y);
            ctx.rotate(a.rotation);
            ctx.strokeStyle = isDark ? '#94a3b8' : '#4b5563';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(a.vertices[0].x, a.vertices[0].y);
            for (let i = 1; i < a.vertices.length; i++) {
                ctx.lineTo(a.vertices[i].x, a.vertices[i].y);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
        }
        // Saucer
        if (this.saucer) {
            const s = this.saucer;
            ctx.save();
            ctx.translate(s.x, s.y);
            ctx.strokeStyle = '#f87171';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            const rw = s.large ? 24 : 16;
            ctx.ellipse(0, 0, rw, 6, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-rw, 0);
            ctx.lineTo(rw, 0);
            ctx.stroke();
            ctx.restore();
        }
        // Ship
        if (this.ship.alive) {
            if (this.ship.invincible && Math.floor(this.ship.blinkTimer * 8) % 2 === 0) {
                // blink: skip draw
            }
            else {
                ctx.save();
                ctx.translate(this.ship.x, this.ship.y);
                ctx.rotate(this.ship.angle);
                ctx.strokeStyle = '#38bdf8';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(18, 0);
                ctx.lineTo(-12, -8);
                ctx.lineTo(-6, 0);
                ctx.lineTo(-12, 8);
                ctx.closePath();
                ctx.stroke();
                // Thrust flame
                if (this.thrust) {
                    ctx.strokeStyle = '#f97316';
                    ctx.beginPath();
                    ctx.moveTo(-8, -4);
                    ctx.lineTo(-16 - Math.random() * 6, 0);
                    ctx.lineTo(-8, 4);
                    ctx.stroke();
                }
                ctx.restore();
            }
        }
        // HUD
        ctx.fillStyle = isDark ? '#e0e0e0' : '#1a1a2e';
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`SCORE ${this.score}`, 8, 20);
        ctx.fillText(`LVL ${this.level}`, 8, 38);
        // Lives as small ships
        for (let i = 0; i < this.lives; i++) {
            ctx.save();
            ctx.translate(this.width - 20 - i * 22, 16);
            ctx.rotate(-Math.PI / 2);
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(8, 0);
            ctx.lineTo(-5, -4);
            ctx.lineTo(-3, 0);
            ctx.lineTo(-5, 4);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
        }
        // Game Over
        if (this.gameOver) {
            if (!this._recorded) {
                this._recorded = true;
                window.reportScore?.(this.score);
            }
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(0, 0, this.width, this.height);
            ctx.fillStyle = '#f8fafc';
            ctx.font = '16px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.fillText('GAME OVER', this.width / 2, this.height / 2 - 20);
            ctx.font = '8px "Press Start 2P", monospace';
            ctx.fillText('PRESS SPACE', this.width / 2, this.height / 2 + 16);
        }
    }
    handleInput(e) {
        if (e instanceof KeyboardEvent) {
            const down = e.type === 'keydown';
            switch (e.key) {
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    this.rotateLeft = down;
                    break;
                case 'ArrowRight':
                case 'd':
                case 'D':
                    this.rotateRight = down;
                    break;
                case 'ArrowUp':
                case 'w':
                case 'W':
                    this.thrust = down;
                    break;
                case ' ':
                    if (down) {
                        if (this.gameOver) {
                            this.init();
                        }
                        else {
                            this.shootPending = true;
                        }
                    }
                    break;
            }
            return;
        }
        if (e instanceof TouchEvent) {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const touch = e.touches[0] || e.changedTouches?.[0];
            if (!touch)
                return;
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            const cx = x - this.width / 2;
            const cy = y - this.height / 2;
            if (e.type === 'touchstart') {
                if (this.gameOver) {
                    this.init();
                    return;
                }
                this.rotateLeft = false;
                this.rotateRight = false;
                this.thrust = false;
                if (cx < -60)
                    this.rotateLeft = true;
                else if (cx > 60)
                    this.rotateRight = true;
                if (cy < -60)
                    this.thrust = true;
                this.shootPending = true;
            }
            else if (e.type === 'touchend') {
                this.rotateLeft = false;
                this.rotateRight = false;
                this.thrust = false;
                this.shootPending = false;
            }
            else if (e.type === 'touchmove') {
                this.rotateLeft = false;
                this.rotateRight = false;
                this.thrust = false;
                if (cx < -60)
                    this.rotateLeft = true;
                else if (cx > 60)
                    this.rotateRight = true;
                if (cy < -60)
                    this.thrust = true;
            }
        }
    }
}
//# sourceMappingURL=asteroids.js.map