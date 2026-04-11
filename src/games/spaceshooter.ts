import { BaseGame } from '../core/game.js';

interface Bullet {
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
}

interface Enemy {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  active: boolean;
}

export class SpaceShooterGame extends BaseGame {
  // Player
  private playerWidth = 40;
  private playerHeight = 30;
  private playerX = 0;
  private playerY = 0;
  private playerSpeed = 300;

  // Bullets
  private bullets: Bullet[] = [];
  private bulletWidth = 4;
  private bulletHeight = 12;
  private bulletSpeed = 400;
  private fireTimer = 0;
  private fireInterval = 0.25;

  // Enemies
  private enemies: Enemy[] = [];
  private enemyWidth = 30;
  private enemyHeight = 30;
  private enemyMinSpeed = 60;
  private enemyMaxSpeed = 120;
  private spawnTimer = 0;
  private spawnInterval = 0.8;

  // Game state
  private score = 0;
  private gameOver = false;
  private rightPressed = false;
  private leftPressed = false;

  constructor() {
    super('gameCanvas', 480, 640);
  }

  init() {
    this.playerX = (this.width - this.playerWidth) / 2;
    this.playerY = this.height - this.playerHeight - 20;
    this.bullets = [];
    this.enemies = [];
    this.score = 0;
    this.gameOver = false;
    this.rightPressed = false;
    this.leftPressed = false;
    this.fireTimer = 0;
    this.spawnTimer = 0;
  }

  private spawnBullet() {
    this.bullets.push({
      x: this.playerX + this.playerWidth / 2 - this.bulletWidth / 2,
      y: this.playerY,
      width: this.bulletWidth,
      height: this.bulletHeight,
      active: true,
    });
  }

  private spawnEnemy() {
    const speed = this.enemyMinSpeed + Math.random() * (this.enemyMaxSpeed - this.enemyMinSpeed);
    this.enemies.push({
      x: Math.random() * (this.width - this.enemyWidth),
      y: -this.enemyHeight,
      width: this.enemyWidth,
      height: this.enemyHeight,
      speed: speed,
      active: true,
    });
  }

  private checkCollision(a: { x: number; y: number; width: number; height: number },
                         b: { x: number; y: number; width: number; height: number }): boolean {
    return a.x < b.x + b.width &&
           a.x + a.width > b.x &&
           a.y < b.y + b.height &&
           a.y + a.height > b.y;
  }

  update(dt: number) {
    if (this.gameOver) return;

    // Player movement
    if (this.rightPressed && this.playerX < this.width - this.playerWidth) {
      this.playerX += this.playerSpeed * dt;
    } else if (this.leftPressed && this.playerX > 0) {
      this.playerX -= this.playerSpeed * dt;
    }
    // Clamp player
    this.playerX = Math.max(0, Math.min(this.width - this.playerWidth, this.playerX));

    // Auto-fire bullets
    this.fireTimer += dt;
    if (this.fireTimer >= this.fireInterval) {
      this.fireTimer = 0;
      this.spawnBullet();
    }

    // Spawn enemies
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawnEnemy();
    }

    // Update bullets
    for (const bullet of this.bullets) {
      if (!bullet.active) continue;
      bullet.y -= this.bulletSpeed * dt;
      if (bullet.y + bullet.height < 0) {
        bullet.active = false;
      }
    }

    // Update enemies and check collisions
    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      enemy.y += enemy.speed * dt;

      // Check player collision
      if (this.checkCollision(
        { x: this.playerX, y: this.playerY, width: this.playerWidth, height: this.playerHeight },
        enemy
      )) {
        this.gameOver = true;
        return;
      }

      // Check bullet collisions
      for (const bullet of this.bullets) {
        if (!bullet.active) continue;
        if (this.checkCollision(bullet, enemy)) {
          bullet.active = false;
          enemy.active = false;
          this.score += 10;
          break;
        }
      }

      // Remove enemies that pass bottom edge
      if (enemy.y > this.height) {
        enemy.active = false;
      }
    }

    // Clean up inactive bullets and enemies
    this.bullets = this.bullets.filter(b => b.active);
    this.enemies = this.enemies.filter(e => e.active);
  }

  draw(ctx: CanvasRenderingContext2D) {
    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, this.width, this.height);

    // Draw stars (simple static stars)
    ctx.fillStyle = '#64748b';
    for (let i = 0; i < 50; i++) {
      const x = (i * 73) % this.width;
      const y = (i * 37) % this.height;
      ctx.fillRect(x, y, 2, 2);
    }

    // Draw player (ship)
    ctx.fillStyle = '#39C5BB';
    // Ship body (triangle)
    ctx.beginPath();
    ctx.moveTo(this.playerX + this.playerWidth / 2, this.playerY);
    ctx.lineTo(this.playerX + this.playerWidth, this.playerY + this.playerHeight);
    ctx.lineTo(this.playerX + this.playerWidth / 2, this.playerY + this.playerHeight - 5);
    ctx.lineTo(this.playerX, this.playerY + this.playerHeight);
    ctx.closePath();
    ctx.fill();

    // Draw bullets
    ctx.fillStyle = '#facc15';
    for (const bullet of this.bullets) {
      if (!bullet.active) continue;
      ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
    }

    // Draw enemies
    ctx.fillStyle = '#f472b6';
    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      // Enemy shape (inverted triangle/invader style)
      ctx.beginPath();
      ctx.moveTo(enemy.x, enemy.y);
      ctx.lineTo(enemy.x + enemy.width, enemy.y);
      ctx.lineTo(enemy.x + enemy.width / 2, enemy.y + enemy.height);
      ctx.closePath();
      ctx.fill();
    }

    // Score
    ctx.fillStyle = '#f8fafc';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE ${this.score}`, 8, 20);

    // Game Over overlay
    if (this.gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '20px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', this.width / 2, this.height / 2 - 30);
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText(`SCORE ${this.score}`, this.width / 2, this.height / 2 + 10);
      ctx.fillText('PRESS SPACE', this.width / 2, this.height / 2 + 40);
      ctx.textAlign = 'left';
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (e instanceof KeyboardEvent) {
      const isKeyDown = e.type === 'keydown';
      if (e.key === 'Right' || e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        this.rightPressed = isKeyDown;
      } else if (e.key === 'Left' || e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        this.leftPressed = isKeyDown;
      } else if (e.key === ' ' && this.gameOver) {
        this.init();
      }
      return;
    }

    if (e instanceof TouchEvent) {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const touch = e.touches[0] || e.changedTouches[0];
      if (!touch) return;
      const x = touch.clientX - rect.left;
      const scaleX = this.canvas.width / rect.width;
      const canvasX = x * scaleX;

      if (this.gameOver) {
        this.init();
        return;
      }

      // Touch left/right side to move ship
      if (e.type === 'touchstart') {
        if (canvasX < this.width / 2) {
          this.leftPressed = true;
          this.rightPressed = false;
        } else {
          this.rightPressed = true;
          this.leftPressed = false;
        }
      }

      // On touch end, stop movement
      if (e.type === 'touchend') {
        this.rightPressed = false;
        this.leftPressed = false;
      }
    }
  }
}
