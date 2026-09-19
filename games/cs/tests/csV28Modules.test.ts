import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { grenadeLaunch, advanceGrenade, GRENADE_RADIUS } from '../src/csGrenade.js';
import { chooseButterflyVariant, BUTTERFLY_VARIANTS } from '../src/csButterflyKnife.js';
import { DEFAULT_SETTINGS, normalizeSettings, loadSettings, saveSettings } from '../src/csSettings.js';
import { normalizeKnifeModel } from '../src/csKnifeStyles.js';
import { WEAPONS, makeWeapon, makeSoldier } from '../src/csWeapons.js';
import { applyWeaponAnimation, sampleWeaponMotion, reloadLabel, inspectDuration } from '../src/csWeaponMotion.js';
import { DEPLOY, actionPhase, actionCues } from '../src/csWeaponDeploy.js';
import { createViewHand, poseFirearmHand, poseViewHand } from '../src/csViewHands.js';
import { karambitMaterials } from '../src/csKarambitMaterials.js';
import { GameAudio } from '../src/csAudio.js';
import { RECORDED_REPORTS, RECORDED_MECHANICS, SAMPLE_FILES, SHOT_FILES, SAMPLE_GAINS } from '../src/csAudioRecordings.js';
import { parseSoldierAsset, preloadSoldiers, updateSkinnedSoldier, poseSkinnedSoldierDeath } from '../src/csSkinnedSoldier.js';
import { createDustPlan, dustCombatMove } from '../src/csTactics.js';

