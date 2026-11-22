import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { VillaScene, VILLA_SECURITY_FEED_SIZE, villaFlipSecurityPixels, villaSceneInputKey, type VillaSceneState } from '../src/villaScene.js';
import { createVillaHome, VILLA_SECURITY_CAMERAS } from '../src/villaHome.js';
import { VILLA_ENTRANCE } from '../src/villaWorld.js';
import { createVillaHomeModel } from '../src/villaHomeModel.js';
import { createVillaOutdoor } from '../src/villaOutdoor.js';
import { createVillaOutdoorModel } from '../src/villaOutdoorModel.js';

const instances: VillaScene[] = [];
afterEach(() => { instances.forEach(s => s.dispose()); instances.length = 0; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function canvas() {
  const context = {
    drawImage: vi.fn(), putImageData: vi.fn(),
    createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
  };
  return { width: 0, height: 0, getContext: () => context, addEventListener: vi.fn(), removeEventListener: vi.fn(), context };
}
function snapshot(): VillaSceneState {
  return {
    evening: true, gaming: false, fireplace: true, fedUntil: 0, carDoorOpen: false, pickupDoorOpen: false,
    seated: null, screenSource: 'pc', displayLights: true, home: createVillaHome(), outdoor: createVillaOutdoor(),
    tea: { phase: 'idle' }, wardrobes: { wardrobes: { master: { open: false, progress: 0 } } },
    driving: { x: 16.2, z: -2.6 }, scooter: { x: 38, z: 7 }, pickup: { x: 21.5, z: -2.6 },
    elevator: { phase: 'idle', target: 0 }, snooker: { aimAssist: true }, snookerActive: false, pets: { feedSequence: 0 },
  } as unknown as VillaSceneState;
}
/** No WebGL/browser in this unit. Exercise the real Scene methods and Home /
 * Outdoor models around a strict renderer/readback double. Browser acceptance
 * still verifies pixels from the actual GPU implementation. */
function fixture() {
  vi.stubGlobal('document', { createElement: () => canvas() });
  const state = snapshot(), h = Object.create(VillaScene.prototype) as any, api = h as VillaScene;
  const oldTarget = new THREE.WebGLRenderTarget(32, 24);
  let target: THREE.WebGLRenderTarget | null = oldTarget, face = 3, mip = 2, ratio = 1;
  const size = new THREE.Vector2(800, 500), viewport = new THREE.Vector4(3, 4, 792, 490), scissor = new THREE.Vector4(5, 6, 780, 470);
  let scissorTest = true;
  const dom = canvas(); dom.width = 800; dom.height = 500;
  const renderer = {
    domElement: dom, shadowMap: { needsUpdate: false }, toneMappingExposure: 1.1,
    toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace, extensions: { has: () => true },
    getContext: () => ({ isContextLost: () => h.contextLost }),
    getRenderTarget: () => target, getActiveCubeFace: () => face, getActiveMipmapLevel: () => mip,
    setRenderTarget: vi.fn((next: THREE.WebGLRenderTarget | null, f = 0, m = 0) => { target = next; face = f; mip = m; }),
    getSize: (out: THREE.Vector2) => out.copy(size), getPixelRatio: () => ratio,
    setPixelRatio: vi.fn((r: number) => { ratio = r; }), setSize: vi.fn((w: number, ht: number) => { size.set(w, ht); dom.width = w; dom.height = ht; viewport.set(0, 0, w, ht); }),
    getViewport: (out: THREE.Vector4) => out.copy(viewport), setViewport: vi.fn((v: THREE.Vector4) => viewport.copy(v)),
    getScissor: (out: THREE.Vector4) => out.copy(scissor), setScissor: vi.fn((v: THREE.Vector4) => scissor.copy(v)),
    getScissorTest: () => scissorTest, setScissorTest: vi.fn((value: boolean) => { scissorTest = value; }),
    clear: vi.fn(), render: vi.fn(),
    readRenderTargetPixels: vi.fn((_t: unknown, _x: number, _y: number, width: number, height: number, bytes: Uint8Array) => {
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const i = (y * width + x) * 4; bytes[i] = y; bytes[i + 1] = x % 256; bytes[i + 2] = 77; bytes[i + 3] = 255; }
    }),
    dispose: vi.fn(() => oldTarget.dispose()), forceContextLoss: vi.fn(),
  };
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog('#aaaaaa', 40, 230);
  const homeModel = createVillaHomeModel(scene), outdoorModel = createVillaOutdoorModel(scene);
  const primaryView = { x: -7, y: 0, z: 4, yaw: .25, pitch: -.1, roll: .07, eyeHeight: 1.65 };
  const camera = new THREE.PerspectiveCamera(64, 1.6, .065, 650); camera.position.set(-7, 1.65, 4); camera.rotation.set(-.1, .25, .07, 'YXZ'); camera.updateMatrixWorld();
  const waterMap = new THREE.Texture(), water = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshPhongMaterial({ bumpMap: waterMap })); scene.add(water);
  const sky = new THREE.ShaderMaterial({ uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunColor: { value: new THREE.Color() } } }); scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 4, 3), sky));
  Object.assign(h, {
    renderer, scene, camera, primaryView, homeModel, outdoorModel, fallbackHome: createVillaHome(), fallbackOutdoor: createVillaOutdoor(),
    sky, water, waterMap, sun: new THREE.DirectionalLight(), hemi: new THREE.HemisphereLight(), ambient: new THREE.AmbientLight(), atmosphereColor: new THREE.Color(),
    securityCamera: new THREE.PerspectiveCamera(66, 16 / 9, .065, 650), securityTarget: null, securityCanvas: null, securityContext: null, securityPixels: null, securityImage: null,
    securityKey: '', securityLastAt: -Infinity, securityLastTime: -Infinity,
    disposed: false, contextLost: false, environment: new THREE.CubeTexture(), lowSpec: true,
    cachedFrame: canvas(), lastStateKey: '', lastDrawAt: -Infinity, cachedTime: -1, softwareInputFrames: 0,
    vehicle: { update: vi.fn(() => false) }, pickup: { update: vi.fn(() => false) }, suv: { update: vi.fn(() => false) }, scooter: { update: vi.fn(() => false) },
    elevator: { update: vi.fn(() => false) }, elevatorCollisions: { update: vi.fn() }, snooker: { update: vi.fn(() => false) },
    course: { update: vi.fn() }, stream: { update: vi.fn() }, pets: { update: vi.fn() }, furnishings: { update: vi.fn(() => false) }, gaming: { update: vi.fn() },
  });
  homeModel.update(0, state.home!, { x: -7, y: 1.65, z: 4 });
  instances.push(api);
  return { api, h, state, renderer, scene, camera, oldTarget, viewport, scissor, primaryView };
}

