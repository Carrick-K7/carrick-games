// Unit coverage for the pure CS HUD layout helpers: viewport breakpoints,
// safe-area and shell-button reservation, and internal scroll state.
import { describe, expect, it } from 'vitest';
import {
  aimGeometry,
  aimClearanceRect,
  buttonHit,
  clampScroll,
  computeHudLayout,
  computeTouchControls,
  healthPanelRect,
  HudScroll,
  menuHeaderLayout,
  modalSections,
  shopLayout,
  tacticalMapLayout,
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

  it('retains desktop centering and portrait docking with a smaller score budget', () => {
    expect(scoreStripRect(computeHudLayout(1280, 720), 148)).toEqual({ x: 520, y: 14, w: 240, h: 36 });
    expect(scoreStripRect(computeHudLayout(390, 844), 109)).toEqual({ x: 12, y: 151, w: 240, h: 36 });
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
        expect(tc.buttons.map(b => b.id).sort()).toEqual(
          ['fire', 'jump', 'reload', 'use', 'switch', 'pause', ...(hasBuy ? ['buy'] : [])].sort());
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
          if (!name.startsWith('look')) expect(rectsOverlap(rect, aimClearanceRect(L)), `${tag}: ${name} vs aim`).toBe(false);
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
        expectInside({ ...cell, y: body.y, h: rowHeight }, body);
        if (i > 0) expect(cell.x).toBeGreaterThan(cells[i - 1].x + cells[i - 1].w);
      });
      if (L.short) expect(maxScroll).toBeGreaterThan(0);
    });

    for (const touch of [false, true]) {
      it(`${tag} touch:${touch}: concurrent feedback avoids HUD and visible controls`, () => {
        const radar = radarRect(L), strip = scoreStripRect(L, radar.w);
        const reserved = [aimClearanceRect(L), L.shellReserve, { ...radar, h: radar.h + (L.short ? 0 : 24) }, { ...strip, h: strip.h + 8 }, healthPanelRect(L), weaponPanelRect(L)];
        if (touch) {
          const controls = computeTouchControls(L, { hasBuy: true });
          reserved.push(controls.joystick.hit, ...controls.buttons.map(buttonHit));
        }
        const feedback = matchFeedbackLayout(L, { touch, hasBuy: true, objective: true, objectiveAction: true, center: true, notice: true, pickup: true, equipment: true, killfeedCount: 5,
          hitConfirmationWidth: 120, scopeLabelWidth: 60 });
        expect(feedback.objectiveAction).not.toBeNull();
        const all = [feedback.objectiveAction, feedback.hitConfirmation, feedback.scopeLabel, feedback.center, feedback.objective, feedback.notice, feedback.pickup, ...feedback.killfeed, feedback.equipment].filter((rect): rect is HudRect => rect != null);
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
      expect(healthPanelRect(L).h).toBe(48);
      expect(weaponPanelRect(L).h).toBe(60);
    }
  });

  it('reclaims a full objective progress row in the extreme short-phone notch', () => {
    const L = computeHudLayout(568, 320, { top: 44, right: 20, bottom: 34, left: 47 });
    const feedback = matchFeedbackLayout(L, { touch: true, hasBuy: true, objectiveAction: true });
    expect(feedback.objectiveAction?.h).toBe(40);
    expect(feedback.objectiveAction?.w).toBeGreaterThanOrEqual(96);
    expect(rectsOverlap(feedback.objectiveAction!, aimClearanceRect(L))).toBe(false);
  });

  it('empty feedback has no persistent extra panels and caps an oversized killfeed', () => {
    const L = computeHudLayout(1280, 720);
    expect(matchFeedbackLayout(L)).toEqual({ objective: null, objectiveAction: null, center: null, notice: null, pickup: null, equipment: null, hitConfirmation: null, scopeLabel: null, killfeed: [] });
    expect(matchFeedbackLayout(L, { killfeedCount: 100 }).killfeed.length).toBeLessThanOrEqual(5);
  });
});

