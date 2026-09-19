import { BaseGame, createDefaultGameHost, type GameHost, type GameViewport } from '@carrick/game-sdk/game';
import { VillaScene, type VillaSceneState, type VillaView } from './villaScene.js';
import { createVillaActivities, CAR_DOOR_SECONDS, VILLA_CAR, VILLA_RACING, VILLA_SNOOKER, VILLA_RUN_SPEED, VILLA_WALK_SPEED, nextVillaScreen } from './villaActivities.js';
import {
  advanceVillaElevator, createVillaElevator, idleVillaElevator, requestVillaElevator, requestVillaElevatorDoor, VILLA_ELEVATOR,
  villaElevatorCabinContains, villaElevatorDoorwayObstructed, villaElevatorPanelButtons, villaElevatorShaftContains, villaElevatorSupportAt,
  type VillaElevatorPanelButton,
} from './villaElevator.js';
import {
  moveVillaPlayer, nearestVillaHotspot, villaFloor, villaRoomAt, villaSupportAt, villaCollides,
  VILLA_BLOCKS, VILLA_ENTRANCE, VILLA_ROOMS, VILLA_SPAWN, POOL, STAIR_HOLE,
  EYE_HEIGHT, type VillaPosition, type VillaHotspot,
} from './villaWorld.js';
import { advanceVillaMotion, createVillaMotion, jumpVillaMotion, toggleVillaCrouch, villaBodyHeight, villaEyeHeight } from './villaMotion.js';
import { advanceVillaDriving, createVillaDriving, villaCarAnchors, villaCarDriverSide, villaCarExitClear, villaDrivingPoseBlocked, VILLA_CAR_LIMITS, VILLA_SCENIC_ROAD } from './villaDriving.js';
import { advanceVillaScooter, createVillaScooter, villaScooterAnchors, villaScooterSafeExit, villaScooterExitClear, villaScooterPoseBlocked, VILLA_SCOOTER } from './villaScooter.js';
import { VILLA_AQUARIUM, villaRelaxSeat, resolveVillaSeatPosition, villaSeatExitCandidates, villaSeatColliderId, type VillaRelaxSeat } from './villaSeating.js';
import { advanceVillaRace, createVillaRace } from './villaRacing.js';
import { advanceVillaSnooker, createVillaSnooker, shootVillaSnooker } from './villaSnooker.js';
import { advanceVillaPets, createVillaPets, feedVillaPet, nearestVillaPet, villaPetLabel } from './villaPets.js';
import { VILLA_FAUCET } from './villaFaucet.js';
import { VILLA_TEA_BAR } from './villaTeaBar.js';
import { VILLA_VEGETABLE_BEDS } from './villaGarden.js';
import { createVillaUseButton } from './villaUseButton.js';
import { villaUseCircle, wrapVillaTouchHint } from './villaTouchUi.js';
import { SHELL_BUTTON_MARGIN, SHELL_CLUSTER_WIDTH } from '@carrick/game-sdk/layout';
import { createVillaHome, advanceVillaHome, cycleVillaTimeOfDay, setVillaTimeOfDay, setVillaWeather, setVillaRoomLight, setVillaAllLights, setVillaLookSensitivity, type VillaHomeState } from './villaHome.js';
import { createVillaTerminal, type VillaTerminal, type VillaTerminalSnapshot } from './villaTerminal.js';
import { createVillaTea, advanceVillaTea, interactVillaTea, type VillaTeaState } from './villaTea.js';
import { createVillaWardrobes, advanceVillaWardrobes, toggleVillaWardrobe, villaOpenableLabel, VILLA_WARDROBES, VILLA_FRIDGE_FREEZER, type VillaWardrobeState } from './villaWardrobe.js';
import { createVillaOutdoor, advanceVillaOutdoor, villaOutdoorSeat, villaSwingSeat, villaCampingSeat, pickUpVillaCampingChair, placeVillaCampingChair, type VillaOutdoorState } from './villaOutdoor.js';
import { createVillaPickup, advanceVillaPickup, villaPickupAnchors, villaPickupDriverSide, villaPickupSafeExit, villaPickupExitClear, villaPickupPoseBlocked, VILLA_PICKUP, VILLA_PICKUP_LIMITS, type VillaPickupState } from './villaPickup.js';
import { createVillaSuv, advanceVillaSuv, villaSuvAnchors, villaSuvDriverSide, villaSuvSafeExit, villaSuvExitClear, villaSuvPoseBlocked, VILLA_SUV, VILLA_SUV_LIMITS, type VillaSuvState } from './villaSuv.js';
import { villaCarSafeExit } from './villaDriving.js';
import { VILLA_EAST_WALL as EAST, VILLA_NORTH_WALL as NORTH, VILLA_SOUTH_WALL as SOUTH, VILLA_WEST_WALL as WEST, VILLA_ESTATE_BOUNDS, VILLA_GARAGE_EXTENT, VILLA_POND_BOUNDS, VILLA_ESTATE_FIELDS, villaTerrainOrientation } from './villaEstateLayout.js';
import { VILLA_ESTATE_ROAD_PATHS, VILLA_GARAGE_DRIVE } from './villaDrivingCourse.js';
import { VillaAudio, type VillaAudioEngine } from './villaAudio.js';
import { advanceVillaBathDoors, createVillaBathDoors, toggleVillaBathDoor, type VillaBathDoorState } from './villaBathDoors.js';
import { advanceVillaPark, createVillaParkRun, villaParkAvailable, villaParkRouteClear, villaVehicleParked, villaParkRoute, type VillaParkRun } from './villaAutopilot.js';
import { VILLA_VERSION } from './villaVersion.js';

interface Point { x: number; y: number }
interface Button { id: string; x: number; y: number; w: number; h: number; label: string }
const UI_FONT = 'system-ui, -apple-system, sans-serif';
type VillaRoadVehicle = 'car' | 'pickup' | 'suv';
type VillaGameState = VillaSceneState & { home: VillaHomeState; outdoor: VillaOutdoorState; tea: VillaTeaState; wardrobes: VillaWardrobeState; pickup: VillaPickupState; suv: VillaSuvState; aquariumOn: boolean; bathDoors: VillaBathDoorState; grillLids: boolean[];
  /** One self-driving run per road vehicle; only ever active when sent home. */
  park: Record<VillaRoadVehicle, VillaParkRun> };
const initialVillaState = (): VillaGameState => ({
  evening: true, fireplace: true, gaming: true, fedUntil: 0, ...createVillaActivities(),
  elevator: createVillaElevator(), driving: createVillaDriving(), pickup: createVillaPickup(), suv: createVillaSuv(), scooter: createVillaScooter(), race: createVillaRace(),
  snooker: createVillaSnooker(), snookerActive: false, pets: createVillaPets(), faucetOn: false, teaUntil: 0,
  home: createVillaHome(), outdoor: createVillaOutdoor(), tea: createVillaTea(), wardrobes: createVillaWardrobes(), aquariumOn: true,
  bathDoors: createVillaBathDoors(), grillLids: [false, false, false],
  park: { car: createVillaParkRun(), pickup: createVillaParkRun(), suv: createVillaParkRun() },
});

/** A quiet, non-scoring first-person home. All scene resources belong to this game. */
/** One pointer-lock recentre delta is the cursor's displacement from the canvas
 *  centre, so it is large; a deliberate hand movement is not. */
const RECENTRE_JOLT = 150;
/** Look sensitivity per input channel: locked mouse deltas, unlocked drags
 *  (scaled by canvas pixel density) and touch drags. */
const LOCK_LOOK_SENSITIVITY = 0.0023;
const TOUCH_LOOK_SENSITIVITY = 0.0036;
export class VillaGame extends BaseGame {
  private scene: VillaScene | null = null;
  private unavailable = false;
  private position: VillaPosition = { ...VILLA_SPAWN };
  private yaw = -0.74;
  private pitch = 0.14;
  private eyeY = 0;
  private time = 0;
  private state: VillaGameState = initialVillaState();
  private terminal: VillaTerminal | null = null;
  private accessVehicle: VillaRoadVehicle = 'car';
  private readonly keys = new Set<string>();
  private motion = createVillaMotion();
  private readonly audio = new VillaAudio();
  /** Vehicle drive snapshot for the engine loop; null on foot. */
  private audioEngine: VillaAudioEngine | null = null;
  private audioFocusLost = false;
  private stepDistance = 0;
  private readonly roadDoorAudio = new Map<VillaRoadVehicle, boolean>();
  private immersive = false;
  private promptAlpha = 0;
  private safetyBrake = true;
  private readonly touchActions = new Map<number, string>();
  private lastMouse: Point | null = null;
  private mouseLookEnabled = true;
  private hudHintShown = false;
  /** Granting pointer lock makes the browser emit one recentre move whose delta
   *  is far larger than hand motion. Without this guard that single event spun
   *  the camera the moment the player re-captured the mouse. */
  private skipLockRecentre = false;
  /** When the current lock was granted, for the recentre guard's time window. */
  private lockGrantedAt = -Infinity;
  private wantPointerLock = false;
  private lockVersion = 0;
  private releasePending = false;
  private listenersBound = false;
  private transition: { from: VillaView; at: number } | null = null;
  private closeCarAt = Infinity;
  private enterCarAt = Infinity;
  private exitCarAt = Infinity;
  private joystick: { id: number; origin: Point; point: Point } | null = null;
  private lookTouch: { id: number; point: Point } | null = null;
  private touchMode = false;
  private mapOpen = false;
  private mapFloor = 0;
  private shellOverlayOpen = false;
  private get helpOpen() { return !!this.host.presentation?.isControlsOpen?.(); }
  private toast = '';
  private toastUntil = 0;
  private toastTarget = '';
  /** A blocked door swings only after the player backs off to a clear spot. */
  private doorStepBack: { from: VillaPosition; to: VillaPosition; at: number; seconds: number } | null = null;
  private doorStepBackVehicle: VillaRoadVehicle = 'car';
  private doorStepBackLeaving = false;
  /** Set once a step-back has cleared this vehicle's door for the current access. */
  private doorClearedVehicle: VillaRoadVehicle | null = null;
  private visited = new Set<string>();
  private lastLang: boolean | null = null;
  private lastTouchMode: boolean | null = null;
  private oldAriaLabel: string | null = null;
  private useButton: ReturnType<typeof createVillaUseButton> | null = null;
  private usePressedUntil = 0;

  constructor(host?: GameHost) {
    super(host ?? createDefaultGameHost('gameCanvas', 1120, 700));
    this.oldAriaLabel = this.canvas.getAttribute('aria-label');
    this.useButton = createVillaUseButton(this.canvas, () => this.use());
    this.terminal = createVillaTerminal(this.canvas, {
      close: () => this.setTerminal(false),
      light: (id, on) => { setVillaRoomLight(this.state.home, id, on); this.audio.lightClick(); this.terminalChanged(); },
      allLights: on => { setVillaAllLights(this.state.home, on); this.state.aquariumOn = on; this.state.displayLights = on; this.audio.lightClick(); this.terminalChanged(); },
      time: value => { setVillaTimeOfDay(this.state.home, value); this.terminalChanged(); },
      weather: value => { setVillaWeather(this.state.home, value); this.terminalChanged(); },
      sensitivity: value => this.saveSensitivity(value),
      aimAssist: on => { this.state.snooker.aimAssist = on; this.terminalChanged(); },
      fireplace: on => { this.state.fireplace = on; this.audio.lightClick(); this.terminalChanged(); },
      aquarium: on => { this.state.aquariumOn = on; this.audio.lightClick(); this.terminalChanged(); },
      sound: on => { this.audio.setEnabled(on); if (on) this.primeAudio(); this.terminalChanged(); },
      park: id => { this.parkVehicleHome(id as VillaRoadVehicle); this.terminalChanged(); },
      // Isolated/older hosts have no game-action menu; keep touch access in
      // terminal Settings instead of restoring extra persistent HUD buttons.
      ...(!this.host.presentation?.setActions ? {
        home: () => { this.setTerminal(false); this.activate('home'); },
        immersive: () => { this.setTerminal(false); this.activate('immersion'); },
      } : {}),
    });
  }

  /** Responsive viewport: logical drawing units become CSS pixels. Game state
   * (position, activities, panels) is never reset by a resize. */
  setViewport(viewport: GameViewport) {
    this.resizeLogicalViewport(viewport);
    this.syncUseButton();
    this.publishState();
  }

  /** Host-owned menu entries: labels stay bilingual for the host to localize.
   * Do not start/restart or change presentation pause ownership from an action. */
  private publishActions() {
    this.host.presentation?.setActions?.([
      { id: 'villa-home', label: 'Return to entrance', labelZh: '回到门口', run: () => this.activate('home') },
      { id: 'villa-immersive', label: 'Immersive mode', labelZh: '沉浸模式', checked: this.immersive, run: () => this.activate('immersion') },
    ]);
  }

  private syncAudioPause() {
    this.audio.setPaused(!this.running || this.presentationPaused || this.shellOpen() || document.hidden || this.audioFocusLost || this.unavailable);
  }
  private primeAudio(event?: Event) {
    if (!this.running || this.presentationPaused || this.shellOpen() || document.hidden || this.unavailable) return;
    // Only genuine input can end the focus-loss silence. The audio module also
    // validates the event/activation before constructing or resuming a context.
    if (event?.isTrusted || navigator.userActivation?.isActive) this.audioFocusLost = false;
    this.syncAudioPause(); this.audio.prime(event);
  }
  setPresentationPaused(paused: boolean) {
    super.setPresentationPaused(paused); this.syncAudioPause();
  }
  /** Shell menus pause world input and audio immediately, not on a later RAF. */
  onShellOverlayChange(open: boolean) {
    this.shellOverlayOpen = open; this.syncAudioPause();
    if (open) { this.terminal?.hide(); this.cancelCarAccess(); this.clearInput(); this.mouseLookEnabled = false; this.unlock(); }
    else this.mouseLookEnabled = !this.mapOpen && !this.terminal?.visible && !this.helpOpen;
    this.syncUseButton();
    this.publishState();
  }

  stop() {
    this.audio.setPaused(true);
    this.cancelCarAccess();
    this.resetRoadVehicles();
    this.state.scooter.speed = 0; this.state.scooter.handbrake = false;
    super.stop();
    this.useButton?.hide(); this.terminal?.hide();
  }

  /** Zero every road vehicle's motion through the one dispatch point, so a
   * newly added model cannot be forgotten by one of the reset sites. */
  private resetRoadVehicles() {
    for (const id of ['car', 'pickup', 'suv'] as const) {
      const state = this.roadApi(id).state;
      state.speed = 0; state.steering = 0; state.handbrake = false;
      this.state.park[id].active = false;
    }
  }

  private use() {
    if (!this.running || this.mapOpen || this.terminal?.visible || this.helpOpen || this.immersive || this.shellOpen()) return;
    this.usePressedUntil = this.time + .28;
    this.interact(); this.publishState(); this.syncUseButton();
  }

  private syncUseButton() {
    const circle = villaUseCircle(this.width, this.height, this.uiScale(), this.state.snookerActive, this.safe());
    const target = this.hotspot(), zh = this.isZhLang();
    const label = this.state.seated || this.state.snookerActive ? (zh ? '离开' : 'Exit')
      : target ? `${zh ? '互动' : 'Use'}: ${zh ? target.zh : target.name}` : (zh ? '互动：靠近可互动的物品' : 'Use: move closer to an interactive object');
    this.useButton?.update({ ...circle, radius: circle.radius + 2 * this.uiScale(), width: this.width, height: this.height, label,
      visible: this.running && this.touchMode && !this.immersive && !this.mapOpen && !this.terminal?.visible && !this.helpOpen && !this.shellOpen() && !this.unavailable });
  }

  getDiagnostics() {
    return {
      cameraAspect: this.scene?.cameraAspect,
      renderWidth: this.scene?.renderer.domElement.width,
      renderHeight: this.scene?.renderer.domElement.height,
      paused: this.presentationPaused,
    };
  }

  init() {
    this.audio.setPaused(true); this.audioEngine = null; this.stepDistance = 0; this.roadDoorAudio.clear();
    this.clearInput();
    this.position = { ...VILLA_SPAWN }; this.yaw = -0.74; this.pitch = 0.14; this.eyeY = 0;
    this.time = 0; this.mapOpen = false; this.mapFloor = 0;
    this.state = initialVillaState(); this.motion = createVillaMotion(); this.immersive = false; this.promptAlpha = 0;
    this.publishActions(); // Register before any potentially slow renderer initialization.
    this.terminal?.hide(); this.accessVehicle = 'car';
    try { const value = window.localStorage.getItem('carrick:villa:look-sensitivity'); if (value?.trim()) setVillaLookSensitivity(this.state.home, Number(value)); } catch { /* Optional, Villa-only preference. */ }
    this.mouseLookEnabled = true; this.transition = null; this.closeCarAt = this.enterCarAt = this.exitCarAt = Infinity;
    this.toast = ''; this.toastUntil = 0; this.toastTarget = ''; this.doorStepBack = null; this.usePressedUntil = 0; this.visited = new Set(['garden']);
    this.touchMode = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    if (!this.scene) {
      try { this.scene = new VillaScene(); this.unavailable = false; }
      catch { this.unavailable = true; }
    }
    this.scene?.updateActivities(0, this.state);
    this.publishState();
  }

