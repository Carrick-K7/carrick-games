import { describe, expect, it, vi } from 'vitest';
import { CsHud } from '../src/csHud';
import { computeHudLayout, overlayRect, rectsOverlap } from '../src/csHudLayout';
import { uiText, uiLines } from '../src/csHudUi';

function context() {
  const text: string[] = [];
  const ctx = new Proxy({
    font: '80px serif',
    measureText(value: string) { return { width: value.length * (parseFloat(this.font.match(/[\d.]+px/)?.[0] || '14') / 2) }; },
    fillText: (value: string) => text.push(value),
  }, { get: (target, key) => (target as any)[key] ?? (() => undefined) }) as unknown as CanvasRenderingContext2D;
  return { ctx, text };
}
function engine() {
  const e: any = {
    isZh: () => false, phase: 'menu', touchMode: false,
    selectedMap: 'fy_snow', selectedMode: 'elimination', selectedTeam: 'ct', selectedPistol: 'default',
    selectedKillLimit: 50, difficulty: 'normal', ready: true, bootLoading: false, mapLoading: false,
    settingsOpen: false, buyOpen: false, mapOpen: false, audio: { enabled: true },
    quality: 'low', controlSettings: { sensitivity: .8, scopeSensitivity: 1, knifeModel: 'classic', hitFeedback: 'full' },
    hud: { menuError: '', menuStart: { label: 'Loading', enabled: true }, scoreboardOpen: false, matchEnd: null },
    settingsNote: '', primaryAction: vi.fn(), closeSettings: vi.fn(), resetSettings: vi.fn(),
    setSensitivity: vi.fn(), setScopeSensitivity: vi.fn(), setKnifeModel: vi.fn(), setHitFeedback: vi.fn(),
    selectTeam: vi.fn(), setDifficulty: vi.fn(), setPistol: vi.fn(), setKillLimit: vi.fn(), setQuality: vi.fn(),
    toggleSound: vi.fn(), selectMap: vi.fn(),
    openSettings: () => { e.settingsOpen = true; }, selectMode: (m: string) => { e.selectedMode = m; },
  };
  return e;
}

describe('CS repaired menu surfaces', () => {
  for (const [W, H] of [[320, 568], [390, 844], [568, 320], [844, 390], [1100, 640], [1280, 720]]) {
    for (const touch of [false, true]) {
      it(`${W}x${H} touch=${touch}: mode changes cannot push the primary action outside safe content`, () => {
        const e = engine(); e.touchMode = touch;
        const hud = new CsHud(e), { ctx } = context();
        const safe = { top: 12, left: 24, right: 12, bottom: 16 };
        hud.setSafeArea(safe);
        const layout = computeHudLayout(W, H, safe);
        hud.draw(ctx, W, H);
        const before = hud.regions.find(r => r.id === 'menu-start')!;
        expect(before).toBeTruthy(); expect(before.h).toBe(48);
        e.selectedMode = 'tdm'; hud.draw(ctx, W, H);
        const after = hud.regions.find(r => r.id === 'menu-start')!;
        expect(after).toMatchObject({ x: before.x, y: before.y, w: before.w, h: before.h });
        after.down!(after.x + 2, after.y + 2); expect(e.primaryAction).toHaveBeenCalledOnce();
        for (const r of hud.regions) {
          expect(r.x).toBeGreaterThanOrEqual(layout.left);
          expect(r.x + r.w).toBeLessThanOrEqual(layout.right + .001);
          expect(r.y).toBeGreaterThanOrEqual(layout.contentTop);
          expect(r.y + r.h).toBeLessThanOrEqual(layout.bottom + .001);
          expect(rectsOverlap(r, layout.shellReserve)).toBe(false);
        }
        const settings = hud.regions.find(r => r.id === 'menu-settings')!;
        expect(settings.h).toBe(44);
        expect(rectsOverlap(settings, after)).toBe(false);
      });
    }
  }

  it('settings paints exactly one surface, with no underlying menu text or hit regions', () => {
    const e = engine(); e.settingsOpen = true;
    const hud = new CsHud(e), { ctx, text } = context();
    hud.draw(ctx, 1280, 720);
    expect(text).toContain('Settings'); expect(text).toContain('Reset settings');
    expect(text).not.toContain('Enter the Arena'); expect(text).not.toContain('Snow Arena');
    expect(hud.regions.filter(r => r.id).every(r => r.id!.startsWith('settings-'))).toBe(true);
    expect(hud.regions.find(r => r.id === 'settings-sensitivity')?.dragAxis).toBe('x');
  });

  it('short settings scrolls choices, never its header or reset button', () => {
    const e = engine(); e.settingsOpen = true;
    const hud = new CsHud(e), { ctx } = context();
    const render = () => hud.draw(ctx, 568, 320);
    render();
    const close = hud.regions.find(r => r.id === 'settings-close')!, reset = hud.regions.find(r => r.id === 'settings-reset')!;
    const bounds = overlayRect(computeHudLayout(568, 320), 560, 638);
    hud.onWheel(1000); render();
    expect(hud.regions.find(r => r.id === 'settings-close')).toMatchObject({ x: close.x, y: close.y, w: close.w, h: close.h });
    expect(hud.regions.find(r => r.id === 'settings-reset')).toMatchObject({ x: reset.x, y: reset.y, w: reset.w, h: reset.h });
    expect(hud.regions.find(r => r.id === 'settings-sound-off')!.h).toBe(44);
    for (const r of hud.regions.filter(r => r.deferTap)) {
      expect(r.y).toBeGreaterThanOrEqual(bounds.y + 68);
      expect(r.y + r.h).toBeLessThanOrEqual(reset.y - 8);
    }
  });
});

describe('CS text metrics', () => {
  it('measures labels with their actual painted font, not a preceding heading', () => {
    const { ctx, text } = context();
    uiText(ctx, 'Butterfly', 0, 0, 13, '#fff', 'left', false, 72);
    expect(text).toEqual(['Butterfly']);
    expect(ctx.font).toContain('13px');
  });
  it('wraps localized prose into bounded readable lines', () => {
    const { ctx } = context();
    const lines = uiLines(ctx, '经典沙城地图，两处包点，双方进行战术对抗。', 84, 14, 3);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines.every(line => ctx.measureText(line).width <= 84)).toBe(true);
  });
});
