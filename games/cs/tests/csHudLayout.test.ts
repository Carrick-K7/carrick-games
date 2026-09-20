// Unit coverage for the pure CS HUD layout helpers: viewport breakpoints,
// safe-area and shell-button reservation, and internal scroll state.
import { describe, expect, it } from 'vitest';
import {
  buttonHit,
  clampScroll,
  computeHudLayout,
  computeTouchControls,
  healthPanelRect,
  HudScroll,
  menuHeaderLayout,
  normalizeSafeArea,
  overlayBounds,
  overlayRect,
  radarRect,
  matchFeedbackLayout,
  scoreboardBodyLayout,
  scoreboardColumns,
  scoreboardRect,
  scoreStripRect,
  rectsOverlap,
  SHELL_BUTTON_MARGIN,
  SHELL_BUTTON_SIZE,
  SHELL_CLUSTER_WIDTH,
  TOUCH_TARGET,
  weaponPanelRect,
  type HudRect,
} from '../src/csHudLayout';
import { CsHud } from '../src/csHud';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 568, height: 320 },
  { width: 844, height: 390 },
  { width: 1100, height: 640 },
  { width: 1280, height: 720 },
  { width: 2560, height: 1080 },
];

describe('csHudLayout: computeHudLayout', () => {
  it('every supported viewport yields a non-empty safe content box', () => {
    for (const { width, height } of VIEWPORTS) {
      const L = computeHudLayout(width, height);
      expect(L.availW, `${width}x${height}`).toBeGreaterThan(200);
      expect(L.availH, `${width}x${height}`).toBeGreaterThan(280);
      expect(L.top).toBe(L.margin);
      expect(L.left).toBe(L.margin);
      expect(L.right).toBe(width - L.margin);
      expect(L.bottom).toBe(height - L.margin);
    }
  });

  it('reserves the 200x44 brand/help/menu row without increasing vertical clearance)', () => {
    for (const { width, height } of VIEWPORTS) {
      const L = computeHudLayout(width, height);
      expect(SHELL_CLUSTER_WIDTH).toBe(200);
      expect(L.shellReserve.w).toBe(200);
      expect(L.contentTop).toBe(64);
      expect(L.shellReserve.h).toBe(SHELL_BUTTON_SIZE);
      expect(L.shellReserve.x).toBe(width - SHELL_BUTTON_MARGIN - (SHELL_CLUSTER_WIDTH));
      expect(L.shellReserve.y).toBe(SHELL_BUTTON_MARGIN);
      expect(L.contentTop).toBe(L.shellReserve.y + L.shellReserve.h + 8);
    }
  });

  it('applies safe-area insets to content edges and the shell reserve', () => {
    const safe = { top: 24, right: 12, bottom: 16, left: 48 };
    const L = computeHudLayout(390, 844, safe);
    expect(L.top).toBe(L.margin + 24);
    expect(L.left).toBe(L.margin + 48);
    expect(L.right).toBe(390 - L.margin - 12);
    expect(L.bottom).toBe(844 - L.margin - 16);
    expect(L.shellReserve.x).toBe(390 - 12 - SHELL_BUTTON_MARGIN - (SHELL_CLUSTER_WIDTH));
    expect(L.shellReserve.y).toBe(24 + SHELL_BUTTON_MARGIN);
    expect(L.availW).toBe(L.right - L.left);
    expect(L.availH).toBe(L.bottom - L.top);
  });

  it('classifies breakpoints: compact, short and classic menu', () => {
    expect(computeHudLayout(320, 568).compact).toBe(true);
    expect(computeHudLayout(390, 844).compact).toBe(true);
    expect(computeHudLayout(844, 390).compact).toBe(false);
    expect(computeHudLayout(844, 390).short).toBe(true);
    expect(computeHudLayout(1280, 720).classicMenu).toBe(true);
    expect(computeHudLayout(2560, 1080).classicMenu).toBe(true);
    expect(computeHudLayout(390, 844).classicMenu).toBe(false);
    expect(computeHudLayout(844, 390).classicMenu).toBe(false);
    // 940px+ margins widen on tablets/desktop windows.
    expect(computeHudLayout(940, 500).margin).toBe(18);
    expect(computeHudLayout(939, 500).margin).toBe(12);
  });

  it('normalizeSafeArea clamps garbage to zeroed edges', () => {
    expect(normalizeSafeArea(null)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(normalizeSafeArea({ top: -5, right: Number.NaN, bottom: 10, left: Infinity }))
      .toEqual({ top: 0, right: 0, bottom: 10, left: 0 });
  });
});

describe('csHudLayout: header and scoreboard clear the brand cluster', () => {
  for (const { width, height } of [...VIEWPORTS, { width: 524, height: 720 }, { width: 700, height: 720 }]) {
    for (const safe of [undefined, { top: 24, right: 20, bottom: 21, left: 24 }]) {
      const L = computeHudLayout(width, height, safe);
      const tag = `${width}x${height}${safe ? '+safe' : ''}`;
      it(`${tag}: score strip and scoreboard avoid shell chrome`, () => {
        const radar = radarRect(L);
        const strip = scoreStripRect(L, radar.w);
        expect(rectsOverlap(strip, radar)).toBe(false);
        for (const rect of [strip, scoreboardRect(L, 10)]) {
          expect(rectsOverlap(rect, L.shellReserve)).toBe(false);
          expect(rect.x).toBeGreaterThanOrEqual(L.left);
          expect(rect.x + rect.w).toBeLessThanOrEqual(L.right);
          expect(rect.y + rect.h).toBeLessThanOrEqual(L.bottom);
        }
        expect(L.contentTop).toBe((safe?.top ?? 0) + 64);
      });
      it(`${tag}: menu title/FPS/subtitle occupy disjoint horizontal slots`, () => {
        const statusWidth = 110, header = menuHeaderLayout(L, statusWidth);
        expect(L.left + header.titleWidth).toBeLessThanOrEqual(L.shellReserve.x - 12);
        if (header.subtitleWidth > 0) {
          expect(header.subtitleX).toBeGreaterThanOrEqual(L.left + header.titleWidth);
          expect(header.subtitleX + header.subtitleWidth).toBeLessThanOrEqual(L.shellReserve.x - 12);
          if (header.showStatus) expect(header.subtitleX + header.subtitleWidth + 12).toBeLessThanOrEqual(header.statusX - statusWidth);
        }
        if (header.showStatus) {
          expect(header.statusX - statusWidth).toBeGreaterThanOrEqual(L.left + header.titleWidth + 12);
          expect(header.statusX).toBe(L.shellReserve.x - 12);
        }
      });
    }
  }

  it('preserves established desktop and portrait score-strip positions', () => {
    expect(scoreStripRect(computeHudLayout(1280, 720), 148)).toEqual({ x: 490, y: 14, w: 300, h: 46 });
    expect(scoreStripRect(computeHudLayout(390, 844), 109)).toEqual({ x: 12, y: 151, w: 366, h: 46 });
    expect(scoreboardRect(computeHudLayout(844, 390), 10)).toEqual({ x: 112, y: 64, w: 620, h: 314 });
  });
});

describe('csHudLayout: scroll state', () => {
  it('clampScroll pins offset into [0, max] and zeroes invalid input', () => {
    expect(clampScroll(-10, 100)).toBe(0);
    expect(clampScroll(50, 100)).toBe(50);
    expect(clampScroll(150, 100)).toBe(100);
    expect(clampScroll(50, 0)).toBe(0);
    expect(clampScroll(Number.NaN, 100)).toBe(0);
  });

  it('setMax recomputes the clamp as content height changes', () => {
    const s = new HudScroll();
    expect(s.active).toBe(false);
    s.setMax(200);
    expect(s.active).toBe(true);
    s.wheel(500);
    expect(s.offset).toBe(200);
    s.setMax(120); // content shrank (category switch): offset follows
    expect(s.offset).toBe(120);
    s.setMax(0);
    expect(s.active).toBe(false);
    expect(s.offset).toBe(0);
  });

  it('wheel is ignored while the panel fits without scrolling', () => {
    const s = new HudScroll();
    s.wheel(300);
    expect(s.offset).toBe(0);
  });

  it('background drag scrolls content with the finger (drag up = scroll down)', () => {
    const s = new HudScroll();
    s.setMax(100);
    s.beginDrag();
    s.drag(200); // first contact anchors
    expect(s.offset).toBe(0);
    s.drag(150); // finger moved up 50px -> content scrolls down 50
    expect(s.offset).toBe(50);
    s.drag(400); // finger moved down past the start -> clamps at 0
    expect(s.offset).toBe(0);
    s.endDrag();
  });

  it('scrollbar drag uses a negative amplified scale (thumb down = scroll down)', () => {
    const s = new HudScroll();
    s.setMax(300);
    s.beginDrag();
    s.drag(100);
    s.drag(150, -4); // thumb down 50px * 4 -> offset 200
    expect(s.offset).toBe(200);
    s.drag(0, -4);
    expect(s.offset).toBe(0);
  });
});

// ─── Touch control geometry regression matrix ──────────────────────────────
// The 320x568 layout previously overlapped badly (joystick hit x48..212, USE
// centered at x100 inside it, fire covering the ammo panel). These tests pin
// the invariants computeTouchControls must keep on every supported screen.

const SAFE_AREAS = [
  undefined,
  { top: 0, right: 20, bottom: 21, left: 47 },
  { top: 24, right: 12, bottom: 16, left: 48 },
  { top: 44, right: 20, bottom: 34, left: 47 },
];
const TOUCH_MATRIX = VIEWPORTS.flatMap(viewport => SAFE_AREAS.map(safe => ({ ...viewport, safe })));

function touchRects(L: ReturnType<typeof computeHudLayout>, hasBuy: boolean) {
  const tc = computeTouchControls(L, { hasBuy });
  const named: { name: string; rect: HudRect }[] = [
    { name: 'joystick', rect: tc.joystick.hit },
    ...tc.buttons.map(b => ({ name: b.id, rect: buttonHit(b) })),
    ...tc.look.map((band, i) => ({ name: `look${i}`, rect: band })),
  ];
  return { tc, named };
}

describe('csHudLayout: touch controls matrix', () => {
  for (const { width, height, safe } of TOUCH_MATRIX) {
    for (const hasBuy of [false, true]) {
      const tag = `${width}x${height}${safe ? '+safe' : ''} buy:${hasBuy}`;
      const L = computeHudLayout(width, height, safe);

      it(`${tag}: every control hit box is >= ${TOUCH_TARGET}px and inside the viewport`, () => {
        const { tc, named } = touchRects(L, hasBuy);
        expect(named.length).toBeGreaterThanOrEqual(hasBuy ? 9 : 8);
        expect(tc.look.length, `${tag}: aiming must remain possible`).toBeGreaterThan(0);
        for (const { name, rect } of named) {
          expect(rect.w, `${tag} ${name} w`).toBeGreaterThanOrEqual(TOUCH_TARGET - (name.startsWith('look') ? 16 : 0));
          expect(rect.h, `${tag} ${name} h`).toBeGreaterThanOrEqual(name.startsWith('look') ? 24 : TOUCH_TARGET);
          expect(rect.x, `${tag} ${name} left`).toBeGreaterThanOrEqual(L.left);
          expect(rect.y, `${tag} ${name} top`).toBeGreaterThanOrEqual(L.top);
          expect(rect.x + rect.w, `${tag} ${name} right`).toBeLessThanOrEqual(L.right);
          expect(rect.y + rect.h, `${tag} ${name} bottom`).toBeLessThanOrEqual(L.bottom);
        }
      });

      it(`${tag}: joystick, fire, small actions and look bands are pairwise disjoint`, () => {
        const { named } = touchRects(L, hasBuy);
        for (let i = 0; i < named.length; i++) {
          for (let j = i + 1; j < named.length; j++) {
            expect(
              rectsOverlap(named[i].rect, named[j].rect),
              `${tag}: ${named[i].name} vs ${named[j].name}`,
            ).toBe(false);
          }
        }
      });

      it(`${tag}: controls never cover the HP/ammo panels or the shell button`, () => {
        const { named } = touchRects(L, hasBuy);
        const hp = healthPanelRect(L);
        const wp = weaponPanelRect(L);
        for (const { name, rect } of named) {
          expect(rectsOverlap(rect, hp), `${tag}: ${name} vs health panel`).toBe(false);
          expect(rectsOverlap(rect, wp), `${tag}: ${name} vs weapon panel`).toBe(false);
          expect(rectsOverlap(rect, L.shellReserve), `${tag}: ${name} vs shell reserve`).toBe(false);
          const radar = radarRect(L), strip = scoreStripRect(L, radar.w);
          expect(rectsOverlap(rect, radar), `${tag}: ${name} vs radar`).toBe(false);
          expect(rectsOverlap(rect, strip), `${tag}: ${name} vs score`).toBe(false);
        }
      });
    }
  }

  it('all five action buttons + pause exist, buy only when the shop is available', () => {
    const L = computeHudLayout(390, 844);
    const ids = computeTouchControls(L, { hasBuy: false }).buttons.map(b => b.id);
    expect(ids.sort()).toEqual(['fire', 'jump', 'pause', 'reload', 'switch', 'use'].sort());
    expect(computeTouchControls(L, { hasBuy: true }).buttons.map(b => b.id)).toContain('buy');
  });

  it('320x568 narrow portrait falls back to the two-column cluster clear of the joystick', () => {
    const L = computeHudLayout(320, 568);
    const { tc } = touchRects(L, true);
    const joyRight = tc.joystick.hit.x + tc.joystick.hit.w;
    for (const b of tc.buttons) {
      const hit = buttonHit(b);
      if (b.id === 'pause' || b.id === 'buy') continue;
      expect(hit.x, b.id).toBeGreaterThanOrEqual(joyRight + 8);
    }
  });
});

function expectInside(rect: HudRect, bounds: HudRect) {
  expect(rect.x).toBeGreaterThanOrEqual(bounds.x - 1e-8);
  expect(rect.y).toBeGreaterThanOrEqual(bounds.y - 1e-8);
  expect(rect.w).toBeGreaterThanOrEqual(0);
  expect(rect.h).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.w).toBeLessThanOrEqual(bounds.x + bounds.w + 1e-8);
  expect(rect.y + rect.h).toBeLessThanOrEqual(bounds.y + bounds.h + 1e-8);
}

