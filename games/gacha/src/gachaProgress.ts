import { GACHA_POOL } from './gachaData.js';
import type { GachaStats } from './gachaStorage.js';
import './gachaProgress.css';

export interface GachaNavButton {
  id: 'collection' | 'back';
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  run(): void;
}

/** Native buttons use CSS pixels, outside the canvas's DPR/fit/shake transforms. */
export class GachaNavigationHud {
  private element: HTMLElement | null = null;
  private readonly buttons = new Map<string, HTMLButtonElement>();

  ownsTarget(target: EventTarget | null) {
    return target !== null && (target === this.element || [...this.buttons.values()].some(button => button === target));
  }

  update(canvas: HTMLCanvasElement, box: { x: number; y: number; w: number; h: number }, buttons: GachaNavButton[], paused: boolean, zh: boolean) {
    const root = canvas.closest('#gameApp');
    if (!root) return;
    if (!this.element) {
      this.element = document.createElement('nav');
      this.element.className = 'gacha-navigation';
      // Keep native activation out of Draw, but allow Escape/arrows/shared help.
      for (const type of ['keydown', 'keyup']) {
        this.element.addEventListener(type, event => {
          const key = (event as KeyboardEvent).key;
          if (key === ' ' || key === 'Enter') event.stopPropagation();
        });
      }
      for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click']) {
        this.element.addEventListener(type, event => event.stopPropagation());
      }
      root.append(this.element);
    }
    this.element.setAttribute('aria-label', zh ? '抽卡导航' : 'Gacha navigation');
    this.element.dataset.gachaScreen = canvas.dataset.gachaScreen;
    // The game supplies its known safe gameplay viewport, not a DOM measurement.
    this.element.style.left = `${box.x}px`;
    this.element.style.top = `${box.y}px`;
    this.element.style.width = `${box.w}px`;
    this.element.style.height = `${box.h}px`;
    for (const [id, button] of this.buttons) {
      if (buttons.some(spec => spec.id === id)) continue;
      button.remove();
      this.buttons.delete(id);
    }
    for (const spec of buttons) {
      let button = this.buttons.get(spec.id);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'gacha-nav-button';
        button.dataset.testid = `gacha-${spec.id}`;
        button.dataset.gachaAction = spec.id;
        this.element.append(button);
        this.buttons.set(spec.id, button);
      }
      button.textContent = spec.label;
      button.setAttribute('aria-label', spec.label);
      button.disabled = paused;
      button.onclick = spec.run;
      button.style.left = `${spec.x}px`;
      button.style.top = `${spec.y}px`;
      button.style.width = `${Math.max(44, spec.w)}px`;
      button.style.height = `${Math.max(44, spec.h)}px`;
    }
  }

  destroy() {
    this.element?.remove();
    this.element = null;
    this.buttons.clear();
  }
}

const collectionItems = Object.values(GACHA_POOL).flat();

/** Collection progress counts unique known items, never duplicate pulls. */
export function gachaProgress(stats: GachaStats) {
  const collected = collectionItems.filter(item => (stats.itemCounts[item.id] ?? 0) > 0).length;
  const total = collectionItems.length;
  // Do not round an incomplete collection up to 100%.
  const percent = total ? Math.floor(collected / total * 1000) / 10 : 0;
  return { pulls: stats.totalPulls, collected, total, percent };
}

/** Game-owned HUD: outside the shaking canvas, inside the persistent app root. */
export class GachaProgressHud {
  private element: HTMLElement | null = null;
  private signature = '';

  update(canvas: HTMLCanvasElement, stats: GachaStats, zh: boolean) {
    const root = canvas.closest('#gameApp');
    if (!root) return;
    if (!this.element) {
      this.element = document.createElement('section');
      this.element.className = 'gacha-progress-hud';
      this.element.dataset.testid = 'gacha-progress';
      this.element.innerHTML = `<div class="gacha-progress-metric"><span data-label="pulls"></span><strong data-value="pulls"></strong></div><div class="gacha-progress-metric"><span data-label="collection"></span><strong data-value="collection"></strong><div class="gacha-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i></div></div>`;
      root.append(this.element);
    }
    const progress = gachaProgress(stats);
    const signature = `${zh}:${progress.pulls}:${progress.collected}:${progress.total}`;
    if (signature === this.signature) return;
    this.signature = signature;
    const locale = zh ? 'zh-CN' : 'en-US';
    const pulls = progress.pulls.toLocaleString(locale);
    const percent = `${progress.percent.toFixed(1)}%`;
    this.element.setAttribute('aria-label', zh ? '开箱进度' : 'Case opening progress');
    this.element.querySelector('[data-label="pulls"]')!.textContent = zh ? '总抽奖次数' : 'TOTAL PULLS';
    this.element.querySelector('[data-value="pulls"]')!.textContent = pulls;
    this.element.querySelector('[data-label="collection"]')!.textContent = zh ? '图鉴收集度' : 'COLLECTION';
    this.element.querySelector('[data-value="collection"]')!.textContent = percent;
    const track = this.element.querySelector<HTMLElement>('[role="progressbar"]')!;
    track.setAttribute('aria-label', zh ? '图鉴收集度' : 'Collection progress');
    track.setAttribute('aria-valuenow', String(progress.percent));
    track.setAttribute('aria-valuetext', zh
      ? `已收集 ${progress.collected} / ${progress.total}，${percent}`
      : `${progress.collected} of ${progress.total} collected, ${percent}`);
    track.querySelector('i')!.style.width = percent;
  }

  destroy() {
    this.element?.remove();
    this.element = null;
    this.signature = '';
  }
}
