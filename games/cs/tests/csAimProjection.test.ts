import * as T from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CsEngine } from '../src/csEngine.js';
import { computeHudLayout } from '../src/csHudLayout';
import { viewMuzzle } from '../src/csWeaponBehavior.js';
import { WEAPON_VIEW_FOV } from '../src/csWeaponMotion.js';

// CPU-only engine tests. Constructor, Three cameras/rigs and fire are real;
// never call init() (GPU/asset boot is covered by aiming.spec.ts).
const engines: any[] = [];
beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value) });
});
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function arena() {
  const e: any = new CsEngine({ canvas: {}, isZh: () => false,
    assetUrl: (path: string) => `https://example.test/immutable-cs/${path}` });
  engines.push(e);
  e.world = { theme: 'snow', raycast: vi.fn(() => null), dispose: vi.fn(),
    spawns: { ct: [{ pos: new T.Vector3() }], t: [{ pos: new T.Vector3(20, 0, 0) }] }, bombSites: [], buyZones: [] };
  e.player = e.makeActor('ct', 'PROJECTION', true);
  e.player.pos.set(7.25, 2.1, -4.75);
  e.player.pitch = -.23;
  e.player.yaw = .71;
  e.player.grounded = true;
  e.player.inventory.primary = e.inventoryWeapon('g3sg1');
  e.player.slot = 'primary';
  e.all = [e.player];
  e.phase = 'active';
  e.matchActive = true;
  e.mode = 'tdm';
  e.clock = 10;
  vi.spyOn(e.audio, 'shot').mockImplementation(() => {});
  vi.spyOn(e.audio, 'mechanic').mockReturnValue(false);
  e.setGun(false);
  return e;
}

const viewports = [
  { name: 'desktop', width: 1280, height: 720, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { name: 'small phone', width: 320, height: 568, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { name: 'phone notch', width: 390, height: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } },
  { name: 'short landscape notch', width: 568, height: 320, safe: { top: 0, right: 8, bottom: 21, left: 44 } },
  { name: 'height-only resize', width: 844, height: 390, safe: { top: 9, right: 8, bottom: 21, left: 44 } },
];

describe('CS real engine aim projection (CPU geometry, not GPU rendering)', () => {
  for (const dpr of [1, 2]) for (const [zoom, fov] of [[0, 76], [1, 40], [2, 10]]) {
    it(`projects camera forward and the actual fire base ray at viewport centre: FOV ${fov}, DPR ${dpr}`, () => {
      vi.stubGlobal('devicePixelRatio', dpr);
      vi.spyOn(Math, 'random').mockReturnValue(.5); // deterministic base ray, not a replacement fire/hit result
      const e = arena();
      // Nonzero look AND recoil angles catch camera/ray orientation divergence.
      e.kickPitch = .035;
      e.kickYaw = -.018;
      for (const viewport of viewports) {
        const position = e.player.pos.clone(), clock = e.clock;
        e.resize(viewport.width, viewport.height);
        e.zoom = zoom;
        e.player.cooldown = 0;
        e.weaponOf(e.player).readyAt = 0;
        e.syncPlayerView(2, false); // converge through the actual engine zoom path
        e.camera.updateMatrixWorld(true);
        expect(e.camera.fov).toBeCloseTo(fov, 8);
        expect(e.camera.aspect).toBeCloseTo(viewport.width / viewport.height, 10);
        expect(e.gunCamera.aspect).toBe(e.camera.aspect);
        expect(e.gunCamera.fov).toBe(WEAPON_VIEW_FOV);
        const forward = e.camera.getWorldDirection(new T.Vector3());
        const eye = e.eyeOf(e.player);
        expect(e.camera.position.distanceTo(eye)).toBeLessThan(1e-10);
        for (const distance of [1, 10, 90]) {
          const ndc = eye.clone().addScaledVector(forward, distance).project(e.camera);
          expect(ndc.x).toBeCloseTo(0, 10);
          expect(ndc.y).toBeCloseTo(0, 10);
          expect(ndc.z).toBeGreaterThan(-1);
          expect(ndc.z).toBeLessThan(1);
        }
        const hud = computeHudLayout(viewport.width, viewport.height, viewport.safe);
        // Safe areas reserve UI room, never crop/shift the camera viewport.
        expect(hud.W).toBe(viewport.width);
        expect(hud.H).toBe(viewport.height);
        const hitActor = vi.spyOn(e, 'hitActor'); // passthrough: record real fire's ray
        const before = e.weaponOf(e.player).ammo;
        e.fire();
        expect(e.weaponOf(e.player).ammo).toBe(before - 1);
        expect(hitActor).toHaveBeenCalledTimes(1);
        const [origin, direction, , shooter] = hitActor.mock.calls[0] as [T.Vector3, T.Vector3, number, unknown];
        expect(shooter).toBe(e.player);
        expect(origin.distanceTo(eye)).toBeLessThan(1e-10);
        expect(direction.distanceTo(forward)).toBeLessThan(1e-10);
        const ndc = origin.clone().addScaledVector(direction, 20).project(e.camera);
        expect((ndc.x + 1) * hud.W / 2).toBeCloseTo(viewport.width / 2, 8);
        expect((1 - ndc.y) * hud.H / 2).toBeCloseTo(viewport.height / 2, 8);
        expect(e.player.pos).toEqual(position);
        expect(e.clock).toBe(clock);
        hitActor.mockRestore();
      }
    });

    it(`preserves the off-centre gun muzzle NDC through world projection: FOV ${fov}, DPR ${dpr}`, () => {
      vi.stubGlobal('devicePixelRatio', dpr);
      const e = arena();
      for (const viewport of viewports) {
        e.resize(viewport.width, viewport.height);
        e.zoom = zoom;
        e.syncPlayerView(2, false);
        e.gun.updateWorldMatrix(true, true);
        e.gunCamera.updateMatrixWorld(true);
        e.camera.updateMatrixWorld(true);
        const rig = e.gun.userData.rig;
        const barrel = rig.core.localToWorld(rig.muzzle.clone());
        const gunNdc = barrel.clone().project(e.gunCamera);
        const muzzle = viewMuzzle(e.gun, e.gunCamera, e.camera);
        const worldNdc = muzzle.clone().project(e.camera);
        expect(worldNdc.x).toBeCloseTo(gunNdc.x, 9);
        expect(worldNdc.y).toBeCloseTo(gunNdc.y, 9);
        // The muzzle is the barrel, not the centre-screen aiming anchor. Do not
        // "fix" aiming by moving this physically distinct projection to (0, 0).
        expect(Math.hypot(gunNdc.x, gunNdc.y)).toBeGreaterThan(.01);
        const gunPx = [(gunNdc.x + 1) * viewport.width / 2, (1 - gunNdc.y) * viewport.height / 2];
        const worldPx = [(worldNdc.x + 1) * viewport.width / 2, (1 - worldNdc.y) * viewport.height / 2];
        expect(worldPx[0]).toBeCloseTo(gunPx[0], 7);
        expect(worldPx[1]).toBeCloseTo(gunPx[1], 7);
      }
    });
  }
});