const assets = join(process.cwd(), 'games/cs/public/assets');
const leases: any[] = [];
const audioInstances: any[] = [];
afterEach(() => {
  for (const lease of leases.splice(0)) lease.dispose();
  for (const audio of audioInstances.splice(0)) audio.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function audioAt(base: string) {
  const audio = new GameAudio((path: string) => `${base}/${path}`);
  audioInstances.push(audio);
  return audio;
}
function disposeModel(model: T.Object3D) {
  const skeletons = new Set<T.Skeleton>(), materials = new Set<T.Material>();
  model.traverse((object: any) => {
    if (object.geometry && !object.geometry.userData.sharedCharacter) object.geometry.dispose();
    if (object.skeleton) skeletons.add(object.skeleton);
    for (const material of [].concat(object.material || [])) if (material.userData.ownedCsWeaponMaterial) materials.add(material);
  });
  for (const skeleton of skeletons) skeleton.dispose();
  for (const material of materials) material.dispose();
}

describe('v28 grenade physics', () => {
  const eye = new T.Vector3(0, 1.6, 0);
  const floor = { raycast(p: T.Vector3, d: T.Vector3, max: number) {
    if (d.y < 0 && p.y >= 0) {
      const t = -p.y / d.y;
      if (t <= max) return { point: p.clone().addScaledVector(d, t), face: { normal: new T.Vector3(0, 1, 0) } };
    }
    return null;
  } };
  it('clamps strengths, inherits movement/jump and does not mutate the launch inputs', () => {
    const still = new T.Vector3();
    const shots = [0, .5, 1].map(strength => grenadeLaunch(0, 0, strength, eye, still));
    expect(shots[0].velocity.length()).toBeLessThan(shots[1].velocity.length());
    expect(shots[1].velocity.length()).toBeLessThan(shots[2].velocity.length());
    expect(shots.every(s => s.velocity.y > 0)).toBe(true);
    expect(grenadeLaunch(0, 0, 8, eye, still)).toEqual(shots[2]);
    expect(grenadeLaunch(0, 0, -8, eye, still)).toEqual(shots[0]);
    const moving = grenadeLaunch(0, 0, 1, eye, new T.Vector3(2, 0, -3), 5);
    expect(moving.velocity.x).toBeCloseTo(2.5);
    expect(moving.velocity.y - shots[2].velocity.y).toBeCloseTo(6.25);
    expect(moving.velocity.z - shots[2].velocity.z).toBeCloseTo(-3.75);
    expect(eye.toArray()).toEqual([0, 1.6, 0]);
    expect(still.length()).toBe(0);
  });
  it('keeps trajectories, bounce counts and fuse identical across 30–144 Hz', () => {
    const run = (hz: number) => {
      const launch = grenadeLaunch(-.25, 0, 1, eye, new T.Vector3());
      const grenade = { ...launch, pos: launch.origin, mesh: new T.Group(), spin: new T.Vector3(9, 0, 4), fuse: 1.5 };
      const bounces: number[] = [];
      for (let i = 0; i < hz * 2; i++) advanceGrenade(grenade, 1 / hz, floor, (n: number) => bounces.push(n));
      return { grenade, bounces };
    };
    const reference = run(120);
    expect(reference.bounces.length).toBeGreaterThan(0);
    expect(reference.grenade.fuse).toBeLessThanOrEqual(0);
    expect(reference.grenade.pos.y).toBeGreaterThanOrEqual(GRENADE_RADIUS);
    for (const hz of [30, 60, 144]) {
      const result = run(hz);
      expect(result.grenade.pos.distanceTo(reference.grenade.pos)).toBeLessThan(1e-6);
      expect(result.bounces).toEqual(reference.bounces);
      expect(result.grenade.mesh.position).toEqual(result.grenade.pos);
    }
  });
  it('hides only the released grenade and resets cancelled pin/throw poses', () => {
    const model = makeWeapon('he', true), rig = model.userData.rig;
    expect(rig.left.skin && rig.right.skin && rig.lever).toBeTruthy();
    applyWeaponAnimation(model, { grenadeProgress: 1 });
    expect(rig.pin.visible).toBe(false);
    expect(rig.fixed.visible).toBe(true);
    applyWeaponAnimation(model, { grenadeProgress: 1, grenadeThrowProgress: .5 });
    expect(rig.fixed.visible).toBe(false);
    applyWeaponAnimation(model);
    expect(rig.pin.visible && rig.fixed.visible).toBe(true);
    disposeModel(model);
  });
});

describe('v28 knife, firearm and hand rigs', () => {
  it('selects bounded action variants only at the caller-controlled action boundary', () => {
    expect(BUTTERFLY_VARIANTS).toEqual({ draw: 2, inspect: 3 });
    for (const action of ['draw', 'inspect']) {
      expect(chooseButterflyVariant(action, () => 0)).toBe(0);
      expect(chooseButterflyVariant(action, () => 1)).toBe(BUTTERFLY_VARIANTS[action] - 1);
      expect(chooseButterflyVariant(action, () => -1)).toBe(0);
    }
    expect(() => chooseButterflyVariant('invalid')).toThrow();
    const random = vi.spyOn(Math, 'random');
    for (let variant = 0; variant < 3; variant++) {
      const state = { knifeModel: 'butterfly', inspectProgress: .5, butterflyInspectVariant: variant };
      expect(sampleWeaponMotion('knife', state)).toEqual(sampleWeaponMotion('knife', state));
    }
    expect(random).not.toHaveBeenCalled();
    expect(sampleWeaponMotion('knife', { knifeModel: 'butterfly', inspectProgress: .3, butterflyInspectVariant: 0 }))
      .not.toEqual(sampleWeaponMotion('knife', { knifeModel: 'butterfly', inspectProgress: .3, butterflyInspectVariant: 1 }));
  });
  it.each(['classic', 'karambit', 'butterfly'])('keeps %s animation finite, hinges fixed and cancellation reversible', knifeModel => {
    const model = makeWeapon('knife', true, knifeModel), rig = model.userData.rig;
    const idle = applyWeaponAnimation(model);
    const hinge = rig.butterflyHandle?.position.length();
    const states: any[] = [];
    for (let i = 0; i <= 20; i++) for (let variant = 0; variant < 3; variant++) {
      states.push({ inspectProgress: i / 20, butterflyInspectVariant: variant });
      states.push({ deployProgress: i / 20, butterflyDrawVariant: variant % 2 });
      states.push({ shotAge: i * .04, knifeHeavy: variant === 1 });
    }
    for (const state of states) {
      applyWeaponAnimation(model, state);
      model.updateMatrixWorld(true);
      model.traverse(o => expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
      expect(rig.knifeWristBend).toBeLessThanOrEqual(.480001);
      if (rig.butterflyHandle) expect(rig.butterflyHandle.position.length()).toBeCloseTo(hinge, 10);
    }
    expect(applyWeaponAnimation(model)).toEqual(idle);
    expect(inspectDuration('knife', knifeModel)).toBeGreaterThanOrEqual(2.5);
    disposeModel(model);
  });
  it('imports all 17 distinct firearm rigs and respects action locking order', () => {
    const guns = Object.entries(WEAPONS).filter(([id, def]: [string, any]) => id !== 'knife' && !def.utility);
    expect(guns).toHaveLength(17);
    for (const [id] of guns) {
      const model = makeWeapon(id), rig = model.userData.rig;
      expect(rig.imported, id).toBe(true);
      const phase = actionPhase(id);
      expect([...phase].sort((a, b) => a - b)).toEqual(phase);
      const cues = actionCues(id);
      expect(cues.every(c => c.at >= 0 && c.at <= 1), id).toBe(true);
      applyWeaponAnimation(model, { reloadProgress: .5, empty: true, rounds: 5 });
      applyWeaponAnimation(model, { deployProgress: .6 });
      applyWeaponAnimation(model);
      expect(rig.magazine.position.distanceTo(rig.magazine.userData.restPosition), id).toBeLessThan(1e-8);
      expect(rig.magazine.visible, id).toBe(true);
      const shot = sampleWeaponMotion(id, { shotAge: .024 });
      if (['m4a1', 'tmp', 'aug', 'mp5', 'p90'].includes(id)) expect(shot.boltTravel, id).toBe(0);
      if (['awp', 'scout'].includes(id)) {
        const [contact, back] = phase;
        const unlocked = sampleWeaponMotion(id, { deployProgress: contact + (back - contact) * .42 });
        expect(unlocked.boltLift, id).toBeCloseTo(1);
        expect(unlocked.boltTravel, id).toBeCloseTo(0);
        expect(sampleWeaponMotion(id, { deployProgress: back }).boltTravel).toBeCloseTo(DEPLOY[id].travel);
      }
      disposeModel(model);
    }
    expect(reloadLabel('m3', .5, true)).toBe('Loading shells');
    expect(reloadLabel('m3', .5, false)).toBe('逐发装填');
  });
  it('marks only instance-owned shell and grenade stripe materials across repeated construction', () => {
    const allocated = new Set<T.Material>();
    for (const id of ['m3', 'xm1014', 'he', 'ak47', 'knife']) {
      let previousShared = new Set<T.Material>();
      for (let construction = 0; construction < 3; construction++) {
        const model = makeWeapon(id, construction % 2 === 0), all = new Set<T.Material>();
        model.traverse((object: any) => { for (const material of [].concat(object.material || [])) all.add(material); });
        const owned = [...all].filter(material => material.userData.ownedCsWeaponMaterial);
        expect(owned, id).toHaveLength(['m3', 'xm1014', 'he'].includes(id) ? 1 : 0);
        for (const material of owned) {
          expect(allocated.has(material), `${id} ownership is per instance`).toBe(false);
          expect(previousShared.has(material), `${id} shared materials remain unmarked`).toBe(false);
          expect((material as T.MeshStandardMaterial).color.getHex()).toBe(id === 'he' ? 0xb8a54b : 0x813b27);
          allocated.add(material);
        }
        const shared = new Set([...all].filter(material => !material.userData.ownedCsWeaponMaterial));
        if (construction > 0) expect([...shared].some(material => previousShared.has(material))).toBe(true);
        previousShared = shared;
        const disposals = owned.map(material => vi.spyOn(material, 'dispose'));
        const sharedDisposals = [...shared].map(material => vi.spyOn(material, 'dispose'));
        disposeModel(model);
        expect(disposals.every(spy => spy.mock.calls.length === 1)).toBe(true);
        expect(sharedDisposals.every(spy => spy.mock.calls.length === 0)).toBe(true);
        vi.restoreAllMocks();
      }
    }
    expect(allocated.size).toBe(9);
  });
  it('poses independent anatomical hands without changing bone lengths', () => {
    const material = new T.MeshStandardMaterial();
    for (const side of ['l', 'r']) {
      const hand = createViewHand(material, side, true), other = createViewHand(material, side, true);
      const lengths = hand.skeleton.bones.map(b => b.position.length());
      const rest = other.skeleton.bones.map(b => b.quaternion.toArray());
      for (const style of ['underhand', 'pistol', 'vertical']) for (const reach of [0, .5, 1]) {
        poseFirearmHand(hand, style, reach);
        expect(hand.skeleton.bones.map(b => b.position.length())).toEqual(lengths);
        expect(hand.skeleton.bones.every(b => b.matrixWorld.elements.every(Number.isFinite))).toBe(true);
      }
      poseViewHand(hand, { open: 1, relaxed: true });
      expect(other.skeleton.bones.map(b => b.quaternion.toArray())).toEqual(rest);
      expect(other.skeleton).not.toBe(hand.skeleton);
      disposeModel(hand.group); disposeModel(other.group);
    }
    material.dispose();
  });
  it('uses a finite local HDR reflection texture only on karambit steel', () => {
    const materials = karambitMaterials(), texture = materials.face.envMap;
    expect(karambitMaterials()).toBe(materials);
    expect(texture.image.width).toBe(512);
    expect(texture.image.height).toBe(256);
    expect(texture.mapping).toBe(T.EquirectangularReflectionMapping);
    expect(materials.edge.roughness).toBeLessThan(materials.face.roughness);
    expect(materials.ring.envMap).toBe(texture);
    let peak = 0, finite = true;
    for (const value of texture.image.data) {
      const sample = T.DataUtils.fromHalfFloat(value);
      finite &&= Number.isFinite(sample);
      peak = Math.max(peak, sample);
    }
    expect(finite).toBe(true);
    expect(peak).toBeGreaterThan(1);
  });
});

describe('v28 settings and tactics', () => {
  it('normalizes expanded preferences, old records and unavailable storage safely', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ sensitivity: Infinity, scopeSensitivity: -1, knifeModel: '__proto__', startingPistol: 'awp', quality: 'bad', hitFeedback: 'bad' }))
      .toEqual({ ...DEFAULT_SETTINGS, scopeSensitivity: .1 });
    expect(normalizeKnifeModel('butterfly')).toBe('butterfly');
    const values = { sensitivity: 1.5, scopeSensitivity: .7, knifeModel: 'butterfly', startingPistol: 'deagle', quality: 'low', hitFeedback: 'visual' };
    const stored = new Map();
    vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key), setItem: (key: string, value: string) => stored.set(key, value) });
    expect(saveSettings(values)).toBe(true);
    expect(loadSettings()).toEqual(values);
    stored.set('cs.controls.v1', '{invalid');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    vi.stubGlobal('localStorage', { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } });
    expect(saveSettings(values)).toBe(false);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
  it('keeps A/B anchors with four CT bots and mobile roles for remaining defenders', () => {
    const world = { bombSites: [{ id: 'A' }, { id: 'B' }] };
    for (const count of [4, 5]) {
      const plan = createDustPlan(world, () => .45, count);
      expect(plan.roles).toHaveLength(count);
      expect(plan.roles.filter(role => role === 'anchor')).toHaveLength(2);
      expect(plan.defence.filter((_, i) => plan.roles[i] === 'anchor').sort()).toEqual(['A', 'B']);
      expect(new Set(plan.order).size).toBe(5);
    }
    const actor = { pos: new T.Vector3(), role: 'hunt', reload: 0, strafe: 1 };
    const advance = dustCombatMove(actor, new T.Vector3(40, 0, 0), WEAPONS.ak47, 3, 0, 'ak47');
    expect(advance.x).toBeGreaterThan(0);
    actor.reload = 1;
    expect(dustCombatMove(actor, new T.Vector3(3, 0, 0), WEAPONS.ak47, 3, 0, 'ak47').x).toBeLessThan(0);
  });
});

