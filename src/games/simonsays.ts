import { BaseGame } from '../core/game.js';

type Color = 'green' | 'red' | 'yellow' | 'blue';

interface Quadrant {
  color: Color;
  baseColor: string;
  activeColor: string;
  glowColor: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class SimonSaysGame extends BaseGame {
  private quadrants: Map<Color, Quadrant> = new Map();
  private sequence: Color[] = [];
  private playerIndex = 0;
  private round = 0;
  private gameOver = false;
  private showingSequence = false;
  private sequenceIndex = 0;
  private sequenceTimer = 0;
  private sequenceDelay = 0.8; // seconds between sequence steps
  private activeQuadrant: Color | null = null;
  private activeTimer = 0;
  private activeDuration = 0.3; // how long a quadrant stays lit
  private gameStarted = false;
  private audioContext: AudioContext | null = null;

  // Tone frequencies for each color
  private tones: Record<Color, number> = {
    green: 329.63,   // E4
    red: 261.63,     // C4
    yellow: 392.00,  // G4
    blue: 196.00,    // G3
  };

  constructor() {
    super('gameCanvas', 400, 400);
    this.initQuadrants();
  }

  private initQuadrants() {
    const gap = 8;
    const halfW = (this.width - gap * 3) / 2;
    const halfH = (this.height - 60 - gap * 3) / 2; // Leave space for score at top
    const startY = 50;

    this.quadrants.set('green', {
      color: 'green',
      baseColor: '#166534',
      activeColor: '#4ade80',
      glowColor: 'rgba(74, 222, 128, 0.6)',
      x: gap,
      y: startY + gap,
      width: halfW,
      height: halfH,
    });

    this.quadrants.set('red', {
      color: 'red',
      baseColor: '#991b1b',
      activeColor: '#f87171',
      glowColor: 'rgba(248, 113, 113, 0.6)',
      x: gap * 2 + halfW,
      y: startY + gap,
      width: halfW,
      height: halfH,
    });

    this.quadrants.set('yellow', {
      color: 'yellow',
      baseColor: '#a16207',
      activeColor: '#facc15',
      glowColor: 'rgba(250, 204, 21, 0.6)',
      x: gap,
      y: startY + gap * 2 + halfH,
      width: halfW,
      height: halfH,
    });

    this.quadrants.set('blue', {
      color: 'blue',
      baseColor: '#1e40af',
      activeColor: '#60a5fa',
      glowColor: 'rgba(96, 165, 250, 0.6)',
      x: gap * 2 + halfW,
      y: startY + gap * 2 + halfH,
      width: halfW,
      height: halfH,
    });
  }

  init() {
    this.sequence = [];
    this.playerIndex = 0;
    this.round = 0;
    this.gameOver = false;
    this.showingSequence = false;
    this.sequenceIndex = 0;
    this.sequenceTimer = 0;
    this.activeQuadrant = null;
    this.activeTimer = 0;
    this.gameStarted = false;
    this.sequenceDelay = 0.8;
    (this as any)._recorded = false;
  }

  private playTone(color: Color, duration = 0.2) {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = this.audioContext;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.frequency.value = this.tones[color];
      osc.type = 'sine';
      
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      // Audio not available, silently fail
    }
  }

