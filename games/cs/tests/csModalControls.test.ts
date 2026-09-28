import { afterEach, describe, expect, it, vi } from 'vitest';
import * as T from 'three';
import { CsEngine } from '../src/csEngine.js';
import { BUY_CATEGORIES } from '../src/csEconomy.js';

const engines: any[] = [];
afterEach(() => { engines.splice(0).forEach(e => e.dispose()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function engine(zh = false) {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  const hooks = { requestCapture: vi.fn(), releaseCapture: vi.fn() };
  const e: any = new CsEngine({ canvas: {}, isZh: () => zh, hooks }); engines.push(e);
  vi.spyOn(e.audio, 'init').mockImplementation(() => {}); vi.spyOn(e.audio, 'mechanic').mockReturnValue(false);
  e.world = { theme: 'desert', spawns: { ct: [{ pos: new T.Vector3() }], t: [{ pos: new T.Vector3(30, 0, 0) }] },
    bombSites: [], buyZones: [{ team: 'ct', box: new T.Box3(new T.Vector3(-10, -10, -10), new T.Vector3(10, 10, 10)) }],
    ground: () => 0, canStand: () => true, lineClear: () => true, raycast: () => null, dispose: vi.fn(), update: vi.fn() };
  e.player = e.makeActor('ct', 'YOU', true); e.player.grounded = true;
  e.all = [e.player]; e.bots = []; e.phase = 'active'; e.matchActive = true; e.clock = 10;
  e.mode = 'defusal'; e.bomb = { elapsed: 0, status: 'carried', canPlant: () => false, canDefuse: () => false };
  e.computeHud(); return { e, hooks };
}
const key = (code: string, repeat = false) => ({ code, repeat, preventDefault: vi.fn() });

describe('CS radio input ownership', () => {
  it('releases held actions and blocks shoot/weapon input without pausing the round', () => {
    const { e, hooks } = engine(); e.keys.add('KeyW'); e.fireHeld = true; e.shotPressed = true;
    e.buyOpen = true; e.hud.scoreboardOpen = true; e.openRadio('radio1');
    expect(e.phase).toBe('active'); expect(e.clock).toBe(10); expect(e.gameInputActive()).toBe(false);
    expect(e.radioMenu).toBe('radio1'); expect(e.hud.radio.options).toHaveLength(6);
    expect(e.buyOpen).toBe(false); expect(e.hud.scoreboardOpen).toBe(false);
    expect(e.fireHeld).toBe(false); expect(e.shotPressed).toBe(false); expect(e.keys.size).toBe(0);
    const slot = e.player.slot; e.onMouseDown(0); e.onWheel(1); e.onKeyDown(key('KeyW')); e.onKeyDown(key('Digit9'));
    expect(e.fireHeld).toBe(false); expect(e.player.slot).toBe(slot); expect(e.keys.has('KeyW')).toBe(false);
    expect(hooks.releaseCapture).toHaveBeenCalledOnce();
  });
  it('keeps radio number/group shortcuts, shows command feedback and closes cleanly', () => {
    const { e, hooks } = engine(); e.openRadio('radio1');
    e.onKeyDown(key('KeyX')); expect(e.radioMenu).toBe('radio2');
    e.onKeyDown(key('Digit1', true)); expect(e.radioMenu).toBe('radio2');
    e.onKeyDown(key('Digit1'));
    expect(e.radioMenu).toBeNull(); expect(e.hud.radio).toBeNull();
    expect(e.hud.notice.text).toContain('Charge'); expect(e.phase).toBe('active');
    expect(hooks.requestCapture).toHaveBeenCalledOnce();
  });
  it('Escape and an explicitly non-capturing close never restore capture', () => {
    const { e, hooks } = engine(); e.openRadio('radio3'); e.onKeyDown(key('Escape'));
    expect(e.radioMenu).toBeNull(); expect(e.phase).toBe('active'); expect(hooks.requestCapture).not.toHaveBeenCalled();
    e.openRadio('radio1'); e.closeRadio(false);
    expect(e.radioMenu).toBeNull(); expect(e.hud.radio).toBeNull(); expect(hooks.requestCapture).not.toHaveBeenCalled();
  });
  it('automatically closes radio at round end without capture or a stale command', () => {
    const { e, hooks } = engine(); e.mode = 'elimination'; vi.spyOn(e.audio, 'round').mockImplementation(() => {});
    e.openRadio('radio1'); e.fireHeld = true; e.shotPressed = true; e.keys.add('KeyW');
    e.endRound('ct');
    expect(e.phase).toBe('round-end'); expect(e.radioMenu).toBeNull(); expect(e.hud.radio).toBeNull();
    expect(e.hud.center.kicker).toBe('ROUND WON');
    expect(e.fireHeld).toBe(false); expect(e.shotPressed).toBe(false); expect(e.keys.size).toBe(0);
    expect(hooks.requestCapture).not.toHaveBeenCalled();
    const notice = e.hud.notice; e.chooseRadio(0);
    expect(e.hud.notice).toBe(notice); expect(hooks.requestCapture).not.toHaveBeenCalled();
  });
  it('opening from a manual pause preserves pause on choice or close', () => {
    const { e, hooks } = engine(); e.phase = 'paused'; e.openRadio('radio1'); e.chooseRadio(0);
    expect(e.phase).toBe('paused'); expect(e.radioMenu).toBeNull(); expect(hooks.requestCapture).not.toHaveBeenCalled();
    e.openRadio('radio3'); e.onKeyDown(key('Digit0'));
    expect(e.phase).toBe('paused'); expect(e.hud.radio).toBeNull(); expect(hooks.requestCapture).not.toHaveBeenCalled();
  });
  it('retains team-follow effects while rejecting nonexistent/dead/menu entry', () => {
    const { e } = engine();
    const mate = { alive: true, team: 'ct', route: [], routeIndex: 7, pathTime: 5 };
    e.bots = [mate]; e.openRadio('radio1'); e.chooseRadio(4);
    expect(mate.route).toEqual([e.player.pos]); expect(mate.routeIndex).toBe(0); expect(mate.pathTime).toBe(0);
    e.bots = [];
    for (const invalid of ['not-a-radio', '__proto__']) { e.openRadio(invalid); expect(e.radioMenu).toBeNull(); }
    e.player.alive = false; e.openRadio('radio1'); expect(e.radioMenu).toBeNull();
    e.player.alive = true; e.phase = 'menu'; e.openRadio('radio1'); expect(e.radioMenu).toBeNull();
  });
});

describe('CS localized purchase feedback', () => {
  it('English shop rows have localized utility names/types and distinct owned/funds states', () => {
    const { e } = engine(); e.player.money = 0; e.player.armor = 0; e.player.helmet = false; e.player.defuseKit = false; e.player.grenades = 0;
    for (const category of BUY_CATEGORIES) {
      e.setBuyCategory(category.id); const view = e.shopView();
      expect(/[\u3400-\u9fff]/u.test(JSON.stringify(view.items))).toBe(false);
      expect(/[\u3400-\u9fff]/u.test(view.categoryTitle)).toBe(false);
      for (const item of view.items) expect(['owned', 'funds']).toContain(item.status);
    }
    e.setBuyCategory('equipment'); expect(e.shopView().items.find((i: any) => i.id === 'kit').label).toBe('Defuse Kit');
  });
  it('preserves prices/team restrictions and reports successful purchases visibly', () => {
    const { e } = engine(true); e.player.money = 1000; e.player.armor = 0; e.player.helmet = false; e.player.defuseKit = false;
    e.setBuyCategory('equipment'); expect(e.shopView().items.find((i: any) => i.id === 'kit').label).toBe('拆弹工具');
    e.buy('kit'); expect(e.player.money).toBe(600); expect(e.player.defuseKit).toBe(true);
    expect(e.hud.notice.text).toContain('已购买');
    expect(e.shopView().items.find((i: any) => i.id === 'kit')).toMatchObject({ status: 'owned', disabled: true });
    e.setBuyCategory('rifle'); expect(e.shopView().items.some((i: any) => i.id === 'ak47')).toBe(false);
    const money = e.player.money; e.buy('ak47'); expect(e.player.money).toBe(money); expect(e.hud.notice.text).toContain('无法购买');
    e.player.pos.set(50, 0, 50); expect(e.shopView().items.every((i: any) => i.disabled)).toBe(true);
  });
});