describe('v28 recorded audio', () => {
  it('ships every manifest sample unchanged with a gain and pinned source identity', () => {
    const manifest = JSON.parse(readFileSync(join(assets, 'audio/manifest.json'), 'utf8'));
    expect(manifest).toHaveLength(154);
    expect(SAMPLE_FILES).toHaveLength(154);
    expect(SHOT_FILES).toHaveLength(44);
    expect(new Set(manifest.map(entry => entry.asset))).toEqual(new Set(SAMPLE_FILES));
    expect(Object.keys(RECORDED_REPORTS)).toHaveLength(17);
    expect(RECORDED_MECHANICS.he).toBeTruthy();
    for (const entry of manifest) {
      const data = readFileSync(join(assets, 'audio', entry.asset));
      expect(data.subarray(0, 4).toString()).toBe('RIFF');
      expect(data.subarray(8, 12).toString()).toBe('WAVE');
      expect(createHash('sha256').update(data).digest('hex'), entry.asset).toBe(entry.sha256);
      expect(createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex')).toBe(entry.source_git_blob);
      expect(entry.source_commit).toBe('08f1bd6835d4f510d2ccaedeab6bb9f637b388ab');
      expect(SAMPLE_GAINS[entry.asset]).toBeGreaterThan(0);
    }
  });
  it('isolates overlapping release audio URLs and deduplicates each instance preload', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }));
    vi.stubGlobal('fetch', fetcher);
    const a = audioAt('https://example.test/releases/old'), b = audioAt('https://example.test/releases/new');
    const first = a.preload();
    expect(a.preload()).toBe(first);
    await Promise.all([first, b.preload()]);
    expect(fetcher).toHaveBeenCalledTimes(SAMPLE_FILES.length * 2);
    const urls = fetcher.mock.calls.map(call => String(call[0]));
    for (const file of SAMPLE_FILES) {
      expect(urls).toContain(`https://example.test/releases/old/assets/audio/${file}`);
      expect(urls).toContain(`https://example.test/releases/new/assets/audio/${file}`);
    }
  });
  it('deduplicates decoding, retries failed files and ignores a decode after disposal', async () => {
    const audio = audioAt('https://example.test/audio');
    let resolve!: (buffer: any) => void;
    const decoder = vi.fn(() => new Promise(done => { resolve = done; }));
    audio.ctx = { decodeAudioData: decoder, close: vi.fn(async () => {}) };
    const first = audio.decode('sample.wav', new ArrayBuffer(4));
    expect(audio.decode('sample.wav', new ArrayBuffer(4))).toBe(first);
    await Promise.resolve();
    expect(decoder).toHaveBeenCalledTimes(1);
    audio.dispose(); resolve({});
    expect(await first).toBe(false);
    expect(audio.samples.size).toBe(0);
    const retry = audioAt('https://example.test/retry');
    retry.ctx = { decodeAudioData: vi.fn().mockRejectedValueOnce(new Error('invalid')).mockResolvedValueOnce({ pcm: true }), close: vi.fn(async () => {}) };
    expect(await retry.decode('retry.wav', new ArrayBuffer(4))).toBe(false);
    expect(await retry.decode('retry.wav', new ArrayBuffer(4))).toBe(true);
    expect(retry.loadErrors.size).toBe(0);
  });
  it('cancels pending downloads without retrying or retaining late buffers', async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signals.push(signal);
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })));
    const audio = audioAt('https://example.test/disposed'), task = audio.preload();
    expect(signals).toHaveLength(8);
    audio.dispose(); await task;
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(audio.rawSamples.size).toBe(0);
    expect(audio.loadErrors.size).toBe(0);
  });
});