describe('Villa scene logical cache and live Home/Outdoor integration', () => {
  it('keys logical actions, not animated blends, wardrobe progress, swing or carried-chair motion', () => {
    const state = snapshot(), first = villaSceneInputKey(state);
    state.home!.darkness = .83; state.home!.rain = .6; state.home!.lightLevels.living = .4;
    state.wardrobes!.wardrobes.master.progress = .5; state.outdoor!.swingAngle = .2; state.driving.x += 1;
    expect(villaSceneInputKey(state)).toBe(first);
    for (const change of [() => state.home!.revision++, () => { state.wardrobes!.wardrobes.master.open = true; }, () => { state.snooker.aimAssist = false; }, () => { state.aquariumOn = false; }, () => { state.outdoor!.camping.carried = true; }]) {
      const old = villaSceneInputKey(state); change(); expect(villaSceneInputKey(state)).not.toBe(old);
    }
    const carried = villaSceneInputKey(state); state.outdoor!.camping.x += 4; state.outdoor!.camping.yaw += .5; expect(villaSceneInputKey(state)).toBe(carried);
    state.outdoor!.camping.carried = false; const placed = villaSceneInputKey(state); state.outdoor!.camping.x += .1; expect(villaSceneInputKey(state)).not.toBe(placed);
  });
  it('preserves all six input-only frames while updating primary view/roll and smoothly blended atmosphere', () => {
    const { api, h, renderer, state, primaryView } = fixture(), ctx = canvas().context as unknown as CanvasRenderingContext2D;
    let now = 0; vi.spyOn(performance, 'now').mockImplementation(() => now);
    api.render(ctx, 800, 500, 1, primaryView, 0, state); expect(renderer.render).toHaveBeenCalledTimes(1);
    const beforeExposure = renderer.toneMappingExposure;
    h.furnishings.update.mockReturnValue(true); // a moving wardrobe collider
    for (let i = 1; i <= 6; i++) {
      now += 20; state.home!.darkness += .03; state.outdoor!.swingAngle = i * .02; state.wardrobes!.wardrobes.master.progress = i / 10;
      renderer.shadowMap.needsUpdate = false;
      api.render(ctx, 800, 500, 1, { ...primaryView, roll: .07 + i * .01, x: -7 + i * .1 }, i / 60, state);
      expect(renderer.render).toHaveBeenCalledTimes(1);
      expect(h.furnishings.update).toHaveBeenCalledTimes(i + 1); expect(renderer.shadowMap.needsUpdate).toBe(true);
      expect(h.furnishings.update.mock.lastCall[1].wardrobes.wardrobes.master.progress).toBe(i / 10);
    }
    now += 20; api.render(ctx, 800, 500, 1, { ...primaryView, roll: .15 }, 7 / 60, state);
    expect(renderer.render).toHaveBeenCalledTimes(2); expect(h.camera.rotation.z).toBe(.15); expect(renderer.toneMappingExposure).toBeGreaterThan(beforeExposure);
    expect(h.furnishings.update.mock.lastCall[1]).toMatchObject({ roomLights: state.home!.roomLights, nightFactor: state.home!.darkness });
    state.home!.revision++; now += 20; api.render(ctx, 800, 500, 1, primaryView, 8 / 60, state); expect(renderer.render).toHaveBeenCalledTimes(3);
  });
  it('keeps input and collision updates live with a GPU ticket outstanding, showing only a completed camera and discarding stale action frames',()=>{
    const {api,h,renderer,state,primaryView}=fixture(),ctx=canvas().context as unknown as CanvasRenderingContext2D;
    let now=1000;vi.spyOn(performance,'now').mockImplementation(()=>now);
    const readback={pending:false,submit:vi.fn(function(this:any){this.pending=true;return true;}),poll:vi.fn(),cancel:vi.fn(function(this:any){this.pending=false;}),dispose:vi.fn()};
    h.readback=readback;h.queuedCamera=new THREE.PerspectiveCamera();h.lastInputTime=-1;
    api.render(ctx,800,500,1,primaryView,0,state);expect(readback.submit).not.toHaveBeenCalled();
    const displayed=h.camera.position.clone();h.softwareInputFrames=0;now+=100;
    api.render(ctx,800,500,1,{...primaryView,x:11},.05,state);expect(readback.pending).toBe(true);
    expect(h.camera.position).toEqual(displayed);expect(h.queuedCamera.position.x).toBe(11);
    readback.poll.mockReturnValue('waiting');now+=100;api.render(ctx,800,500,1,{...primaryView,x:12},.1,state);
    expect(readback.submit).toHaveBeenCalledTimes(1);expect(renderer.render).toHaveBeenCalledTimes(2);expect(h.camera.position).toEqual(displayed);
    const image={data:[127]};readback.poll.mockImplementation(()=>{readback.pending=false;return image;});now+=100;
    api.render(ctx,800,500,1,{...primaryView,x:13},.15,state);expect(h.cachedFrame.context.putImageData).toHaveBeenCalledWith(image,0,0);expect(h.camera.position.x).toBe(11);
    h.softwareInputFrames=0;now+=100;api.render(ctx,800,500,1,{...primaryView,x:14},.2,state);expect(readback.pending).toBe(true);
    state.home!.revision++;now+=100;api.render(ctx,800,500,1,{...primaryView,x:15},.25,state);expect(readback.cancel).toHaveBeenCalledTimes(1);expect(h.camera.position.x).toBe(15);
    expect(h.furnishings.update).toHaveBeenCalledTimes(6);
  });
  it('reserves a bounded lead for native movement after a cached draw, then shows the actual new eye even if input repeats', () => {
    const { api,h,renderer,state,primaryView }=fixture(), ctx=canvas().context as unknown as CanvasRenderingContext2D;
    let now=0;vi.spyOn(performance,'now').mockImplementation(()=>now);
    api.render(ctx,800,500,1,primaryView,0,state);
    // Stand at the cadence boundary, when a key down must not immediately block on a cold draw.
    h.softwareInputFrames=0;api.beginMovementInput();
    for(let i=1;i<=3;i++){now+=60;api.beginMovementInput();api.render(ctx,800,500,1,{...primaryView,z:4-i*.07},i*.03,state);}
    expect(renderer.render).toHaveBeenCalledTimes(1);now+=60;
    api.beginMovementInput();api.render(ctx,800,500,1,{...primaryView,z:3.72},.12,state);
    expect(renderer.render).toHaveBeenCalledTimes(2);expect(h.camera.position.z).toBeCloseTo(3.72,6);
    // Lighting/door changes are semantic input, not the six-frame movement-only cache.
    api.beginMovementInput();state.home!.revision++;api.render(ctx,800,500,1,primaryView,.13,state);expect(renderer.render).toHaveBeenCalledTimes(3);
  });
  it('reframes the old bitmap at its original projection during resize, presents the new raster, and cannot accept a superseded size',()=>{
    const {api,h,renderer,state,primaryView}=fixture(),dest=canvas().context,ctx=dest as unknown as CanvasRenderingContext2D;
    let now=100;vi.spyOn(performance,'now').mockImplementation(()=>now);
    const ticket={pending:false,submit:vi.fn(function(this:any){this.pending=true;return true;}),poll:vi.fn(),cancel:vi.fn(function(this:any){this.pending=false;}),dispose:vi.fn()};h.readback=ticket;h.queuedCamera=new THREE.PerspectiveCamera();
    api.render(ctx,800,500,1,primaryView,0,state);const original=h.cachedFrame;
    api.setPrimaryAspect(1100,500);now+=100;api.render(ctx,1100,500,1,primaryView,.01,state);
    expect(api.cameraAspect).toBe(2.2);expect(dest.drawImage.mock.lastCall).toEqual([original,150,0,800,500]);expect(renderer.render).toHaveBeenCalledTimes(1);
    now+=100;api.render(ctx,1100,500,1,primaryView,.02,state);expect(ticket.pending).toBe(true);
    api.setPrimaryAspect(360,780);expect(ticket.cancel).toHaveBeenCalledTimes(1);now+=100;api.render(ctx,360,780,1,primaryView,.03,state);
    expect(api.cameraAspect).toBeCloseTo(360/780,8);expect(h.cachedAspect).toBe(1.6);expect(dest.drawImage.mock.lastCall?.[3]).toBeCloseTo(780*1.6,5);
    now+=100;api.render(ctx,360,780,1,primaryView,.04,state);expect(ticket.pending).toBe(true);ticket.poll.mockImplementation(()=>{ticket.pending=false;return {data:[0]};});
    now+=100;api.render(ctx,360,780,1,primaryView,.05,state);expect(h.cachedAspect).toBeCloseTo(360/780,7);expect(h.cachedFrame.width).toBe(198);expect(h.cachedFrame.height).toBe(429);expect(h.resizing).toBe(false);
  });
  it('applies the real projection before a terminal or cached world can draw, including near-identical aspect changes at the software ceiling', () => {
    const { api, h, renderer, state, primaryView } = fixture();
    const ctx = canvas().context as unknown as CanvasRenderingContext2D;
    api.render(ctx,1920,1080,1,primaryView,0,state);
    const frame = renderer.render.mock.calls.length;
    // The target may round to the same raster dimensions. It is never proof of the same FOV.
    api.setPrimaryAspect(1919,1080);
    expect(api.cameraAspect).toBe(1919/1080);expect(h.camera.projectionMatrix.elements[0]).toBeCloseTo(h.camera.projectionMatrix.elements[5]/api.cameraAspect,7);
    expect(renderer.render.mock.calls.length).toBe(frame);
    api.render(ctx,1919,1080,1,primaryView,.015,state);expect(renderer.render).toHaveBeenCalledTimes(frame+1);
    api.setPrimaryAspect(NaN,1080);api.setPrimaryAspect(0,1080);expect(api.cameraAspect).toBe(1919/1080);
  });
  it('updates carried-chair colliders using latest visitor feet, while passive swing creates no shadow invalidation', () => {
    const { api, h, state, renderer } = fixture();
    api.updateActivities(0, state); renderer.shadowMap.needsUpdate = false;
    state.outdoor!.swingAngle = .2; api.updateActivities(.1, state); expect(renderer.shadowMap.needsUpdate).toBe(false);
    state.outdoor!.camping.carried = true; api.updateActivities(.2, state, { x: 12, y: 3.6, z: 20 }, .5);
    expect(renderer.shadowMap.needsUpdate).toBe(true);
    const chair = h.scene.getObjectByName('villa-portable-camping-chair'); expect(chair.position.x).toBeCloseTo(12 - Math.sin(.5) * .8); expect(chair.position.y).toBeCloseTo(4.2);
    expect(h.outdoorModel.colliders.at(-1).minY).toBe(1e6);
  });
});