  protected onStart() {
    this.audioFocusLost = false; this.syncAudioPause();
    this.publishActions();
    this.mouseLookEnabled = true;
    if (!this.listenersBound) {
      this.listenersBound = true;
      const blur = () => { this.audioFocusLost = true; this.audio.setPaused(true); this.cancelCarAccess(); this.clearInput(); this.mouseLookEnabled = false; this.unlock(); };
      const cancelTouch = () => this.clearInput();
      const visibility = () => { if (document.hidden) blur(); };
      const leave = () => { this.lastMouse = null; };
      const pointerMove = (e: MouseEvent) => {
        if (document.pointerLockElement !== this.canvas || this.mapOpen || this.terminal?.visible || this.helpOpen || this.shellOpen()) return;
        if (this.skipLockRecentre) {
          this.skipLockRecentre = false;
          // Only the browser's own recentre jolt is dropped, and only while it
          // can plausibly be the one arriving right after the grant. A large
          // move the player makes later is real input and must reach the camera.
          // A recentre is the cursor's whole displacement and runs to hundreds
          // of pixels; a hand flick is far smaller. 150 leaves every human move
          // reaching the camera while still swallowing the browser's jump.
          if (Math.abs(e.movementX) + Math.abs(e.movementY) > RECENTRE_JOLT && this.time - this.lockGrantedAt < .25) return;
        }
        this.look(e.movementX, e.movementY, LOCK_LOOK_SENSITIVITY);
      };
      const lockChange = () => {
        this.clearInput();
        if (document.pointerLockElement === this.canvas) {
          if (!this.wantPointerLock || this.mapOpen || this.terminal?.visible || this.helpOpen || this.shellOpen()) this.unlock();
          else {
            this.mouseLookEnabled = true; this.skipLockRecentre = true; this.lockGrantedAt = this.time;
            if (!this.hudHintShown) { this.hudHintShown = true; this.message(this.isZhLang() ? '按 Tab 释放鼠标，即可点击终端与页面按钮。' : 'Press Tab to free the mouse for the terminal and page buttons.'); }
          }
        } else if (this.releasePending) {
          this.releasePending = false;
        } else if (this.wantPointerLock) {
          // A native Escape or focus loss, not a deliberate panel release.
          this.wantPointerLock = false; this.mouseLookEnabled = false;
        }
        this.publishState();
      };
      const mount = this.canvas.closest('#gameApp') ?? this.canvas.parentElement;
      const primeControl = (event: Event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target === this.canvas || target?.closest('[data-villa-use], [data-villa-terminal]')) this.primeAudio(event);
      };
      const gestures = ['keydown', 'mousedown', 'pointerdown', 'touchstart', 'touchend', 'click'];
      for (const type of gestures) mount?.addEventListener(type, primeControl, { capture: true, passive: true });
      // Muting is toggled by the button callback after capture. Bubble lets the
      // enabling click prime old WebKit, which has no navigator.userActivation.
      mount?.addEventListener('click', primeControl);
      window.addEventListener('blur', blur);
      document.addEventListener('visibilitychange', visibility);
      document.addEventListener('mousemove', pointerMove);
      document.addEventListener('pointerlockchange', lockChange);
      this.canvas.addEventListener('touchcancel', cancelTouch);
      this.canvas.addEventListener('mouseleave', leave);
      this.registerCleanup(() => {
        for (const type of gestures) mount?.removeEventListener(type, primeControl, true);
        mount?.removeEventListener('click', primeControl);
        window.removeEventListener('blur', blur);
        document.removeEventListener('visibilitychange', visibility);
        document.removeEventListener('mousemove', pointerMove);
        document.removeEventListener('pointerlockchange', lockChange);
        this.canvas.removeEventListener('touchcancel', cancelTouch);
        this.canvas.removeEventListener('mouseleave', leave);
        this.listenersBound = false; this.clearInput(); this.unlock();
      });
    }
    // The shell's start click/Enter grants the gesture: no hold-to-drag or extra L key.
    if (!this.touchMode && navigator.userActivation?.isActive) this.lockPointer();
  }

  restorePointerCapture() {
    if (this.running && !this.presentationPaused) this.lockPointer();
  }

  private lockPointer() {
    this.primeAudio();
    if (this.touchMode || this.mapOpen || this.terminal?.visible || this.helpOpen || this.shellOpen()) return;
    this.mouseLookEnabled = true; this.lastMouse = null; this.wantPointerLock = true;
    const version = ++this.lockVersion;
    const fallback = () => {
      if (version === this.lockVersion && this.running && !this.mapOpen && !this.terminal?.visible && !this.helpOpen && !this.shellOpen()) {
        this.wantPointerLock = false; this.mouseLookEnabled = true;
      }
    };
    try {
      const request = this.canvas.requestPointerLock?.();
      if (request && typeof request.then === 'function') request.then(() => {
        if (!this.running || !this.wantPointerLock || this.mapOpen || this.terminal?.visible || this.helpOpen || this.shellOpen()) this.unlock();
      }).catch(fallback);
    } catch { fallback(); }
  }

  private shellOpen(): boolean {
    return this.shellOverlayOpen;
  }

  private drivingSeat(): boolean { return this.state.seated === 'car' || this.state.seated === 'pickup' || this.state.seated === 'suv' || this.state.seated === 'racing' || this.state.seated === 'scooter'; }
  /** One dispatch point per road vehicle: a third model must not fan out into
   * nested ternaries at forty call sites. */
  private roadApi(id: VillaRoadVehicle) {
    return id === 'pickup'
      ? { state: this.state.pickup, anchors: villaPickupAnchors, obstacles: this.scene?.pickupObstacles,
          doorProgress: this.scene?.pickupDoorProgress ?? 0, doorOpen: this.state.pickupDoorOpen,
          setDoor: (open: boolean) => { this.state.pickupDoorOpen = open; },
          safeExit: villaPickupSafeExit, exitClear: villaPickupExitClear, advance: advanceVillaPickup,
          create: createVillaPickup, blocked: villaPickupPoseBlocked, const: VILLA_PICKUP }
      : id === 'suv'
        ? { state: this.state.suv, anchors: villaSuvAnchors, obstacles: this.scene?.suvObstacles,
            doorProgress: this.scene?.suvDoorProgress ?? 0, doorOpen: this.state.suvDoorOpen,
            setDoor: (open: boolean) => { this.state.suvDoorOpen = open; },
            safeExit: villaSuvSafeExit, exitClear: villaSuvExitClear, advance: advanceVillaSuv,
            create: createVillaSuv, blocked: villaSuvPoseBlocked, const: VILLA_SUV }
        : { state: this.state.driving, anchors: villaCarAnchors, obstacles: this.scene?.drivingObstacles,
            doorProgress: this.scene?.carDoorProgress ?? 0, doorOpen: this.state.carDoorOpen,
            setDoor: (open: boolean) => { this.state.carDoorOpen = open; },
            safeExit: villaCarSafeExit, exitClear: villaCarExitClear, advance: advanceVillaDriving,
            create: createVillaDriving, blocked: villaDrivingPoseBlocked, const: VILLA_CAR };
  }
  /** Per-vehicle steering and speed envelope for the autopilot. */
  private roadLimits(id: VillaRoadVehicle) {
    return id === 'pickup' ? VILLA_PICKUP_LIMITS : id === 'suv' ? VILLA_SUV_LIMITS : VILLA_CAR_LIMITS;
  }
  private parkVehicle(id: VillaRoadVehicle) { return id === 'pickup' ? 'pickup' as const : id === 'suv' ? 'suv' as const : 'car' as const; }
  /** One-key parking: hand this car to its own autopilot and drive it home. */
  private parkVehicleHome(id: VillaRoadVehicle) {
    const key = this.parkVehicle(id), run = this.state.park[id], state = this.roadState(id);
    if (run.active) { run.active = false; this.message(this.isZhLang() ? '已取消自动泊车。' : 'Auto-park cancelled.'); return; }
    if (villaVehicleParked(key, state)) { this.message(this.isZhLang() ? '这辆车已经在自己的车位里。' : 'That car is already in its own bay.'); return; }
    if (!villaParkAvailable(key, state)) { this.message(this.isZhLang() ? '车横在车库地面上：请先把它开出来再自动泊车。' : 'That car is sideways inside the garage: drive it out before auto-parking.'); return; }
    if (this.state.seated === id) { this.cancelCarAccess(); this.closeCarAt = Infinity; }
    const points = villaParkRoute(key, state);
    // Never start a run that would scrape the estate: the route is validated with
    // the same blocking test the car itself uses before a wheel turns.
    if (!villaParkRouteClear(points, pose => this.roadApi(id).blocked(pose, this.roadObstacles(id)))) {
      this.message(this.isZhLang() ? '到车库的路线被挡住了，无法自动泊车。' : 'The route home is blocked, so auto-park cannot start.');
      return;
    }
    Object.assign(run, createVillaParkRun(), { active: true, points });
    this.message(this.isZhLang() ? '已启动自动泊车：车辆正沿庄园道路返回自己的车位。' : 'Auto-park engaged: the car is driving itself back to its own bay.');
  }
  private nearestParkVehicle(): VillaRoadVehicle | null {
    const p = this.groundPosition();
    let best: VillaRoadVehicle | null = null, bestDistance = Infinity;
    for (const id of ['car', 'pickup', 'suv'] as const) {
      const key = this.parkVehicle(id), state = this.roadState(id);
      if (villaVehicleParked(key, state) || !villaParkAvailable(key, state)) continue;
      const d = Math.hypot(state.x - p.x, state.z - p.z);
      if (d < bestDistance) { bestDistance = d; best = id; }
    }
    return best;
  }
  private messageFailedPark(id: VillaRoadVehicle, reason: string) {
    const zh = this.isZhLang(), name = zh ? (id === 'car' ? '轿车' : id === 'pickup' ? '皮卡' : 'SUV') : (id === 'car' ? 'Sedan' : id === 'pickup' ? 'Pickup' : 'SUV');
    this.message(zh ? `${name}自动泊车中断（${reason === 'blocked' ? '前方受阻' : '路线丢失'}），请手动驾驶。` : `${name} auto-park stopped (${reason}); please take over.`);
  }
  private roadState(id: VillaRoadVehicle) { return this.roadApi(id).state; }
  private roadAnchors(id: VillaRoadVehicle) { return this.roadApi(id).anchors(this.roadApi(id).state); }
  private roadObstacles(id: VillaRoadVehicle) { return this.roadApi(id).obstacles ?? []; }
  private roadDoorProgress(id: VillaRoadVehicle) { return this.roadApi(id).doorProgress; }
  private roadDoorOpen(id: VillaRoadVehicle) { return this.roadApi(id).doorOpen; }
  private setRoadDoor(id: VillaRoadVehicle, open: boolean) {
    if (this.roadDoorAudio.get(id) !== open) { this.roadDoorAudio.set(id, open); this.audio.vehicleDoor(open); }
    this.roadApi(id).setDoor(open);
  }
  private roadSafeExit(id: VillaRoadVehicle) { return this.roadApi(id).safeExit(this.roadApi(id).state, this.roadObstacles(id)); }
  private roadExitClear(id: VillaRoadVehicle) { return this.roadApi(id).exitClear(this.roadApi(id).state, this.roadObstacles(id)); }
  private currentRelaxSeat(): VillaRelaxSeat | null { return villaOutdoorSeat(this.state.outdoor, this.state.relaxSeatId) ?? villaRelaxSeat(this.state.relaxSeatId); }

  private cancelCarAccess() {
    if (this.enterCarAt !== Infinity || this.exitCarAt !== Infinity || this.closeCarAt !== Infinity) this.setRoadDoor(this.accessVehicle, false);
    this.doorStepBack = null; this.doorClearedVehicle = null;
    this.enterCarAt = this.exitCarAt = this.closeCarAt = Infinity;
  }

  private terminalSnapshot(): VillaTerminalSnapshot {
    return { home: this.state.home, zh: this.isZhLang(), dark: this.isDarkTheme(), version: VILLA_VERSION,
      aimAssist: this.state.snooker.aimAssist, fireplace: this.state.fireplace, aquarium: this.state.aquariumOn,
      sound: this.audio.enabled,
      petsSheltered: this.state.pets.pets.filter(pet => pet.sheltered).length, petCount: this.state.pets.pets.length,
      vehicles: (['car', 'pickup', 'suv'] as const).map(id => ({ id, name: id === 'car' ? 'Sedan' : id === 'pickup' ? 'Pickup' : 'SUV',
        zh: id === 'car' ? '轿车' : id === 'pickup' ? '皮卡' : 'SUV',
        parked: villaVehicleParked(this.parkVehicle(id), this.roadState(id)),
        canPark: villaParkAvailable(this.parkVehicle(id), this.roadState(id)),
        driving: this.state.park[id].active })) };
  }
  private terminalChanged() { this.terminal?.update(this.terminalSnapshot()); this.publishState(); }
  private setTerminal(open: boolean) {
    if (open && (!this.running || this.shellOpen() || this.helpOpen || this.unavailable)) return;
    this.cancelCarAccess(); this.clearInput(); this.unlock();
    if (open) {
      this.mapOpen = false; this.immersive = false; this.mouseLookEnabled = false;
      this.state.scooter.speed = 0; this.state.scooter.handbrake = false; this.resetRoadVehicles();
      this.state.race.speed = 0; this.terminal?.show(this.terminalSnapshot());
    } else {
      this.terminal?.hide(); this.mouseLookEnabled = !this.mapOpen && !this.terminal?.visible && !this.helpOpen && !this.shellOpen();
      this.canvas.focus({ preventScroll: true });
    }
    this.publishActions(); this.syncUseButton(); this.publishState();
  }
  private saveSensitivity(value: number) {
    setVillaLookSensitivity(this.state.home, value);
    try { window.localStorage.setItem('carrick:villa:look-sensitivity', String(this.state.home.lookSensitivity)); } catch { /* Private browsing can reject storage. */ }
    this.terminalChanged();
  }

  private clearInput() {
    this.keys.clear(); this.touchActions.clear(); this.safetyBrake = true; this.lastMouse = null; this.joystick = null; this.lookTouch = null;
  }

  private unlock() {
    this.wantPointerLock = false; this.lockVersion++;
    if (document.pointerLockElement === this.canvas) { this.releasePending = true; document.exitPointerLock?.(); }
  }

  private look(dx: number, dy: number, sensitivity: number) {
    sensitivity *= this.state.home.lookSensitivity;
    if (this.state.snookerActive) {
      if (!this.state.snooker.moving) {
        this.state.snooker.aim += dx * sensitivity * .35;
        this.state.snooker.power = Math.max(.05, Math.min(1, this.state.snooker.power - dy * sensitivity * .35));
      }
      return;
    }
    this.yaw -= dx * sensitivity;
    this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));
    this.pitch = Math.max(-1.14, Math.min(1.14, this.pitch - dy * sensitivity));
  }

  update(dt: number) {
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(0.05, dt)) : 0;
    this.time += dt;
    this.audioEngine = null;
    advanceVillaHome(this.state.home, dt); this.state.evening = this.state.home.darkness > .2;
    advanceVillaTea(this.state.tea, dt);
    advanceVillaBathDoors(this.state.bathDoors, dt, { position: this.groundPosition(), height: villaBodyHeight(this.motion) + this.motion.offset });
    const wardrobeBefore = Object.fromEntries(Object.entries(this.state.wardrobes.wardrobes).map(([id, wardrobe]) => [id, wardrobe.progress]));
    const wardrobeChanged = advanceVillaWardrobes(this.state.wardrobes, dt);
    advanceVillaOutdoor(this.state.outdoor, dt, this.state.relaxSeatId === 'swing');
    if (this.shellOpen() || document.hidden) { this.cancelCarAccess(); this.clearInput(); this.mouseLookEnabled = false; this.unlock(); }
    if (this.mapOpen || this.terminal?.visible || this.helpOpen) this.cancelCarAccess();
    if (this.transition && this.time - this.transition.at >= 0.45) this.transition = null;
    // Blocked door: glide the player clear, then open on the frame it arrives.
    if (this.doorStepBack) {
      const step = this.doorStepBack, progress = Math.min(1, (this.time - step.at) / step.seconds);
      const eased = progress * progress * (3 - 2 * progress);
      const x = step.from.x + (step.to.x - step.from.x) * eased, z = step.from.z + (step.to.z - step.from.z) * eased;
      this.position = { x, y: step.from.y + (step.to.y - step.from.y) * eased, z };
      this.eyeY = this.position.y;
      const vehicle = this.doorStepBackVehicle, leaving = this.doorStepBackLeaving;
      if (progress >= 1) {
        this.doorStepBack = null;
        this.state.relaxSeatId = null; this.state.relaxSeatPosition = this.state.relaxEntryPosition = null;
        // Stand back at the doorway so the normal automatic entry continues.
        const stance = this.driverDoorStance(vehicle);
        if (stance) { this.position = { ...stance }; this.eyeY = stance.y; }
        else this.doorClearedVehicle = vehicle;
        this.accessVehicle = vehicle; this.closeCarAt = Infinity; this.setRoadDoor(vehicle, true);
        const readyAt = this.time + Math.max(.02, (1 - this.roadDoorProgress(vehicle)) * CAR_DOOR_SECONDS);
        if (leaving) this.exitCarAt = readyAt; else this.enterCarAt = readyAt;
        this.message(this.isZhLang() ? (leaving ? '位置让开了，正在开门下车…' : '位置让开了，正在开门…')
          : (leaving ? 'Clear now. Opening the door to step out…' : 'Clear now. Opening the door…'));
      }
      this.publishState();
    }
    const access = this.accessVehicle;
    if (this.time >= this.closeCarAt) { this.setRoadDoor(access, false); this.closeCarAt = Infinity; }
    if (this.time >= this.enterCarAt && this.roadDoorProgress(access) === 1) {
      this.enterCarAt = Infinity;
      if (!this.state.seated && (this.atDriverDoor(access) || this.doorClearedVehicle === access) && this.roadExitClear(access)) this.takeSeat(access);
      else { this.setRoadDoor(access, false); this.message(this.isZhLang() ? '上车通道被挡住了，请重新靠近驾驶位。' : 'The entry is obstructed. Approach the driver door again.'); }
    }
    if (this.time >= this.exitCarAt && this.roadDoorProgress(access) === 1) { this.exitCarAt = Infinity; this.leaveSeat(); }
    const ground = this.groundPosition(), lift = this.state.elevator;
    const obstruction = villaElevatorDoorwayObstructed(ground, lift);
    idleVillaElevator(lift, dt, !this.state.seated && villaElevatorCabinContains(ground, lift), obstruction);
    const wasRiding = lift.riding;
    advanceVillaElevator(lift, dt, obstruction);
    if (!wasRiding && lift.riding) this.audio.elevatorMove();
    if (wasRiding) {
      this.position.y = lift.y; this.eyeY = this.position.y;
      if (!lift.riding) { this.clearInput(); this.audio.elevatorArrive(); this.message(this.isZhLang() ? '已到达，电梯门已打开。' : 'Arrived. The doors are open.'); }
    }
    this.scene?.updateActivities(this.time, this.state, this.groundPosition(), this.yaw);
    if (wardrobeChanged && !this.state.seated && this.scene && villaCollides(this.groundPosition(), this.scene.colliders, villaBodyHeight(this.motion))) {
      for (const [id, progress] of Object.entries(wardrobeBefore)) this.state.wardrobes.wardrobes[id].progress = progress;
      this.scene.updateActivities(this.time, this.state, this.groundPosition(), this.yaw);
    }
    const enabled = !this.mapOpen && !this.terminal?.visible && !this.helpOpen && !this.shellOpen() && !document.hidden && !this.unavailable && !this.transition
      && this.enterCarAt === Infinity && this.exitCarAt === Infinity;
    if (enabled && !this.drivingSeat() && !this.state.snookerActive) this.yaw += (Number(this.keys.has('arrowleft')) - Number(this.keys.has('arrowright'))) * dt * 1.5;
    let { forward, side } = enabled ? this.axes() : { forward: 0, side: 0 };
    const held = (id: string) => [...this.touchActions.values()].includes(id);
    if (enabled && Math.abs(forward) > .01) this.safetyBrake = false;
    const brake = !enabled || this.safetyBrake;
    const handbrake = enabled && (this.keys.has(' ') || held('brake'));
    if (this.state.seated === 'car' || this.state.seated === 'pickup' || this.state.seated === 'suv') {
      const id = this.state.seated, car = this.roadState(id), oldYaw = car.yaw;
      const run = this.state.park[id];
      if (run.active && (forward || side || handbrake)) {
        run.active = false;
        this.message(this.isZhLang() ? '已接管驾驶，自动泊车取消。' : 'You took over, so auto-park is cancelled.');
      }
      const auto = run.active ? advanceVillaPark(id, car, car.speed, this.roadLimits(id), run, dt) : null;
      if (auto && run.failed) { run.active = false; this.messageFailedPark(id, run.failed); }
      else if (auto?.arrived) this.message(this.isZhLang() ? '已自动泊入车库。' : 'Parked itself back in the garage.');
      const input = auto && run.active
        ? auto.input
        : { throttle: this.roadDoorProgress(id) === 0 && this.exitCarAt === Infinity ? forward : 0,
          steer: side, brake: brake || this.roadDoorOpen(id) || this.exitCarAt !== Infinity, handbrake };
      this.roadApi(id).advance(car, input, dt, this.roadObstacles(id));
      this.audioEngine = { kind: id, speed: car.speed, throttle: input.throttle };
      this.yaw += car.yaw - oldYaw;
      this.position = { ...this.roadAnchors(id).seat }; this.eyeY = this.position.y;
    } else if (this.state.seated === 'scooter') {
      const scooter = this.state.scooter, oldYaw = scooter.yaw;
      advanceVillaScooter(scooter, { throttle: forward, steer: side, brake, handbrake }, dt, this.scene?.scooterObstacles ?? []);
      this.audioEngine = { kind: 'scooter', speed: scooter.speed, throttle: forward };
      this.yaw += scooter.yaw - oldYaw; this.position = { ...villaScooterAnchors(scooter).seat }; this.eyeY = this.position.y;
    } else if (this.state.seated === 'racing' && enabled && this.state.screenSource === 'pc') {
      advanceVillaRace(this.state.race, { throttle: forward, steer: side, brake: brake || handbrake }, dt);
    } else if (this.state.snookerActive) {
      if (enabled && !this.state.snooker.moving) {
        this.state.snooker.aim += (side * .6 + (Number(held('aim-right')) - Number(held('aim-left'))) * .25) * dt;
        this.state.snooker.power = Math.max(.05, Math.min(1, this.state.snooker.power + (forward + Number(held('power-up')) - Number(held('power-down'))) * dt * .4));
      }
    } else if (this.state.seated && this.state.relaxSeatId === 'swing') {
      this.position = { ...villaSwingSeat(this.state.outdoor).seat }; this.eyeY = this.position.y;
    } else if (!this.state.seated && !lift.riding) {
      const base = this.groundPosition();
      advanceVillaMotion(this.motion, dt, height => this.canFit(height, base));
      if (enabled) {
        const magnitude = Math.hypot(forward, side);
        if (magnitude > 1) { forward /= magnitude; side /= magnitude; }
        const speed = (this.keys.has('shift') && !this.motion.crouched ? VILLA_RUN_SPEED : VILLA_WALK_SPEED) * (1 - this.motion.stance * .52);
        const dx = (-Math.sin(this.yaw) * forward + Math.cos(this.yaw) * side) * speed * dt;
        const dz = (-Math.cos(this.yaw) * forward - Math.sin(this.yaw) * side) * speed * dt;
        const height = villaBodyHeight(this.motion) + this.motion.offset;
        const next = this.scene && (dx || dz) ? moveVillaPlayer(base, dx, dz, this.scene.colliders,
          (x, z, y) => this.supportAt(x, z, y, height), height) : base;
        this.position = { ...next, y: next.y + this.motion.offset };
        const running = this.keys.has('shift') && !this.motion.crouched;
        if (this.motion.offset === 0 && !this.motion.velocity) this.stepDistance += Math.hypot(next.x - base.x, next.z - base.z);
        if (this.stepDistance > (running ? 1.15 : 0.82)) { this.stepDistance = 0; this.audio.footstep(running); }
      } else this.position.y = base.y + this.motion.offset;
      if (this.motion.offset > 0 || this.motion.velocity) this.eyeY = this.position.y;
      else this.eyeY += (this.position.y - this.eyeY) * Math.min(1, dt * 18);
      this.visited.add(villaRoomAt(this.groundPosition()).id);
    }
    // Cars the player is not sitting in still drive themselves home.
    for (const id of ['car', 'pickup', 'suv'] as const) {
      if (this.state.seated === id) continue;
      const run = this.state.park[id];
      if (!run.active) continue;
      const state = this.roadState(id);
      const auto = advanceVillaPark(this.parkVehicle(id), state, state.speed, this.roadLimits(id), run, dt);
      if (run.failed) { run.active = false; this.messageFailedPark(id, run.failed); continue; }
      if (auto.arrived) { this.message(this.isZhLang() ? '车辆已自动泊入车库。' : 'The car parked itself back in the garage.'); continue; }
      this.roadApi(id).advance(state, auto.input, dt, this.roadObstacles(id));
    }
    advanceVillaSnooker(this.state.snooker, dt);
    this.scene?.updateActivities(this.time, this.state, this.groundPosition(), this.yaw);
    // Current vehicle footprints and swept pet bounds keep all encounters peaceful.
    advanceVillaPets(this.state.pets, dt, this.scene?.colliders ?? [],
      enabled && !this.state.seated && !lift.riding ? this.groundPosition() : undefined,
      { raining: this.state.home.weather === 'rain' || this.state.home.rain > .18 });
    this.scene?.updatePets(this.time, this.state.pets);
    this.promptAlpha += ((this.hotspot() && !this.state.seated && !this.state.snookerActive ? 1 : 0) - this.promptAlpha) * Math.min(1, dt * 10);
    const listener = this.groundPosition();
    this.audio.update({
      roomId: villaRoomAt(listener).id,
      poolDistance: Math.hypot(listener.x - (POOL.minX + POOL.maxX) / 2, listener.y, listener.z - (POOL.minZ + POOL.maxZ) / 2),
      fireDistance: Math.hypot(listener.x + 10, listener.y, listener.z - 0.95),
      fireplace: this.state.fireplace,
      rain: this.state.home.rain,
      engine: this.audioEngine,
    });
    this.publishState();
  }

  private groundPosition(): VillaPosition { return { ...this.position, y: this.position.y - this.motion.offset }; }
  private supportAt(x: number, z: number, y: number, height: number): number | null {
    return villaElevatorShaftContains(x, z) ? villaElevatorSupportAt(this.state.elevator, x, z, y) : villaSupportAt(x, z, y, height);
  }
  private canFit(height: number, base = this.groundPosition()): boolean {
    return this.supportAt(base.x, base.z, base.y, height) != null && !!this.scene && !villaCollides(base, this.scene.colliders, height);
  }
  private axes() {
    let forward = Number(this.keys.has('w') || this.keys.has('arrowup')) - Number(this.keys.has('s') || this.keys.has('arrowdown'));
    let side = Number(this.keys.has('d')) - Number(this.keys.has('a'));
    if (this.drivingSeat() || this.state.snookerActive) side += Number(this.keys.has('arrowright')) - Number(this.keys.has('arrowleft'));
    if (this.joystick) {
      const radius = 56 * this.uiScale();
      side += (this.joystick.point.x - this.joystick.origin.x) / radius;
      forward -= (this.joystick.point.y - this.joystick.origin.y) / radius;
    }
    return { forward: Math.max(-1, Math.min(1, forward)), side: Math.max(-1, Math.min(1, side)) };
  }
  private hotspot(): VillaHotspot | null {
    const car = this.state.driving, pickup = this.state.pickup, p = this.groundPosition();
    // In the lift cabin, the crosshair picks the operating panel's button: the
    // buttons are centimetres apart, so proximity alone could never tell them apart.
    const aimed = this.elevatorAimButton();
    if (aimed) return { id: aimed.id, x: aimed.x, y: aimed.y, z: aimed.z, radius: .5, name: aimed.name, zh: aimed.zh };
    if (this.state.outdoor.camping.carried) return { id: 'camping-chair', x: p.x - Math.sin(this.yaw) * 1.25, y: p.y, z: p.z - Math.cos(this.yaw) * 1.25,
      name: 'Place the camping chair', zh: '放下露营椅', radius: 2 };
    const suv = this.state.suv;
    const scooter = villaScooterAnchors(this.state.scooter);
    const approach = scooter.exits.reduce((a, b) => Math.hypot(a.x - p.x, a.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? a : b);
    // Driver-side gating uses each profile's own door-hinge line, never a
    // hardcoded offset that can drift away from the real hinge.
    let fixture = nearestVillaHotspot(p, { door: villaCarAnchors(car).door, driverSide: villaCarDriverSide(car, p) }, approach,
      { door: villaPickupAnchors(pickup).door, driverSide: villaPickupDriverSide(pickup, p) },
      { door: villaSuvAnchors(suv).door, driverSide: villaSuvDriverSide(suv, p) });
    const swing = villaSwingSeat(this.state.outdoor), camping = villaCampingSeat(this.state.outdoor);
    const extras: VillaHotspot[] = [
      { id: 'swing', ...swing.seat, radius: 1.85, name: 'Sit on the swing', zh: '坐上秋千' },
      { id: 'camping-chair', ...camping.seat, radius: 1.65, name: 'Sit · Q pick up chair', zh: '坐下 · Q 搬起露营椅' },
      ...VILLA_WARDROBES.map(wardrobe => ({ id: wardrobe.id, ...wardrobe.approach,
        x: Math.max(wardrobe.x - wardrobe.width / 2 + .2, Math.min(wardrobe.x + wardrobe.width / 2 - .2, p.x)), radius: 1.35,
        name: villaOpenableLabel(wardrobe.id, !!this.state.wardrobes.wardrobes[wardrobe.id]?.open, false)!,
        zh: villaOpenableLabel(wardrobe.id, !!this.state.wardrobes.wardrobes[wardrobe.id]?.open, true)! })),
    ];
    for (const candidate of extras) {
      const distance = Math.hypot(candidate.x - p.x, candidate.z - p.z);
      if (Math.abs(candidate.y - p.y) < .4 && distance < (candidate.radius ?? 1.5)
        && (!fixture || distance < Math.hypot(fixture.x - p.x, fixture.z - p.z))) fixture = candidate;
    }
    const pet = nearestVillaPet(this.state.pets, p, this.scene?.colliders ?? []);
    if (pet && (!fixture || Math.hypot(pet.x - p.x, pet.z - p.z) < Math.hypot(fixture.x - p.x, fixture.z - p.z))) {
      const { zh, en: name } = villaPetLabel(pet);
      return { id: `pet-${pet.id}`, x: pet.x, y: 0, z: pet.z, radius: 2.2,
        zh: pet.cooldown > 0 ? `${zh}吃饱啦` : `投喂${zh}`, name: pet.cooldown > 0 ? `${name} is full` : `Feed ${name.toLowerCase()}` };
    }
    if (fixture?.id === 'faucet') return { ...fixture, zh: this.state.faucetOn ? '关闭水龙头' : '打开水龙头', name: this.state.faucetOn ? 'Turn tap off' : 'Turn tap on' };
    if (fixture?.id === 'tea-bar') {
      const phase = this.state.tea.phase;
      return { ...fixture, zh: phase === 'empty' ? '冲一杯茶' : phase === 'brewing' ? '茶正在泡着' : phase === 'ready' ? '喝这杯茶' : '慢慢喝茶',
        name: phase === 'empty' ? 'Brew a cup of tea' : phase === 'brewing' ? 'Tea is brewing' : phase === 'ready' ? 'Drink the tea' : 'Enjoying the tea' };
    }
    return fixture;
  }

  /** Read-only DOM telemetry is useful for accessibility and browser regression tests. */
  private publishState() {
    const data = this.canvas.dataset;
    data.villaPosition = JSON.stringify({ x: +this.position.x.toFixed(3), y: +this.position.y.toFixed(3), z: +this.position.z.toFixed(3) });
    data.villaFloor = String(villaFloor(this.position.y) + 1);
    data.villaRoom = villaRoomAt(this.position).id;
    data.villaRenderer = this.unavailable ? 'unavailable' : 'webgl';
    data.villaMap = String(this.mapOpen);
    data.villaMapFloor = String(this.mapFloor + 1);
    data.villaLook = JSON.stringify({ yaw: +this.yaw.toFixed(3), pitch: +this.pitch.toFixed(3) });
    data.villaVersion = VILLA_VERSION;
    data.villaTime = this.state.home.timeOfDay;
    data.villaWeather = this.state.home.weather;
    data.villaAtmosphere = JSON.stringify({ darkness: +this.state.home.darkness.toFixed(3), rain: +this.state.home.rain.toFixed(3) });
    data.villaTerminal = String(!!this.terminal?.visible);
    data.villaLights = JSON.stringify(this.state.home.roomLights);
    data.villaLookSensitivity = String(this.state.home.lookSensitivity);
    data.villaWardrobes = JSON.stringify(this.state.wardrobes.wardrobes);
    data.villaBathDoors = JSON.stringify(this.state.bathDoors);
    data.villaGrills = JSON.stringify(this.state.grillLids);
    data.villaSoundEnabled = this.audio.enabled ? 'on' : 'off';
    data.villaOutdoor = JSON.stringify({ camping: this.state.outdoor.camping, swingAngle: +this.state.outdoor.swingAngle.toFixed(3) });
    data.villaFireplace = String(this.state.fireplace);
    data.villaGaming = String(this.state.gaming);
    data.villaFed = String(this.time < this.state.fedUntil);
    data.villaFaucet = this.state.faucetOn ? 'on' : 'off';
    data.villaTea = this.state.tea.phase;
    data.villaTeaFill = String(+this.state.tea.fill.toFixed(3));
    data.villaPets = JSON.stringify(this.state.pets.pets.map(({ id, kind, sex, x, y, z, mode, visit, feedCount, cooldown, sheltered, shelterSite, shelterPhase }) => ({
      id, kind, sex, x: +x.toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3), mode, visit, feedCount, cooldown: +cooldown.toFixed(2), sheltered, shelterSite, shelterPhase,
    })));
    data.villaSeat = this.state.seated ?? 'none';
    data.villaRelaxSeat = this.state.relaxSeatId ?? '';
    data.villaCarDoor = this.state.carDoorOpen ? 'open' : 'closed';
    data.villaPickupDoor = this.state.pickupDoorOpen ? 'open' : 'closed';
    data.villaSuvDoor = this.state.suvDoorOpen ? 'open' : 'closed';
    data.villaPark = JSON.stringify((['car', 'pickup', 'suv'] as const).map(id => ({ id,
      parked: villaVehicleParked(this.parkVehicle(id), this.roadState(id)),
      canPark: villaParkAvailable(this.parkVehicle(id), this.roadState(id)),
      active: this.state.park[id].active, index: this.state.park[id].index, of: this.state.park[id].points.length,
      failed: this.state.park[id].failed })));
    data.villaAccessVehicle = this.accessVehicle;
    data.villaCarAccess = this.enterCarAt !== Infinity ? 'entering' : this.exitCarAt !== Infinity ? 'exiting' : this.closeCarAt !== Infinity ? 'closing' : 'idle';
    data.villaScreenSource = this.state.screenSource;
    data.villaDisplayLights = String(this.state.displayLights);
    data.villaPointerLocked = String(document.pointerLockElement === this.canvas);
    data.villaMouseLook = this.mouseLookEnabled ? 'active' : 'cursor';
    data.villaRunning = String(this.keys.has('shift') && !this.motion.crouched && !this.state.seated && !this.state.snookerActive && !this.mapOpen && !this.terminal?.visible && !this.helpOpen && !this.state.elevator.riding);
    data.villaImmersive = String(this.immersive);
    data.villaMotion = JSON.stringify({ ...this.motion, eyeHeight: villaEyeHeight(this.motion) });
    data.villaDriving = JSON.stringify(this.state.driving);
    data.villaPickup = JSON.stringify(this.state.pickup);
    data.villaSuv = JSON.stringify(this.state.suv);
    data.villaScooter = JSON.stringify(this.state.scooter);
    data.villaRace = JSON.stringify({ speed: this.state.race.speed, distance: this.state.race.distance, lane: this.state.race.lane, laps: this.state.race.laps, crashes: this.state.race.crashes });
    data.villaSnooker = JSON.stringify({ active: this.state.snookerActive, moving: this.state.snooker.moving, shots: this.state.snooker.shots, score: this.state.snooker.score, target: this.state.snooker.target, aim: this.state.snooker.aim, power: this.state.snooker.power, aimAssist: this.state.snooker.aimAssist });
    data.villaElevator = JSON.stringify({ floor: this.state.elevator.floor + 1, target: this.state.elevator.target + 1,
      y: +this.state.elevator.y.toFixed(3), phase: this.state.elevator.phase, riding: this.state.elevator.riding });
    data.villaTarget = this.inElevator() ? 'elevator' : this.state.snookerActive ? 'snooker' : this.state.seated ?? this.hotspot()?.id ?? '';
    data.villaVisited = [...this.visited].join(',');
    data.villaUseFeedback = this.time < this.toastUntil ? this.toast : '';
    // The same CSS/logical rectangles drive drawing and input, never shadow geometry.
    data.villaUtilities = JSON.stringify(this.utilityButtons());
    data.villaButtons = JSON.stringify(this.buttons());
  }

  /** Logical units are CSS pixels under the edge-to-edge viewport, so authored
   * sizes (44px buttons, 56px joystick radius) are already physical sizes. */
  private uiScale() {
    if (this.viewport || !this.touchMode) return 1;
    // Isolated legacy hosts can still contain a fixed logical canvas.
    return Math.min(3.5, Math.max(1.2, this.width / (this.canvas.clientWidth || this.width)));
  }

  /** Display safe-area insets (notch / system bars), zero before the first viewport. */
  private safe() {
    return this.viewport?.safeArea ?? { top: 0, right: 0, bottom: 0, left: 0 };
  }

  /** Keep the existing compact activity HUD on narrow or coarse-pointer displays. */
  private compactHud() {
    const safe = this.safe();
    return this.touchMode || this.width - safe.left - safe.right < 1110 || this.height - safe.top - safe.bottom < 600;
  }

  /** Exactly two direct utilities. The location badge IS the map target; the
   * terminal owns time/weather. Every rectangle is at least 44 CSS pixels. */
  private utilityButtons(): Button[] {
    const s = this.uiScale(), size = 44 * s, safe = this.safe(), compact = this.compactHud(), zh = this.isZhLang();
    const top = (compact ? 12 : 22) * s + safe.top, gap = 12 * s;
    const shellLeft = this.width - safe.right - (SHELL_BUTTON_MARGIN + SHELL_CLUSTER_WIDTH) * s;
    const x = (compact ? 12 : 24) * s + safe.left;
    const available = shellLeft - gap - x;
    const locationWidth = Math.max(size, Math.min((compact ? 56 : 294) * s, available));
    const locationY = available < size ? top + 56 * s : top;
    const p = this.groundPosition(), room = villaRoomAt(p);
    const location = this.state.snookerActive ? (zh ? '斯诺克厅' : 'Snooker') : (zh ? room.zh : room.name);
    const map: Button = { id: 'map', x, y: locationY, w: locationWidth, h: size,
      label: compact ? `${villaFloor(p.y) + 1}F ▾` : `${villaFloor(p.y) + 1}F · ${location} ▾` };
    const snooker = this.touchMode && this.state.snookerActive;
    const w = (snooker ? 44 : compact ? 76 : 118) * s;
    const rowX = shellLeft - gap - w;
    const secondRow = locationY !== top || rowX < map.x + map.w + gap;
    const terminal: Button = { id: 'terminal', label: zh ? '终端' : 'Terminal', w, h: size,
      x: snooker ? this.width - 112 * s - safe.right : secondRow ? this.width - gap - safe.right - w : rowX,
      // Snooker reuses the old immersive slot, leaving aim/power/Shot untouched.
      y: snooker ? (compact ? 12 : 22) + safe.top + 54 * s : top + (secondRow ? 56 * s : 0) };
    return [map, terminal];
  }

  private buttons(): Button[] {
    const s = this.uiScale(), zh = this.isZhLang(), safe = this.safe();
    const top = (this.compactHud() ? 12 : 22) + safe.top;
    const buttons = this.utilityButtons();
    if (this.immersive) return buttons;
    const target = this.hotspot()?.id;
    if (this.touchMode && this.state.snookerActive) {
      const control = (id: string, label: string, x: number, y: number): Button => ({ id, label, x, y, w: 44 * s, h: 44 * s });
      return [...buttons,
        control('aim-left', '←', 12 * s + safe.left, top + 54 * s), control('aim-right', '→', 64 * s + safe.left, top + 54 * s),
        control('power-down', '−', 12 * s + safe.left, top + 106 * s), control('power-up', '+', 64 * s + safe.left, top + 106 * s),
        control('reset-activity', zh ? '重摆' : 'Reset', 12 * s + safe.left, this.height - 55 * s - safe.bottom),
        control('shoot', zh ? '击球' : 'Shot', this.width - 64 * s - safe.right, top + 54 * s)];
    }
    if (this.touchMode && !this.inElevator()) {
      const actions = this.drivingSeat() ? [['brake', zh ? '手刹' : 'HB'], ['reset-activity', zh ? '复位' : 'Reset']]
        : this.state.seated ? [] : [['crouch', zh ? '蹲' : 'C'], ['jump', zh ? '跳' : 'Jump']];
      actions.forEach(([id, label], i) => buttons.push({ id, label, x: this.width - (this.state.seated ? 168 - i * 54 : 170 - i * 52) * s - safe.right, y: this.height - (this.state.seated ? 151 : 93) * s - safe.bottom, w: 44 * s, h: 44 * s }));
    }
    if (this.touchMode && (this.state.seated === 'car' || this.state.seated === 'pickup' || this.state.seated === 'suv' || this.state.seated === 'racing' || this.state.relaxSeatId === 'chair-pc'
      || (!this.state.seated && (target === 'car' || target === 'pickup' || target === 'suv' || target === 'media' || target === 'camping-chair' || target === 'chair-pc')))) {
      const door = this.state.seated === 'car' || this.state.seated === 'pickup' || this.state.seated === 'suv' || target === 'car' || target === 'pickup' || target === 'suv';
      const camp = target === 'camping-chair', pc = target === 'chair-pc' || this.state.relaxSeatId === 'chair-pc';
      const label = zh ? (camp ? (this.state.outdoor.camping.carried ? '放下' : '搬起') : pc ? '电源' : door ? '车门' : '信号')
        : (camp ? (this.state.outdoor.camping.carried ? 'Place' : 'Carry') : pc ? 'Power' : door ? 'Door' : 'Input');
      buttons.push({ id: 'secondary', x: this.width - 60 * s - safe.right, y: this.height - 151 * s - safe.bottom, w: 44 * s, h: 44 * s, label });
    }
    if (this.inElevator()) {
      const w = (this.touchMode ? 46 : 64) * s, gap = 8 * s;
      // Two rows: floor buttons with the highest floor on top, then the door
      // open/close buttons, so the panel reads like a real lift operating panel.
      const rowY = this.touchMode ? top + (this.width - safe.left - safe.right < 640 ? 108 : 52) * s : this.height - 180 - safe.bottom;
      const floors = [2, 1, 0];
      floors.forEach((floor, column) => buttons.push({ id: `elevator-${floor}`, label: `${floor + 1}F`,
        x: (this.width - 3 * w - 2 * gap) / 2 + column * (w + gap), y: rowY, w, h: 44 * s }));
      const doorY = rowY + 50 * s;
      buttons.push({ id: 'elevator-open', label: zh ? '开门' : 'Open', x: this.width / 2 - w - gap / 2, y: doorY, w, h: 44 * s });
      buttons.push({ id: 'elevator-close', label: zh ? '关门' : 'Close', x: this.width / 2 + gap / 2, y: doorY, w, h: 44 * s });
    }
    return buttons;
  }

  private panelRect() {
    const s = this.uiScale(), safe = this.safe();
    return this.compactHud() ? { x: 12 * s + safe.left, y: 68 + safe.top, w: this.width - 24 * s - safe.left - safe.right, h: this.height - 80 - safe.top - safe.bottom }
      : { x: 88 + safe.left, y: 74 + safe.top, w: this.width - 176 - safe.left - safe.right, h: this.height - 148 - safe.top - safe.bottom };
  }

  private closeButton() {
    const p = this.panelRect(), s = this.uiScale();
    return this.compactHud() ? { x: p.x + p.w - 50 * s, y: p.y + 6 * s, w: 44 * s, h: 44 * s }
      : { x: p.x + p.w - 70, y: p.y + 12, w: 56, h: 50 };
  }

  private mapTabs(): Button[] {
    const p = this.panelRect(), s = this.uiScale();
    const labels = this.isZhLang() ? ['1F  生活与花园', '2F  卧室与阅读', '3F  天台花园', '南向田园'] : ['1F  Living', '2F  Bedrooms', '3F  Rooftop', 'South estate'];
    const compact = this.compactHud(), w = compact ? (p.w - 64 * s) / 4 - 4 * s : 146;
    return labels.map((label, f) => ({ id: String(f === 3 ? -1 : f), label: compact ? (f === 3 ? (this.isZhLang() ? '庭院' : 'Estate') : `${f + 1}F`) : label,
      x: p.x + (compact ? 8 * s + f * (w + 4 * s) : 28 + f * 156),
      y: p.y + (compact ? 6 * s : 65), w, h: compact ? 44 * s : 48,
    }));
  }

  private activate(id: string) {
    if (id === 'elevator-open') { this.controlElevatorDoor(true); return; }
    if (id === 'elevator-close') { this.controlElevatorDoor(false); return; }
    if (id.startsWith('elevator-floor-')) { this.selectElevatorFloor(Number(id.slice(15))); return; }
    if (id.startsWith('elevator-')) { this.selectElevatorFloor(Number(id.slice(9))); return; }
    if (id === 'bath-door-west' || id === 'bath-door-east') {
      const which = id === 'bath-door-west' ? 'west' : 'east';
      toggleVillaBathDoor(this.state.bathDoors, which);
      this.audio.lightClick();
      const open = this.state.bathDoors[which];
      this.message(this.isZhLang() ? (open ? '正在开门，请让开门扇。' : '正在关门，请让开门扇。') : open ? 'Opening. Please keep the swing clear.' : 'Closing. Please keep the swing clear.');
      this.publishState(); return;
    }
    if (id === 'grill-west' || id === 'grill-centre' || id === 'grill-east') {
      const index = id === 'grill-west' ? 0 : id === 'grill-centre' ? 1 : 2;
      this.state.grillLids[index] = !this.state.grillLids[index];
      this.audio.uiSelect();
      this.message(this.isZhLang() ? (this.state.grillLids[index] ? '烤炉盖已打开。' : '烤炉盖已盖上。') : this.state.grillLids[index] ? 'The grill lid is open.' : 'The grill lid is closed.');
      this.publishState(); return;
    }
    switch (id) {
      case 'terminal': this.setTerminal(!this.terminal?.visible); break;
      case 'map':
        this.terminal?.hide(); this.mapOpen = !this.mapOpen; if (this.mapOpen) this.immersive = false;
        this.mapFloor = this.position.z >= 24 ? -1 : villaFloor(this.position.y); this.clearInput();
        this.mouseLookEnabled = !this.mapOpen; if (this.mapOpen) this.unlock(); break;
      case 'time': cycleVillaTimeOfDay(this.state.home); break;
      case 'home':
        this.position = { ...VILLA_ENTRANCE }; this.eyeY = 0; this.yaw = 0; this.pitch = 0.04;
        this.state.seated = null; this.state.relaxSeatId = null; this.state.relaxSeatPosition = this.state.relaxEntryPosition = null;
        this.state.carDoorOpen = false; this.state.pickupDoorOpen = false; this.state.suvDoorOpen = false;
        this.transition = null; this.closeCarAt = this.enterCarAt = this.exitCarAt = Infinity;
        this.state.outdoor.camping.carried = false; this.terminal?.hide();
        this.motion = createVillaMotion(); this.state.snookerActive = false;
        this.resetRoadVehicles();
        this.state.scooter.speed = 0; this.state.scooter.steering = 0; this.state.scooter.handbrake = false;
        this.state.elevator = createVillaElevator(); this.scene?.updateActivities(this.time, this.state);
        this.mapOpen = false; this.clearInput();
        this.message(this.isZhLang() ? '回到家门口，欢迎回家。' : 'Back at the front door. Welcome home.'); break;
      case 'help':
        // Let the shell observe capture before it clears input/unlocks the mouse.
        if (this.host.presentation?.openControls) {
          this.mapOpen = false; this.host.presentation.openControls();
        }
        break;
      case 'interact': this.interact(); break;
      case 'secondary': this.secondaryInteraction(); break;
      case 'immersion':
        this.immersive = !this.immersive; this.mapOpen = false; this.clearInput();
        this.mouseLookEnabled = !this.shellOpen() && !this.terminal?.visible && !this.helpOpen;
        if (this.immersive) this.lockPointer(); break;
      case 'crouch':
        if (!this.state.seated && !this.state.snookerActive && !this.state.elevator.riding && !toggleVillaCrouch(this.motion, h => this.canFit(h)))
          this.message(this.isZhLang() ? '上方空间不足，暂时不能站起。' : 'Not enough headroom to stand.');
        break;
      case 'jump': if (!this.state.seated && !this.state.snookerActive && !this.state.elevator.riding && !this.transition && this.enterCarAt === Infinity) jumpVillaMotion(this.motion); break;
      case 'shoot': if (this.state.snookerActive && !this.transition && shootVillaSnooker(this.state.snooker)) this.audio.snookerHit(this.state.snooker.power); break;
      case 'reset-activity':
        this.clearInput();
        if (this.state.snookerActive) this.state.snooker = createVillaSnooker();
        else if (this.state.seated === 'racing') this.state.race = createVillaRace();
        else if (this.state.seated === 'car' || this.state.seated === 'pickup' || this.state.seated === 'suv') {
          const id = this.state.seated, parked = this.roadApi(id).create();
          const blocked = this.roadApi(id).blocked(parked, this.roadObstacles(id));
          if (blocked) { this.message(this.isZhLang() ? '车库原位被占用了，请先移开障碍。' : 'The garage space is occupied. Clear it before resetting.'); break; }
          if (id === 'pickup') this.state.pickup = parked; else if (id === 'suv') this.state.suv = parked; else this.state.driving = parked;
          this.position = { ...this.roadAnchors(id).seat }; this.eyeY = this.position.y;
          this.yaw = Math.PI; this.pitch = -.035; this.transition = null; this.setRoadDoor(id, false); this.closeCarAt = this.enterCarAt = this.exitCarAt = Infinity;
          this.scene?.updateActivities(this.time, this.state, this.groundPosition(), this.yaw);
        } else if (this.state.seated === 'scooter') {
          const parked = createVillaScooter();
          if (villaScooterPoseBlocked(parked, this.scene?.scooterObstacles ?? [])) { this.message(this.isZhLang() ? '电动车原位被占用了，请先移开障碍。' : 'The scooter space is occupied. Clear it before resetting.'); break; }
          this.state.scooter = parked; this.position = { ...villaScooterAnchors(parked).seat };
          this.yaw = Math.PI; this.pitch = -.12; this.transition = null; this.scene?.updateActivities(this.time, this.state);
        }
        break;
    }
    this.publishActions();
    this.publishState();
  }

  private message(text: string) {
    this.toast = text; this.toastUntil = this.time + 4.5;
    this.toastTarget = this.state.relaxSeatId ?? this.state.seated ?? (this.state.snookerActive ? 'snooker' : this.inElevator() ? 'elevator' : this.hotspot()?.id ?? '');
  }

  private view(): VillaView {
    const rest = this.currentRelaxSeat();
    const eyeHeight = this.state.seated === 'car' ? VILLA_CAR.eyeHeight : this.state.seated === 'pickup' ? VILLA_PICKUP.eyeHeight : this.state.seated === 'suv' ? VILLA_SUV.eyeHeight : this.state.seated === 'racing' ? VILLA_RACING.eyeHeight
      : this.state.seated === 'scooter' ? VILLA_SCOOTER.eyeHeight : this.state.seated && rest ? rest.eyeHeight : villaEyeHeight(this.motion);
    const mounted = this.state.seated === 'car' || this.state.seated === 'pickup' || this.state.seated === 'suv' || this.state.seated === 'scooter';
    const terrain = mounted ? villaTerrainOrientation(this.position.x, this.position.z, this.yaw) : { pitch: 0, roll: 0 };
    // Stay below the 3.4m ceiling. A wider top-down view fits the complete table.
    const target: VillaView = this.state.snookerActive
      ? { x: VILLA_SNOOKER.center.x, y: 3.15, z: VILLA_SNOOKER.center.z, yaw: 0, pitch: -Math.PI / 2, eyeHeight: 0, fov: 96 }
      : { ...this.position, y: this.state.seated ? this.position.y : this.eyeY, yaw: this.yaw, pitch: this.pitch + terrain.pitch, roll: terrain.roll, eyeHeight, fov: this.state.seated === 'racing' ? 70 : 64 };
    if (!this.transition) return target;
    const t = Math.min(1, Math.max(0, (this.time - this.transition.at) / 0.45)), s = t * t * (3 - 2 * t), from = this.transition.from;
    const mix = (a: number, b: number) => a + (b - a) * s;
    return { x: mix(from.x, target.x), y: mix(from.y, target.y), z: mix(from.z, target.z),
      yaw: from.yaw + Math.atan2(Math.sin(target.yaw - from.yaw), Math.cos(target.yaw - from.yaw)) * s,
      pitch: mix(from.pitch, target.pitch), roll: mix(from.roll ?? 0, target.roll ?? 0), eyeHeight: mix(from.eyeHeight ?? EYE_HEIGHT, target.eyeHeight ?? EYE_HEIGHT), fov: mix(from.fov ?? 64, target.fov ?? 64) };
  }

  private takeSeat(seat: VillaRoadVehicle | 'racing' | 'scooter') {
    const from = this.view(), road = seat === 'car' || seat === 'pickup' || seat === 'suv';
    this.state.seated = seat; this.state.relaxSeatId = null; this.state.relaxSeatPosition = null;
    this.state.relaxEntryPosition = seat === 'racing' ? { ...this.groundPosition() } : null;
    this.position = { ...(road ? this.roadAnchors(seat).seat : seat === 'scooter' ? villaScooterAnchors(this.state.scooter).seat : VILLA_RACING.seat) };
    this.eyeY = this.position.y; this.motion = createVillaMotion();
    this.yaw = Math.PI + (road ? this.roadState(seat).yaw : seat === 'scooter' ? this.state.scooter.yaw : 0);
    this.pitch = road ? -.035 : seat === 'scooter' ? -.12 : .225;
    if (seat === 'racing') this.state.screenSource = 'pc';
    this.transition = { from, at: this.time }; this.clearInput();
    if (road) { this.accessVehicle = seat; this.closeCarAt = this.time + .5; }
    this.message(this.isZhLang() ? (road ? '已坐进驾驶位，车门将自动关闭。' : seat === 'scooter' ? '已骑上电动车。' : '已坐进驾驶模拟器。')
      : (road ? 'In the driver seat. The door will close automatically.' : seat === 'scooter' ? 'On the electric scooter.' : 'Seated in the driving simulator.'));
  }

  private takeRelaxSeat(id: string) {
    const seat = villaOutdoorSeat(this.state.outdoor, id) ?? villaRelaxSeat(id); if (!seat) return;
    const from = this.view(), entry = this.groundPosition(), resolved = resolveVillaSeatPosition(seat, entry);
    this.state.seated = seat.kind; this.state.relaxSeatId = seat.id;
    this.state.relaxEntryPosition = { ...entry }; this.state.relaxSeatPosition = { ...resolved };
    this.position = { ...resolved }; this.eyeY = resolved.y; this.yaw = seat.yaw; this.pitch = seat.pitch;
    this.motion = createVillaMotion(); this.transition = { from, at: this.time }; this.clearInput();
    this.message(this.isZhLang() ? (seat.kind === 'bed' ? '已经躺好，可以慢慢环顾。' : id === 'swing' ? '坐稳了，秋千轻轻晃动。' : '坐下来歇一会儿。')
      : (seat.kind === 'bed' ? 'Resting on the bed. Feel free to look around.' : id === 'swing' ? 'Settled into a gentle swing.' : 'Take a quiet seat.'));
  }

  private leaveSeat() {
    const seat = this.state.seated; if (!seat) return;
    const road = seat === 'car' || seat === 'pickup' || seat === 'suv', scooter = seat === 'scooter', from = this.view(), rest = this.currentRelaxSeat();
    if ((road && Math.abs(this.roadState(seat).speed) > .12) || (scooter && Math.abs(this.state.scooter.speed) > .12)) {
      this.message(this.isZhLang() ? '请先停稳，再下车。' : 'Stop completely before getting off.'); return;
    }
    const exit = road ? this.roadSafeExit(seat) : scooter ? villaScooterSafeExit(this.state.scooter, this.scene?.scooterObstacles ?? [])
      : rest ? villaSeatExitCandidates(rest, this.position, this.state.relaxEntryPosition ?? undefined)
        .find(p => this.canFit(1.75, p) && this.approachClear(p, rest.id))
        : [this.state.relaxEntryPosition, VILLA_RACING.exit].filter((p): p is VillaPosition => !!p)
          .find(p => this.canFit(1.75, p) && this.approachClear(p, 'racing'));
    if (!exit || !this.canFit(1.75, exit)) {
      if (road) { this.accessVehicle = seat; this.closeCarAt = this.time + .25; }
      this.message(this.isZhLang() ? '旁边没有安全的站立空间，请稍候或换个位置。' : 'There is no safe standing space beside you. Wait or reposition.'); return;
    }
    this.position = { ...exit }; this.state.seated = null; this.state.relaxSeatId = null; this.state.relaxSeatPosition = this.state.relaxEntryPosition = null;
    this.eyeY = exit.y; this.motion = createVillaMotion(); this.pitch = -.06;
    if (road) {
      const vehicle = this.roadState(seat); this.yaw = Math.atan2(exit.x - vehicle.x, exit.z - vehicle.z);
      vehicle.speed = 0; vehicle.handbrake = false; this.accessVehicle = seat; this.closeCarAt = this.time + .55;
    }
    if (scooter) {
      this.yaw = Math.atan2(exit.x - this.state.scooter.x, exit.z - this.state.scooter.z);
      this.state.scooter.speed = 0; this.state.scooter.steering = 0; this.state.scooter.handbrake = false;
    }
    this.transition = { from, at: this.time }; this.clearInput();
    this.message(this.isZhLang() ? (road ? '已下车，车门会自动关好。' : '已起身，可以继续参观。')
      : (road ? 'Stepped outside. The door will close automatically.' : 'Back on your feet. Continue exploring.'));
  }

  private inElevator(): boolean {
    return this.state.elevator.riding || villaElevatorCabinContains(this.groundPosition(), this.state.elevator);
  }

  /** Inside the lift cabin, the crosshair aims at the operating panel's real
   * buttons; the mouse keeps steering the view and E or a click presses the aimed one. */
  private elevatorAimButton(): VillaElevatorPanelButton | null {
    if (!this.inElevator() || this.state.seated || this.mapOpen || this.terminal?.visible || this.helpOpen || this.shellOpen()) return null;
    const view = this.view(), eyeY = view.y + (view.eyeHeight ?? EYE_HEIGHT);
    const cp = Math.cos(view.pitch), fx = -Math.sin(view.yaw) * cp, fy = Math.sin(view.pitch), fz = -Math.cos(view.yaw) * cp;
    let best: VillaElevatorPanelButton | null = null, bestDot = 0.965;
    for (const button of villaElevatorPanelButtons(this.state.elevator)) {
      const dx = button.x - view.x, dy = button.y - eyeY, dz = button.z - view.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance < .25 || distance > 1.7) continue;
      const dot = (dx * fx + dy * fy + dz * fz) / distance;
      if (dot > bestDot) { bestDot = dot; best = button; }
    }
    return best;
  }

  private selectElevatorFloor(floor: number) {
    if (!this.inElevator() || this.state.seated || this.transition || this.motion.offset > .001 || this.motion.velocity) return;
    if (villaElevatorDoorwayObstructed(this.position, this.state.elevator)) {
      this.message(this.isZhLang() ? '请完全走进轿厢，给电梯门留出空间。' : 'Step fully inside and clear the doorway.'); return;
    }
    if (!requestVillaElevator(this.state.elevator, floor, true)) {
      this.message(this.isZhLang() ? '电梯运行中，请稍候。' : 'Please wait for the elevator.'); return;
    }
    this.clearInput();
    this.message(this.isZhLang() ? (this.state.elevator.riding ? `前往 ${floor + 1}F，可以自由环顾。` : '已在这一层，可以走出电梯。')
      : (this.state.elevator.riding ? `Going to ${floor + 1}F. Feel free to look around.` : 'Already on this floor. You may step out.'));
    this.publishState();
  }

  private controlElevatorDoor(open: boolean) {
    const zh = this.isZhLang(), lift = this.state.elevator;
    if (this.state.seated || this.transition || this.motion.offset > .001 || this.motion.velocity) return;
    if (open && villaElevatorDoorwayObstructed(this.position, lift)) {
      this.message(zh ? '门口有人，暂时无法关门。' : 'Someone is in the doorway.'); return;
    }
    if (!requestVillaElevatorDoor(lift, open)) {
      this.message(zh ? (lift.phase === 'moving' ? '电梯运行中，请稍候。' : '门已经关好了。') : (lift.phase === 'moving' ? 'Please wait for the elevator.' : 'The doors are already closed.'));
      this.publishState(); return;
    }
    this.clearInput();
    this.message(zh ? (open ? '正在开门。' : '正在关门。') : (open ? 'Opening the doors.' : 'Closing the doors.'));
    this.publishState();
  }

  /** The vehicle's local frame for door work: the door-hinge offset plus a
   * local→world position helper shared by every door-side method. */
  private doorFrame(id: VillaRoadVehicle) {
    const car = this.roadState(id), c = this.roadApi(id).const;
    const cos = Math.cos(car.yaw), sin = Math.sin(car.yaw);
    const local = (x: number, z: number, y: number): VillaPosition => ({ x: car.x + x * cos + z * sin, y, z: car.z - x * sin + z * cos });
    return { car, hinge: { x: c.door.x - c.center.x, z: c.door.z - c.center.z }, local };
  }
  /** How far the player is from the driver door, and how far along its face. */
  private driverDoorOffset(id: VillaRoadVehicle, at?: VillaPosition): { along: number; lateral: number; height: number } {
    const from = at ?? this.position;
    const { car, hinge } = this.doorFrame(id);
    const dx = from.x - car.x, dz = from.z - car.z;
    const x = dx * Math.cos(car.yaw) - dz * Math.sin(car.yaw), z = dx * Math.sin(car.yaw) + dz * Math.cos(car.yaw);
    // Every road vehicle keeps door/center world anchors of the same shape, so
    // compare in the vehicle's own local frame.
    return { along: z - hinge.z, lateral: x - hinge.x,
      height: Math.abs(this.groundPosition().y - this.roadAnchors(id).exit.y) };
  }
  /** Standing anywhere in front of the driver door counts, so the player does
   * not have to hunt for one exact spot. A door that would be blocked first
   * moves the player back to a clear spot instead of refusing outright. */
  private atDriverDoor(id: VillaRoadVehicle = 'car', at?: VillaPosition): boolean {
    const offset = this.driverDoorOffset(id, at);
    // The arc starts just inside the body and must reach the vehicle's own
    // standing exit, which the wider pickup places further from its hinge.
    return offset.lateral >= -.35 && offset.lateral <= 2.9 && Math.abs(offset.along) <= 1.6 && offset.height < .4;
  }
  /** The nearest spot that still counts as standing at the driver doorway, so a
   * blocked swing only needs the shortest possible step before the door opens. */
  private driverDoorStance(id: VillaRoadVehicle): VillaPosition | null {
    const anchors = this.roadAnchors(id), offset = this.driverDoorOffset(id);
    const { hinge, local } = this.doorFrame(id);
    const candidates: VillaPosition[] = [];
    if (anchors.exits[0]) candidates.push(anchors.exits[0]);
    // Offsets are from the vehicle centre, so the hinge offset is added here.
    for (const out of [0, .25, .5, .8, 1.1, 1.5]) for (const slide of [offset.along, 0, .35, -.35, .7, -.7, 1.05, -1.05])
      candidates.push(local(hinge.x + offset.lateral + out, hinge.z + slide, anchors.exit.y));
    for (const candidate of candidates) if (this.atDriverDoor(id, candidate) && this.canFit(1.75, candidate)) return { ...candidate };
    return null;
  }
  /** Where the driver can stand so the door misses them: a real probe of the
   * scene and the vehicle boxes, searched outward from wherever they already are. */
  private stepBackFromDriverDoor(id: VillaRoadVehicle): VillaPosition | null {
    if (!this.scene) return null;
    const anchors = this.roadAnchors(id), offset = this.driverDoorOffset(id);
    const { hinge, local } = this.doorFrame(id);
    const nearest = Math.max(0, offset.lateral), along = Math.max(-1.5, Math.min(1.5, offset.along));
    const candidates: VillaPosition[] = [];
    // Straight out from the car's side first: it is the shortest clear move and
    // it never crosses the very obstruction that made the door blocked.
    for (const out of [nearest, nearest + .25, nearest + .55, nearest + .9, .5, 1, 1.5, 2.1, 2.7])
      candidates.push(local(out, hinge.z + along, anchors.exit.y));
    for (const out of [nearest + .2, nearest + .6, 1, 1.5, 2.1])
      for (const slide of [along + .45, along - .45, 0, .8, -.8, 1.3, -1.3])
        candidates.push(local(out, hinge.z + slide, anchors.exit.y));
    if (anchors.exits[0]) candidates.push(anchors.exits[0]);
    if (anchors.exits[1]) candidates.push(anchors.exits[1]);
    const height = 1.75;
    const standing = (p: VillaPosition) => {
      if (Math.abs(p.y - anchors.exit.y) > .3) return false;
      const support = this.supportAt(p.x, p.z, p.y, height);
      return support != null && Math.abs(support - p.y) <= .12 && this.canFit(height, p);
    };
    // The door swings out and forward from its hinge; standing beyond the tip
    // clears the whole arc even when the exact route has been walled in.
    const clearOfSwing = (p: VillaPosition) => {
      const tip = local(hinge.x + .82, hinge.z + .34, anchors.exit.y);
      return Math.hypot(p.x - tip.x, p.z - tip.z) > .5;
    };
    let best: VillaPosition | null = null, bestDistance = Infinity;
    for (const candidate of candidates) {
      if (!standing(candidate) || !clearOfSwing(candidate)) continue;
      const distance = Math.hypot(candidate.x - this.position.x, candidate.z - this.position.z);
      if (distance < bestDistance) { best = candidate; bestDistance = distance; }
    }
    return best ? { ...best } : null;
  }

  /** Exempt only the selected cushion; walls, tables and other chairs still block entry. */
  private approachClear(target: VillaPosition, seatId?: string): boolean {
    if (!this.scene) return false;
    const from = this.groundPosition(), obstacles = seatId ? this.scene.colliders.filter(collider => villaSeatColliderId(collider) !== seatId) : this.scene.colliders;
    const steps = Math.max(1, Math.ceil(Math.hypot(target.x - from.x, target.z - from.z) / .1));
    let height = from.y;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = from.x + (target.x - from.x) * t, z = from.z + (target.z - from.z) * t;
      const support = this.supportAt(x, z, height, 1.75);
      if (support == null || villaCollides({ x, y: support, z }, obstacles, 1.75)) return false;
      height = support;
    }
    return Math.abs(height - target.y) <= .1;
  }

  private requestCarAccess(id: VillaRoadVehicle = this.state.seated === 'pickup' ? 'pickup' : this.state.seated === 'suv' ? 'suv' : 'car') {
    const zh = this.isZhLang(), leaving = this.state.seated === id;
    if (this.transition || this.enterCarAt !== Infinity || this.exitCarAt !== Infinity) return;
    if (this.state.outdoor.camping.carried) { this.message(zh ? '请先放下露营椅。' : 'Put the camping chair down first.'); return; }
    if (Math.abs(this.roadState(id).speed) > .12) { this.message(zh ? '请先刹停，再打开车门。' : 'Stop the car before opening the door.'); return; }
    if (!leaving && !this.atDriverDoor(id)) {
      this.message(zh ? '请走到驾驶位车门旁再上车。' : 'Walk up to the driver door to get in.'); return;
    }
    if (!(leaving ? this.roadSafeExit(id) : this.roadExitClear(id))) {
      // The swing is blocked: back the player off to a clear spot first, then
      // open. Only a genuinely sealed bay has no such spot.
      const spot = this.stepBackFromDriverDoor(id);
      if (!spot) {
        this.message(zh ? '车门完全被挡住了，请把车挪到空旷位置。' : 'The door has no room to open. Move the vehicle to a clear space.'); return;
      }
      this.beginDoorStepBack(spot, id, leaving);
      return;
    }
    if (this.accessVehicle !== id) this.cancelCarAccess();
    this.clearInput(); this.accessVehicle = id; this.closeCarAt = Infinity; this.setRoadDoor(id, true);
    const readyAt = this.time + Math.max(.02, (1 - this.roadDoorProgress(id)) * CAR_DOOR_SECONDS);
    if (leaving) this.exitCarAt = readyAt; else this.enterCarAt = readyAt;
    this.message(zh ? (leaving ? '正在开门，下车后会自动关门…' : '正在开门，随后自动坐进驾驶位…')
      : (leaving ? 'Opening the door. Step out, then it closes automatically…' : 'Opening the door, then taking the driver seat automatically…'));
    this.scene?.updateActivities(this.time, this.state, this.groundPosition(), this.yaw); this.publishState();
  }

  /** Glide the player clear of the blocked swing, then run the normal door
   * sequence, so the player sees the character step back instead of a refusal. */
  private beginDoorStepBack(spot: VillaPosition, id: VillaRoadVehicle, leaving: boolean) {
    const from = this.groundPosition();
    this.clearInput(); this.transition = null;
    this.doorStepBack = { from: { ...from }, to: { ...spot }, at: this.time, seconds: .45 };
    this.doorStepBackLeaving = leaving; this.doorStepBackVehicle = id;
    this.message(this.isZhLang() ? '车门会挡住，先退开一点再开门。' : 'The door would be blocked, so step back first.');
    this.publishState();
  }

  private toggleCampingCarry() {
    const zh = this.isZhLang();
    if (this.state.seated || this.motion.offset > .001 || this.motion.velocity) return;
    if (this.state.outdoor.camping.carried) {
      const placed = placeVillaCampingChair(this.state.outdoor, this.groundPosition(), this.yaw, this.scene?.colliders ?? []);
      this.message(zh ? (placed ? '露营椅已放稳，可以坐下。' : '这里放不稳，请找一块空旷平整的地面。')
        : (placed ? 'Chair placed safely. Take a seat.' : 'Find clear, level ground to place the chair.'));
    } else if (this.hotspot()?.id === 'camping-chair') {
      const chair = villaCampingSeat(this.state.outdoor);
      if (this.approachClear(chair.seat, chair.id) && pickUpVillaCampingChair(this.state.outdoor, this.groundPosition()))
        this.message(zh ? '已拿起露营椅，走到喜欢的地方再放下。' : 'Carrying the chair. Find your favourite spot.');
      else this.message(zh ? '请走近露营椅，不要隔着障碍搬动。' : 'Move closer with a clear reach to the chair.');
    }
    this.scene?.updateActivities(this.time, this.state, this.groundPosition(), this.yaw); this.publishState();
  }

  private secondaryInteraction() {
    if (this.transition || this.enterCarAt !== Infinity || this.exitCarAt !== Infinity) return;
    const id = this.hotspot()?.id;
    if (this.state.outdoor.camping.carried || (!this.state.seated && id === 'camping-chair')) { this.toggleCampingCarry(); return; }
    if (this.state.seated === 'car' || this.state.seated === 'pickup' || this.state.seated === 'suv' || (!this.state.seated && (id === 'car' || id === 'pickup' || id === 'suv'))) {
      this.requestCarAccess((this.state.seated as VillaRoadVehicle) ?? id); return;
    } else if (this.state.relaxSeatId === 'chair-pc' || (!this.state.seated && id === 'chair-pc')) {
      this.state.gaming = !this.state.gaming;
    } else if (this.state.seated === 'racing' || (!this.state.seated && (id === 'media' || id === 'racing'))) {
      this.state.screenSource = nextVillaScreen(this.state.screenSource);
      const name = this.state.screenSource === 'pc' ? 'PC' : this.state.screenSource === 'ps' ? 'PlayStation' : 'Switch';
      this.message(this.isZhLang() ? `大屏虚拟信号源：${name}` : `Virtual screen input: ${name}`);
    }
    this.scene?.updateActivities(this.time, this.state); this.publishState();
  }

  private interactionHint(): string | null {
    const zh = this.isZhLang();
    if (this.enterCarAt !== Infinity || this.exitCarAt !== Infinity) return zh ? '车门正在打开，随后自动进出…' : 'Opening the door, then stepping through…';
    if (this.inElevator()) {
      const lift = this.state.elevator;
      if (lift.phase === 'open') return zh ? '1 / 2 / 3 选择楼层 · 开门后步行进出' : '1 / 2 / 3 select floor · Walk through open doors';
      if (lift.phase === 'closed') return zh ? 'E 打开电梯门' : 'E open elevator doors';
      return zh ? `电梯 → ${lift.target + 1}F · 请稍候，可自由环顾` : `Elevator → ${lift.target + 1}F · Please wait, look around`;
    }
    if (this.state.snookerActive) return zh ? '鼠标 / ←→ 瞄准 · ↑↓ 力度 · 空格击球 · R 重摆 · E 离开' : 'Mouse / ←→ aim · ↑↓ power · Space shoot · R reset · E leave';
    if (this.state.seated === 'car' || this.state.seated === 'pickup' || this.state.seated === 'suv') {
      if (this.state.park[this.state.seated].active) return zh ? '自动泊车中 · 按任意驾驶键接管' : 'Auto-parking · press any driving key to take over';
      return zh ? 'W/S 前进倒车 · A/D 转向 · 空格手刹 · 停稳后 E 下车 · R 复位' : 'W/S drive/reverse · A/D steer · Space handbrake · E exit when stopped · R reset';
    }
    if (this.state.seated === 'racing') return zh ? `拉力赛 · W 油门 / S 刹车 · A/D 转向 · 空格手刹 · E 起身 · Q ${this.state.screenSource.toUpperCase()}` : `Rally · W throttle / S brake · A/D steer · Space handbrake · E exit · Q ${this.state.screenSource.toUpperCase()}`;
    if (this.state.seated === 'scooter') return zh ? 'W 加速 · S 刹车 · A/D 转向 · 空格手刹 · 停稳后 E 下车 · R 复位' : 'W accelerate · S brake · A/D steer · Space handbrake · E dismount when stopped · R reset';
    if (this.state.seated) return zh ? '坐下来慢慢看风景 · E 或点离开起身' : 'Sit back and enjoy the view · E or Exit to stand';
    const hotspot = this.hotspot();
    if (!hotspot) return null;
    if (hotspot.id === 'car') return zh ? 'E 或 Q 开门并自动入座' : 'E or Q opens the door and seats you automatically';
    return `E  ${zh ? hotspot.zh : hotspot.name}`;
  }

  private interact() {
    if (this.transition || this.enterCarAt !== Infinity || this.exitCarAt !== Infinity) { this.message(this.isZhLang() ? '正在切换位置，请稍候。' : 'Please wait for the movement to finish.'); return; }
    if (this.motion.offset > .001 || this.motion.velocity) { this.message(this.isZhLang() ? '请先落地，再互动。' : 'Land before interacting.'); return; }
    if (this.state.snookerActive) {
      const from = this.view(); this.state.snookerActive = false; this.transition = { from, at: this.time }; this.clearInput(); this.publishState(); return;
    }
    const hotspot = this.hotspot();
    const zh = this.isZhLang();
    if (this.inElevator()) {
      if (this.state.elevator.phase === 'closed') requestVillaElevator(this.state.elevator, this.state.elevator.floor);
      this.message(this.interactionHint() ?? ''); this.publishState(); return;
    }
    if (this.state.outdoor.camping.carried) { this.toggleCampingCarry(); return; }
    if (this.state.seated === 'car' || this.state.seated === 'pickup' || this.state.seated === 'suv') { this.requestCarAccess(this.state.seated); return; }
    if (this.state.seated) { this.leaveSeat(); this.publishState(); return; }
    // Pressing Use with nothing in range is a no-op, not an error: the proximity
    // badges already say what is reachable, so a toast here is only noise.
    if (!hotspot) return;
    const rest = villaOutdoorSeat(this.state.outdoor, hotspot.id) ?? villaRelaxSeat(hotspot.id);
    if (rest) {
      if (this.approachClear(resolveVillaSeatPosition(rest, this.groundPosition()), rest.id)) this.takeRelaxSeat(rest.id);
      else this.message(zh ? '请从座位前方或侧面靠近，不要隔着家具入座。' : 'Approach the front or side of the seat, without furniture in between.');
      this.publishState(); return;
    }
    if (VILLA_WARDROBES.some(wardrobe => wardrobe.id === hotspot.id)) {
      toggleVillaWardrobe(this.state.wardrobes, hotspot.id);
      this.message(zh ? (this.state.wardrobes.wardrobes[hotspot.id].open ? '正在打开衣柜。' : '正在关闭衣柜。') : (this.state.wardrobes.wardrobes[hotspot.id].open ? 'Opening the wardrobe.' : 'Closing the wardrobe.'));
      this.scene?.updateActivities(this.time, this.state, this.groundPosition(), this.yaw); this.publishState(); return;
    }
    const pet = this.state.pets.pets.find(p => `pet-${p.id}` === hotspot.id);
    if (pet) {
      const labels = villaPetLabel(pet), name = zh ? labels.zh : labels.en;
      if (feedVillaPet(this.state.pets, pet.id)) this.message(zh ? `给${name}添了${labels.foodZh}。` : `${name} has some ${labels.foodEn.toLowerCase()}.`);
      else this.message(zh ? (pet.cooldown > 0 ? `${name}吃饱了，先歇一会儿。` : '再靠近一点，等它停稳。')
        : (pet.cooldown > 0 ? `${name} is full. Let it rest a little.` : 'Come a little closer and let it settle.'));
      this.scene?.updatePets(this.time, this.state.pets); this.publishState(); return;
    }
    switch (hotspot.id) {
      case 'tea-bar': {
        const action = interactVillaTea(this.state.tea);
        if (action === 'brewing') { this.state.teaUntil = this.time + VILLA_TEA_BAR.duration; this.message(zh ? '从空杯开始，慢慢冲一杯茶。' : 'Brewing a fresh cup from empty.'); }
        else if (action === 'drinking') this.message(zh ? '端起茶杯，慢慢喝。' : 'Lift the cup and enjoy the tea.');
        else this.message(zh ? (this.state.tea.phase === 'brewing' ? '茶正在泡着，稍等片刻。' : '正在喝茶。') : (this.state.tea.phase === 'brewing' ? 'The tea is steeping.' : 'Enjoying the tea.'));
        break;
      }
      case 'faucet':
        this.state.faucetOn = !this.state.faucetOn;
        this.message(zh ? (this.state.faucetOn ? '水龙头打开了，清水流入水槽。' : '水龙头关好了。') : (this.state.faucetOn ? 'Fresh water is flowing into the sink.' : 'The tap is off.')); break;
      case 'bath-door-west': case 'bath-door-east': {
        const which = hotspot.id === 'bath-door-west' ? 'west' : 'east';
        toggleVillaBathDoor(this.state.bathDoors, which); this.audio.lightClick();
        const open = this.state.bathDoors[which];
        this.message(zh ? (open ? '正在开门，请让开门扇。' : '正在关门，请让开门扇。') : open ? 'Opening. Please keep the swing clear.' : 'Closing. Please keep the swing clear.');
        this.publishState(); break;
      }
      case 'grill-west': case 'grill-centre': case 'grill-east': {
        const index = hotspot.id === 'grill-west' ? 0 : hotspot.id === 'grill-centre' ? 1 : 2;
        this.state.grillLids[index] = !this.state.grillLids[index];
        this.audio.uiSelect();
        this.message(zh ? (this.state.grillLids[index] ? '烤炉盖已打开。' : '烤炉盖已盖上。') : this.state.grillLids[index] ? 'The grill lid is open.' : 'The grill lid is closed.');
        this.publishState(); break;
      }
      case 'snooker': {
        const from = this.view(); this.state.snookerActive = true; this.motion = createVillaMotion();
        this.transition = { from, at: this.time }; this.clearInput();
        this.message(zh ? '练习开始，先瞄准红球。' : 'Ready for practice. Aim for a red.'); break;
      }
      case 'elevator': {
        const accepted = requestVillaElevator(this.state.elevator, villaFloor(this.position.y));
        this.message(zh ? (accepted ? '电梯已呼叫。开门后走入，按 1 / 2 / 3 选层。' : '电梯正在运行，请稍候。')
          : (accepted ? 'Elevator called. Walk inside, then press 1 / 2 / 3.' : 'The elevator is busy. Please wait.'));
        break;
      }
      case 'car': case 'pickup': case 'suv': this.requestCarAccess(hotspot.id); break;
      case 'scooter': {
        const bike = this.state.scooter;
        const clear = villaScooterAnchors(bike).exits.some((exit, i) =>
          villaScooterExitClear(bike, this.scene?.scooterObstacles ?? [], i === 0 ? 1 : -1) && this.approachClear(exit));
        if (clear) this.takeSeat('scooter');
        else this.message(zh ? '请从电动车旁的空旷位置靠近。' : 'Approach a clear side of the electric scooter.');
        break;
      }
      case 'racing':
        if (this.canFit(1.75) && this.approachClear(VILLA_RACING.seat, 'racing')) this.takeSeat('racing');
        else this.message(zh ? '请从没有障碍的一侧靠近模拟器。' : 'Approach the simulator through a clear route.');
        break;
      case 'media': this.secondaryInteraction(); break;
      case 'figures': case 'replicas':
        this.state.displayLights = !this.state.displayLights;
        this.message(zh ? (this.state.displayLights ? '收藏柜灯光已开启。' : '收藏柜灯光已关闭。') : (this.state.displayLights ? 'Collection lights on.' : 'Collection lights off.')); break;
      case 'aquarium':
        this.state.fedUntil = this.time + 8;
        this.message(zh ? '小鱼们游过来了。今天也要好好吃饭。' : 'The fish gather for dinner. A little everyday happiness.'); break;
      case 'fireplace':
        this.state.fireplace = !this.state.fireplace;
        this.message(zh ? (this.state.fireplace ? '炉火亮起来了，屋子又暖了一点。' : '壁炉已经熄灭。') : (this.state.fireplace ? 'The fire is lit. A little warmer, a little slower.' : 'The fireplace is off.')); break;
      case 'gaming':
        this.state.gaming = !this.state.gaming;
        this.message(zh ? (this.state.gaming ? '电竞设备已开启，今晚一起玩。' : '设备已关闭，好好休息。') : (this.state.gaming ? 'The setup is on. One more game together?' : 'Screens off. Time to unwind.')); break;
      case 'tea': this.message(zh ? '热茶刚好。把今天的疲惫留在门外。' : 'Your tea is warm. Leave the busy day at the door.'); break;
      case 'roof': setVillaTimeOfDay(this.state.home, 'evening'); this.message(zh ? '晚风、灯串，还有一个属于你的家。' : 'An evening breeze, warm lights, and a place of your own.'); break;
    }
    this.publishState();
  }

  private hit(point: Point, b: { x: number; y: number; w: number; h: number }) {
    return point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h;
  }

  private clickUi(point: Point): boolean {
    if (this.terminal?.visible) return true;
    if (this.mapOpen || this.helpOpen) {
      const p = this.panelRect();
      if (!this.hit(point, p) || this.hit(point, this.closeButton())) {
        this.mapOpen = false; this.clearInput(); this.mouseLookEnabled = true; this.publishState(); return true;
      }
      if (this.mapOpen) {
        const tab = this.mapTabs().find(tab => this.hit(point, tab));
        if (tab) { this.mapFloor = Number(tab.id); this.publishState(); }
      }
      return true;
    }
    const button = this.buttons().find(b => this.hit(point, b));
    if (button) { this.activate(button.id); return true; }
    if (this.touchMode && !this.immersive) {
      const s = this.uiScale(), circle = villaUseCircle(this.width, this.height, s, this.state.snookerActive, this.safe());
      if (Math.hypot(point.x - circle.x, point.y - circle.y) < circle.radius + 2 * s) { this.use(); return true; }
    }
    return false;
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (!this.running) return;
    if (['keydown', 'mousedown', 'touchstart', 'touchend'].includes(e.type)) this.primeAudio(e);
    if (e instanceof KeyboardEvent) {
      const key = e.key.toLowerCase();
      if (e.type === 'keyup') { this.keys.delete(key); return; }
      const target = e.target instanceof Element ? e.target : null;
      if (this.shellOpen() || target?.closest('input, textarea, select, [contenteditable="true"], .header-actions')) { this.clearInput(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(key)) {
        e.preventDefault(); if (!this.mapOpen && !this.terminal?.visible && !this.helpOpen) this.keys.add(key); return;
      }
      if (key === ' ') {
        e.preventDefault();
        if (!this.mapOpen && !this.terminal?.visible && !this.helpOpen) {
          if (this.drivingSeat()) this.keys.add(key);
          else if (!this.state.seated && !e.repeat) this.activate(this.state.snookerActive ? 'shoot' : 'jump');
        }
        return;
      }
      if (e.repeat) return;
      if (key === 'escape') {
        if (this.terminal?.visible) { this.setTerminal(false); return; }
        const wasPanel = this.mapOpen || this.terminal?.visible || this.helpOpen;
        this.mapOpen = false; this.clearInput(); this.unlock(); this.mouseLookEnabled = wasPanel;
      }
      else if (this.mapOpen && ['1', '2', '3'].includes(key)) this.mapFloor = Number(key) - 1;
      else if (!this.helpOpen && ['1', '2', '3'].includes(key) && this.inElevator()) this.selectElevatorFloor(Number(key) - 1);
      else if (!this.helpOpen && (key === 'o' || key === 'k') && this.inElevator()) this.controlElevatorDoor(key === 'o');
      // Under pointer lock the browser reports no cursor, so the HUD is only
      // mouse-reachable once the lock is released. Tab does exactly that and
      // Tab again (or a click on the world) takes the lock back.
      else if (key === 'tab' && !this.mapOpen && !this.terminal?.visible && !this.helpOpen) {
        e.preventDefault();
        if (document.pointerLockElement === this.canvas) { this.unlock(); this.mouseLookEnabled = false; this.message(this.isZhLang() ? '鼠标已释放：可以点击终端、地图和页面按钮。再按 Tab 或点击画面回到视角控制。' : 'Mouse freed: click the terminal, map or page buttons. Tab or a click on the world returns to camera control.'); }
        else this.lockPointer();
      }
      else if (key === 'p') { e.preventDefault(); this.activate('terminal'); }
      else if (key === 'v') {
        const target = this.state.seated === 'car' || this.state.seated === 'pickup' || this.state.seated === 'suv'
          ? this.state.seated : this.nearestParkVehicle();
        if (target) this.parkVehicleHome(target);
        else this.message(this.isZhLang() ? '附近没有可以自动泊车的车辆。' : 'No car nearby that can park itself.');
      }
      else if (key === 'm') this.activate('map');
      else if (key === 't') this.activate('time');
      else if (key === 'h') this.activate('home');
      else if (key === '?' || key === '/') this.activate('help');
      else if (key === 'e' && !this.mapOpen && !this.terminal?.visible && !this.helpOpen) this.interact();
      else if (key === 'q' && !this.mapOpen && !this.terminal?.visible && !this.helpOpen) this.secondaryInteraction();
      else if (key === 'l' && !this.mapOpen && !this.terminal?.visible && !this.helpOpen) this.lockPointer();
      else if (key === 'i') this.activate('immersion');
      else if (key === 'c' && !this.mapOpen && !this.terminal?.visible && !this.helpOpen) this.activate('crouch');
      else if (key === 'r' && !this.mapOpen && !this.terminal?.visible && !this.helpOpen) this.activate('reset-activity');
      this.publishState();
    } else if (e instanceof MouseEvent) {
      if (this.shellOpen()) return;
      const point = this.canvasPoint(e.clientX, e.clientY);
      if (document.pointerLockElement === this.canvas) {
        // Locked: the browser reports no cursor position, so a click acts through
        // the crosshair — in the car it presses the aimed panel button.
        if (e.type === 'mousedown' && e.button === 0) {
          const aimed = this.elevatorAimButton();
          if (aimed) this.activate(aimed.id);
        }
        return;
      }
      if (e.type === 'mousedown' && e.button === 0) {
        if (this.clickUi(point)) return;
        this.mouseLookEnabled = true; this.lastMouse = point; this.lockPointer();
      } else if (e.type === 'mousemove') {
        const overControl = this.buttons().some(b => this.hit(point, b));
        if (this.mouseLookEnabled && this.lastMouse && !this.mapOpen && !this.terminal?.visible && !this.helpOpen && !overControl) {
          const sensitivity = LOCK_LOOK_SENSITIVITY * (this.canvas.clientWidth || this.width) / this.width;
          this.look(point.x - this.lastMouse.x, point.y - this.lastMouse.y, sensitivity);
        }
        this.lastMouse = point;
      }
    } else if (e instanceof TouchEvent) {
      e.preventDefault(); this.touchMode = true;
      for (const touch of Array.from(e.changedTouches)) {
        const point = this.canvasPoint(touch.clientX, touch.clientY);
        if (e.type === 'touchend' || e.type === 'touchcancel') {
          this.touchActions.delete(touch.identifier);
          if (this.joystick?.id === touch.identifier) this.joystick = null;
          if (this.lookTouch?.id === touch.identifier) this.lookTouch = null;
        } else if (e.type === 'touchstart') {
          const button = !this.mapOpen && !this.terminal?.visible && !this.helpOpen && this.buttons().find(b => this.hit(point, b));
          if (button && ['brake', 'aim-left', 'aim-right', 'power-up', 'power-down'].includes(button.id)) {
            this.touchActions.set(touch.identifier, button.id); continue;
          }
          if (this.clickUi(point)) continue;
          if (point.x < this.width * 0.44 && !this.joystick && (!this.state.seated || this.drivingSeat())) this.joystick = { id: touch.identifier, origin: point, point };
          else if (!this.lookTouch) this.lookTouch = { id: touch.identifier, point };
        } else if (e.type === 'touchmove') {
          if (this.joystick?.id === touch.identifier) this.joystick.point = point;
          if (this.lookTouch?.id === touch.identifier) {
            this.look(point.x - this.lookTouch.point.x, point.y - this.lookTouch.point.y, TOUCH_LOOK_SENSITIVITY); this.lookTouch.point = point;
          }
        }
      }
    }
  }

  private rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius = 8) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
  }

  draw(ctx: CanvasRenderingContext2D) {
    this.syncUseButton();
    const zh = this.isZhLang(), dark = this.isDarkTheme();
    if (zh !== this.lastLang || this.touchMode !== this.lastTouchMode) {
      this.lastLang = zh; this.lastTouchMode = this.touchMode;
      this.canvas.setAttribute('aria-label', this.touchMode
        ? (zh ? `暖居别墅 ${VILLA_VERSION}。左杆移动，右侧拖动环顾，靠近物品点互动。点位置信息打开导览图，点终端操控智能家居，点 ? 查看完整操作。` : `Warm Villa ${VILLA_VERSION}. Left stick moves, right drag looks, Use interacts nearby. Tap the location for the map, Terminal for smart controls, or ? for all controls.`)
        : (zh ? `暖居别墅 ${VILLA_VERSION}。坐北朝南的 3D 漫游。WASD 移动，E 靠近互动，P 智能终端，M 导览图，? 查看完整操作。` : `Warm Villa ${VILLA_VERSION}. A south-facing 3D home. WASD moves, E interacts nearby, P opens the smart terminal, M opens the map, ? shows all controls.`));
    }
    ctx.fillStyle = dark ? '#252e2e' : '#d9d4c9'; ctx.fillRect(0, 0, this.width, this.height);
    if (this.terminal?.visible) {
      this.canvas.dataset.villaPrompt = '';
      this.terminal.update(this.terminalSnapshot());
      const camera = this.terminal.cameraId;
      if (camera) this.terminal.presentCamera(this.scene?.renderSecurityFeed(camera, this.time, this.state) ?? null);
      return;
    }
    const rendered = this.scene?.render(ctx, this.width, this.height, this.pixelRatio, this.view(), this.time, this.state);
    if (!rendered) {
      ctx.textAlign = 'center'; ctx.fillStyle = dark ? '#f2e9d8' : '#493e30';
      ctx.font = `500 27px ${UI_FONT}`;
      ctx.fillText(zh ? '3D 漫游需要 WebGL 2' : 'This home needs WebGL 2', this.width / 2, this.height / 2 - 25);
      ctx.font = `17px ${UI_FONT}`;
      ctx.fillText(zh ? '请启用浏览器硬件加速，然后从菜单重新开始。' : 'Enable browser hardware acceleration, then restart from the menu.', this.width / 2, this.height / 2 + 18);
      return;
    }
    // A very restrained photographic edge vignette, never page-level chrome.
    const vignette = ctx.createRadialGradient(this.width / 2, this.height * 0.45, this.height * 0.32, this.width / 2, this.height / 2, this.width * 0.7);
    vignette.addColorStop(0, 'rgba(27,21,13,0)'); vignette.addColorStop(1, 'rgba(27,21,13,.17)');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, this.width, this.height);
    this.drawHud(ctx);
    if (this.mapOpen) this.drawMap(ctx);
  }

  private drawHud(ctx: CanvasRenderingContext2D) {
    this.canvas.dataset.villaPrompt = ''; this.canvas.dataset.villaContextFeedback = '';
    const zh = this.isZhLang(), s = this.uiScale(), safe = this.safe(), compact = this.compactHud();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    for (const b of this.buttons()) {
      ctx.fillStyle = b.id === `elevator-${this.state.elevator.target}` ? 'rgba(79,103,69,.92)' : 'rgba(33,35,31,.72)';
      this.rounded(ctx, b.x, b.y, b.w, b.h);
      const fontSize = b.id === 'terminal' ? (b.w <= 44 * s ? 10 : 13) * s : b.id === 'map' ? (compact ? 15 * s : 16) : compact ? 17 * s : 13;
      ctx.fillStyle = '#fff7e9'; ctx.font = `500 ${fontSize}px ${UI_FONT}`;
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2, b.w - 6 * s);
    }
    if (this.immersive) { ctx.textBaseline = 'alphabetic'; return; }
    ctx.textAlign = 'center';
    if (this.touchMode) {
      if (!this.state.snookerActive && (!this.state.seated || this.drivingSeat())) {
      const origin = this.joystick?.origin ?? { x: 78 * s + safe.left, y: this.height - 78 * s - safe.bottom };
      ctx.strokeStyle = 'rgba(255,251,236,.45)'; ctx.lineWidth = 1.5 * s; ctx.fillStyle = 'rgba(29,35,31,.20)';
      ctx.beginPath(); ctx.arc(origin.x, origin.y, 51 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      let dx = (this.joystick?.point.x ?? origin.x) - origin.x, dy = (this.joystick?.point.y ?? origin.y) - origin.y;
      const length = Math.hypot(dx, dy); if (length > 42 * s) { dx *= 42 * s / length; dy *= 42 * s / length; }
      ctx.fillStyle = 'rgba(255,251,236,.45)'; ctx.beginPath(); ctx.arc(origin.x + dx, origin.y + dy, 20 * s, 0, Math.PI * 2); ctx.fill();
      ctx.font = `${12 * s}px ${UI_FONT}`; ctx.fillStyle = '#fffaee'; ctx.fillText(this.state.seated ? (zh ? '驾驶' : 'Drive') : (zh ? '行走' : 'Walk'), origin.x, origin.y + 68 * s);
      }
      const use = villaUseCircle(this.width, this.height, s, this.state.snookerActive, safe);
      ctx.fillStyle = this.time < this.usePressedUntil ? 'rgba(88,129,72,.95)' : 'rgba(33,35,31,.60)';
      ctx.beginPath(); ctx.arc(use.x, use.y, use.radius, 0, Math.PI * 2); ctx.fill();
      ctx.font = `500 ${15 * s}px ${UI_FONT}`; ctx.fillStyle = '#fff7e9'; ctx.fillText(this.state.seated || this.state.snookerActive ? (zh ? '离开' : 'Exit') : (zh ? '互动' : 'Use'), use.x, use.y);
    } else if (!this.state.snookerActive) {
      ctx.fillStyle = 'rgba(255,251,238,.65)'; ctx.beginPath(); ctx.arc(this.width / 2, this.height / 2, 2, 0, Math.PI * 2); ctx.fill();
    }
    this.drawActivityHud(ctx);
    this.drawInteractionPrompt(ctx); this.drawContextFeedback(ctx);
    // No bottom instruction bar: only proximity badges and actual activity HUDs.
    ctx.textBaseline = 'alphabetic';
  }

  /** A short-lived response to the player's own action, never a persistent
   *  bottom instruction bar. It attaches to the occupied object when there is
   *  one, and otherwise appears as a brief centred toast. */
  private drawContextFeedback(ctx: CanvasRenderingContext2D) {
    if (this.mapOpen || this.helpOpen || this.terminal?.visible || this.shellOpen() || this.time >= this.toastUntil || !this.toast) return;
    const active = this.state.relaxSeatId ?? this.state.seated ?? (this.state.snookerActive ? 'snooker' : this.inElevator() ? 'elevator' : null);
    if (active && active !== this.toastTarget) return;
    const s = this.uiScale(), safe = this.safe(); ctx.save(); ctx.font = `500 ${13 * s}px ${UI_FONT}`;
    const maxWidth = Math.min(460 * s, this.width - 32 - safe.left - safe.right);
    const lines = wrapVillaTouchHint(this.toast, maxWidth - 28 * s, text => ctx.measureText(text).width);
    const width = Math.min(maxWidth, Math.max(...lines.map(line => ctx.measureText(line).width)) + 28 * s), height = (18 + 17 * lines.length) * s;
    const x = safe.left + (this.width - safe.left - safe.right - width) / 2;
    const y = active
      ? Math.min(this.height - safe.bottom - height - 12, Math.max(122 + safe.top, this.height * .3))
      : (this.compactHud() ? 12 : 22) + safe.top + 104 * s;
    ctx.globalAlpha = Math.min(1, this.toastUntil - this.time); ctx.fillStyle = 'rgba(32,39,33,.86)'; this.rounded(ctx, x, y, width, height, 8 * s);
    ctx.fillStyle = '#fff7e9'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((line, i) => ctx.fillText(line, x + width / 2, y + height / 2 + (i - (lines.length - 1) / 2) * 17 * s));
    this.canvas.dataset.villaContextFeedback = this.toast; ctx.restore();
  }

  private drawActivityHud(ctx: CanvasRenderingContext2D) {
    const zh = this.isZhLang(), s = this.uiScale(), safe = this.safe(), lines: string[] = [];
    const hudTop = (this.compactHud() ? 12 : 22) + safe.top;
    if (this.state.snookerActive) {
      const table = this.state.snooker;
      const names: Record<string, string> = { red: '红球', color: '任意彩球', yellow: '黄球', green: '绿球', brown: '棕球', blue: '蓝球', pink: '粉球', black: '黑球' };
      const target = zh ? names[table.target] : table.target;
      const fouls: Record<string, string> = { 'Cue ball potted': '白球落袋', 'No object ball hit': '未碰到目标球', 'Wrong first ball': '首碰球不符', 'Wrong ball potted': '落袋球不符' };
      if (this.touchMode) {
        ctx.fillStyle = 'rgba(33,35,31,.76)'; this.rounded(ctx, 8 * s + safe.left, hudTop + 45 * s, 106 * s, 23 * s);
        ctx.textAlign = 'left'; ctx.fillStyle = '#fff7e9'; ctx.font = `${10 * s}px ${UI_FONT}`;
        const complete = table.phase === 'complete', power = `${Math.round(table.power * 100)}%`;
        const status = complete ? (zh ? '清台' : 'Cleared') : table.foul ? (zh ? '犯规' : 'Foul') : target;
        const shortFouls: Record<string, string> = { 'Cue ball potted': 'Scratch', 'No object ball hit': 'No contact', 'Wrong first ball': 'Wrong first', 'Wrong ball potted': 'Wrong pot' };
        const detail = complete ? (zh ? '点重摆再开一局' : 'Tap Reset to restart')
          : table.foul ? `${zh ? fouls[table.foul] : shortFouls[table.foul]} · ${power}`
            : `${table.moving ? (zh ? '滚动中' : 'Rolling') : (zh ? '力度' : 'Power')} ${power}`;
        ctx.fillText(`${zh ? '得分' : 'Score'} ${table.score} · ${status}`, 12 * s + safe.left, hudTop + 52 * s, 105 * s);
        ctx.fillText(detail, 12 * s + safe.left, hudTop + 63 * s, 105 * s);
        ctx.textAlign = 'center'; return;
      }
      lines.push(zh ? '斯诺克 · 单人练习' : 'Snooker · Solo practice', `${zh ? '得分' : 'Score'} ${table.score} · ${zh ? '出杆' : 'Shots'} ${table.shots}`,
        `${zh ? '目标' : 'Target'}: ${target} · ${zh ? '力度' : 'Power'} ${Math.round(table.power * 100)}%`,
        table.moving ? (zh ? '球正在滚动…' : 'Balls rolling…') : table.phase === 'complete' ? (zh ? '清台成功！R 开新局' : 'Table cleared! R for a fresh rack')
          : table.foul ? (zh ? `犯规：${fouls[table.foul] ?? '请按目标击球'}` : table.foul) : (zh ? '先红后彩；彩球清台按顺序' : 'Red, colour; then colours in order'));
    } else if (this.state.seated === 'car' || this.state.seated === 'pickup' || this.state.seated === 'suv' || this.state.seated === 'scooter') {
      const vehicle = this.state.seated === 'scooter' ? this.state.scooter : this.roadState(this.state.seated);
      lines.push(`${vehicle.handbrake ? 'Ⓟ' : vehicle.speed < -.05 ? 'R' : 'D'}  ${Math.abs(vehicle.speed * 3.6).toFixed(0)} km/h`);
      if (vehicle.handbrake) lines.push(zh ? '手刹已拉起' : 'Handbrake applied');
      else if (vehicle.contact) lines.push(zh ? '前方有障碍，请减速调整' : 'Obstacle ahead — stop and adjust');
    }
    if (!lines.length) return;
    const x = (this.touchMode ? 12 : 24) + safe.left, y = this.touchMode ? hudTop + 47 * s : 108 + safe.top, w = this.touchMode ? 168 * s : 294;
    const lineHeight = this.touchMode ? 13 * s : 22, pad = this.touchMode ? 6 * s : 14;
    ctx.fillStyle = 'rgba(33,35,31,.76)'; this.rounded(ctx, x, y, w, pad * 2 + lines.length * lineHeight);
    ctx.fillStyle = '#fff7e9'; ctx.textAlign = 'left'; ctx.font = `${this.touchMode ? 11 * s : 14}px ${UI_FONT}`;
    lines.forEach((line, i) => ctx.fillText(line, x + pad, y + pad + (i + .5) * lineHeight, w - pad * 2));
    ctx.textAlign = 'center';
  }

  private drawInteractionPrompt(ctx: CanvasRenderingContext2D) {
    if (this.mapOpen || this.terminal?.visible || this.helpOpen || this.state.seated || this.state.snookerActive || (this.inElevator() && !this.elevatorAimButton()) || this.motion.offset > .001 || this.promptAlpha < .02) return;
    const target = this.hotspot(); if (!target || !this.scene) return;
    // Hotspots describe where a visitor stands; badges belong on the actual prop,
    // not at that approach point (which can be behind the camera when close).
    const anchors: Partial<Record<VillaHotspot['id'], VillaPosition>> = {
      figures: { x: 2.58, y: 1.4, z: 6.45 }, replicas: { x: 10.35, y: 1.4, z: 3.5 },
      racing: { ...VILLA_RACING.seat, y: 1.3 }, gaming: { x: 7.05, y: 1.5, z: 3.7 },
      media: { ...VILLA_RACING.screen }, snooker: { ...VILLA_SNOOKER.center, y: VILLA_SNOOKER.height + .15 },
      fireplace: { x: -10, y: 1.35, z: .78 }, aquarium: { ...VILLA_AQUARIUM.anchor },
      scooter: { ...villaScooterAnchors(this.state.scooter).seat, y: villaScooterAnchors(this.state.scooter).seat.y + 1.15 },
      'wardrobe-master': { x: target.x, y: VILLA_WARDROBES[0].anchor.y, z: VILLA_WARDROBES[0].anchor.z },
      'fridge-freezer': { x: VILLA_FRIDGE_FREEZER.anchor.x, y: VILLA_FRIDGE_FREEZER.anchor.y, z: VILLA_FRIDGE_FREEZER.anchor.z },
      elevator: { x: VILLA_ELEVATOR.centerX, y: target.y + 1.45, z: VILLA_ELEVATOR.frontZ + .06 },
      faucet: { ...VILLA_FAUCET.outlet, y: 1.4 }, 'tea-bar': VILLA_TEA_BAR.anchor,
    };
    const seat = villaOutdoorSeat(this.state.outdoor, target.id) ?? villaRelaxSeat(target.id);
    const resolved = seat ? resolveVillaSeatPosition(seat, this.groundPosition()) : null;
    const pet = this.state.pets.pets.find(item => `pet-${item.id}` === target.id);
    const anchor = anchors[target.id] ?? (resolved ? { ...resolved, y: resolved.y + .85 }
      : pet ? { x: pet.x, y: pet.y + (pet.kind === 'parrot' ? .53 : .78), z: pet.z }
        : { x: target.x, y: target.y + 1.4, z: target.z });
    anchor.y = Math.min(anchor.y, target.y + villaEyeHeight(this.motion) + .2);
    const point = this.scene.projectInteraction(anchor, this.width, this.height);
    if (!point) { this.canvas.dataset.villaPrompt = ''; return; }
    const zh = this.isZhLang(), s = this.touchMode ? this.uiScale() * .85 : 1, safe = this.safe();
    const labels: Record<string, [string, string]> = { car: ['开门并入座', 'Open & sit'], racing: ['开始拉力赛', 'Rally'], scooter: ['骑电动车', 'Ride scooter'], snooker: ['打斯诺克', 'Play snooker'], elevator: ['呼叫电梯', 'Call lift'], figures: ['开关柜灯', 'Display lights'], replicas: ['开关柜灯', 'Display lights'], fireplace: ['开关壁炉', 'Fireplace'], aquarium: ['喂鱼', 'Feed fish'], gaming: ['开关电脑', 'PC power'], media: ['切换信号', 'Screen input'], tea: ['喝茶', 'Have tea'], roof: ['赏景', 'Enjoy the view'] };
    const label = this.time < this.toastUntil && this.toastTarget === target.id ? this.toast
      : labels[target.id]?.[zh ? 0 : 1] ?? (zh ? target.zh : target.name);
    this.canvas.dataset.villaPrompt = target.id;
    ctx.save(); ctx.globalAlpha = Math.min(1, this.promptAlpha) * .94; ctx.font = `500 ${13 * s}px ${UI_FONT}`; ctx.textBaseline = 'middle';
    const maxWidth = Math.max(90 * s, Math.min(440 * s, this.width - 32 - safe.left - safe.right));
    const lines = wrapVillaTouchHint(label, maxWidth - 54 * s, text => ctx.measureText(text).width);
    const width = Math.min(maxWidth, Math.max(...lines.map(line => ctx.measureText(line).width)) + 54 * s), height = (18 + 16 * lines.length) * s;
    const x = Math.max(16 + safe.left, Math.min(this.width - width - 16 - safe.right, point.x - width / 2));
    const y = Math.max(112 + safe.top, Math.min(this.height - 110 - safe.bottom - height, point.y - height / 2));
    ctx.fillStyle = 'rgba(32,39,33,.82)'; this.rounded(ctx, x, y, width, height, 7 * s);
    ctx.strokeStyle = 'rgba(241,239,215,.62)'; ctx.lineWidth = s; ctx.beginPath(); ctx.roundRect(x + 6 * s, y + (height - 22 * s) / 2, 22 * s, 22 * s, 4 * s); ctx.stroke();
    ctx.fillStyle = '#fff7e9'; ctx.textAlign = 'center'; ctx.fillText(this.touchMode ? '·' : 'E', x + 17 * s, y + height / 2);
    ctx.textAlign = 'left'; lines.forEach((line, i) => ctx.fillText(line, x + 36 * s, y + height / 2 + (i - (lines.length - 1) / 2) * 16 * s)); ctx.restore();
  }

  private panel(ctx: CanvasRenderingContext2D, title: string, compact = false) {
    const p = this.panelRect(), dark = this.isDarkTheme();
    ctx.fillStyle = 'rgba(19,27,24,.66)'; ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = dark ? '#222d28' : '#f4efe4'; this.rounded(ctx, p.x, p.y, p.w, p.h, 12);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = dark ? '#f5eddf' : '#3e4b40';
    if (!compact) { ctx.font = `500 25px ${UI_FONT}`; ctx.fillText(title, p.x + 28, p.y + 42); }
    const close = this.closeButton();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${28 * (compact ? this.uiScale() : 1)}px ${UI_FONT}`;
    ctx.fillText('×', close.x + close.w / 2, close.y + close.h / 2);
    ctx.textBaseline = 'alphabetic';
    return p;
  }

  private drawEstateMap(ctx: CanvasRenderingContext2D, panel: { x: number; y: number; w: number; h: number }, compact: boolean) {
    const zh = this.isZhLang(), dark = this.isDarkTheme(), s = this.uiScale(), b = VILLA_ESTATE_BOUNDS;
    const top = panel.y + (compact ? 57 * s : 133), height = Math.max(20, panel.h - (compact ? 84 * s : 167));
    const scale = Math.min(Math.max(20, panel.w - 36 * s) / (b.maxX - b.minX), height / (b.maxZ - b.minZ));
    const left = panel.x + (panel.w - (b.maxX - b.minX) * scale) / 2;
    const mx = (x: number) => left + (x - b.minX) * scale, mz = (z: number) => top + (z - b.minZ) * scale;
    const rect = (minX: number, maxX: number, minZ: number, maxZ: number, color: string) => {
      ctx.fillStyle = color; ctx.fillRect(mx(minX), mz(minZ), (maxX - minX) * scale, (maxZ - minZ) * scale);
    };
    ctx.save(); ctx.beginPath(); ctx.rect(left, top, (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale); ctx.clip();
    rect(b.minX, b.maxX, b.minZ, b.maxZ, dark ? '#344736' : '#dce4ca');
    ctx.strokeStyle = dark ? '#9eab86' : '#bac895'; ctx.lineWidth = Math.max(1, scale * .35);
    for (const radius of [16, 23, 30]) { ctx.beginPath(); ctx.ellipse(mx(14), mz(124), radius * scale, radius * 1.2 * scale, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.strokeStyle = '#626b63'; ctx.lineWidth = VILLA_SCENIC_ROAD.width * scale; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const path of VILLA_ESTATE_ROAD_PATHS) {
      ctx.beginPath(); path.forEach((point, i) => { if (i) ctx.lineTo(mx(point.x), mz(point.z)); else ctx.moveTo(mx(point.x), mz(point.z)); }); ctx.stroke();
    }
    rect(VILLA_GARAGE_EXTENT.minX, VILLA_GARAGE_EXTENT.maxX, VILLA_GARAGE_EXTENT.maxZ, VILLA_GARAGE_EXTENT.maxZ + 3, '#626b63');
    rect(WEST.outer, EAST.outer, NORTH.outer, SOUTH.outer, dark ? '#c2b79c' : '#ece1c9');
    rect(VILLA_GARAGE_EXTENT.minX, VILLA_GARAGE_EXTENT.maxX, VILLA_GARAGE_EXTENT.minZ, VILLA_GARAGE_EXTENT.maxZ, '#aaa58f');
    rect(POOL.minX, POOL.maxX, POOL.minZ, POOL.maxZ, '#75afb6');
    for (const field of VILLA_ESTATE_FIELDS) rect(field.minX, field.maxX, field.minZ, field.maxZ, field.crop === 'lavender' ? '#978ca1' : field.crop === 'corn' ? '#a2aa64' : '#7e9463');
    const pond = VILLA_POND_BOUNDS;
    ctx.fillStyle = '#70a3a4'; ctx.beginPath(); ctx.ellipse(mx((pond.minX + pond.maxX) / 2), mz((pond.minZ + pond.maxZ) / 2), (pond.maxX - pond.minX) * scale / 2, (pond.maxZ - pond.minZ) * scale / 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.font = `500 ${Math.min(12 * s, Math.max(9, scale * 4.8))}px ${UI_FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = dark ? '#fff2d9' : '#354a3b';
    for (const [x, z, en, cn] of [[0, 0, 'Home', '主屋'], [39.6, -6, 'Garage', '车库'], [-17.6, 48, 'Fields', '田地'], [-13, 78, 'Pond', '池塘'], [14, 126, 'Viewpoint', '缓坡观景']] as const) ctx.fillText(zh ? cn : en, mx(x), mz(z), Math.max(34, 20 * scale));
    const vehicle = (pose: { x: number; z: number; yaw: number }, color: string, width: number, length: number) => {
      ctx.save(); ctx.translate(mx(pose.x), mz(pose.z)); ctx.rotate(-pose.yaw); ctx.fillStyle = color;
      ctx.fillRect(-width * scale / 2, -length * scale / 2, Math.max(3, width * scale), Math.max(4, length * scale)); ctx.restore();
    };
    vehicle(this.state.driving, '#d9e3dc', 1.9, 4.72); vehicle(this.state.pickup, '#a28b69', 2.4, 5.72); vehicle(this.state.suv, '#4a6b8f', 1.98, 4.92); vehicle(this.state.scooter, '#839d8a', .8, 1.8);
    for (const pet of this.state.pets.pets) { ctx.fillStyle = '#edd6a0'; ctx.beginPath(); ctx.arc(mx(pet.x), mz(pet.z), 2, 0, Math.PI * 2); ctx.fill(); }
    ctx.save(); ctx.translate(mx(this.position.x), mz(this.position.z)); ctx.rotate(-this.yaw); ctx.fillStyle = '#d1774d'; ctx.strokeStyle = '#fff8e9'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5.5, 5.5); ctx.lineTo(0, 2); ctx.lineTo(-5.5, 5.5); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); ctx.restore();
    ctx.fillStyle = dark ? '#d1d4c0' : '#5b6654'; ctx.font = `${12 * s}px ${UI_FONT}`; ctx.textAlign = 'left';
    ctx.fillText(zh ? '↑ 北 N' : '↑ N', panel.x + 14 * s, top + 17 * s);
    ctx.fillText(zh ? '南 S ↓' : 'S ↓', panel.x + 14 * s, top + 39 * s);
    ctx.fillText(zh ? '西：田地与池塘 · 东：车库 · 南：缓坡环路' : 'West: fields & pond · East: garage · South: scenic hills', panel.x + 8 * s, panel.y + panel.h - 12 * s, panel.w - 16 * s);
  }

  private drawMap(ctx: CanvasRenderingContext2D) {
    const zh = this.isZhLang(), dark = this.isDarkTheme(), s = this.uiScale();
    const compact = this.compactHud();
    const p = this.panel(ctx, zh ? '家的导览图' : 'Find your way home', compact);
    for (const tab of this.mapTabs()) {
      const selected = Number(tab.id) === this.mapFloor;
      ctx.fillStyle = selected ? (dark ? '#b9c9ad' : '#46614e') : (dark ? '#344039' : '#e2dfd2');
      this.rounded(ctx, tab.x, tab.y, tab.w, tab.h);
      ctx.fillStyle = selected ? (dark ? '#24342b' : '#ffffff') : (dark ? '#eee5d5' : '#4b5a4c');
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${15 * s}px ${UI_FONT}`;
      ctx.fillText(tab.label, tab.x + tab.w / 2, tab.y + tab.h / 2);
    }
    ctx.textBaseline = 'alphabetic';
    if (this.mapFloor === -1) { this.drawEstateMap(ctx, p, compact); return; }
    // Plan bounds derive from the envelope so a resized house cannot fall off
    // the map; the ground floor also spans the garage.
    const shell = { minX: WEST.outer - 2, maxX: EAST.outer + 2, minZ: NORTH.outer - 2, maxZ: SOUTH.outer + 3 };
    const groundWest = Math.min(shell.minX, POOL.minX - 2);
    const range = this.mapFloor === 0
      ? { x: groundWest, z: shell.minZ, w: VILLA_GARAGE_EXTENT.maxX + 3 - groundWest, d: 25 - shell.minZ }
      : { x: shell.minX, z: shell.minZ, w: shell.maxX - shell.minX, d: shell.maxZ - shell.minZ };
    const scale = Math.min((p.w - 50) / range.w, (p.h - (compact ? 80 * s : 185)) / range.d);
    const left = p.x + (p.w - range.w * scale) / 2, top = p.y + (compact ? 57 * s : 133);
    const mx = (x: number) => left + (x - range.x) * scale;
    const mz = (z: number) => top + (z - range.z) * scale;
    ctx.fillStyle = dark ? '#344736' : '#dce4ca';
    ctx.fillRect(mx(range.x), mz(range.z), range.w * scale, range.d * scale);
    ctx.fillStyle = dark ? '#707466' : '#ebe1ce';
    ctx.fillRect(mx(WEST.inner), mz(NORTH.inner), (EAST.inner - WEST.inner) * scale, (SOUTH.inner - NORTH.inner) * scale);
    if (this.mapFloor === 0) {
      ctx.fillStyle = '#78b6bc'; ctx.fillRect(mx(POOL.minX), mz(POOL.minZ), (POOL.maxX - POOL.minX) * scale, (POOL.maxZ - POOL.minZ) * scale);
      ctx.fillStyle = '#37505a'; ctx.font = `${12 * s}px ${UI_FONT}`; ctx.fillText(zh ? '泳池' : 'Pool', mx((POOL.minX + POOL.maxX) / 2), mz((POOL.minZ + POOL.maxZ) / 2), 7 * scale);
      ctx.fillStyle = '#e9dfcb'; ctx.fillRect(mx(-1.7), mz(9), 3.4 * scale, 14 * scale);
      // Plot the actual paths, not the obsolete x=16.2 driveway through the house.
      ctx.save(); ctx.beginPath(); ctx.rect(mx(range.x), mz(range.z), range.w * scale, range.d * scale); ctx.clip();
      ctx.strokeStyle = '#85897d'; ctx.lineJoin = 'round';
      for (const path of VILLA_ESTATE_ROAD_PATHS) {
        ctx.lineWidth = (path === VILLA_GARAGE_DRIVE ? VILLA_SCENIC_ROAD.drivewayWidth : VILLA_SCENIC_ROAD.width) * scale;
        ctx.beginPath(); path.forEach((point, index) => index ? ctx.lineTo(mx(point.x), mz(point.z)) : ctx.moveTo(mx(point.x), mz(point.z))); ctx.stroke();
      }
      ctx.fillStyle = '#85897d'; ctx.fillRect(mx(29), mz(2), 21.2 * scale, 3 * scale); ctx.restore();
      for (const bed of VILLA_VEGETABLE_BEDS) {
        ctx.fillStyle = '#75634c'; ctx.fillRect(mx(bed.x - bed.w / 2), mz(bed.z - bed.d / 2), bed.w * scale, bed.d * scale);
        ctx.fillStyle = '#a4b475'; ctx.fillRect(mx(bed.x - bed.w / 2) + 1, mz(bed.z - bed.d / 2) + 1, Math.max(1, bed.w * scale - 2), Math.max(1, bed.d * scale - 2));
      }
      ctx.fillStyle = dark ? '#f3e7c4' : '#3c4b3e'; ctx.textAlign = 'center'; ctx.font = `${this.touchMode ? 10 * s : 12}px ${UI_FONT}`;
      ctx.fillText(zh ? '小伙伴' : 'Pets', mx(-17), mz(13.8), 9 * scale);
      ctx.fillText(zh ? '菜地' : 'Veg beds', mx(-7.9), mz(16), 7 * scale);
      for (const pet of this.state.pets.pets) {
        if (pet.x < range.x || pet.x > range.x + range.w || pet.z < range.z || pet.z > range.z + range.d) continue;
        ctx.fillStyle = '#ead9a8'; ctx.beginPath(); ctx.arc(mx(pet.x), mz(pet.z), 2.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = dark ? '#f3e7c4' : '#3c4b3e'; ctx.textAlign = 'center'; ctx.font = `${this.touchMode ? 10 * s : 12}px ${UI_FONT}`;
      ctx.fillText(zh ? '↓ 南侧田园 · 庭院页查看' : '↓ South estate · see Estate tab', mx(6), mz(23), 25 * scale);
    }
    for (const room of VILLA_ROOMS.filter(r => r.floor === this.mapFloor)) {
      ctx.fillStyle = dark ? '#697465' : '#e8ddc6';
      ctx.fillRect(mx(room.minX) + 1, mz(room.minZ) + 1, (room.maxX - room.minX) * scale - 2, (room.maxZ - room.minZ) * scale - 2);
      ctx.fillStyle = dark ? '#fff6e6' : '#485442'; ctx.textAlign = 'center'; ctx.font = `500 ${this.touchMode ? 11 * s : 13}px ${UI_FONT}`;
      const label = zh ? room.zh.split(' · ')[0] : this.touchMode ? room.name.split(' ')[0] : room.name.replace(' & workshop', '').replace('Primary', 'Main');
      ctx.fillText(label, mx((room.minX + room.maxX) / 2), mz((room.minZ + room.maxZ) / 2), (room.maxX - room.minX) * scale - 6);
    }
    ctx.fillStyle = dark ? '#ded8c4' : '#69705c';
    for (const b of VILLA_BLOCKS) {
      if (!b.solid || b.y < this.mapFloor * 3.6 + 0.1 || b.y > this.mapFloor * 3.6 + 2.8) continue;
      ctx.fillRect(mx(b.x - b.w / 2), mz(b.z - b.d / 2), Math.max(1.5, b.w * scale), Math.max(1.5, b.d * scale));
    }
    ctx.fillStyle = dark ? '#c1b38d' : '#baab86';
    ctx.fillRect(mx(STAIR_HOLE.minX + .05), mz(STAIR_HOLE.minZ), (STAIR_HOLE.maxX - STAIR_HOLE.minX - .1) * scale, (STAIR_HOLE.maxZ - STAIR_HOLE.minZ) * scale);
    ctx.strokeStyle = '#695c44'; ctx.lineWidth = 1;
    for (let z = -5.5; z < 0.5; z += 0.5) { ctx.beginPath(); ctx.moveTo(mx(-0.7), mz(z)); ctx.lineTo(mx(3.1), mz(z)); ctx.stroke(); }
    ctx.fillStyle = '#334339'; ctx.font = `bold 18px ${UI_FONT}`; ctx.fillText('↑ ↓', mx(1.2), mz(-3));
    ctx.font = `12px ${UI_FONT}`; ctx.fillText(zh ? '楼梯' : 'Stairs', mx(1.2), mz(1.8));
    ctx.fillStyle = dark ? '#c1b38d' : '#b6c6aa';
    ctx.fillRect(mx(VILLA_ELEVATOR.minX), mz(VILLA_ELEVATOR.minZ), (VILLA_ELEVATOR.maxX - VILLA_ELEVATOR.minX) * scale, (VILLA_ELEVATOR.maxZ - VILLA_ELEVATOR.minZ) * scale);
    ctx.fillStyle = '#334339'; ctx.font = `bold 14px ${UI_FONT}`;
    ctx.fillText('↕', mx(VILLA_ELEVATOR.centerX), mz(VILLA_ELEVATOR.centerZ) + 4);
    if (villaFloor(this.position.y) === this.mapFloor && this.position.x >= range.x && this.position.x <= range.x + range.w
      && this.position.z >= range.z && this.position.z <= range.z + range.d) {
      ctx.save(); ctx.translate(mx(this.position.x), mz(this.position.z)); ctx.rotate(-this.yaw);
      ctx.fillStyle = '#d1774d'; ctx.strokeStyle = '#fff8e9'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    ctx.fillStyle = dark ? '#d1d4c0' : '#5b6654'; ctx.font = `${compact ? 11 * s : 14}px ${UI_FONT}`; ctx.textAlign = 'left';
    const legend = compact ? (zh ? '橙色：你 · ↑↓楼梯 · ↕电梯' : 'Orange: you · ↑↓ stairs · ↕ lift')
      : (zh ? '橙色箭头是你 · ↑↓ 楼梯 · ↕ 电梯：E 呼叫，进入后 1 / 2 / 3 选层 · 地图不传送' : 'Orange: you · ↑↓ stairs · ↕ elevator: E to call, 1 / 2 / 3 inside · Map does not teleport');
    ctx.fillText(legend, p.x + 8 * s, p.y + p.h - (compact ? 8 * s : 21), p.w - 16 * s);
    ctx.fillText(zh ? '↑ 北 N' : '↑ N', p.x + 10 * s, top + 18 * s);
  }

  destroy() {
    this.terminal?.destroy(); this.terminal = null;
    this.useButton?.destroy();
    super.destroy(); this.audio.close(); this.scene?.dispose(); this.scene = null; this.unlock();
    for (const key of Object.keys(this.canvas.dataset)) if (key.startsWith('villa')) delete this.canvas.dataset[key];
    if (this.oldAriaLabel == null) this.canvas.removeAttribute('aria-label'); else this.canvas.setAttribute('aria-label', this.oldAriaLabel);
  }
}
