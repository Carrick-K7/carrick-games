import { BaseGame } from '../core/game.js';
export class PongGame extends BaseGame {
    constructor() {
        super('gameCanvas', 600, 400);
        this.paddleWidth = 12;
        this.paddleHeight = 80;
        this.playerY = 0;
        this.aiY = 0;
        this.ballX = 0;
        this.ballY = 0;
        this.ballRadius = 6;
        this.ballDx = 260;
        this.ballDy = 200;
        this.playerScore = 0;
        this.aiScore = 0;
        this.upPressed = false;
        this.downPressed = false;
        this.gameOver = false;
        this.winner = null;
        this.paddleSpeed = 400;
        this.aiSpeed = 260;
        this.maxScore = 7;
    }
    init() {
        this.playerY = (this.height - this.paddleHeight) / 2;
        this.aiY = (this.height - this.paddleHeight) / 2;
        this.playerScore = 0;
        this.aiScore = 0;
        this.gameOver = false;
        this.winner = null;
        this.upPressed = false;
        this.downPressed = false;
        this.resetBall();
        this._recorded = false;
    }
    resetBall() {
        this.ballX = this.width / 2;
        this.ballY = this.height / 2;
        this.ballDx = (Math.random() > 0.5 ? 1 : -1) * 260;
        this.ballDy = (Math.random() * 2 - 1) * 200;
    }
    update(dt) {
        if (this.gameOver)
            return;
        // Player movement
        if (this.upPressed && this.playerY > 0) {
            this.playerY -= this.paddleSpeed * dt;
        }
        if (this.downPressed && this.playerY < this.height - this.paddleHeight) {
            this.playerY += this.paddleSpeed * dt;
        }
        this.playerY = Math.max(0, Math.min(this.height - this.paddleHeight, this.playerY));
        // AI movement (follow ball with limited speed)
        const aiCenter = this.aiY + this.paddleHeight / 2;
        if (this.ballY < aiCenter - 10) {
            this.aiY -= this.aiSpeed * dt;
        }
        else if (this.ballY > aiCenter + 10) {
            this.aiY += this.aiSpeed * dt;
        }
        this.aiY = Math.max(0, Math.min(this.height - this.paddleHeight, this.aiY));
        // Ball movement
        this.ballX += this.ballDx * dt;
        this.ballY += this.ballDy * dt;
        // Top/bottom wall collision
        if (this.ballY - this.ballRadius < 0) {
            this.ballDy = Math.abs(this.ballDy);
            this.ballY = this.ballRadius;
        }
        else if (this.ballY + this.ballRadius > this.height) {
            this.ballDy = -Math.abs(this.ballDy);
            this.ballY = this.height - this.ballRadius;
        }
        // Paddle collisions
        const playerX = 20;
        const aiX = this.width - 20 - this.paddleWidth;
        // Player paddle
        if (this.ballDx < 0 &&
            this.ballX - this.ballRadius <= playerX + this.paddleWidth &&
            this.ballX + this.ballRadius >= playerX &&
            this.ballY >= this.playerY &&
            this.ballY <= this.playerY + this.paddleHeight) {
            const relativeIntersectY = (this.playerY + this.paddleHeight / 2) - this.ballY;
            const normalized = relativeIntersectY / (this.paddleHeight / 2);
            const bounceAngle = normalized * (Math.PI / 4);
            const speed = Math.sqrt(this.ballDx * this.ballDx + this.ballDy * this.ballDy) * 1.05;
            this.ballDx = Math.abs(Math.cos(bounceAngle) * speed);
            this.ballDy = -Math.sin(bounceAngle) * speed;
            this.ballX = playerX + this.paddleWidth + this.ballRadius + 1;
        }
        // AI paddle
        if (this.ballDx > 0 &&
            this.ballX + this.ballRadius >= aiX &&
            this.ballX - this.ballRadius <= aiX + this.paddleWidth &&
            this.ballY >= this.aiY &&
            this.ballY <= this.aiY + this.paddleHeight) {
            const relativeIntersectY = (this.aiY + this.paddleHeight / 2) - this.ballY;
            const normalized = relativeIntersectY / (this.paddleHeight / 2);
            const bounceAngle = normalized * (Math.PI / 4);
            const speed = Math.sqrt(this.ballDx * this.ballDx + this.ballDy * this.ballDy) * 1.05;
            this.ballDx = -Math.abs(Math.cos(bounceAngle) * speed);
            this.ballDy = -Math.sin(bounceAngle) * speed;
            this.ballX = aiX - this.ballRadius - 1;
        }
        // Scoring
        if (this.ballX + this.ballRadius < 0) {
            this.aiScore++;
            if (this.aiScore >= this.maxScore) {
                this.gameOver = true;
                this.winner = 'ai';
            }
            else {
                this.resetBall();
            }
        }
        else if (this.ballX - this.ballRadius > this.width) {
            this.playerScore++;
            if (this.playerScore >= this.maxScore) {
                this.gameOver = true;
                this.winner = 'player';
            }
            else {
                this.resetBall();
            }
        }
    }
    draw(ctx) {
        const isDark = !document.documentElement.hasAttribute('data-theme') ||
            document.documentElement.getAttribute('data-theme') === 'dark';
        // Background
        ctx.fillStyle = isDark ? '#0b0f19' : '#fafafa';
        ctx.fillRect(0, 0, this.width, this.height);
        // Decorative background bars
        ctx.fillStyle = isDark ? '#1e293b' : '#e5e7eb';
        for (let y = 0; y < this.height; y += 40) {
            ctx.fillRect(30, y + 10, this.width - 60, 4);
        }
        // Center dashed line
        ctx.strokeStyle = isDark ? '#334155' : '#9ca3af';
        ctx.setLineDash([8, 8]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.width / 2, 0);
        ctx.lineTo(this.width / 2, this.height);
        ctx.stroke();
        ctx.setLineDash([]);
        // Paddles
        ctx.fillStyle = isDark ? '#39C5BB' : '#0d9488';
        const playerX = 20;
        const aiX = this.width - 20 - this.paddleWidth;
        ctx.fillRect(playerX, this.playerY, this.paddleWidth, this.paddleHeight);
        ctx.fillRect(aiX, this.aiY, this.paddleWidth, this.paddleHeight);
        // Ball
        ctx.beginPath();
        ctx.arc(this.ballX, this.ballY, this.ballRadius, 0, Math.PI * 2);
        ctx.fill();
        // Score
        ctx.fillStyle = isDark ? '#e0e0e0' : '#1a1a2e';
        ctx.font = '16px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(this.playerScore), this.width / 2 - 40, 40);
        ctx.fillText(String(this.aiScore), this.width / 2 + 40, 40);
        // Game over overlay
        if (this.gameOver) {
            if (!this._recorded) {
                this._recorded = true;
                window.reportScore?.(this.playerScore);
            }
            ctx.fillStyle = 'rgba(0,0,0,0.75)';
            ctx.fillRect(0, 0, this.width, this.height);
            ctx.textAlign = 'center';
            ctx.fillStyle = isDark ? '#e0e0e0' : '#1a1a2e';
            ctx.font = '20px "Press Start 2P", monospace';
            const text = this.winner === 'player' ? 'YOU WIN' : 'GAME OVER';
            ctx.fillText(text, this.width / 2, this.height / 2 - 10);
            ctx.font = '10px "Press Start 2P", monospace';
            ctx.fillText('PRESS SPACE', this.width / 2, this.height / 2 + 24);
        }
    }
    handleInput(e) {
        if (e instanceof KeyboardEvent) {
            if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
                this.upPressed = e.type === 'keydown';
            }
            else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
                this.downPressed = e.type === 'keydown';
            }
            else if (e.key === ' ' && this.gameOver) {
                this.init();
            }
            return;
        }
        if (e instanceof TouchEvent) {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const touch = e.touches[0] || e.changedTouches[0];
            if (!touch)
                return;
            const y = touch.clientY - rect.top;
            const scaleY = this.canvas.height / rect.height;
            const canvasY = y * scaleY;
            if (this.gameOver) {
                this.init();
                return;
            }
            if (canvasY < this.height / 2) {
                this.upPressed = true;
                this.downPressed = false;
            }
            else {
                this.downPressed = true;
                this.upPressed = false;
            }
            if (e.type === 'touchend') {
                this.upPressed = false;
                this.downPressed = false;
            }
        }
    }
}
//# sourceMappingURL=pong.js.map