describe('Villa Home destination-only software camera cut', () => {
  function setup() {
    const { api, h, state, renderer, primaryView } = fixture(), dst = canvas().context;
    const home = { ...primaryView, ...VILLA_ENTRANCE, yaw: 0, pitch: .04, roll: 0 };
    const ticket = {
      pending: false,
      submit: vi.fn(function (this: {pending: boolean}) { expect(this.pending).toBe(false); return this.pending = true; }),
      poll: vi.fn((): ImageData | 'waiting' | null => 'waiting'),
      cancel: vi.fn(function (this: {pending: boolean}) { this.pending = false; }),
      dispose: vi.fn(function (this: {pending: boolean}) { this.pending = false; }),
    };
    h.queuedCamera = new THREE.PerspectiveCamera(); h.lastInputTime = -1; h.colliders = []; h.readback = ticket;
    const render = (t: number, view = home, w = 800, ht = 500) => api.render(dst as unknown as CanvasRenderingContext2D, w, ht, 1, view, t, state);
    const seed = () => { render(0, primaryView); dst.drawImage.mockClear(); h.cachedFrame.context.drawImage.mockClear(); };
    return { api, h, state, renderer, primaryView, dst, home, ticket, render, seed };
  }

  it('keeps input/collision updates live over a neutral base, then presents only matching destination pixels, eye and clock', () => {
    const { api, h, state, renderer, dst, home, ticket, render, seed } = setup(); seed();
    const previous = h.camera.position.clone(), walked = { ...home, x: .3 }, anchor = { x: 0, y: home.eyeHeight, z: 7 };
    api.beginHomeCameraCut(state); expect(render(.01)).toBe(true); expect(render(.03, walked)).toBe(true);
    expect(ticket.submit).toHaveBeenCalledTimes(1); expect(ticket.poll).toHaveBeenCalledTimes(1); expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(h.primaryView.x).toBe(walked.x); expect(h.furnishings.update).toHaveBeenCalledTimes(3);
    expect(h.camera.position).toEqual(previous); expect(api.projectInteraction(anchor, 800, 500)).toBeNull();
    expect(dst.drawImage).not.toHaveBeenCalled(); expect(h.cachedFrame.context.drawImage).not.toHaveBeenCalled();
    const image = { data: Uint8ClampedArray.of(17, 63, 51, 255) } as ImageData;
    ticket.poll.mockImplementationOnce(() => { ticket.pending = false; return image; });
    render(.05, walked); expect(h.cachedFrame.context.putImageData).toHaveBeenCalledWith(image, 0, 0);
    expect(dst.drawImage.mock.calls).toEqual([[h.cachedFrame, 0, 0, 800, 500]]); expect(h.cachedFrame.context.drawImage).not.toHaveBeenCalled();
    expect(h.camera.position.toArray()).toEqual([home.x, home.eyeHeight, home.z]); expect(h.cachedTime).toBe(.01);
    h.camera.updateMatrixWorld(); expect(api.projectInteraction(anchor, 800, 500)).not.toBeNull();
    render(.07, walked); expect(renderer.render).toHaveBeenCalledTimes(2); // normal completed-frame cache resumes
    h.softwareInputFrames = 0; h.lastDrawAt = performance.now() - 100; render(.09, walked);
    expect(ticket.pending).toBe(true); expect(dst.drawImage).toHaveBeenCalledTimes(3); // ordinary refresh can show the *destination*
  });

  it('retires an ordinary ticket and a repeated same-key Home without polling or presenting either superseded frame', () => {
    const { api, h, state, dst, home, ticket, render, seed } = setup(); seed();
    h.softwareInputFrames = 0; h.lastDrawAt = performance.now() - 100; render(.02, { ...home, x: -12 });
    expect(ticket.pending).toBe(true); dst.drawImage.mockClear();
    api.beginHomeCameraCut(state); render(.04); api.beginHomeCameraCut(state); render(.06);
    expect(ticket.cancel).toHaveBeenCalledTimes(2); expect(ticket.submit).toHaveBeenCalledTimes(3); expect(ticket.pending).toBe(true);
    expect(ticket.poll).not.toHaveBeenCalled(); expect(dst.drawImage).not.toHaveBeenCalled();
    api.dispose(); expect(ticket.pending).toBe(false); expect(ticket.dispose).toHaveBeenCalledTimes(1); expect(render(.08)).toBe(false);
  });

  it.each(['semantic action', 'forced snapshot', 'clock jump', 'viewport resize', 'same-raster aspect', 'restart/material invalidation'])('discards a pending destination on %s and draws the current world synchronously', mode => {
    const { api, h, state, renderer, dst, home, ticket, render, seed } = setup(); seed(); api.beginHomeCameraCut(state); render(.02);
    let t = .04, w = 800;
    if (mode === 'semantic action') state.fireplace = !state.fireplace;
    if (mode === 'forced snapshot') h.lastDrawAt = -Infinity;
    if (mode === 'clock jump') t = 2;
    if (mode === 'viewport resize') { w = 470; api.setPrimaryAspect(w, 500); }
    if (mode === 'same-raster aspect') w += .1; // caller draws directly; rounded target is still 440×275
    if (mode === 'restart/material invalidation') api.invalidateCameraFrame();
    render(t, { ...home, x: 3 }, w);
    expect(ticket.cancel).toHaveBeenCalledTimes(1); expect(ticket.poll).not.toHaveBeenCalled(); expect(ticket.pending).toBe(false);
    expect(h.cachedFrame.context.putImageData).not.toHaveBeenCalled(); expect(h.cachedFrame.context.drawImage).toHaveBeenCalledWith(renderer.domElement, 0, 0);
    expect(dst.drawImage).toHaveBeenCalledTimes(1); expect(h.camera.position.x).toBe(3); expect(h.camera.aspect).toBe(w / 500); expect(h.cachedTime).toBe(t);
  });

  it.each(['cold', 'hardware', 'no readback', 'forced before submit', 'submit rejected', 'poll failed'])('preserves a correct synchronous Home on %s', mode => {
    const { api, h, state, renderer, dst, home, ticket, render, seed } = setup();
    if (mode !== 'cold') seed();
    if (mode === 'hardware') h.lowSpec = false;
    if (mode === 'no readback') h.readback = null;
    api.beginHomeCameraCut(state);
    if (mode === 'forced before submit') h.lastDrawAt = -Infinity;
    if (mode === 'submit rejected') ticket.submit.mockReturnValueOnce(false);
    render(.02);
    if (mode === 'poll failed') { expect(dst.drawImage).not.toHaveBeenCalled(); ticket.poll.mockReturnValueOnce(null); render(.04); }
    if (mode === 'submit rejected' || mode === 'poll failed') expect(ticket.dispose).toHaveBeenCalledTimes(1);
    else expect(ticket.submit).not.toHaveBeenCalled();
    expect(h.camera.position.toArray()).toEqual([home.x, home.eyeHeight, home.z]); expect(ticket.pending).toBe(false);
    if (mode === 'hardware') expect(dst.drawImage).toHaveBeenCalledWith(renderer.domElement, 0, 0, 800, 500);
    else { expect(h.cachedFrame.context.drawImage).toHaveBeenCalledWith(renderer.domElement, 0, 0); expect(dst.drawImage.mock.calls).toEqual([[h.cachedFrame, 0, 0, 800, 500]]); }
  });
});