describe('csHudLayout: safe overlays, readable table columns and feedback', () => {
  for (const { width, height, safe } of TOUCH_MATRIX) {
    const L = computeHudLayout(width, height, safe);
    const tag = `${width}x${height} ${JSON.stringify(safe)}`;
    it(`${tag}: overlays center within safe content below the shell`, () => {
      const bounds = overlayBounds(L);
      for (const [w, h] of [[420, 316], [520, 680], [720, 520], [620, 436], [1000, 720]]) {
        const rect = overlayRect(L, w, h);
        expectInside(rect, bounds);
        expect(rectsOverlap(rect, L.shellReserve)).toBe(false);
        expect(rect.x + rect.w / 2).toBeCloseTo((L.left + L.right) / 2);
        expect(rect.y + rect.h / 2).toBeCloseTo((L.contentTop + L.bottom) / 2);
      }
      const radar = radarRect(L);
      expectInside(radar, { x: L.left, y: L.top, w: L.availW, h: L.availH });
      expect(rectsOverlap(radar, L.shellReserve)).toBe(false);
    });

    it(`${tag}: every scoreboard row remains reachable through a bounded scroll body`, () => {
      const panel = scoreboardRect(L, 10), columns = scoreboardColumns(panel);
      const { body, rowHeight, teamHeaderHeight, contentH, maxScroll } = scoreboardBodyLayout(panel, 10);
      expectInside(body, panel);
      expect(contentH).toBe(10 * rowHeight + teamHeaderHeight * 2);
      expect(contentH - maxScroll).toBeLessThanOrEqual(body.h);
      expect(columns.name.w).toBeGreaterThanOrEqual(80);
      expect(columns.kills.w).toBeGreaterThanOrEqual(28);
      expect(columns.status.w).toBeGreaterThanOrEqual(44);
      const cells = Object.values(columns);
      cells.forEach((cell, i) => {
        expectInside({ ...cell, y: body.y, h: rowHeight }, panel);
        if (i > 0) expect(cell.x).toBeGreaterThan(cells[i - 1].x + cells[i - 1].w);
      });
      if (L.short) expect(maxScroll).toBeGreaterThan(0);
    });

    for (const touch of [false, true]) {
      it(`${tag} touch:${touch}: concurrent feedback avoids HUD and visible controls`, () => {
        const radar = radarRect(L), strip = scoreStripRect(L, radar.w);
        const reserved = [L.shellReserve, { ...radar, h: radar.h + (L.short ? 0 : 24) }, { ...strip, h: strip.h + 8 }, healthPanelRect(L), weaponPanelRect(L)];
        if (touch) {
          const controls = computeTouchControls(L, { hasBuy: true });
          reserved.push(controls.joystick.hit, ...controls.buttons.map(buttonHit));
        }
        const feedback = matchFeedbackLayout(L, { touch, hasBuy: true, objective: true, objectiveAction: true, center: true, notice: true, pickup: true, killfeedCount: 5 });
        expect(feedback.objectiveAction).not.toBeNull();
        const all = [feedback.objectiveAction, feedback.center, feedback.objective, feedback.notice, feedback.pickup, ...feedback.killfeed].filter((rect): rect is HudRect => rect != null);
        all.forEach((rect, i) => {
          expectInside(rect, overlayBounds(L));
          for (const obstacle of [...reserved, ...all.slice(0, i)]) {
            expect(rectsOverlap(rect, obstacle), `${JSON.stringify(rect)} overlaps ${JSON.stringify(obstacle)}`).toBe(false);
          }
        });
      });
    }
  }

  it('baseline 320px radar keeps the existing six-pixel shell gap', () => {
    const L = computeHudLayout(320, 568), radar = radarRect(L);
    expect(radar).toEqual({ x: 12, y: 12, w: 90, h: 90 });
    expect(L.shellReserve.x - radar.x - radar.w).toBe(6);
  });

  it('short-phone controls leave an actual >=24px-high aiming band with large notches', () => {
    for (const safe of SAFE_AREAS) {
      const L = computeHudLayout(568, 320, safe), controls = computeTouchControls(L, { hasBuy: true });
      expect(controls.look.length).toBeGreaterThan(0);
      expect(controls.look[0].h).toBeGreaterThanOrEqual(24);
      expect(healthPanelRect(L).h).toBe(62);
      expect(weaponPanelRect(L).h).toBe(76);
    }
  });

  it('keeps objective progress visible in the extreme short-phone 24px lane', () => {
    const L = computeHudLayout(568, 320, { top: 44, right: 20, bottom: 34, left: 47 });
    const feedback = matchFeedbackLayout(L, { touch: true, hasBuy: true, objectiveAction: true });
    expect(feedback.objectiveAction?.h).toBe(24);
    expect(feedback.objectiveAction?.w).toBeGreaterThanOrEqual(240);
  });

  it('empty feedback has no persistent extra panels and caps an oversized killfeed', () => {
    const L = computeHudLayout(1280, 720);
    expect(matchFeedbackLayout(L)).toEqual({ objective: null, objectiveAction: null, center: null, notice: null, pickup: null, killfeed: [] });
    expect(matchFeedbackLayout(L, { killfeedCount: 100 }).killfeed.length).toBeLessThanOrEqual(5);
  });
});

