import { GACHA_POOL } from './gachaData.js';
import type { GachaStats } from './gachaStorage.js';
import './gachaProgress.css';

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