// A real Three scene for cache/disposal tests, without browser image decoding.
function fakeCharacterAsset() {
  const scene = new T.Group();
  const names = ['Head', 'neck_01', 'pelvis', 'spine_01', 'spine_03', ...['l', 'r'].flatMap(side => ['clavicle', 'upperarm', 'lowerarm', 'hand', 'thigh', 'calf', 'foot'].map(name => `${name}_${side}`))];
  for (const name of names) { const bone = new T.Bone(); bone.name = name; scene.add(bone); }
  const geometry = new T.BoxGeometry(), material = new T.MeshStandardMaterial({ map: new T.DataTexture(new Uint8Array(4), 1, 1) });
  scene.add(new T.Mesh(geometry, material));
  const clips = ['Death01', 'Pistol_Idle_Loop', 'Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Crouch_Fwd_Loop', 'Crouch_Idle_Loop', 'Jump_Loop'];
  return { scene, scenes: [scene], animations: clips.map(name => new T.AnimationClip(name, 1, [])), geometry, material };
}

describe('v28 instance-scoped character libraries', () => {
  it('deduplicates immutable URLs but returns separate leases and frees only the last lease', async () => {
    const parsed: any[] = [];
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementation(async () => { const asset = fakeCharacterAsset(); parsed.push(asset); return asset as any; });
    const fetcher = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }));
    vi.stubGlobal('fetch', fetcher);
    const assetUrl = (path: string) => `https://example.test/releases/shared/${path}`;
    const [a, b] = await Promise.all([preloadSoldiers(assetUrl), preloadSoldiers(assetUrl)]);
    leases.push(a, b);
    expect(a).not.toBe(b);
    expect(a.ct).toBe(b.ct);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const disposals = parsed.map(asset => vi.spyOn(asset.geometry, 'dispose'));
    a.dispose(); a.dispose();
    expect(a.disposed).toBe(true);
    expect(disposals.every(spy => spy.mock.calls.length === 0)).toBe(true);
    const c = await preloadSoldiers((path: string) => `https://example.test/releases/other/${path}`);
    leases.push(c);
    expect(c.ct).not.toBe(b.ct);
    b.dispose();
    expect(disposals.every(spy => spy.mock.calls.length === 1)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('aborts only the cancelled lease while another consumer completes the shared requests', async () => {
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementation(async () => fakeCharacterAsset() as any);
    const pending: (() => void)[] = [], signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise(resolve => {
      signals.push(signal); pending.push(() => resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }));
    })));
    const controller = new AbortController(), url = (path: string) => `https://example.test/abort-shared/${path}`;
    const a = preloadSoldiers(url, { signal: controller.signal }), b = preloadSoldiers(url);
    const rejected = expect(a).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await rejected;
    expect(signals.every(signal => !signal.aborted)).toBe(true);
    pending.forEach(resolve => resolve());
    const library = await b; leases.push(library);
    expect(library.ct).toBeTruthy();
  });
  it('disposes a late GLTF parse after its only instance was cancelled', async () => {
    const finish: (() => void)[] = [], disposals: any[] = [];
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementation(() => new Promise(resolve => {
      const asset = fakeCharacterAsset();
      disposals.push(vi.spyOn(asset.geometry, 'dispose'));
      finish.push(() => resolve(asset as any));
    }));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })));
    const controller = new AbortController();
    const task = preloadSoldiers((path: string) => `https://example.test/late-parse/${path}`, { signal: controller.signal });
    const rejected = expect(task).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(finish).toHaveLength(2));
    controller.abort(); await rejected;
    finish.forEach(resolve => resolve());
    await vi.waitFor(() => expect(disposals.every(spy => spy.mock.calls.length === 1)).toBe(true));
  });
  it('evicts failed team loads for retry without discarding the successful team', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementation(async () => fakeCharacterAsset() as any);
    let failCT = true;
    const fetcher = vi.fn(async (url: string) => ({ ok: !(url.includes('ct-sample') && failCT), arrayBuffer: async () => new ArrayBuffer(4) }));
    vi.stubGlobal('fetch', fetcher);
    const url = (path: string) => `https://example.test/retry-character/${path}`;
    const first = await preloadSoldiers(url); leases.push(first);
    expect(first.ct).toBeNull(); expect(first.t).toBeTruthy();
    failCT = false;
    const second = await preloadSoldiers(url); leases.push(second);
    expect(second.ct).toBeTruthy(); expect(second.t).toBe(first.t);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it.each(['ct', 't'])('parses shipped %s rig with independent skeletons, floor contact and retained fall', async team => {
    const bytes = readFileSync(join(assets, `characters/${team}-sample.glb`));
    const asset = await parseSoldierAsset(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), loader => loader.register(() => ({
      name: 'HeadlessCharacterTextures', loadTexture() { const texture = new T.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); texture.flipY = false; return Promise.resolve(texture); },
    })));
    const library = { [team]: asset };
    const actor = makeSoldier(team, library), other = makeSoldier(team, library), state = actor.userData.skinned;
    expect(Object.keys(state.bones)).toHaveLength(65);
    expect(state.bones.Head).not.toBe(other.userData.skinned.bones.Head);
    expect(state.meshes[0].geometry).toBe(other.userData.skinned.meshes[0].geometry);
    expect(state.meshes.every(mesh => mesh.geometry.userData.sharedCharacter)).toBe(true);
    const still = other.userData.skinned.bones.Head.getWorldPosition(new T.Vector3()).clone();
    for (let i = 0; i < 30; i++) updateSkinnedSoldier(actor, 1 / 60, { speed: 2.7, velocity: new T.Vector3(0, 0, -2.7), grounded: true });
    expect(new T.Box3().setFromObject(state.root, true).min.y).toBeGreaterThan(-.035);
    expect(other.userData.skinned.bones.Head.getWorldPosition(new T.Vector3()).distanceTo(still)).toBeLessThan(1e-8);
    poseSkinnedSoldierDeath(actor, 3);
    expect(new T.Box3().setFromObject(state.root, true).max.y).toBeLessThan(.65);
    const fallen = state.bones.Head.getWorldPosition(new T.Vector3()).clone();
    poseSkinnedSoldierDeath(actor, 16);
    expect(state.bones.Head.getWorldPosition(new T.Vector3()).distanceTo(fallen)).toBeLessThan(1e-7);
    updateSkinnedSoldier(actor, 0, { speed: 0, grounded: true });
    expect(state.dead).toBe(false);
    expect(new T.Box3().setFromObject(state.root, true).max.y).toBeGreaterThan(1.7);
    disposeModel(actor); disposeModel(other);
    const geometry = new Set<any>(), material = new Set<any>();
    asset.scene.traverse((o: any) => { if (o.geometry) geometry.add(o.geometry); if (o.material) material.add(o.material); o.skeleton?.dispose(); });
    for (const g of geometry) g.dispose();
    for (const m of material) { m.map?.dispose(); m.dispose(); }
  });
});