describe('csHudLayout: minimal persistent plates and transient equipment', () => {
  it('uses exact stable desktop and narrow row budgets without reducing radar detail', () => {
    const desktop = computeHudLayout(1280, 720);
    expect(healthPanelRect(desktop)).toEqual({ x: 18, y: 654, w: 190, h: 48 });
    expect(weaponPanelRect(desktop)).toEqual({ x: 1022, y: 642, w: 240, h: 60 });
    expect(radarRect(desktop)).toEqual({ x: 18, y: 18, w: 148, h: 148 });
    const narrow = computeHudLayout(320, 568, { left: 47, right: 20, top: 44, bottom: 34 });
    expect(healthPanelRect(narrow).w).toBeCloseTo(100.76);
    expect(healthPanelRect(narrow).h).toBe(60);
    expect(weaponPanelRect(narrow)).toEqual({ x: 173.5, y: 446, w: 114.5, h: 76 });
    expect(radarRect(narrow)).toEqual({ x: 59, y: 166, w: 75, h: 75 });
    expect(radarRect(computeHudLayout(568, 320))).toEqual({ x: 12, y: 12, w: 96, h: 96 });
    expect(radarRect(computeHudLayout(390, 844))).toEqual({ x: 12, y: 12, w: 109, h: 109 });
  });

  it('changes row budgets only at actual panel width thresholds', () => {
    for (const availW of [240, 120 / .44 - .01, 120 / .44, 319.99, 320, 366]) {
      const L = computeHudLayout(availW + 24, 568), health = healthPanelRect(L), weapon = weaponPanelRect(L);
      expect(health.h).toBe(health.w < 120 ? 60 : 48);
      expect(weapon.h).toBe(weapon.w < 160 ? 76 : 60);
      expect(health.y + health.h).toBe(L.bottom);
      expect(weapon.y + weapon.h).toBe(L.bottom);
    }
  });

  for (const { width, height, safe } of TOUCH_MATRIX) {
    const tag = `${width}x${height} ${JSON.stringify(safe)}`;
    it(`${tag}: CSS geometry and all seven touch IDs are independent of DPR`, () => {
      const geometry = (dpr: number) => {
        const viewport = { width, height, dpr, safeArea: safe };
        const L = computeHudLayout(viewport.width, viewport.height, viewport.safeArea);
        return { health: healthPanelRect(L), weapon: weaponPanelRect(L), radar: radarRect(L),
          score: scoreStripRect(L, radarRect(L).w), controls: computeTouchControls(L, { hasBuy: true }),
          feedback: matchFeedbackLayout(L, { touch: true, hasBuy: true, equipment: true, objectiveAction: true }) };
      };
      const baseline = geometry(1), L = computeHudLayout(width, height, safe);
      for (const dpr of [1.25, 1.5, 2, 3]) expect(geometry(dpr)).toEqual(baseline);
      expect(baseline.controls.buttons.map(b => b.id).sort()).toEqual(['buy', 'fire', 'jump', 'pause', 'reload', 'switch', 'use']);
      expect(baseline.health.w).toBeLessThanOrEqual(190);
      expect(baseline.weapon.w).toBeLessThanOrEqual(240);
      expect(baseline.score.w).toBeLessThanOrEqual(240);
      expect(baseline.score.w).toBeGreaterThanOrEqual(140);
      expect(baseline.score.h).toBe(36);
      const plates = [baseline.health, baseline.weapon, baseline.score, baseline.radar];
      plates.forEach((rect, i) => {
        expectInside(rect, { x: L.left, y: Math.min(L.top, baseline.score.y), w: L.availW, h: L.bottom - Math.min(L.top, baseline.score.y) });
        for (const other of [aimClearanceRect(L), L.shellReserve, ...plates.slice(0, i)]) expect(rectsOverlap(rect, other)).toBe(false);
      });
    });

    for (const touch of [false, true]) {
      it(`${tag} touch:${touch}: equipment yields without moving existing priority placement`, () => {
        const L = computeHudLayout(width, height, safe);
        for (const busy of [false, true]) {
          const options = { touch, hasBuy: true, objectiveAction: busy, center: busy, objective: busy,
            notice: busy, pickup: busy, killfeedCount: busy ? 5 : 0,
            hitConfirmationWidth: busy ? 120 : undefined, scopeLabelWidth: busy ? 60 : undefined };
          const before = matchFeedbackLayout(L, options), after = matchFeedbackLayout(L, { ...options, equipment: true });
          expect(before.equipment).toBeNull();
          if (!busy) expect(after.equipment).not.toBeNull();
          expect({ ...after, equipment: null }).toEqual(before);
          if (after.equipment) {
            expect(after.equipment.h).toBe(22);
            expect(after.equipment.w).toBeGreaterThanOrEqual(96);
            expect(after.equipment.w).toBeLessThanOrEqual(240);
            expectInside(after.equipment, overlayBounds(L));
            const radar = radarRect(L), score = scoreStripRect(L, radar.w);
            const obstacles = [aimClearanceRect(L), L.shellReserve, { ...radar, h: radar.h + (L.short ? 0 : 24) },
              { ...score, h: score.h + 8 }, healthPanelRect(L), weaponPanelRect(L),
              ...Object.values(before).flat().filter((rect): rect is HudRect => rect != null)];
            if (touch) {
              const controls = computeTouchControls(L, { hasBuy: true });
              obstacles.push(controls.joystick.hit, ...controls.buttons.map(buttonHit));
            }
            for (const obstacle of obstacles) expect(rectsOverlap(after.equipment, obstacle)).toBe(false);
          }
        }
      });
    }
  }

  it('prefers the full inventory strip directly above the desktop weapon', () => {
    const L = computeHudLayout(1280, 720), weapon = weaponPanelRect(L);
    expect(matchFeedbackLayout(L, { equipment: true }).equipment).toEqual({ x: weapon.x, y: weapon.y - 30, w: 240, h: 22 });
  });

  it('drops inventory before critical action and hit feedback on a busy notched phone', () => {
    const L = computeHudLayout(320, 568, { top: 44, right: 20, bottom: 34, left: 47 });
    const feedback = matchFeedbackLayout(L, { touch: true, hasBuy: true, equipment: true, objectiveAction: true,
      center: true, objective: true, notice: true, pickup: true, killfeedCount: 5, hitConfirmationWidth: 120, scopeLabelWidth: 60 });
    expect(feedback.equipment).toBeNull();
    expect(feedback.objectiveAction).not.toBeNull();
    expect(feedback.hitConfirmation?.w).toBeGreaterThanOrEqual(80);
    expect(feedback.scopeLabel?.w).toBe(60);
  });

  it('omits inventory on an unsupported viewport rather than covering controls or aim', () => {
    const L = computeHudLayout(160, 120);
    expect(matchFeedbackLayout(L, { touch: true, hasBuy: true, equipment: true }).equipment).toBeNull();
  });
});

