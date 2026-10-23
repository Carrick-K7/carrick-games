import { afterEach, describe, expect, it, vi } from 'vitest';
import { CsEngine } from '../src/csEngine.js';
import { MAPS } from '../src/csMaps.js';
import { BombRound } from '../src/csBombMode.js';
import { assignDustRoute, createDustPlan } from '../src/csTactics.js';
import * as T from 'three';

const engines: any[] = [];
afterEach(() => { engines.splice(0).forEach(e => e.dispose()); vi.restoreAllMocks(); });
function engine() {
  const e: any = new CsEngine({ canvas: {}, assetUrl: (path: string) => `https://example.test/release/${path}`, isZh: () => false });
  engines.push(e);
  vi.spyOn(e, 'makeRadarBase').mockImplementation(() => {}); // No Canvas in CPU mechanics tests.
  vi.spyOn(e.audio, 'init').mockImplementation(() => {});
  vi.spyOn(e.audio, 'mechanic').mockReturnValue(false);
  vi.spyOn(e.audio, 'stopKnifeAction').mockImplementation(() => {});
  return e;
}

describe('CS classic map engine integration', () => {
  for (const id of ['de_inferno', 'de_mirage']) {
    it(`${id}: real loading, ten actors, map-specific routes and buy zones work in both modes`, async () => {
      const e = engine(); e.selectedTeam = 't';
      expect(await e.loadMap(id)).toBe(true);
      expect(e.selectedMap).toBe(id); expect(e.selectedMode).toBe('defusal');
      e.startMatch();
      expect(e.all).toHaveLength(10); expect(e.bots).toHaveLength(9);
      expect(e.bomb.carrier).toBe(e.player); expect(e.canBuy(e.player)).toBe(true);
      e.player.money = 16000; expect(e.buyItem(e.player, 'ak47')).toBe(true);
      const names = Object.values(e.world.tacticalRoutes).flatMap((site: any) => Object.keys(site));
      for (const b of e.bots.filter((a: any) => a.team === 't')) {
        expect(names).toContain(b.routeName); expect(b.route.length).toBeGreaterThan(0);
        expect(b.route.every((p: any) => e.world.closest(p))).toBe(true);
      }
      const clock = e.clock; e.pauseGame(); e.update(.1); expect(e.clock).toBe(clock);
      e.toMenu(); e.selectMode('tdm'); e.startMatch();
      expect(e.mode).toBe('tdm'); expect(e.bomb).toBeNull();
      expect(e.player.inventory.primary.id).toBe('ak47'); expect(e.canBuy(e.player)).toBe(true);
      e.player.pos.copy(e.world.bombSites[0].pos); expect(e.canBuy(e.player)).toBe(false);
      expect(e.computeLocation()).toContain('A');
    });

    it(`${id}: all rush entrances are selectable and CT pushes leave the plant zone`, async () => {
      const e = engine(); await e.loadMap(id); e.startMatch();
      let seed = 27; const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      const entries = new Set<number>();
      for (let i = 0; i < 400; i++) { const plan = createDustPlan(e.world, random); if (plan.site === 'A') entries.add(plan.entry); }
      expect([...entries].sort()).toEqual([0, 1, 2]);
      const actor = e.all.find((a: any) => a.team === 'ct');
      assignDustRoute(e.world, actor, 0, 0, null, { order: [0], defence: ['A'], roles: ['push'], style: 'rush', entry: 0 }, () => .1);
      expect(actor.route.length).toBeGreaterThan(2);
      const site = e.world.bombSites.find((s: any) => s.id === 'A');
      expect(site.box.containsPoint(actor.route.at(-1).clone().add(new T.Vector3(0, .35, 0)))).toBe(false);
    });

    it.each(['A', 'B'])(`${id}: actual %s site supports planting and defusing without changing objective durations`, async siteId => {
      const e = engine(); e.selectedTeam = 't'; await e.loadMap(id); e.startMatch();
      const t = e.player, ct = e.all.find((a: any) => a.team === 'ct'), site = e.world.bombSites.find((s: any) => s.id === siteId);
      t.pos.copy(site.pos); t.grounded = true; t.moveSpeed = 0;
      expect(e.world.canStand(t.pos.x, t.pos.y + .01, t.pos.z)).toBe(true);
      const bomb = new BombRound(e.world); bomb.reset(e.all, 1, siteId);
      expect(bomb.canPlant(t)).toBe(true);
      bomb.tick(3.19, e.all, new Set([t])); expect(bomb.status).toBe('carried');
      bomb.tick(.02, e.all, new Set([t])); expect(bomb.status).toBe('planted'); expect(bomb.fuse).toBe(40);
      ct.pos.copy(site.pos); ct.grounded = true; ct.moveSpeed = 0; ct.defuseKit = true;
      expect(bomb.canDefuse(ct)).toBe(true);
      bomb.tick(4.99, e.all, new Set([ct])); expect(bomb.status).toBe('planted');
      bomb.tick(.02, e.all, new Set([ct])); expect(bomb.status).toBe('defused'); expect(bomb.winner).toBe('ct');
    });
  }

  it('starts missing detail-map work when a constrained viewport becomes desktop-sized', () => {
    const e = engine(), palette = { applyQuality: vi.fn(), load: vi.fn().mockResolvedValue({}), dispose: vi.fn() };
    e.renderer = { shadowMap: { enabled: false }, setPixelRatio: vi.fn(), setSize: vi.fn(), dispose: vi.fn() };
    e.world = { materialPalette: palette, dispose: () => palette.dispose() }; e.quality = 'high';
    e.resize(390, 844, 2); expect(palette.applyQuality).toHaveBeenLastCalledWith({ detail: false, anisotropy: 1 });
    e.resize(1280, 720, 2); expect(palette.applyQuality).toHaveBeenLastCalledWith({ detail: true, anisotropy: 1 });
    expect(palette.load).toHaveBeenCalledTimes(2);
  });

  it('aborts the pending photo palette immediately on teardown without prematurely sealing raw world loading', () => {
    const e = engine(), palette = { dispose: vi.fn() }, geometryDispose = vi.fn();
    e.pendingWorld = { materialPalette: palette, dispose: geometryDispose };
    e.dispose(); expect(palette.dispose).toHaveBeenCalledOnce(); expect(geometryDispose).not.toHaveBeenCalled();
  });

  it('switches authored maps transactionally and retires the old world, not the new instance', async () => {
    const e = engine(); await e.loadMap('de_inferno');
    const previous = e.world, dispose = vi.spyOn(previous, 'dispose');
    expect(await e.loadMap('not-a-map')).toBe(false); expect(e.world).toBe(previous);
    expect(await e.loadMap('de_mirage')).toBe(true); expect(dispose).toHaveBeenCalledOnce();
    expect(e.world).not.toBe(previous); expect(e.world.mapGroup.visible).toBe(true);
    expect(Object.keys(MAPS)).toEqual(['fy_snow', 'de_dust2', 'de_inferno', 'de_mirage']);
  });
});
