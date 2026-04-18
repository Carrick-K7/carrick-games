export class BaseGame {
    constructor(canvasId, width = 640, height = 480) {
        this.width = width;
        this.height = height;
        this.running = false;
        this.lastTime = 0;
        this.animationId = 0;
        this.inputBound = false;
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
        this.boundHandleInput = this.handleInput.bind(this);
        this.bindInput();
    }
    bindInput() {
        if (this.inputBound)
            return;
        window.addEventListener('keydown', this.boundHandleInput);
        window.addEventListener('keyup', this.boundHandleInput);
        this.canvas.addEventListener('touchstart', this.boundHandleInput, { passive: false });
        this.canvas.addEventListener('touchend', this.boundHandleInput, { passive: false });
        this.canvas.addEventListener('touchmove', this.boundHandleInput, { passive: false });
        this.canvas.addEventListener('mousedown', this.boundHandleInput);
        this.canvas.addEventListener('mouseup', this.boundHandleInput);
        this.inputBound = true;
    }
    unbindInput() {
        if (!this.inputBound)
            return;
        window.removeEventListener('keydown', this.boundHandleInput);
        window.removeEventListener('keyup', this.boundHandleInput);
        this.canvas.removeEventListener('touchstart', this.boundHandleInput);
        this.canvas.removeEventListener('touchend', this.boundHandleInput);
        this.canvas.removeEventListener('touchmove', this.boundHandleInput);
        this.canvas.removeEventListener('mousedown', this.boundHandleInput);
        this.canvas.removeEventListener('mouseup', this.boundHandleInput);
        this.inputBound = false;
    }
    start() {
        this.bindInput();
        this.running = true;
        this.lastTime = performance.now();
        this.init();
        this.loop(this.lastTime);
    }
    stop() {
        this.running = false;
        cancelAnimationFrame(this.animationId);
    }
    destroy() {
        this.stop();
        this.unbindInput();
    }
}
//# sourceMappingURL=game.js.map