// ─── Scrolled hit-region mapping (CsHud.push) ─────────────────────────────

describe('csHud: scrolled hit regions', () => {
  function hudInScroll(scroll: HudScroll) {
    const hud = new CsHud({ isZh: () => false } as never);
    (hud as unknown as { regionClip: HudRect }).regionClip = { x: 0, y: 100, w: 200, h: 100 };
    (hud as unknown as { regionDy: number }).regionDy = -50;
    (hud as unknown as { regionScroll: HudScroll }).regionScroll = scroll;
    return hud;
  }

  it('intersects partially visible rows with the clip instead of leaking hit area', () => {
    const scroll = new HudScroll();
    const hud = hudInScroll(scroll);
    (hud as unknown as { push(r: object): void }).push({ x: 10, y: 120, w: 100, h: 50, down: () => undefined });
    const r = hud.regions[0];
    // Content y 120..170, scrolled -50 -> screen 70..120, clipped to 100..120.
    expect(r.y).toBe(100);
    expect(r.h).toBe(20);
    expect(r.x).toBe(10);
    expect(r.w).toBe(100);
  });

  it('drops fully clipped rows and marks visible action rows as deferred taps', () => {
    const scroll = new HudScroll();
    const hud = hudInScroll(scroll);
    (hud as unknown as { push(r: object): void }).push({ x: 10, y: 40, w: 100, h: 40, down: () => undefined }); // screen -10..30: gone
    expect(hud.regions).toHaveLength(0);
    (hud as unknown as { push(r: object): void }).push({ x: 10, y: 160, w: 100, h: 40, down: () => undefined }); // screen 110..150
    expect(hud.regions).toHaveLength(1);
    expect(hud.regions[0].deferTap).toBe(true);
    expect(hud.regions[0].scroll).toBe(scroll);
  });

  it('regions outside scroll containers keep immediate activation', () => {
    const hud = new CsHud({ isZh: () => false } as never);
    (hud as unknown as { push(r: object): void }).push({ x: 0, y: 0, w: 50, h: 50, down: () => undefined });
    expect(hud.regions[0].deferTap).toBeUndefined();
    expect(hud.regions[0].scroll).toBeUndefined();
  });
});
