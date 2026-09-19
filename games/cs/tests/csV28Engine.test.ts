import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as T from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CsEngine, freeGeometry } from '../src/csEngine.js';
import { preloadSoldiers, parseSoldierAsset } from '../src/csSkinnedSoldier.js';
import { MAPS } from '../src/csMaps.js';
import { SnowWorld } from '../src/csWorld.js';
import { WEAPONS, makeWeapon } from '../src/csWeapons.js';
import { DEFAULT_SETTINGS } from '../src/csSettings.js';
import { GRENADE_PIN_TIME, GRENADE_RELEASE_TIME, GRENADE_RECOVER_TIME } from '../src/csGrenade.js';
import { BUTTERFLY_DEPLOY_DURATION } from '../src/csButterflyKnife.js';
import { actionCues } from '../src/csWeaponDeploy.js';
import { inspectDuration, WEAPON_VIEW_FOV } from '../src/csWeaponMotion.js';

// Keep real Three geometry, weapon rigs and physics; only browser GPU boot and
// character IO are substituted. Browser tests exercise their actual rendering.
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return { ...actual, WebGLRenderer: class {
    constructor(public options: unknown) {}
    shadowMap = { enabled: true, type: 0 };
    setSize = vi.fn(); setPixelRatio = vi.fn(); setAnimationLoop = vi.fn(); dispose = vi.fn();
  } };
});
vi.mock('../src/csSkinnedSoldier.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/csSkinnedSoldier.js')>();
  return { ...actual, preloadSoldiers: vi.fn() };
});

