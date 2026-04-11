export class BaseGame {
    constructor(canvasId, width = 640, height = 480) {
        this.width = width;
        this.height = height;
        this.running = false;
        this.lastTime = 0;
        this.animationId = 0;
        this.loop = (now) => {
            if (!this.running)
                return;
            const dt = (now - this.lastTime) / 1000;
            this.lastTime = now;
            this.update(dt);
            this.draw(this.ctx);
            this.animationId = requestAnimationFrame(this.loop);
        };
        const canvas = document.getElementById(canvasId);
        if (!canvas)
            throw new Error(`Canvas #${canvasId} not found`);
        this.canvas = canvas;
        this.canvas.width = width;
        this.canvas.height = height;
        const ctx = this.canvas.getContext('2d');
        if (!ctx)
            throw new Error('2D context not available');
        this.ctx = ctx;
        this.bindInput();
    }
    bindInput() {
        window.addEventListener('keydown', this.handleInput.bind(this));
        window.addEventListener('keyup', this.handleInput.bind(this));
        this.canvas.addEventListener('touchstart', this.handleInput.bind(this), { passive: false });
        this.canvas.addEventListener('touchend', this.handleInput.bind(this), { passive: false });
        this.canvas.addEventListener('touchmove', this.handleInput.bind(this), { passive: false });
    }
    start() {
        this.running = true;
        this.lastTime = performance.now();
        this.init();
        this.loop(this.lastTime);
    }
    stop() {
        this.running = false;
        cancelAnimationFrame(this.animationId);
    }
}
//# sourceMappingURL=game.js.map