  private playErrorSound() {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = this.audioContext;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.3);
      osc.type = 'sawtooth';
      
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      // Audio not available
    }
  }

  private addToSequence() {
    const colors: Color[] = ['green', 'red', 'yellow', 'blue'];
    this.sequence.push(colors[Math.floor(Math.random() * colors.length)]);
    this.round++;
    this.playerIndex = 0;
    this.showingSequence = true;
    this.sequenceIndex = 0;
    this.sequenceTimer = 0;
    // Speed up as rounds progress
    this.sequenceDelay = Math.max(0.3, 0.8 - (this.round - 1) * 0.05);
  }

  private activateQuadrant(color: Color) {
    this.activeQuadrant = color;
    this.activeTimer = this.activeDuration;
    this.playTone(color);
  }

  private getQuadrantAt(x: number, y: number): Color | null {
    for (const [color, q] of this.quadrants) {
      if (x >= q.x && x <= q.x + q.width && y >= q.y && y <= q.y + q.height) {
        return color;
      }
    }
    return null;
  }

  update(dt: number) {
    if (this.gameOver || !this.gameStarted) return;

    // Handle active quadrant animation
    if (this.activeTimer > 0) {
      this.activeTimer -= dt;
      if (this.activeTimer <= 0) {
        this.activeQuadrant = null;
      }
    }

    if (this.showingSequence) {
      this.sequenceTimer += dt;
      if (this.sequenceTimer >= this.sequenceDelay) {
        this.sequenceTimer = 0;
        if (this.sequenceIndex < this.sequence.length) {
          this.activateQuadrant(this.sequence[this.sequenceIndex]);
          this.sequenceIndex++;
        } else {
          this.showingSequence = false;
        }
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    // Dark background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, this.width, this.height);

    // Draw quadrants
    for (const [color, q] of this.quadrants) {
      const isActive = this.activeQuadrant === color;
      
      // Glow effect when active
      if (isActive) {
        ctx.shadowColor = q.glowColor;
        ctx.shadowBlur = 30;
      } else {
        ctx.shadowBlur = 0;
      }

      // Draw quadrant
      ctx.fillStyle = isActive ? q.activeColor : q.baseColor;
      ctx.fillRect(q.x, q.y, q.width, q.height);

      // Inner highlight
      if (isActive) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(q.x, q.y, q.width, q.height / 2);
      }

      // Border
      ctx.strokeStyle = isActive ? '#ffffff' : '#334155';
      ctx.lineWidth = isActive ? 3 : 2;
      ctx.strokeRect(q.x, q.y, q.width, q.height);

      ctx.shadowBlur = 0;

      // Draw key hint in corner
      ctx.fillStyle = isActive ? '#000000' : '#64748b';
      ctx.font = '10px "Press Start 2P", monospace';
      const keyMap: Record<Color, string> = { green: 'Q', red: 'W', yellow: 'A', blue: 'S' };
      ctx.fillText(keyMap[color], q.x + 8, q.y + 18);
    }

    // Score / Round display
    ctx.fillStyle = '#f8fafc';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`ROUND ${this.round}`, this.width / 2, 30);
    ctx.textAlign = 'left';

    // Game state messages
    if (!this.gameStarted) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '14px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SIMON SAYS', this.width / 2, this.height / 2 - 30);
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText('WATCH THE PATTERN', this.width / 2, this.height / 2 + 10);
      ctx.fillText('PRESS SPACE TO START', this.width / 2, this.height / 2 + 30);
      ctx.textAlign = 'left';
    } else if (this.gameOver) {
      if (!(this as any)._recorded) {
        (this as any)._recorded = true;
        (window as any).reportScore?.(this.round);
      }
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = '#f87171';
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', this.width / 2, this.height / 2 - 20);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText(`ROUND ${this.round}`, this.width / 2, this.height / 2 + 10);
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText('PRESS SPACE', this.width / 2, this.height / 2 + 35);
      ctx.textAlign = 'left';
    } else if (this.showingSequence) {
      ctx.fillStyle = '#facc15';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('WATCH...', this.width / 2, this.height - 15);
      ctx.textAlign = 'left';
    } else {
      ctx.fillStyle = '#4ade80';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('YOUR TURN!', this.width / 2, this.height - 15);
      ctx.textAlign = 'left';
    }
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (e instanceof KeyboardEvent) {
      const key = e.key.toLowerCase();
      
      if (key === ' ') {
        if (!this.gameStarted || this.gameOver) {
          this.init();
          this.gameStarted = true;
          this.addToSequence();
        }
        return;
      }

      if (!this.gameStarted || this.gameOver || this.showingSequence) return;

      let color: Color | null = null;
      switch (key) {
        case 'q':
        case 'arrowup':
        case 'arrowleft':
          color = 'green';
          break;
        case 'w':
        case 'arrowright':
          color = 'red';
          break;
        case 'a':
        case 'arrowdown':
          color = 'yellow';
          break;
        case 's':
          color = 'blue';
          break;
      }

      if (color) {
        this.handlePlayerInput(color);
      }
    }

    if (e instanceof TouchEvent || e instanceof MouseEvent) {
      if (e instanceof TouchEvent) {
        e.preventDefault();
      }
      
      if (!this.gameStarted || this.gameOver) {
        if (e.type === 'touchstart' || e.type === 'mousedown') {
          this.init();
          this.gameStarted = true;
          this.addToSequence();
        }
        return;
      }

      if (this.showingSequence) return;

      const rect = this.canvas.getBoundingClientRect();
      let clientX: number, clientY: number;
      
      if (e instanceof TouchEvent) {
        const touch = e.touches[0] || e.changedTouches[0];
        clientX = touch.clientX;
        clientY = touch.clientY;
      } else {
        clientX = (e as MouseEvent).clientX;
        clientY = (e as MouseEvent).clientY;
      }

      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const color = this.getQuadrantAt(x, y);
      
      if (color) {
        this.handlePlayerInput(color);
      }
    }
  }

  private handlePlayerInput(color: Color) {
    this.activateQuadrant(color);

    if (color !== this.sequence[this.playerIndex]) {
      this.playErrorSound();
      this.gameOver = true;
      return;
    }

    this.playerIndex++;

    if (this.playerIndex >= this.sequence.length) {
      // Completed the sequence, add new step
      setTimeout(() => {
        this.addToSequence();
      }, 500);
    }
  }
}