const engines: any[] = [];
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) });
  vi.mocked(preloadSoldiers).mockResolvedValue({ ct: null, t: null, dispose: vi.fn() } as any);
});
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function engineAt(base = 'https://example.test/games/cs/2.0.0/revision/') {
  const e: any = new CsEngine({ assetUrl: (path: string) => base + path, isZh: () => false, canvas: {} });
  engines.push(e);
  vi.spyOn(e.audio, 'preload').mockResolvedValue(undefined);
  vi.spyOn(e.audio, 'init').mockImplementation(() => {});
  vi.spyOn(e.audio, 'mechanic').mockReturnValue(false);
  vi.spyOn(e.audio, 'spatialMechanic').mockReturnValue(false);
  vi.spyOn(e.audio, 'shot').mockImplementation(() => {});
  vi.spyOn(e.audio, 'hit').mockImplementation(() => {});
  return e;
}
function arena() {
  const e = engineAt();
  e.world = {
    theme: 'snow', spawns: { ct: [{ pos: new T.Vector3() }], t: [{ pos: new T.Vector3(20, 0, 0) }] },
    bombSites: [], buyZones: [], raycast: vi.fn(() => null), lineClear: () => true,
    ground: () => 0, dispose: vi.fn(), update: vi.fn(), canStand: () => true,
  };
  e.player = e.makeActor('ct', 'YOU', true); e.player.grounded = true;
  e.all = [e.player]; e.phase = 'active'; e.matchActive = true; e.clock = 10;
  return e;
}
function equip(e: any, id: string) {
  const slot = id === 'knife' ? 'knife' : id === 'he' ? 'grenade' : (WEAPONS as any)[id].pistol ? 'pistol' : 'primary';
  e.player.inventory[slot] = e.inventoryWeapon(id); e.player.slot = slot;
  e.player.cooldown = 0; e.setGun(false);
  return e.weaponOf(e.player);
}
function grenade(e: any) {
  e.player.grenades = 1; e.player.lastSlot = 'pistol'; equip(e, 'he');
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('v28 engine settings and presentation', () => {
  it('initializes, persists and resets the complete settings instead of separate menu defaults', () => {
    localStorage.setItem('cs.controls.v1', JSON.stringify({ ...DEFAULT_SETTINGS, quality: 'low', startingPistol: 'deagle', knifeModel: 'butterfly', hitFeedback: 'visual' }));
    const e = arena();
    expect(e.quality).toBe('low'); expect(e.selectedPistol).toBe('deagle');
    equip(e, 'knife'); expect(e.gun.userData.rig.knifeModel).toBe('butterfly');
    expect(e.hud.weaponName).toBe('Butterfly knife');
    e.setKnifeModel('karambit'); expect(e.gun.userData.rig.knifeModel).toBe('karambit');
    e.setHitFeedback('off'); e.setQuality('high'); e.setPistol('default');
    expect(JSON.parse(localStorage.getItem('cs.controls.v1')!)).toMatchObject({ quality: 'high', startingPistol: 'default', knifeModel: 'karambit', hitFeedback: 'off' });
    e.resetSettings(); expect(e.controlSettings).toEqual(DEFAULT_SETTINGS);
    expect(e.quality).toBe(DEFAULT_SETTINGS.quality); expect(e.selectedPistol).toBe(DEFAULT_SETTINGS.startingPistol);
  });

  it('resizes both cameras without resetting simulation or weapon actions', () => {
    const e = arena(); equip(e, 'knife'); e.inspectWeapon();
    const clock = e.clock, inspectAt = e.player.inspectAt, pos = e.player.pos.clone();
    e.resize(431, 900);
    expect(e.camera.aspect).toBeCloseTo(431 / 900); expect(e.gunCamera.aspect).toBe(e.camera.aspect);
    expect(e.gunCamera.fov).toBe(WEAPON_VIEW_FOV);
    expect(e.clock).toBe(clock); expect(e.player.inspectAt).toBe(inspectAt); expect(e.player.pos).toEqual(pos);
  });

  it('bounds software readback independently of logical size and the native GPU quality budget', async () => {
    vi.stubGlobal('devicePixelRatio', 2);
    const e = engineAt(); e.softwareRendering = true; vi.spyOn(e, 'loadMap').mockResolvedValue(true);
    await e.init();
    expect(e.renderer.options.antialias).toBe(false);
    expect(e.renderer.setPixelRatio).toHaveBeenLastCalledWith(.5);
    e.resetSettings(); expect(e.quality).toBe('high'); expect(e.renderer.shadowMap.enabled).toBe(false);
    e.resize(480, 800);
    expect(e.renderer.setPixelRatio).toHaveBeenLastCalledWith(Math.sqrt(230400 / (480 * 800)));
    expect([e.width, e.height, e.camera.aspect]).toEqual([480, 800, .6]);
    e.softwareRendering = false; e.applyQuality();
    expect(e.renderer.setPixelRatio).toHaveBeenLastCalledWith(2); expect(e.renderer.shadowMap.enabled).toBe(true);
  });

  it('respects visual/off/full feedback and localized headshot/kill confirmation', () => {
    const e = arena();
    e.setHitFeedback('visual'); e.showHitFeedback(true, true); e.computeHud();
    expect(e.hud).toMatchObject({ hitOpacity: 1, hitHead: true, hitKind: 'kill', hitConfirmation: 'HEADSHOT KILL' });
    expect(e.audio.hit).not.toHaveBeenCalled();
    e.setHitFeedback('off'); e.showHitFeedback(false, true); e.computeHud(); expect(e.hud.hitOpacity).toBe(0);
    e.setHitFeedback('full'); e.showHitFeedback(false, false);
    expect(e.audio.hit).toHaveBeenCalledExactlyOnceWith(false, false);
  });

  it('preserves a manual pause and never recaptures from Escape or automatic buy closure', () => {
    const e = arena(), capture = vi.fn(); e.hooks.requestCapture = capture;
    e.fireHeld = true; e.keys.add('KeyW');
    e.pauseGame(); expect(e.fireHeld).toBe(false); expect(e.keys.size).toBe(0);
    e.openSettings(); e.closeSettings(); expect(e.phase).toBe('paused');
    e.resumeGame(false); e.openSettings();
    e.onKeyDown({ code: 'Escape', repeat: false, preventDefault: vi.fn() });
    expect(e.phase).toBe('active'); expect(capture).not.toHaveBeenCalled();
    e.mapOpen = true; e.onKeyDown({ code: 'Escape', repeat: false, preventDefault: vi.fn() });
    expect(e.mapOpen).toBe(false); expect(capture).not.toHaveBeenCalled();
    e.buyOpen = true; vi.spyOn(e, 'updatePlayer').mockImplementation(() => {}); e.update(.01);
    expect(e.buyOpen).toBe(false); expect(capture).not.toHaveBeenCalled();
  });
});

describe('v28 engine grenade transitions', () => {
  it.each([[1, 1], [2, 0], [3, .5]])('holds strength %s until both buttons release, launches once, then recovers', (buttons, strength) => {
    const e = arena(); grenade(e);
    if (buttons & 1) e.primeGrenade(1);
    if (buttons & 2) e.primeGrenade(2);
    expect(e.grenadePrime.strength).toBe(strength);
    e.clock += 3; e.updateGrenadePrime();
    expect(e.grenades).toHaveLength(0); expect(e.player.grenades).toBe(1);
    if (buttons & 1) e.releaseGrenade(1);
    if (buttons === 3) { expect(e.grenadePrime.released).toBe(false); expect(e.grenadePrime.strength).toBe(.5); }
    if (buttons & 2) e.releaseGrenade(2);
    const throwAt = e.grenadePrime.throwAt;
    e.clock = throwAt + GRENADE_RELEASE_TIME - .001; e.updateGrenadePrime(); expect(e.grenades).toHaveLength(0);
    e.clock += .002; e.updateGrenadePrime(); e.updateGrenadePrime();
    expect(e.grenades).toHaveLength(1); expect(e.grenades[0].fuse).toBe(1.5);
    expect(e.player.grenades).toBe(0); expect(e.player.slot).toBe('grenade');
    expect(e.weaponAnimationState(e.player).grenadeThrowProgress).toBeGreaterThan(0);
    expect(e.grenades[0].mesh.userData.rig.pin.visible).toBe(false);
    e.clock = throwAt + GRENADE_RECOVER_TIME + .001; e.updateGrenadePrime();
    expect(e.player.slot).toBe('pistol'); expect(e.player.inventory.grenade).toBeNull(); expect(e.grenadePrime).toBeNull();
    expect(e.audio.mechanic).toHaveBeenCalledWith('pin', 'he'); expect(e.audio.mechanic).toHaveBeenCalledWith('throw', 'he');
  });

  it('queues an early release behind deploy/pin timing and clears it on overlay pause', () => {
    const e = arena(); grenade(e); e.beginDeploy(e.player);
    e.primeGrenade(1); e.releaseGrenade(1);
    expect(e.grenadePrime.throwAt).toBeCloseTo(e.player.deployAt + e.player.deployFor + GRENADE_PIN_TIME);
    const clock = e.clock;
    e.pauseGame(); e.update(.04);
    expect(e.grenadePrime).toBeNull(); expect(e.player.grenades).toBe(1); expect(e.grenades).toHaveLength(0); expect(e.clock).toBe(clock);
  });

  it('returns to knife after the recovery if both guns have been dropped, without duplicating the empty HE', () => {
    const e = arena(); grenade(e); e.player.inventory.pistol = null; e.player.lastSlot = 'grenade';
    e.primeGrenade(2); e.releaseGrenade(2);
    e.clock += GRENADE_PIN_TIME + GRENADE_RELEASE_TIME + .001; e.updateGrenadePrime();
    e.dropCurrent(); expect(e.pickupItems).toHaveLength(0);
    e.clock += GRENADE_RECOVER_TIME; e.updateGrenadePrime();
    expect(e.player.slot).toBe('knife'); expect(e.player.inventory.grenade).toBeNull();
  });
});

describe('v28 engine weapon and bot handling', () => {
  it('chooses butterfly variants only when actions begin and uses the correct durations/audio identity', () => {
    const e = arena(); e.controlSettings.knifeModel = 'butterfly'; equip(e, 'knife');
    e.beginDeploy(e.player); expect(e.player.deployFor).toBe(BUTTERFLY_DEPLOY_DURATION); expect(e.player.deployAudio).toBe('butterfly');
    e.clock += e.player.deployFor + .01; e.updateWeapon(e.player, 2); e.inspectWeapon();
    const variant = e.player.butterflyInspectVariant;
    e.clock += inspectDuration('knife', 'butterfly') * .5;
    expect(e.weaponAnimationState(e.player).inspectProgress).toBeCloseTo(.5);
    expect(e.weaponAnimationState(e.player).butterflyInspectVariant).toBe(variant);
    e.updateWeapon(e.player, .01);
    expect(e.audio.mechanic.mock.calls.some(([, id]: any[]) => id === 'butterfly')).toBe(true);
    const random = vi.spyOn(Math, 'random');
    for (let i = 0; i < 10; i++) e.weaponAnimationState(e.player);
    expect(random).not.toHaveBeenCalled();
    e.player.cooldown = 0; e.fire(true);
    expect(e.weaponAnimationState(e.player).knifeHeavy).toBe(true); expect(e.player.inspectAt).toBe(-99);
  });

  it('cycles the actual weapon action cues and restores scope in the post-round window', () => {
    const e = arena(), w = equip(e, 'awp'); e.zoom = 2; e.phase = 'round-end'; e.beginShot(e.player);
    expect(e.zoom).toBe(0); expect(e.isCycling(w)).toBe(true); expect(e.beginReload(e.player)).toBe(false);
    e.clock += WEAPONS.awp.rate + .01; e.updateWeapon(e.player, .04);
    expect(w.cyclePending).toBe(false); expect(e.zoom).toBe(2);
    expect(e.audio.mechanic.mock.calls).toEqual(actionCues('awp', 'cycle').map(c => [c.sound, 'awp']));
  });

  it('supports firing and reload during round-end without reopening round scoring', () => {
    const e = arena(), w = equip(e, 'usp'); e.phase = 'round-end'; e.scores.ct = 1;
    const before = w.ammo; e.fire(); expect(w.ammo).toBe(before - 1);
    e.clock += 1; e.player.cooldown = 0; e.reload(); expect(e.player.reload).toBeGreaterThan(0);
    const target = e.makeActor('t', 'ENEMY'); e.all.push(target); target.health = 1; target.armor = 0;
    expect(e.damageActor(target, 20, e.player, 'usp')).toBe(true);
    expect(e.scores.ct).toBe(1); expect(e.phase).toBe('round-end');
  });

  it('emits a single accumulated confirmation for a multi-pellet shotgun hit', () => {
    const e = arena(); equip(e, 'm3');
    const target = e.makeActor('t', 'ENEMY');
    e.hitActor = vi.fn(() => ({ actor: target, head: true, distance: 2 }));
    e.damageActor = vi.fn(() => { target.alive = false; return true; });
    e.fire();
    expect(e.damageActor).toHaveBeenCalledTimes(WEAPONS.m3.pellets);
    expect(e.audio.hit).toHaveBeenCalledExactlyOnceWith(true, true); expect(e.hud.hitKind).toBe('kill');
  });

  it('matches crouched bot eyes/hitboxes and recent visible squad reports', () => {
    const e = arena(), b = e.makeActor('t', 'BOT'); b.pos.set(0, 0, -4); b.crouching = true; e.all.push(b);
    expect(e.eyeOf(b).y).toBeCloseTo(1.03);
    expect(e.hitActor(new T.Vector3(0, 1.6, 0), new T.Vector3(0, 0, -1), 10, e.player)).toBeNull();
    expect(e.hitActor(new T.Vector3(0, 1.1, 0), new T.Vector3(0, 0, -1), 10, e.player)?.head).toBe(true);
    e.world.theme = 'desert'; e.mode = 'tdm';
    const report = { pos: new T.Vector3(9, 0, 6), time: e.clock - 1 }; b.lastSeen = report;
    expect(e.objectiveDestination(b, [e.player])).toBe(report.pos);
  });
});

describe('v28 integrated active match', () => {
  it('runs real Snow navigation, skinned squads, weapon posing and live combat without stopping the loop', async () => {
    let randomState = 54321;
    vi.spyOn(Math, 'random').mockImplementation(() => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; });
    const e = engineAt(), root = join(process.cwd(), 'games/cs/public');
    const bytes = (path: string) => { const b = readFileSync(join(root, path)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
    const library: any = {};
    for (const team of ['ct', 't']) library[team] = await parseSoldierAsset(bytes(`assets/characters/${team}-sample.glb`), loader => loader.register(() => ({
      name: 'HeadlessCharacterTextures', loadTexture() { const texture = new T.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); texture.flipY = false; return Promise.resolve(texture); },
    })));
    library.dispose = () => {
      const resources = new Set<any>();
      for (const team of ['ct', 't']) library[team].scene.traverse((o: any) => {
        if (o.geometry) resources.add(o.geometry); if (o.skeleton) resources.add(o.skeleton);
        for (const m of [].concat(o.material || [])) { resources.add(m); if (m.map) resources.add(m.map); }
      });
      for (const resource of resources) resource.dispose();
    };
    e.soldierLibrary = library;
    e.world = new SnowWorld(e.scene, MAPS.fy_snow, e.assetUrl);
    e.world.parseBSP(bytes(MAPS.fy_snow.asset)); e.world.buildNavigation();
    e.ready = true; e.startMatch(); e.freezeTime = .01;
    expect(e.bots.filter((b: any) => b.mesh.userData.skinned)).toHaveLength(9);
    for (let frame = 0; frame < 180; frame++) e.update(1 / 30);
    expect(e.clock).toBeCloseTo(6); expect(['active', 'round-end', 'freeze']).toContain(e.phase);
    expect(e.bots.some((b: any) => b.moveSpeed > 0)).toBe(true);
    expect(e.bots.some((b: any) => b.lastShot > 0)).toBe(true);
    for (const b of e.bots) expect(b.mesh.matrixWorld.elements.every(Number.isFinite)).toBe(true);
  }, 60000);
});

describe('v28 engine async resource ownership', () => {
  it('blocks menu actions until character boot resolves and retains the instance URL resolver', async () => {
    const wait = deferred<any>(), library = { dispose: vi.fn() };
    vi.mocked(preloadSoldiers).mockReturnValueOnce(wait.promise);
    const e = engineAt('https://example.test/immutable-old/'), load = vi.spyOn(e, 'loadMap').mockResolvedValue(true);
    const boot = e.init(); expect(e.bootLoading).toBe(true);
    e.primaryAction(); e.selectMap('de_dust2'); expect(load).not.toHaveBeenCalled();
    expect(vi.mocked(preloadSoldiers).mock.calls.at(-1)?.[0]('assets/characters/ct-sample.glb')).toBe('https://example.test/immutable-old/assets/characters/ct-sample.glb');
    wait.resolve(library); await boot;
    expect(e.bootLoading).toBe(false); expect(e.soldierLibrary).toBe(library); expect(load).toHaveBeenCalledExactlyOnceWith('fy_snow');
  });

  it('aborts pending boot and disposes even a non-cancellable late character library', async () => {
    const wait = deferred<any>(), library = { dispose: vi.fn() };
    vi.mocked(preloadSoldiers).mockReturnValueOnce(wait.promise);
    const e = engineAt(), load = vi.spyOn(e, 'loadMap').mockResolvedValue(true), audioDispose = vi.spyOn(e.audio, 'dispose');
    const boot = e.init(), renderer = e.renderer, signal = vi.mocked(preloadSoldiers).mock.calls.at(-1)?.[1]?.signal;
    e.dispose(); expect(signal?.aborted).toBe(true); expect(renderer.dispose).toHaveBeenCalledTimes(1);
    wait.resolve(library); await boot;
    expect(library.dispose).toHaveBeenCalledTimes(1); expect(audioDispose).toHaveBeenCalledTimes(1);
    expect(load).not.toHaveBeenCalled(); expect(e.soldierLibrary).toBeNull(); expect(e.ready).toBe(false);
    e.primaryAction(); expect(e.renderer).toBeNull();
  });

  it('allows retrying failed character boot without overwriting a live renderer or starting early', async () => {
    const e = engineAt(); vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(preloadSoldiers).mockRejectedValueOnce(new Error('Character boot failed'));
    const load = vi.spyOn(e, 'loadMap').mockResolvedValue(true);
    await e.init(); const oldRenderer = e.renderer;
    expect(e.bootLoading).toBe(false); expect(e.bootError).toBe('Character boot failed'); expect(e.hud.menuStart.enabled).toBe(true);
    await e.primaryAction(); expect(oldRenderer.dispose).toHaveBeenCalledTimes(1);
    expect(e.bootError).toBe(''); expect(load).toHaveBeenCalledExactlyOnceWith('fy_snow');
  });

  it('retires a map completing after engine destruction instead of installing it', async () => {
    const wait = deferred<void>(), e = engineAt();
    vi.spyOn(SnowWorld.prototype, 'load').mockImplementation(() => wait.promise);
    const pending = e.loadMap('fy_snow'), candidate = e.pendingWorld, dispose = vi.spyOn(candidate, 'dispose');
    e.dispose(); wait.resolve(); await pending;
    expect(dispose).toHaveBeenCalledTimes(1); expect(e.world).toBeNull(); expect(e.ready).toBe(false);
    expect(e.scene.children).not.toContain(candidate.mapGroup); expect(e.scene.children).not.toContain(candidate.environment);
  });

  it('frees unique weapon materials once without invalidating shared soldier/weapon resources', () => {
    const group = new T.Group(), sharedGeometry = new T.BoxGeometry(), sharedMaterial = new T.MeshBasicMaterial();
    sharedGeometry.userData.sharedCharacter = true;
    const skeleton = new T.Skeleton(), mesh = new T.SkinnedMesh(sharedGeometry, sharedMaterial); mesh.skeleton = skeleton;
    const second = new T.SkinnedMesh(sharedGeometry, sharedMaterial); second.skeleton = skeleton; group.add(mesh, second);
    const stop = vi.fn(); group.userData.skinned = { mixer: { stopAllAction: stop } };
    const skeletonDispose = vi.spyOn(skeleton, 'dispose'), geometryDispose = vi.spyOn(sharedGeometry, 'dispose'), materialDispose = vi.spyOn(sharedMaterial, 'dispose');
    const weapon = makeWeapon('he'); group.add(weapon);
    const owned = new Set<T.Material>(); weapon.traverse((o: any) => { for (const m of [].concat(o.material || [])) if (m.userData.ownedCsWeaponMaterial) owned.add(m); });
    const uniqueDispose = [...owned].map(m => vi.spyOn(m, 'dispose'));
    freeGeometry(group);
    expect(stop).toHaveBeenCalledTimes(1); expect(skeletonDispose).toHaveBeenCalledTimes(1);
    expect(geometryDispose).not.toHaveBeenCalled(); expect(materialDispose).not.toHaveBeenCalled();
    expect(uniqueDispose).toHaveLength(1); expect(uniqueDispose[0]).toHaveBeenCalledTimes(1);
    sharedGeometry.dispose(); sharedMaterial.dispose();
  });
});
