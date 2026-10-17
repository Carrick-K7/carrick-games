import { describe, expect, it, vi } from 'vitest';
import { CsHud } from '../src/csHud';
import { computeHudLayout, rectsOverlap } from '../src/csHudLayout';

function settingsFixture() {
  const engine = {
    isZh: () => false, settingsOpen: true, phase: 'menu', touchMode: true,
    controlSettings: { sensitivity: .8, scopeSensitivity: 1, knifeModel: 'classic', hitFeedback: 'full' },
    selectedPistol: 'default', quality: 'low', audio: { enabled: true }, settingsNote: '',
    closeSettings: vi.fn(), resetSettings: vi.fn(), setSensitivity: vi.fn(), setScopeSensitivity: vi.fn(),
    setKnifeModel: vi.fn(), setPistol: vi.fn(), setHitFeedback: vi.fn(), setQuality: vi.fn(), toggleSound: vi.fn(),
  };
  const hud = new CsHud(engine as never);
  const labels: { label: string; x: number; y: number }[] = [];
  const roundRect = vi.fn(), arc = vi.fn();
  let dy = 0;
  const stack: number[] = [];
  const ctx = new Proxy({
    roundRect, arc,
    measureText: (text: string) => ({ width: text.length * 6 }),
    fillText: (label: string, x: number, y: number) => labels.push({ label, x, y: y + dy }),
    save: () => stack.push(dy), restore: () => { dy = stack.pop() ?? 0; },
    translate: (_x: number, y: number) => { dy += y; },
  }, { get: (target, key) => (target as any)[key] ?? (() => undefined) }) as unknown as CanvasRenderingContext2D;
  const draw = (width: number, height: number, safe?: Record<string, number>) => {
    labels.length = 0;
    const layout = computeHudLayout(width, height, safe);
    (hud as any).drawSettings(ctx, layout);
    return layout;
  };
  return { engine, hud, labels, draw, roundRect, arc };
}

describe('CS modern settings HUD', () => {
  it('uses a soft panel, rounded controls and circular slider without any quality entry', () => {
    const { engine, hud, labels, draw, roundRect, arc } = settingsFixture();
    draw(1280, 720);
    expect(roundRect.mock.calls[0].slice(2)).toEqual([480, 360, 20]);
    expect(roundRect.mock.calls.some(c => c[4] === 12)).toBe(true);
    expect(arc).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 8, 0, Math.PI * 2);
    hud.regions.find(r => r.id === 'settings-more')!.down!(0, 0);
    const seen = new Set<string>(), painted = new Set<string>();
    for (let step = 0; step < 200; step++) {
      draw(1280, 720);
      hud.regions.forEach(r => { if (r.id) seen.add(r.id); });
      labels.forEach(p => painted.add(p.label));
      hud.onWheel(4);
    }
    expect([...seen].some(id => id.includes('quality'))).toBe(false);
    expect([...painted].some(label => /Quality|画质/.test(label))).toBe(false);
    expect(seen.has('settings-hit-full')).toBe(true);
    expect(engine.setQuality).not.toHaveBeenCalled();
  });
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1280, 720]]) {
    it(`${width}x${height}: owns input and keeps scroll/header/footer clear of shell controls`, () => {
      const { hud, draw } = settingsFixture();
      hud.regions.push({ id: 'underlying-menu', x: 0, y: 0, w: 100, h: 100 });
      const layout = draw(width, height, { top: 12, right: 10, bottom: 12, left: 10 });
      expect(hud.regions.some(r => r.id === 'underlying-menu')).toBe(false);
      expect(hud.wantsWheel()).toBe(true);
      for (const r of hud.regions) {
        expect(r.x).toBeGreaterThanOrEqual(layout.left);
        expect(r.x + r.w).toBeLessThanOrEqual(layout.right);
        expect(r.y).toBeGreaterThanOrEqual(layout.contentTop);
        expect(r.y + r.h).toBeLessThanOrEqual(layout.bottom);
        expect(rectsOverlap(r, layout.shellReserve)).toBe(false);
      }
      // Fixed close/done targets stay genuinely 44px high even on short phones.
      expect(hud.regions[0].h).toBe(44);
      expect(hud.regions.at(-1)!.h).toBe(44);
      const close = { ...hud.regions[0] }, done = { ...hud.regions.at(-1)! };
      hud.onWheel(500);
      draw(width, height, { top: 12, right: 10, bottom: 12, left: 10 });
      expect(hud.regions[0]).toMatchObject({ x: close.x, y: close.y, w: close.w, h: close.h });
      expect(hud.regions.at(-1)).toMatchObject({ x: done.x, y: done.y, w: done.w, h: done.h });
    });
  }

  it('knife and feedback options remain reachable through their real scrolled hit regions', () => {
    const { engine, hud, labels, draw } = settingsFixture();
    const reveal = (id: string) => {
      hud.onWheel(-10000);
      for (let n = 0; n < 400; n++) {
        draw(844, 390);
        const region = hud.regions.find(r => r.id === id && r.h >= 44);
        if (region) return region;
        hud.onWheel(4);
      }
      throw new Error(`Missing full settings target: ${id}`);
    };
    const more = reveal('settings-more'); more.down!(more.x, more.y);
    for (const [id, label, action, value] of [
      ['settings-knife-butterfly', 'Butterfly', engine.setKnifeModel, 'butterfly'],
      ['settings-hit-visual', 'Visual', engine.setHitFeedback, 'visual'],
    ] as const) {
      const target = reveal(id), painted = labels.find(p => p.label === label)!;
      expect(target.h).toBe(44); expect(target.deferTap).toBe(true);
      expect(hud.hitTest(painted.x, painted.y)).toBe(target);
      target.down!(painted.x, painted.y);
      expect(action).toHaveBeenCalledExactlyOnceWith(value);
    }
    expect(engine.closeSettings).not.toHaveBeenCalled();
    expect(engine.resetSettings).not.toHaveBeenCalled();
  });
});