describe('csHudLayout: camera-centered aiming feedback', () => {
  it('keeps the aiming origin and optic independent of safe-area centering', () => {
    for (const { width, height, safe } of TOUCH_MATRIX) {
      const L = computeHudLayout(width, height, safe), aim = aimGeometry(width, height);
      expect(aim).toEqual({ x: width / 2, y: height / 2, scopeRadius: Math.min(width, height) * .42,
        clearance: { x: width / 2 - 18, y: height / 2 - 18, w: 36, h: 36 } });
      expect(aimClearanceRect(L)).toEqual(aim.clearance);
      if (safe?.left !== safe?.right) expect(aim.x).not.toBe((L.left + L.right) / 2);
    }
    expect(aimGeometry(431, 901).x).toBe(215.5);
    expect(aimGeometry(431, 901).y).toBe(450.5);
  });

  for (const { width, height, safe } of TOUCH_MATRIX) {
    for (const touch of [false, true]) {
      it(`${width}x${height} ${JSON.stringify(safe)} touch:${touch}: active captions retain bounded readable slots`, () => {
        const L = computeHudLayout(width, height, safe), radar = radarRect(L), score = scoreStripRect(L, radar.w);
        const feedback = matchFeedbackLayout(L, { touch, hasBuy: true, hitConfirmationWidth: 120, scopeLabelWidth: 60,
          notice: true, pickup: true, killfeedCount: 3 });
        expect(feedback.hitConfirmation).not.toBeNull();
        expect(feedback.scopeLabel).not.toBeNull();
        const obstacles = [aimClearanceRect(L), radar, score, healthPanelRect(L), weaponPanelRect(L), L.shellReserve];
        if (touch) {
          const controls = computeTouchControls(L, { hasBuy: true });
          obstacles.push(controls.joystick.hit, ...controls.buttons.map(buttonHit));
        }
        const captions = [feedback.hitConfirmation!, feedback.scopeLabel!];
        for (const [i, rect] of captions.entries()) {
          expect(rect.h).toBe(22);
          expect(rect.w).toBeGreaterThanOrEqual(i === 0 ? 80 : 60);
          expect(rect.w).toBeLessThanOrEqual(i === 0 ? 120 : 60);
          expectInside(rect, overlayBounds(L));
          for (const other of [...obstacles, ...captions.slice(0, i)]) expect(rectsOverlap(rect, other)).toBe(false);
        }
      });
    }
  }

  it('relocates isolated pickup and concurrent feed away from the target, not over it', () => {
    for (const [W, H] of [[320, 568], [568, 320]]) {
      for (const hasBuy of [false, true]) {
        const L = computeHudLayout(W, H), aim = aimClearanceRect(L);
        const pickup = matchFeedbackLayout(L, { touch: true, hasBuy, pickup: true }).pickup;
        expect(pickup).not.toBeNull();
        expect(rectsOverlap(pickup!, aim)).toBe(false);
        const feed = matchFeedbackLayout(L, { touch: true, hasBuy, notice: true, killfeedCount: 3 });
        for (const rect of [feed.notice, ...feed.killfeed].filter((r): r is HudRect => !!r)) expect(rectsOverlap(rect, aim)).toBe(false);
      }
    }
  });

  it('splits dense landscape controls around aim while retaining all actions and look space', () => {
    const safes = [...SAFE_AREAS, { top: 0, right: 44, bottom: 21, left: 44 }];
    for (const W of [568, 667, 844]) for (const safe of safes) for (const hasBuy of [false, true]) {
      const L = computeHudLayout(W, 320, safe), aim = aimClearanceRect(L), controls = computeTouchControls(L, { hasBuy });
      expect(controls.buttons.map(b => b.id).sort()).toEqual(['fire', 'jump', 'reload', 'use', 'switch', 'pause', ...(hasBuy ? ['buy'] : [])].sort());
      expect(controls.look.length).toBeGreaterThan(0);
      const visible = [controls.joystick.hit, ...controls.buttons.map(buttonHit)];
      const obstacles = [radarRect(L), scoreStripRect(L, radarRect(L).w), healthPanelRect(L), weaponPanelRect(L), L.shellReserve];
      for (const obstacle of obstacles) expect(rectsOverlap(obstacle, aim)).toBe(false);
      const all = [...visible, ...controls.look];
      all.forEach((rect, i) => {
        expectInside(rect, { x: L.left, y: L.top, w: L.availW, h: L.availH });
        expect(rect.w).toBeGreaterThanOrEqual(i < visible.length ? 44 : 40);
        expect(rect.h).toBeGreaterThanOrEqual(i < visible.length ? 44 : 24);
        if (i < visible.length) expect(rectsOverlap(rect, aim)).toBe(false);
        for (const other of [...obstacles, ...all.slice(0, i)]) expect(rectsOverlap(rect, other)).toBe(false);
      });
    }
  });

  it('keeps a compact portrait round message and reclaims the full landscape row clear of aim', () => {
    for (const [W, H] of [[320, 568], [568, 320]]) {
      const L = computeHudLayout(W, H), result = matchFeedbackLayout(L, { touch: true, hasBuy: true, center: true });
      expect(result.center).not.toBeNull();
      expect(result.center?.h).toBe(W === 320 ? 56 : 80);
      expectInside(result.center!, overlayBounds(L));
      expect(rectsOverlap(result.center!, aimClearanceRect(L))).toBe(false);
    }
  });

  it('prefers full caption width but ellipsizes within a narrow safe slot when necessary', () => {
    const desktop = matchFeedbackLayout(computeHudLayout(1280, 720), { hitConfirmationWidth: 120 });
    expect(desktop.hitConfirmation?.w).toBe(120);
    const inset = computeHudLayout(320, 568, { top: 44, right: 20, bottom: 34, left: 47 });
    const narrow = matchFeedbackLayout(inset, { touch: true, hasBuy: true, hitConfirmationWidth: 120 });
    expect(narrow.hitConfirmation?.w).toBeGreaterThanOrEqual(80);
    expect(narrow.hitConfirmation?.w).toBeLessThan(120);
    expect(rectsOverlap(narrow.hitConfirmation!, aimClearanceRect(inset))).toBe(false);
  });

  it('does not invent captions for absent or invalid measurements', () => {
    for (const width of [undefined, 0, -10, NaN, Infinity]) {
      const result = matchFeedbackLayout(computeHudLayout(568, 320), { hitConfirmationWidth: width, scopeLabelWidth: width });
      expect(result.hitConfirmation).toBeNull();
      expect(result.scopeLabel).toBeNull();
    }
  });

  it('compacts a docked radar to retain touch aiming on a short heavily inset portrait', () => {
    const L = computeHudLayout(320, 480, { top: 44, right: 20, bottom: 34, left: 47 });
    const aim = aimClearanceRect(L), radar = radarRect(L);
    expect(radar.w).toBeLessThan(90);
    expect(rectsOverlap({ ...radar, h: radar.h + 24 }, aim)).toBe(false);
    for (const hasBuy of [false, true]) {
      const controls = computeTouchControls(L, { hasBuy });
      expect(controls.look.length).toBeGreaterThan(0);
      expect(controls.buttons).toHaveLength(hasBuy ? 7 : 6);
      const visible = [controls.joystick.hit, ...controls.buttons.map(buttonHit)];
      for (const r of visible) {
        expect(r.w).toBeGreaterThanOrEqual(44); expect(r.h).toBeGreaterThanOrEqual(44);
        expect(rectsOverlap(r, aim)).toBe(false);
      }
    }
  });

  it('never falls back to covering aim when an unsupported tiny viewport has no action lane', () => {
    const L = computeHudLayout(568, 280, { top: 44, right: 20, bottom: 34, left: 47 });
    const result = matchFeedbackLayout(L, { touch: true, hasBuy: true, objectiveAction: true, hitConfirmationWidth: 120 });
    for (const rect of [result.objectiveAction, result.hitConfirmation].filter((r): r is HudRect => !!r)) {
      expectInside(rect, overlayBounds(L));
      expect(rectsOverlap(rect, aimClearanceRect(L))).toBe(false);
    }
  });
});

