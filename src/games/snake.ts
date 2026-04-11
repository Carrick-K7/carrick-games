import { BaseGame } from '../core/game.js';

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export class SnakeGame extends BaseGame {
  private tileSize = 20;
  private cols = 20;
  private rows = 20;
  private snake: { x: number; y: number }[] = [];
  private food = { x: 10, y: 10 };
  private direction: Direction = 'RIGHT';
  private nextDirection: Direction = 'RIGHT';
  private moveTimer = 0;
  private moveInterval = 0.12; // seconds
  private score = 0;
  private gameOver = false;

  constructor() {
    super('gameCanvas', 400, 400);
  }

  init() {
    this.snake = [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }];
    this.direction = 'RIGHT';
    this.nextDirection = 'RIGHT';
    this.score = 0;
    this.gameOver = false;
    this.moveTimer = 0;
    this.spawnFood();
  }

  private spawnFood() {
    let pos: { x: number; y: number };
    do {
      pos = {
        x: Math.floor(Math.random() * this.cols),
        y: Math.floor(Math.random() * this.rows),
      };
    } while (this.snake.some(s => s.x === pos.x && s.y === pos.y));
    this.food = pos;
  }

  update(dt: number) {
    if (this.gameOver) return;
    this.moveTimer += dt;
    if (this.moveTimer < this.moveInterval) return;
    this.moveTimer = 0;

    this.direction = this.nextDirection;
    const head = { ...this.snake[0] };
    switch (this.direction) {
      case 'UP': head.y--; break;
      case 'DOWN': head.y++; break;
      case 'LEFT': head.x--; break;
      case 'RIGHT': head.x++; break;
    }

    // Wall collision
    if (head.x < 0 || head.x >= this.cols || head.y < 0 || head.y >= this.rows) {
      this.gameOver = true;
      return;
    }

    // Self collision
    if (this.snake.some(s => s.x === head.x && s.y === head.y)) {
      this.gameOver = true;
      return;
    }

    this.snake.unshift(head);

    if (head.x === this.food.x && head.y === this.food.y) {
      this.score += 10;
      this.moveInterval = Math.max(0.05, this.moveInterval - 0.002);
      this.spawnFood();
    } else {
      this.snake.pop();
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, this.width, this.height);

    // Grid border
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, this.cols * this.tileSize, this.rows * this.tileSize);

    // Food
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    const fx = this.food.x * this.tileSize + this.tileSize / 2;
    const fy = this.food.y * this.tileSize + this.tileSize / 2;
    ctx.arc(fx, fy, this.tileSize / 2 - 2, 0, Math.PI * 2);
    ctx.fill();

    // Snake
    this.snake.forEach((seg, i) => {
      ctx.fillStyle = i === 0 ? '#22c55e' : '#16a34a';
      const pad = 1;
      ctx.fillRect(
        seg.x * this.tileSize + pad,
        seg.y * this.tileSize + pad,
        this.tileSize - pad * 2,
        this.tileSize - pad * 2
      );
    });

    // Score
    ctx.fillStyle = '#f8fafc';
    ctx.font = '16px monospace';
    ctx.fillText(`Score: ${this.score}`, 8, this.height - 10);

    // Game Over
    if (this.gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', this.width / 2, this.height / 2 - 20);
      ctx.font = '14px sans-serif';
      ctx.fillText('Press SPACE to restart', this.width / 2, this.height / 2 + 20);
      ctx.textAlign = 'left';
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (e instanceof KeyboardEvent) {
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
          if (this.direction !== 'DOWN') this.nextDirection = 'UP';
          break;
        case 'ArrowDown':
        case 's':
          if (this.direction !== 'UP') this.nextDirection = 'DOWN';
          break;
        case 'ArrowLeft':
        case 'a':
          if (this.direction !== 'RIGHT') this.nextDirection = 'LEFT';
          break;
        case 'ArrowRight':
        case 'd':
          if (this.direction !== 'LEFT') this.nextDirection = 'RIGHT';
          break;
        case ' ':
          if (this.gameOver) this.init();
          break;
      }
    }
    if (e instanceof TouchEvent) {
      e.preventDefault();
      // Simple touch areas for mobile
      const rect = this.canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      if (Math.abs(x - cx) > Math.abs(y - cy)) {
        if (x > cx && this.direction !== 'LEFT') this.nextDirection = 'RIGHT';
        else if (x <= cx && this.direction !== 'RIGHT') this.nextDirection = 'LEFT';
      } else {
        if (y > cy && this.direction !== 'UP') this.nextDirection = 'DOWN';
        else if (y <= cy && this.direction !== 'DOWN') this.nextDirection = 'UP';
      }
    }
  }
}