describe('Villa real security-camera render/readback contract', () => {
  it('flips RGBA scanlines into a reusable top-down image', () => {
    const pixels = new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]), image = new Uint8ClampedArray(8);
    villaFlipSecurityPixels(pixels, image, 1, 2); expect([...image]).toEqual([4, 5, 6, 255, 1, 2, 3, 255]);
  });
  it('renders selected actual camera and moving models, reuses resources, limits polling to2Hz and immediately changes camera/home revision', () => {
    const { api, h, renderer, state, scene } = fixture(); let now = 1000; vi.spyOn(performance, 'now').mockImplementation(() => now);
    const output = api.renderSecurityFeed('garage', 1, state)!; expect(output.width).toBe(384); expect(output.height).toBe(216);
    const sceneCalls = () => renderer.render.mock.calls.filter(call => call[0] === scene);
    const selected = VILLA_SECURITY_CAMERAS.find(c => c.id === 'garage')!, renderedCamera = sceneCalls()[0]![1] as THREE.PerspectiveCamera;
    expect(sceneCalls()[0]![0]).toBe(scene); expect(renderedCamera.position.toArray()).toEqual([selected.position.x, selected.position.y, selected.position.z]); expect(renderedCamera.aspect).toBe(16 / 9);
    const read = renderer.readRenderTargetPixels.mock.lastCall!; expect(read.slice(1, 5)).toEqual([0, 0, 384, 216]);
    expect(h.securityImage.data[0]).toBe(215); expect(h.securityImage.data[(216 - 1) * 384 * 4]).toBe(0); expect(h.securityImage.data[3]).toBe(255);
    expect(h.vehicle.update).toHaveBeenCalled(); expect(h.pickup.update).toHaveBeenCalled(); expect(h.pets.update).toHaveBeenCalled(); expect(h.furnishings.update).toHaveBeenCalled(); expect(h.gaming.update).toHaveBeenCalled();
    const target = h.securityTarget, linearTarget = h.securitySceneTarget, pixels = h.securityPixels, image = h.securityImage;
    expect(linearTarget.texture.type).toBe(THREE.HalfFloatType); expect(h.securityOutput.material.defines).toHaveProperty('ACES_FILMIC_TONE_MAPPING'); expect(h.securityOutput.material.defines).toHaveProperty('SRGB_TRANSFER');
    now += 499; expect(api.renderSecurityFeed('garage', 2, state)).toBe(output); expect(sceneCalls()).toHaveLength(1);
    now++; expect(api.renderSecurityFeed('garage', 2, state)).toBe(output); expect(sceneCalls()).toHaveLength(2);
    expect(h.securityTarget).toBe(target); expect(h.securitySceneTarget).toBe(linearTarget); expect(h.securityPixels).toBe(pixels); expect(h.securityImage).toBe(image);
    api.renderSecurityFeed('pool', 2, state); expect(sceneCalls()).toHaveLength(3);
    state.home!.revision++; api.renderSecurityFeed('pool', 2, state); expect(sceneCalls()).toHaveLength(4);
    expect(VILLA_SECURITY_FEED_SIZE.intervalMs).toBe(500);
  });
  it('restores primary camera/view, six light slots, rain window, render target, size, viewport and scissor in finally', () => {
    const { api, h, renderer, state, camera, oldTarget, primaryView } = fixture(); state.home!.rain = 1;
    const eye = { x: primaryView.x, y: 1.65, z: primaryView.z }; h.homeModel.update(3, state.home, eye);
    const primaryMatrix = camera.matrixWorld.clone(), view = { ...h.primaryView }, viewport = renderer.getViewport(new THREE.Vector4()), scissor = renderer.getScissor(new THREE.Vector4());
    const lights = () => Array.from({ length: 6 }, (_, i) => { const light = h.scene.getObjectByName(`villa-home-light-slot-${i}`); return [light.position.toArray(), light.intensity, light.distance]; });
    const lightState = lights(), rain = h.scene.getObjectByName('villa-rain-streaks').geometry.getAttribute('position'), rainState = [...rain.array];
    api.renderSecurityFeed('drive', 3, state);
    expect(camera.matrixWorld.equals(primaryMatrix)).toBe(true); expect(h.primaryView).toEqual(view); expect(lights()).toEqual(lightState); expect([...rain.array]).toEqual(rainState);
    expect(renderer.getRenderTarget()).toBe(oldTarget); expect(renderer.getActiveCubeFace()).toBe(3); expect(renderer.getActiveMipmapLevel()).toBe(2);
    expect(renderer.getSize(new THREE.Vector2()).toArray()).toEqual([800, 500]); expect(renderer.setSize).not.toHaveBeenCalled(); expect(renderer.setPixelRatio).not.toHaveBeenCalled();
    expect(renderer.getViewport(new THREE.Vector4())).toEqual(viewport); expect(renderer.getScissor(new THREE.Vector4())).toEqual(scissor); expect(renderer.getScissorTest()).toBe(true);
  });
  it('returns unavailable on invalid/lost/readback failure, restores state on failure and disposes readback resources once', () => {
    const { api, h, renderer, state, oldTarget } = fixture();
    expect(api.renderSecurityFeed('unknown', 0, state)).toBeNull(); h.contextLost = true; expect(api.renderSecurityFeed('garage', 0, state)).toBeNull(); h.contextLost = false;
    renderer.readRenderTargetPixels.mockImplementationOnce(() => { throw new Error('lost readback'); });
    expect(api.renderSecurityFeed('garage', 0, state)).toBeNull(); expect(renderer.getRenderTarget()).toBe(oldTarget); expect(renderer.getScissorTest()).toBe(true);
    expect(api.renderSecurityFeed('garage', 1, state)).not.toBeNull(); const target = h.securityTarget, dispose = vi.spyOn(target, 'dispose'), linearDispose = vi.spyOn(h.securitySceneTarget, 'dispose'), passDispose = vi.spyOn(h.securityOutput, 'dispose'), output = h.securityCanvas;
    api.dispose(); expect(dispose).toHaveBeenCalledTimes(1); expect(linearDispose).toHaveBeenCalledTimes(1); expect(passDispose).toHaveBeenCalledTimes(1); expect(output.width).toBe(0); expect(h.securityTarget).toBeNull(); expect(h.securitySceneTarget).toBeNull(); expect(h.securityPixels).toBeNull(); expect(h.securityImage).toBeNull();
    api.dispose(); expect(dispose).toHaveBeenCalledTimes(1); expect(api.renderSecurityFeed('garage', 2, state)).toBeNull();
  });
});
