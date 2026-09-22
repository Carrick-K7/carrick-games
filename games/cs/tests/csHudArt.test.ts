import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drawHudIcon, drawTeamBadge, type HudIconKind } from '../src/csHudArt';
import { WEAPONS } from '../src/csWeapons.js';
import { HUD_WEAPON_SOURCES, hudWeaponManifest, hudWeaponSvg } from './export-hud-weapon-icons.mjs';
// Offline provenance validation only; no shared artwork import in CS runtime.
import { WEAPON_SILHOUETTES, WEAPON_SILHOUETTE_DIMS } from '../../../packages/weapon-art/src/silhouettes';

type Point = [number, number];
class RecordedPath {
  contours: Point[][] = [];
  moveTo(x: number, y: number) { this.contours.push([[x, y]]); }
  lineTo(x: number, y: number) { this.contours[this.contours.length - 1].push([x, y]); }
  closePath() {}
}
function recorder(throwOnFill = false) {
  const currentPath = new RecordedPath();
  currentPath.moveTo(-99, -88); currentPath.lineTo(-77, -66);
  const target = {
    fillStyle: '#123456', strokeStyle: '#654321', globalAlpha: .37,
    globalCompositeOperation: 'xor', filter: 'blur(9px)', shadowColor: '#ff0000',
    shadowBlur: 12, shadowOffsetX: -18, shadowOffsetY: 17,
    lineWidth: 9, lineCap: 'round', lineJoin: 'bevel', miterLimit: 4,
    lineDashOffset: 2, font: '17px serif', textAlign: 'right', textBaseline: 'bottom',
    imageSmoothingEnabled: false, imageSmoothingQuality: 'high',
    transform: [1.5, .2, -.35, .8, 41, -18], dash: [2, 5], clip: 'caller-clip',
  };
  const snapshot = () => structuredClone(target);
  const initial = snapshot(), stack: typeof target[] = [];
  const paints: { contours: Point[][]; rule: string; state: typeof target; devicePoints: Point[] }[] = [];
  const api = {
    save: vi.fn(() => { stack.push(snapshot()); }),
    restore: vi.fn(() => { Object.assign(target, stack.pop()); }),
    beginPath: vi.fn(() => { currentPath.contours = []; }),
    moveTo: currentPath.moveTo.bind(currentPath), lineTo: currentPath.lineTo.bind(currentPath), closePath: currentPath.closePath.bind(currentPath),
    fill: vi.fn((pathOrRule: RecordedPath | string, rule?: string) => {
      if (throwOnFill) throw new Error('paint failed');
      const path = typeof pathOrRule === 'string' ? currentPath : pathOrRule;
      const [a, b, c, d, e, f] = target.transform;
      paints.push({ contours: structuredClone(path.contours), rule: rule ?? pathOrRule as string, state: snapshot(),
        devicePoints: path.contours.flat().map(([x, y]) => [a * x + c * y + e, b * x + d * y + f]) });
    }),
  };
  const ctx = new Proxy(api, {
    get: (object, key) => key in target ? target[key as keyof typeof target] : object[key as keyof typeof api],
    set: (_object, key, value) => { (target as any)[key] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, paints, currentPath, initial, snapshot, api, stack };
}
const kinds: HudIconKind[] = ['health', 'armor'];
const expected = {
  ak47: 'ak47', m4a1: 'm4a1s', awp: 'awp', mp5: 'mp5', tmp: 'mp9', p90: 'p90',
  mac10: 'mac10', sg552: 'sg552', aug: 'aug', scout: 'scout', g3sg1: 'g3sg1',
  m3: 'm3', xm1014: 'xm1014', m249: 'm249', deagle: 'deagle', usp: 'usp', glock: 'glock',
};
// Independently audited minima of source anchors/control points: normalized
// traces are not perfectly centered at zero after relative-command rounding.
const expectedOrigins: Record<string, [number, number]> = {
  ak47: [-.518, -.268], m4a1: [-.523, -.208], awp: [-.518, -.199], mp5: [-.489, -.299],
  tmp: [-.446, -.3], p90: [-.489, -.299], mac10: [-.238, -.298], sg552: [-.515, -.263],
  aug: [-.437, -.299], scout: [-.516, -.239], g3sg1: [-.516, -.286], m3: [-.511, -.264],
  xm1014: [-.524, -.231], m249: [-.419, -.316], deagle: [-.356, -.305], usp: [-.516, -.265], glock: [-.381, -.302],
};
const assetDir = new URL('../public/assets/ui/weapons/', import.meta.url);
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

beforeEach(() => { vi.stubGlobal('Path2D', RecordedPath); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('CS original HUD artwork', () => {
  for (const kind of kinds) {
    it(`${kind}: fits ammo/shop/tiny/portrait bounds and preserves canvas state/path`, () => {
      for (const [w, h] of [[54, 14], [72, 22], [14, 14], [18, 18], [3, 23], [.5, .25]]) {
        const r = recorder(), x = -11.25, y = 7.5;
        const callerPath = structuredClone(r.currentPath.contours);
        drawHudIcon(r.ctx, kind, x, y, w, h, '#cfd6da');
        expect(r.paints).toHaveLength(1);
        const paint = r.paints[0], points = paint.contours.flat();
        expect(points.length).toBeGreaterThan(3);
        for (const [px, py] of points) {
          expect(Number.isFinite(px) && Number.isFinite(py)).toBe(true);
          expect(px).toBeGreaterThanOrEqual(x); expect(px).toBeLessThanOrEqual(x + w);
          expect(py).toBeGreaterThanOrEqual(y); expect(py).toBeLessThanOrEqual(y + h);
        }
        expect(paint.rule).toBe('evenodd');
        expect(paint.state).toMatchObject({ fillStyle: '#cfd6da', globalAlpha: .37, globalCompositeOperation: 'source-over',
          shadowColor: 'transparent', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, filter: 'none',
          transform: r.initial.transform, clip: r.initial.clip });
        const [a, b, c, d, e, f] = r.initial.transform;
        expect(paint.devicePoints).toEqual(points.map(([px, py]) => [a * px + c * py + e, b * px + d * py + f]));
        expect(r.snapshot()).toEqual(r.initial);
        expect(r.currentPath.contours).toEqual(callerPath);
        expect(r.api.beginPath).not.toHaveBeenCalled();
        expect(r.api.save).toHaveBeenCalledOnce(); expect(r.api.restore).toHaveBeenCalledOnce();
        expect(r.stack).toEqual([]);
      }
    });
  }

  it('keeps alpha zero and uses one fill, including cutouts, without opacity stacking', () => {
    const r = recorder(); r.ctx.globalAlpha = 0;
    drawHudIcon(r.ctx, 'armor', 0, 0, 54, 14, 'rgba(255,255,255,.5)');
    expect(r.paints).toHaveLength(1);
    expect(r.paints[0].state.globalAlpha).toBe(0);
    expect(r.paints[0].state.fillStyle).toBe('rgba(255,255,255,.5)');
    expect(r.ctx.globalAlpha).toBe(0);
  });

  it('scales uniformly and centers utility art instead of stretching it into wide slots', () => {
    const small = recorder(), large = recorder();
    drawHudIcon(small.ctx, 'health', 0, 0, 16, 16, '#fff');
    drawHudIcon(large.ctx, 'health', 10, 20, 52, 32, '#fff');
    expect(large.paints[0].contours).toEqual(small.paints[0].contours.map(contour => contour.map(([x, y]) => [20 + x * 2, 20 + y * 2])));
  });

  it('produces distinct nonempty silhouettes and badges without fonts or image methods', () => {
    const signatures = kinds.map(kind => {
      const r = recorder(); drawHudIcon(r.ctx, kind, 0, 0, 72, 22, '#fff');
      return JSON.stringify(r.paints[0].contours);
    });
    expect(new Set(signatures).size).toBe(kinds.length);
    const ct = recorder(), t = recorder();
    drawTeamBadge(ct.ctx, 'ct', 0, 0, 20, '#fff'); drawTeamBadge(t.ctx, 't', 0, 0, 20, '#fff');
    expect(ct.paints[0].contours).not.toEqual(t.paints[0].contours);
  });

  for (const team of ['ct', 't'] as const) {
    it(`${team}: badge stays within its square and preserves state/path`, () => {
      for (const size of [14, 18, 32, .5]) {
        const r = recorder(), path = structuredClone(r.currentPath.contours);
        drawTeamBadge(r.ctx, team, 5, -3, size, '#9db1c0');
        expect(r.paints).toHaveLength(1);
        for (const [x, y] of r.paints[0].contours.flat()) {
          expect(x).toBeGreaterThanOrEqual(5); expect(x).toBeLessThanOrEqual(5 + size);
          expect(y).toBeGreaterThanOrEqual(-3); expect(y).toBeLessThanOrEqual(-3 + size);
        }
        expect(r.paints[0].state.globalAlpha).toBe(.37);
        expect(r.snapshot()).toEqual(r.initial); expect(r.currentPath.contours).toEqual(path);
      }
    });
  }

  it('rejects invalid coordinates, nonpositive/nonfinite sizes and overflowing bounds without touching context', () => {
    const invalid: [number, number, number, number][] = [
      [NaN, 0, 20, 20], [0, Infinity, 20, 20], [-Infinity, 0, 20, 20],
      [0, 0, 0, 20], [0, 0, 20, -1], [0, 0, NaN, 20], [0, 0, 20, NaN],
      [0, 0, Infinity, 20], [0, 0, 20, -Infinity], [0, 0, -1, 20], [0, 0, 20, 0],
      [Number.MAX_VALUE, 0, Number.MAX_VALUE, 20], [0, Number.MAX_VALUE, 20, Number.MAX_VALUE],
    ];
    for (const bounds of invalid) for (const kind of kinds) {
      const r = recorder(); drawHudIcon(r.ctx, kind, ...bounds, '#fff');
      expect(r.paints).toEqual([]); expect(r.api.save).not.toHaveBeenCalled(); expect(r.snapshot()).toEqual(r.initial);
    }
    for (const size of [0, -1, NaN, Infinity, -Infinity]) for (const team of ['ct', 't'] as const) {
      const r = recorder(); drawTeamBadge(r.ctx, team, 0, 0, size, '#fff');
      expect(r.paints).toEqual([]); expect(r.api.save).not.toHaveBeenCalled();
    }
  });

  it('restores caller state even when painting throws', () => {
    const r = recorder(true);
    expect(() => drawHudIcon(r.ctx, 'armor', 0, 0, 54, 14, '#fff')).toThrow('paint failed');
    expect(r.snapshot()).toEqual(r.initial); expect(r.api.restore).toHaveBeenCalledOnce(); expect(r.stack).toEqual([]);
  });

  it('supports minimal CPU contexts when Path2D is unavailable with identical painted contours', () => {
    for (const kind of kinds) {
      vi.stubGlobal('Path2D', RecordedPath);
      const browser = recorder(); drawHudIcon(browser.ctx, kind, 3, 4, 54, 14, '#fff');
      vi.stubGlobal('Path2D', undefined);
      const cpu = recorder(); drawHudIcon(cpu.ctx, kind, 3, 4, 54, 14, '#fff');
      expect(cpu.paints).toEqual(browser.paints); expect(cpu.snapshot()).toEqual(cpu.initial);
    }
  });
});

describe('CS offline-derived firearm SVGs', () => {
  it('exports exactly the 17 own firearms with explicit name-correct mappings, not utility approximations', () => {
    const firearms = Object.entries(WEAPONS).filter(([, weapon]) => !('utility' in weapon && weapon.utility) && weapon.mag > 0).map(([id]) => id);
    expect(firearms).toHaveLength(17);
    expect(Object.keys(expected).sort()).toEqual(firearms.sort());
    expect(HUD_WEAPON_SOURCES).toEqual(expected);
    expect(WEAPONS.m4a1.name).toBe('M4A1-S'); expect(expected.m4a1).toBe('m4a1s');
    expect(WEAPONS.tmp.name).toBe('MP9'); expect(expected.tmp).toBe('mp9');
    expect(WEAPONS.m3.name).toBe('Nova'); expect(WEAPONS.scout.name).toBe('SSG 08');
    expect(WEAPONS.sg552.name).toBe('SG 553'); expect(WEAPONS.mp5.name).toBe('MP5-SD'); expect(WEAPONS.usp.name).toBe('USP-S');
    expect(readdirSync(assetDir).sort()).toEqual([...firearms.map(id => `${id}.svg`), 'manifest.json'].sort());
  });

  for (const [id, sourceId] of Object.entries(expected)) {
    it(`${id}: retains the exact source path, orientation, dimensions and transparent white fill`, () => {
      const svg = readFileSync(new URL(`${id}.svg`, assetDir), 'utf8');
      const [w, h] = WEAPON_SILHOUETTE_DIMS[sourceId];
      expect(svg).toBe(hudWeaponSvg(id));
      expect(svg.match(/<path\b/g)).toHaveLength(1);
      expect(svg.match(/\bd="([^"]+)"/)?.[1]).toBe(WEAPON_SILHOUETTES[sourceId]);
      expect(svg.match(/\bviewBox="([^"]+)"/)?.[1].split(' ').map(Number)).toEqual([...expectedOrigins[id], w, h]);
      expect(svg).toContain(`width="${Math.round(w * 1000)}" height="${Math.round(h * 1000)}"`);
      expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
      expect(svg).toContain('<path fill="#f0f3f5"');
      expect(svg).toContain(`packages/weapon-art/src/silhouettes.ts (${sourceId})`);
      expect(svg).toContain('../../../CREDITS.md');
      expect(svg).not.toMatch(/<(?:image|rect|text|script|style|use)\b|\b(?:transform|stroke|href|opacity|filter)=/);
    });
  }

  it('ships a reproducible manifest with exact source-path and complete-file SHA-256 identities', () => {
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', assetDir), 'utf8'));
    expect(manifest).toEqual(hudWeaponManifest());
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.source).toBe('packages/weapon-art/src/silhouettes.ts');
    expect(Object.keys(manifest.weapons).sort()).toEqual(Object.keys(expected).sort());
    for (const [id, sourceId] of Object.entries(expected)) {
      const svg = readFileSync(new URL(`${id}.svg`, assetDir), 'utf8');
      expect(manifest.weapons[id]).toMatchObject({ file: `${id}.svg`, sourceId,
        pathSha256: sha256(WEAPON_SILHOUETTES[sourceId]), svgSha256: sha256(svg) });
    }
  });

  it('refuses knife/HE/C4 and unknown IDs rather than substituting an invented firearm', () => {
    for (const id of ['knife', 'he', 'c4', 'armor', '', '__proto__', 'constructor', 'future-weapon']) {
      expect(() => hudWeaponSvg(id)).toThrow('No exact HUD firearm source');
    }
  });
});