describe('CS adaptive modal sections and fixed shop navigation', () => {
  const panels = [
    { name: 'menu', w: 980, h: 638, primary: 48 },
    { name: 'settings', w: 560, h: 638, primary: 44 },
    { name: 'pause', w: 420, h: 352, primary: 48 },
    { name: 'results', w: 480, h: 380, primary: 48 },
    { name: 'radio', w: 420, h: 560, primary: 44 },
  ];
  for (const { width, height, safe } of TOUCH_MATRIX) {
    const L = computeHudLayout(width, height, safe);
    const tag = `${width}x${height} ${JSON.stringify(safe)}`;
    it(`${tag}: modal headers/actions are fixed and a full 44px choice can enter each body`, () => {
      for (const spec of panels) {
        const panel = overlayRect(L, spec.w, spec.h), sections = modalSections(panel, spec.primary);
        expect(sections.scrollAll, spec.name).toBe(false);
        expect(sections.body.h, spec.name).toBeGreaterThanOrEqual(44);
        expect(sections.body.w, spec.name).toBeGreaterThanOrEqual(44);
        expect(sections.close?.h, spec.name).toBe(44);
        expect(sections.close!.w, spec.name).toBeGreaterThanOrEqual(44);
        expect(sections.footer?.h, spec.name).toBe(spec.primary);
        const rectangles = [sections.close!, sections.headerContent!, sections.body, sections.footer!];
        rectangles.forEach((rect, i) => {
          expectInside(rect, panel);
          expect(rectsOverlap(rect, L.shellReserve)).toBe(false);
          for (const other of rectangles.slice(0, i)) expect(rectsOverlap(rect, other), spec.name).toBe(false);
        });
        // At any height, scroll-to-row can expose a whole real target, not an
        // unavoidable 22/26px sliver as in the previous 166px-high panels.
        const scroll = new HudScroll();
        const stride = 56, contentH = 8 * stride;
        scroll.setMax(contentH - sections.body.h);
        for (let i = 0; i < 8; i++) {
          scroll.offset = clampScroll(i * stride, scroll.max);
          const row = { x: sections.body.x, y: sections.body.y + i * stride - scroll.offset,
            w: sections.body.w, h: 44 };
          expectInside(row, sections.body);
        }
      }
    });
    it(`${tag}: shop keeps cash and all category targets outside a usable item-only scroll body`, () => {
      const panel = overlayRect(L, 760, 560), shop = shopLayout(panel, 6);
      expect(shop.scrollAll).toBe(false);
      expect(shop.categories).toHaveLength(6);
      expect(shop.body.h).toBeGreaterThanOrEqual(44);
      expect(shop.itemHeight).toBeGreaterThanOrEqual(44);
      expect(shop.itemHeight).toBeLessThanOrEqual(shop.body.h);
      expect(shop.itemWidth).toBeGreaterThanOrEqual(44);
      for (const category of shop.categories) {
        expect(category.h).toBe(44); expect(category.w).toBeGreaterThanOrEqual(44);
      }
      const rectangles = [shop.close!, shop.status!, ...shop.categories, shop.body, ...(shop.footer ? [shop.footer] : [])];
      rectangles.forEach((rect, i) => {
        expectInside(rect, panel);
        for (const other of rectangles.slice(0, i)) expect(rectsOverlap(rect, other)).toBe(false);
      });
      const before = JSON.stringify({ status: shop.status, categories: shop.categories, close: shop.close });
      const scroll = new HudScroll(); scroll.setMax(1000); scroll.wheel(250);
      const after = shopLayout(panel, 6);
      expect(JSON.stringify({ status: after.status, categories: after.categories, close: after.close })).toBe(before);
    });
    it(`${tag}: actual 640x560 scoreboard has separate close/body/footer and column clip bounds`, () => {
      const panel = overlayRect(L, 640, 560), layout = scoreboardBodyLayout(panel, 10), columns = scoreboardColumns(panel);
      expect(layout.close.w).toBe(44); expect(layout.close.h).toBe(44);
      expect(layout.body.h).toBeGreaterThanOrEqual(44);
      const rectangles = [layout.close, layout.body, layout.footer];
      rectangles.forEach((rect, i) => {
        expectInside(rect, panel);
        for (const other of rectangles.slice(0, i)) expect(rectsOverlap(rect, other)).toBe(false);
      });
      // The current 12px footer at bottom-18 fits wholly below the body clip.
      expectInside({ x: layout.footer.x, y: panel.y + panel.h - 24, w: layout.footer.w, h: 12 }, layout.footer);
      for (const column of Object.values(columns)) expectInside({ ...column, y: layout.body.y, h: 28 }, layout.body);
    });
    it(`${tag}: tactical map, legend and footer stay separated inside the modal`, () => {
      const panel = overlayRect(L, 600, 660), layout = tacticalMapLayout(panel);
      const rectangles = [layout.close, layout.headerContent, layout.map, layout.legend, ...(layout.footer ? [layout.footer] : [])];
      rectangles.forEach((rect, i) => {
        expectInside(rect, panel);
        for (const other of rectangles.slice(0, i)) expect(rectsOverlap(rect, other)).toBe(false);
      });
      expect(layout.map.w).toBe(layout.map.h);
      expect(layout.map.w).toBeGreaterThanOrEqual(90);
    });
  }
  it('preserves a 48px Start and 50px body in the exact deepest supported landscape notch', () => {
    const L = computeHudLayout(568, 320, { top: 44, right: 20, bottom: 34, left: 47 });
    const panel = overlayRect(L, 980, 638), sections = modalSections(panel);
    expect(panel).toEqual({ x: 59, y: 108, w: 477, h: 166 });
    expect(sections.headerH).toBe(52);
    expect(sections.close).toEqual({ x: 484, y: 112, w: 44, h: 44 });
    expect(sections.body).toEqual({ x: 83, y: 164, w: 421, h: 50 });
    expect(sections.footer).toEqual({ x: 83, y: 218, w: 429, h: 48 });
    const shop = shopLayout(panel);
    expect(shop.categoryColumns).toBe(6);
    expect(shop.body).toEqual({ x: 83, y: 212, w: 421, h: 54 });
    expect(shop.itemHeight).toBe(44); expect(shop.footer).toBeNull();
    expect(shop.statusInline).toBe(true);
    const map = tacticalMapLayout(panel);
    expect(map.sideLegend).toBe(true); expect(map.map.w).toBe(98);
  });
  it('uses a bounded scroll-all fallback instead of overlapping fixed chrome on smaller panels', () => {
    for (const panel of [{ x: 10, y: 20, w: 200, h: 159 }, { x: 0, y: 0, w: 70, h: 90 }, { x: 0, y: 0, w: 20, h: 20 }]) {
      for (const layout of [modalSections(panel), shopLayout(panel, 6)]) {
        expect(layout.scrollAll).toBe(true);
        expect(layout.close).toBeNull(); expect(layout.headerContent).toBeNull(); expect(layout.footer).toBeNull();
        expect(layout.headerH).toBe(0);
        expectInside(layout.body, panel);
      }
    }
    expect(modalSections({ x: 0, y: 0, w: 420, h: 160 }).body.h).toBe(44);
  });
  it('keeps all six shop categories on one readable desktop row', () => {
    const L = computeHudLayout(1280, 720), layout = shopLayout(overlayRect(L, 760, 560), 6);
    expect(layout.categoryColumns).toBe(6);
    expect(new Set(layout.categories.map(r => r.y)).size).toBe(1);
    expect(layout.categories.every(r => r.w >= 88 && r.h === 44)).toBe(true);
    expect(layout.body.h).toBeGreaterThanOrEqual(140);
  });

  it('handles absent categories without phantom rows or invalid geometry', () => {
    const panel = { x: 0, y: 0, w: 760, h: 560 };
    for (const count of [0, -4, NaN, Infinity]) {
      const layout = shopLayout(panel, count);
      expect(layout.categories).toEqual([]); expect(layout.categoryColumns).toBe(0);
      expectInside(layout.body, panel);
    }
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

  it('clips rows without exposing action fragments smaller than a real 44px target', () => {
    const scroll = new HudScroll();
    const hud = hudInScroll(scroll);
    (hud as unknown as { push(r: object): void }).push({ x: 10, y: 120, w: 100, h: 50, down: () => undefined });
    // Only20px would be visible; the scroll background handles that fragment.
    expect(hud.regions).toHaveLength(0);
    (hud as unknown as { push(r: object): void }).push({ x: 10, y: 140, w: 100, h: 60, down: () => undefined });
    const r = hud.regions[0];
    // Content140..200, scroll−50=>90..150, clip=>100..150: safe50px.
    expect(r.y).toBe(100); expect(r.h).toBe(50);
    expect(r.x).toBe(10); expect(r.w).toBe(100);
  });

  it('requires the complete name and price area before a rich purchase row activates', () => {
    const hud = hudInScroll(new HudScroll());
    (hud as unknown as { push(r: object): void }).push({ x: 10, y: 130, w: 100, h: 70, minVisibleHeight: 70, down: () => undefined });
    expect(hud.regions).toHaveLength(0);
    (hud as unknown as { push(r: object): void }).push({ x: 10, y: 150, w: 100, h: 70, minVisibleHeight: 70, down: () => undefined });
    expect(hud.regions[0].h).toBe(70);
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
