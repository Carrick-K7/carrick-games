import { BaseGame, createDefaultGameHost, type GameHost } from '../core/game.js';
import { VillaScene, type VillaSceneState, type VillaView } from './villaScene.js';
import { createVillaActivities, CAR_DOOR_SECONDS, VILLA_CAR, VILLA_RACING, VILLA_SNOOKER, VILLA_RUN_SPEED, VILLA_WALK_SPEED, nextVillaScreen, type VillaSeat } from './villaActivities.js';
import {
  advanceVillaElevator, createVillaElevator, idleVillaElevator, requestVillaElevator, VILLA_ELEVATOR,
  villaElevatorCabinContains, villaElevatorDoorwayObstructed, villaElevatorShaftContains, villaElevatorSupportAt,
} from './villaElevator.js';
import {
  moveVillaPlayer, nearestVillaHotspot, villaFloor, villaRoomAt, villaSupportAt, villaCollides,
  VILLA_BLOCKS, VILLA_ENTRANCE, VILLA_ROOMS, VILLA_SPAWN, POOL,
  EYE_HEIGHT, type VillaPosition, type VillaHotspot,
} from './villaWorld.js';
import { advanceVillaMotion, createVillaMotion, jumpVillaMotion, toggleVillaCrouch, villaBodyHeight, villaEyeHeight } from './villaMotion.js';
import { advanceVillaDriving, createVillaDriving, villaCarAnchors, villaCarExitClear } from './villaDriving.js';
import { advanceVillaRace, createVillaRace } from './villaRacing.js';
import { advanceVillaSnooker, createVillaSnooker, shootVillaSnooker } from './villaSnooker.js';

interface Point { x: number; y: number }
interface Button { id: string; x: number; y: number; w: number; h: number; label: string }
const UI_FONT = 'system-ui, -apple-system, sans-serif';
const initialVillaState = (): VillaSceneState => ({
  evening: true, fireplace: true, gaming: true, fedUntil: 0, ...createVillaActivities(),
  elevator: createVillaElevator(), driving: createVillaDriving(), race: createVillaRace(),
  snooker: createVillaSnooker(), snookerActive: false,
});

/** A quiet, non-scoring first-person home. All scene resources belong to this game. */
export class VillaGame extends BaseGame {
  private scene: VillaScene | null = null;
  private unavailable = false;
  private position: VillaPosition = { ...VILLA_SPAWN };
  private yaw = -0.74;
  private pitch = 0.14;
  private eyeY = 0;
  private time = 0;
  private state: VillaSceneState = initialVillaState();
  private readonly keys = new Set<string>();
  private motion = createVillaMotion();
  private immersive = false;
  private promptAlpha = 0;
  private safetyBrake = true;
  private readonly touchActions = new Map<number, string>();
  private lastMouse: Point | null = null;
  private mouseLookEnabled = true;
  private wantPointerLock = false;
  private lockVersion = 0;
  private releasePending = false;
  private listenersBound = false;
  private transition: { from: VillaView; at: number } | null = null;
  private doorReadyAt = 0;
  private closeCarAt = Infinity;
  private exitCarAt = Infinity;
  private joystick: { id: number; origin: Point; point: Point } | null = null;
  private lookTouch: { id: number; point: Point } | null = null;
  private touchMode = false;
  private mapOpen = false;
  private mapFloor = 0;
  private helpOpen = false;
  private toast = '';
  private toastUntil = 0;
  private visited = new Set<string>();
  private lastLang: boolean | null = null;
  private oldAriaLabel: string | null = null;

  constructor(host?: GameHost) {
    super(host ?? createDefaultGameHost('gameCanvas', 1120, 700));
    this.oldAriaLabel = this.canvas.getAttribute('aria-label');
  }

  init() {
    this.clearInput();
    this.position = { ...VILLA_SPAWN }; this.yaw = -0.74; this.pitch = 0.14; this.eyeY = 0;
    this.time = 0; this.mapOpen = false; this.helpOpen = false; this.mapFloor = 0;
    this.state = initialVillaState(); this.motion = createVillaMotion(); this.immersive = false; this.promptAlpha = 0;
    this.mouseLookEnabled = true; this.transition = null; this.doorReadyAt = 0; this.closeCarAt = this.exitCarAt = Infinity;
    this.toast = ''; this.toastUntil = 0; this.visited = new Set(['garden']);
    this.touchMode = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    if (!this.scene) {
      try { this.scene = new VillaScene(); this.unavailable = false; }
      catch { this.unavailable = true; }
    }
    this.scene?.updateActivities(0, this.state);
    this.publishState();
  }

  protected onStart() {
    this.mouseLookEnabled = true;
    if (!this.listenersBound) {
      this.listenersBound = true;
      const blur = () => { this.clearInput(); this.mouseLookEnabled = false; this.unlock(); };
      const cancelTouch = () => this.clearInput();
      const visibility = () => { if (document.hidden) blur(); };
      const leave = () => { this.lastMouse = null; };
      const pointerMove = (e: MouseEvent) => {
        if (document.pointerLockElement === this.canvas && !this.mapOpen && !this.helpOpen && !this.shellOpen()) this.look(e.movementX, e.movementY, 0.0023);
      };
      const lockChange = () => {
        this.clearInput();
        if (document.pointerLockElement === this.canvas) {
          if (!this.wantPointerLock || this.mapOpen || this.helpOpen || this.shellOpen()) this.unlock();
          else this.mouseLookEnabled = true;
        } else if (this.releasePending) {
          this.releasePending = false;
        } else if (this.wantPointerLock) {
          // A native Escape or focus loss, not a deliberate panel release.
          this.wantPointerLock = false; this.mouseLookEnabled = false;
        }
        this.publishState();
      };
      window.addEventListener('blur', blur);
      document.addEventListener('visibilitychange', visibility);
      document.addEventListener('mousemove', pointerMove);
      document.addEventListener('pointerlockchange', lockChange);
      this.canvas.addEventListener('touchcancel', cancelTouch);
      this.canvas.addEventListener('mouseleave', leave);
      this.registerCleanup(() => {
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

  private lockPointer() {
    if (this.touchMode || this.mapOpen || this.helpOpen || this.shellOpen()) return;
    this.mouseLookEnabled = true; this.lastMouse = null; this.wantPointerLock = true;
    const version = ++this.lockVersion;
    const fallback = () => {
      if (version === this.lockVersion && this.running && !this.mapOpen && !this.helpOpen && !this.shellOpen()) {
        this.wantPointerLock = false; this.mouseLookEnabled = true;
      }
    };
    try {
      const request = this.canvas.requestPointerLock?.();
      if (request && typeof request.then === 'function') request.then(() => {
        if (!this.running || !this.wantPointerLock || this.mapOpen || this.helpOpen || this.shellOpen()) this.unlock();
      }).catch(fallback);
    } catch { fallback(); }
  }

  private shellOpen(): boolean {
    return !!document.getElementById('gameLibrary')?.classList.contains('open')
      || document.getElementById('overflowMenu')?.hidden === false;
  }

  private clearInput() {
    this.keys.clear(); this.touchActions.clear(); this.safetyBrake = true; this.lastMouse = null; this.joystick = null; this.lookTouch = null;
    this.canvas.style.cursor = '';
  }

  private unlock() {
    this.wantPointerLock = false; this.lockVersion++;
    if (document.pointerLockElement === this.canvas) { this.releasePending = true; document.exitPointerLock?.(); }
  }

  private look(dx: number, dy: number, sensitivity = 0.0038) {
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
    if (this.shellOpen() || document.hidden) { this.clearInput(); this.mouseLookEnabled = false; this.unlock(); }
    if (this.transition && this.time - this.transition.at >= 0.45) this.transition = null;
    if (this.time >= this.closeCarAt) { this.state.carDoorOpen = false; this.closeCarAt = Infinity; }
    if (this.time >= this.exitCarAt) { this.exitCarAt = Infinity; this.leaveSeat(); }
    const ground = this.groundPosition(), lift = this.state.elevator;
    const obstruction = villaElevatorDoorwayObstructed(ground, lift);
    idleVillaElevator(lift, dt, !this.state.seated && villaElevatorCabinContains(ground, lift), obstruction);
    const wasRiding = lift.riding;
    advanceVillaElevator(lift, dt, obstruction);
    if (wasRiding) {
      this.position.y = lift.y; this.eyeY = this.position.y;
      if (!lift.riding) { this.clearInput(); this.message(this.isZhLang() ? '已到达，电梯门已打开。' : 'Arrived. The doors are open.'); }
    }
    this.scene?.updateActivities(this.time, this.state);
    const enabled = !this.mapOpen && !this.helpOpen && !this.shellOpen() && !document.hidden && !this.unavailable && !this.transition;
    if (enabled && !this.state.seated && !this.state.snookerActive) this.yaw += (Number(this.keys.has('arrowleft')) - Number(this.keys.has('arrowright'))) * dt * 1.5;
    let { forward, side } = enabled ? this.axes() : { forward: 0, side: 0 };
    const held = (id: string) => [...this.touchActions.values()].includes(id);
    if (enabled && Math.abs(forward) > .01) this.safetyBrake = false;
    const brake = !enabled || this.safetyBrake || this.keys.has(' ') || held('brake');
    if (this.state.seated === 'car') {
      const car = this.state.driving, oldYaw = car.yaw;
      advanceVillaDriving(car, { throttle: this.scene?.carDoorProgress === 0 && this.exitCarAt === Infinity ? forward : 0,
        steer: side, brake: brake || this.state.carDoorOpen || this.exitCarAt !== Infinity }, dt, this.scene?.drivingObstacles ?? []);
      this.yaw += car.yaw - oldYaw;
      this.position = { ...villaCarAnchors(car).seat }; this.eyeY = 0;
    } else if (this.state.seated === 'racing' && enabled && this.state.screenSource === 'pc') {
      advanceVillaRace(this.state.race, { throttle: forward, steer: side, brake }, dt);
    } else if (this.state.snookerActive) {
      if (enabled && !this.state.snooker.moving) {
        this.state.snooker.aim += (side * .6 + (Number(held('aim-right')) - Number(held('aim-left'))) * .25) * dt;
        this.state.snooker.power = Math.max(.05, Math.min(1, this.state.snooker.power + (forward + Number(held('power-up')) - Number(held('power-down'))) * dt * .4));
      }
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
      } else this.position.y = base.y + this.motion.offset;
      if (this.motion.offset > 0 || this.motion.velocity) this.eyeY = this.position.y;
      else this.eyeY += (this.position.y - this.eyeY) * Math.min(1, dt * 18);
      this.visited.add(villaRoomAt(this.groundPosition()).id);
    }
    advanceVillaSnooker(this.state.snooker, dt);
    this.scene?.updateActivities(this.time, this.state);
    this.promptAlpha += ((this.hotspot() && !this.state.seated && !this.state.snookerActive ? 1 : 0) - this.promptAlpha) * Math.min(1, dt * 10);
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
    if (this.state.seated || this.state.snookerActive) side += Number(this.keys.has('arrowright')) - Number(this.keys.has('arrowleft'));
    if (this.joystick) {
      const radius = 56 * this.uiScale();
      side += (this.joystick.point.x - this.joystick.origin.x) / radius;
      forward -= (this.joystick.point.y - this.joystick.origin.y) / radius;
    }
    return { forward: Math.max(-1, Math.min(1, forward)), side: Math.max(-1, Math.min(1, side)) };
  }
  private hotspot(): VillaHotspot | null {
    const car = this.state.driving, p = this.groundPosition();
    const localX = (p.x - car.x) * Math.cos(car.yaw) - (p.z - car.z) * Math.sin(car.yaw);
    return nearestVillaHotspot(p, { door: villaCarAnchors(car).door, driverSide: localX >= .96 });
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
    data.villaTime = this.state.evening ? 'evening' : 'day';
    data.villaFireplace = String(this.state.fireplace);
    data.villaGaming = String(this.state.gaming);
    data.villaFed = String(this.time < this.state.fedUntil);
    data.villaSeat = this.state.seated ?? 'none';
    data.villaCarDoor = this.state.carDoorOpen ? 'open' : 'closed';
    data.villaScreenSource = this.state.screenSource;
    data.villaDisplayLights = String(this.state.displayLights);
    data.villaPointerLocked = String(document.pointerLockElement === this.canvas);
    data.villaMouseLook = this.mouseLookEnabled ? 'active' : 'cursor';
    data.villaRunning = String(this.keys.has('shift') && !this.motion.crouched && !this.state.seated && !this.state.snookerActive && !this.mapOpen && !this.helpOpen && !this.state.elevator.riding);
    data.villaImmersive = String(this.immersive);
    data.villaMotion = JSON.stringify({ ...this.motion, eyeHeight: villaEyeHeight(this.motion) });
    data.villaDriving = JSON.stringify({ x: this.state.driving.x, z: this.state.driving.z, yaw: this.state.driving.yaw, speed: this.state.driving.speed, contact: this.state.driving.contact, progress: this.state.driving.progress });
    data.villaRace = JSON.stringify({ speed: this.state.race.speed, distance: this.state.race.distance, lane: this.state.race.lane, laps: this.state.race.laps, crashes: this.state.race.crashes });
    data.villaSnooker = JSON.stringify({ active: this.state.snookerActive, moving: this.state.snooker.moving, shots: this.state.snooker.shots, score: this.state.snooker.score, target: this.state.snooker.target, aim: this.state.snooker.aim, power: this.state.snooker.power });
    data.villaElevator = JSON.stringify({ floor: this.state.elevator.floor + 1, target: this.state.elevator.target + 1,
      y: +this.state.elevator.y.toFixed(3), phase: this.state.elevator.phase, riding: this.state.elevator.riding });
    data.villaTarget = this.inElevator() ? 'elevator' : this.state.snookerActive ? 'snooker' : this.state.seated ?? this.hotspot()?.id ?? '';
    data.villaVisited = [...this.visited].join(',');
  }

  private uiScale() {
    if (!this.touchMode) return 1;
    const cssWidth = this.canvas.clientWidth;
    return Math.min(3.5, Math.max(1.2, this.width / (cssWidth || this.width)));
  }

  private buttons(): Button[] {
    const s = this.uiScale(), size = 44 * s, gap = (this.touchMode ? 7 : 9) * s, zh = this.isZhLang();
    if (this.immersive) return [{ id: 'immersion', x: 24, y: 22, w: this.touchMode ? (this.state.snookerActive ? 114 : 190) * s : 294, h: 44 * s, label: '' }];
    const labels = zh
      ? (this.touchMode ? ['图', this.state.evening ? '☀' : '☾', '⌂', '简'] : ['M  导览图', this.state.evening ? 'T  日光' : 'T  黄昏', 'H  回门口', 'I  沉浸', '?  操作'])
      : (this.touchMode ? ['M', this.state.evening ? '☀' : '☾', '⌂', 'I'] : ['M  Floor plan', this.state.evening ? 'T  Daylight' : 'T  Sunset', 'H  Entrance', 'I  Immersive', '?  Controls']);
    const ids = ['map', 'time', 'home', 'immersion', 'help'];
    const w = this.touchMode ? size : 118;
    const start = this.width - 24 - labels.length * w - (labels.length - 1) * gap;
    const buttons = labels.map((label, i) => ({ id: ids[i], x: start + i * (w + gap), y: 22, w, h: size, label }));
    const target = this.hotspot()?.id;
    if (this.touchMode && this.state.snookerActive) {
      const control = (id: string, label: string, x: number, y: number): Button => ({ id, label, x, y, w: 44 * s, h: 44 * s });
      return [control('immersion', zh ? '简' : 'I', this.width - 60 * s, 22),
        control('aim-left', '←', 12 * s, 76 * s), control('aim-right', '→', 64 * s, 76 * s),
        control('power-down', '−', 12 * s, 128 * s), control('power-up', '+', 64 * s, 128 * s),
        control('reset-activity', zh ? '重摆' : 'Reset', 12 * s, this.height - 55 * s),
        control('shoot', zh ? '击球' : 'Shot', this.width - 64 * s, 76 * s)];
    }
    if (this.touchMode && !this.inElevator()) {
      const actions = this.state.seated ? [['brake', zh ? '刹车' : 'Brake'], ['reset-activity', zh ? '复位' : 'Reset']]
        : [['crouch', zh ? '蹲' : 'C'], ['jump', zh ? '跳' : 'Jump']];
      actions.forEach(([id, label], i) => buttons.push({ id, label, x: this.width - (this.state.seated ? 168 - i * 54 : 170 - i * 52) * s, y: this.height - (this.state.seated ? 151 : 93) * s, w: 44 * s, h: 44 * s }));
    }
    if (this.touchMode && (this.state.seated || target === 'car' || target === 'media')) {
      const door = this.state.seated === 'car' || target === 'car';
      buttons.push({ id: 'secondary', x: this.width - 60 * s, y: this.height - 151 * s, w: 44 * s, h: 44 * s, label: this.isZhLang() ? (door ? '车门' : '信号') : (door ? 'Door' : 'Input') });
    }
    if (this.inElevator()) {
      const w = (this.touchMode ? 46 : 64) * s, gap = 8 * s;
      for (let floor = 0; floor < 3; floor++) buttons.push({ id: `elevator-${floor}`, label: `${floor + 1}F`,
        x: (this.width - 3 * w - 2 * gap) / 2 + floor * (w + gap),
        y: this.touchMode ? 22 + 52 * s : this.height - 124, w, h: 44 * s });
    }
    return buttons;
  }

  private panelRect() {
    const s = this.uiScale();
    return this.touchMode ? { x: 12 * s, y: 10 * s, w: this.width - 24 * s, h: this.height - 20 * s }
      : { x: 88, y: 74, w: this.width - 176, h: this.height - 148 };
  }

  private closeButton() {
    const p = this.panelRect(), s = this.uiScale();
    return this.touchMode ? { x: p.x + p.w - 46 * s, y: p.y + 6 * s, w: 40 * s, h: 44 * s }
      : { x: p.x + p.w - 70, y: p.y + 12, w: 56, h: 50 };
  }

  private mapTabs(): Button[] {
    const p = this.panelRect(), s = this.uiScale();
    const labels = this.isZhLang() ? ['1F  生活与花园', '2F  卧室与阅读', '3F  天台花园'] : ['1F  Living', '2F  Bedrooms', '3F  Rooftop'];
    const w = this.touchMode ? (p.w - 64 * s) / 3 - 4 * s : 146;
    return labels.map((label, f) => ({ id: String(f), label: this.touchMode ? `${f + 1}F` : label,
      x: p.x + (this.touchMode ? 8 * s + f * (w + 4 * s) : 28 + f * 156),
      y: p.y + (this.touchMode ? 6 * s : 65), w, h: this.touchMode ? 44 * s : 48,
    }));
  }

  private activate(id: string) {
    if (id.startsWith('elevator-')) { this.selectElevatorFloor(Number(id.slice(9))); return; }
    switch (id) {
      case 'map':
        this.mapOpen = !this.mapOpen; this.helpOpen = false; if (this.mapOpen) this.immersive = false; this.mapFloor = villaFloor(this.position.y); this.clearInput();
        this.mouseLookEnabled = !this.mapOpen; if (this.mapOpen) this.unlock(); else this.lockPointer(); break;
      case 'time': this.state.evening = !this.state.evening; break;
      case 'home':
        this.position = { ...VILLA_ENTRANCE }; this.eyeY = 0; this.yaw = 0; this.pitch = 0.04;
        this.state.seated = null; this.state.carDoorOpen = false; this.transition = null; this.closeCarAt = this.exitCarAt = Infinity;
        this.motion = createVillaMotion(); this.state.snookerActive = false; this.state.driving.speed = 0; this.state.driving.steering = 0;
        this.state.elevator = createVillaElevator(); this.scene?.updateActivities(this.time, this.state);
        this.mapOpen = false; this.helpOpen = false; this.clearInput();
        this.message(this.isZhLang() ? '回到家门口，欢迎回家。' : 'Back at the front door. Welcome home.'); break;
      case 'help':
        this.helpOpen = !this.helpOpen; this.mapOpen = false; if (this.helpOpen) this.immersive = false; this.clearInput(); this.mouseLookEnabled = !this.helpOpen;
        if (this.helpOpen) this.unlock(); else this.lockPointer(); break;
      case 'interact': this.interact(); break;
      case 'secondary': this.secondaryInteraction(); break;
      case 'immersion':
        this.immersive = !this.immersive; this.mapOpen = false; this.helpOpen = false; this.clearInput();
        this.mouseLookEnabled = true; if (this.immersive) this.lockPointer(); break;
      case 'crouch':
        if (!this.state.seated && !this.state.snookerActive && !this.state.elevator.riding && !toggleVillaCrouch(this.motion, h => this.canFit(h)))
          this.message(this.isZhLang() ? '上方空间不足，暂时不能站起。' : 'Not enough headroom to stand.');
        break;
      case 'jump': if (!this.state.seated && !this.state.snookerActive && !this.state.elevator.riding && !this.transition) jumpVillaMotion(this.motion); break;
      case 'shoot': if (this.state.snookerActive && !this.transition) shootVillaSnooker(this.state.snooker); break;
      case 'reset-activity':
        this.clearInput();
        if (this.state.snookerActive) this.state.snooker = createVillaSnooker();
        else if (this.state.seated === 'racing') this.state.race = createVillaRace();
        else if (this.state.seated === 'car') {
          this.state.driving = createVillaDriving(); this.position = { ...villaCarAnchors(this.state.driving).seat };
          this.yaw = Math.PI; this.pitch = -.035; this.state.carDoorOpen = false; this.closeCarAt = this.exitCarAt = Infinity;
          this.scene?.updateActivities(this.time, this.state);
        }
        break;
    }
    this.publishState();
  }

  private message(text: string) { this.toast = text; this.toastUntil = this.time + 4.5; }

  private view(): VillaView {
    const eyeHeight = this.state.seated === 'car' ? VILLA_CAR.eyeHeight : this.state.seated === 'racing' ? VILLA_RACING.eyeHeight : villaEyeHeight(this.motion);
    // Stay below the 3.4m ceiling. A wider top-down view fits the complete table.
    const target: VillaView = this.state.snookerActive
      ? { x: VILLA_SNOOKER.center.x, y: 3.15, z: VILLA_SNOOKER.center.z, yaw: 0, pitch: -Math.PI / 2, eyeHeight: 0, fov: 96 }
      : { ...this.position, y: this.eyeY, yaw: this.yaw, pitch: this.pitch, eyeHeight, fov: this.state.seated === 'racing' ? 70 : 64 };
    if (!this.transition) return target;
    const t = Math.min(1, Math.max(0, (this.time - this.transition.at) / 0.45)), s = t * t * (3 - 2 * t), from = this.transition.from;
    const mix = (a: number, b: number) => a + (b - a) * s;
    return { x: mix(from.x, target.x), y: mix(from.y, target.y), z: mix(from.z, target.z),
      yaw: from.yaw + Math.atan2(Math.sin(target.yaw - from.yaw), Math.cos(target.yaw - from.yaw)) * s,
      pitch: mix(from.pitch, target.pitch), eyeHeight: mix(from.eyeHeight ?? EYE_HEIGHT, target.eyeHeight ?? EYE_HEIGHT), fov: mix(from.fov ?? 64, target.fov ?? 64) };
  }

  private takeSeat(seat: Exclude<VillaSeat, null>) {
    const from = this.view(), layout = seat === 'car' ? VILLA_CAR : VILLA_RACING;
    this.state.seated = seat; this.position = { ...(seat === 'car' ? villaCarAnchors(this.state.driving).seat : layout.seat) }; this.eyeY = 0;
    this.motion = createVillaMotion();
    this.yaw = layout.yaw + (seat === 'car' ? this.state.driving.yaw : 0); this.pitch = seat === 'car' ? -0.035 : 0.225;
    if (seat === 'racing') this.state.screenSource = 'pc';
    this.transition = { from, at: this.time }; this.clearInput();
    if (seat === 'car') this.closeCarAt = this.time + 0.5;
    this.message(this.isZhLang() ? (seat === 'car' ? 'W/S 前进倒车 · A/D 转向 · 空格刹车 · 室外沿车道进入考场' : 'W/S 油门刹车 · A/D 转向 · 空格制动 · R 重开 · E 起身')
      : (seat === 'car' ? 'W/S drive/reverse · A/D steer · Space brake · Follow the driveway to the course' : 'W/S throttle/brake · A/D steer · Space brake · R restart · E stand up'));
  }

  private leaveSeat() {
    if (!this.state.seated) return;
    const car = this.state.seated === 'car', from = this.view();
    const exit = car ? villaCarAnchors(this.state.driving).exit : VILLA_RACING.exit;
    if (car && (!this.scene || !villaCarExitClear(this.state.driving, this.scene.drivingObstacles) || villaCollides(exit, this.scene.colliders, 1.75))) {
      this.message(this.isZhLang() ? '车门外没有站立空间，请移到空旷处再下车。' : 'No safe space outside the door. Move to a clear area first.'); return;
    }
    this.position = { ...exit }; this.state.seated = null; this.eyeY = 0; this.motion = createVillaMotion();
    this.yaw = car ? Math.PI / 2 + this.state.driving.yaw : Math.PI; this.pitch = -0.06;
    this.transition = { from, at: this.time }; this.clearInput();
    this.message(this.isZhLang() ? '已起身，可以继续参观。' : 'Back on your feet. Continue exploring.');
  }

  private inElevator(): boolean {
    return this.state.elevator.riding || villaElevatorCabinContains(this.groundPosition(), this.state.elevator);
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

  private atDriverDoor(): boolean {
    // Keep the standing visitor outside the complete swing, and enter through the
    // doorway rather than diagonally through the fender / windscreen / B-pillar.
    const car = this.state.driving, dx = this.position.x - car.x, dz = this.position.z - car.z;
    const x = dx * Math.cos(car.yaw) - dz * Math.sin(car.yaw), z = dx * Math.sin(car.yaw) + dz * Math.cos(car.yaw);
    return x >= 2.28 && Math.abs(z - .15) <= .48;
  }

  private secondaryInteraction() {
    if (this.transition) return;
    const id = this.hotspot()?.id;
    if (this.state.seated === 'car' || id === 'car') {
      if (Math.abs(this.state.driving.speed) > .12) { this.message(this.isZhLang() ? '请先刹停，再打开车门。' : 'Stop the car before opening the door.'); return; }
      if (!this.state.seated && !this.atDriverDoor()) {
        this.message(this.isZhLang() ? '站到驾驶位车门外侧，后退半步留出开门空间。' : 'Face the driver door and step back to leave room for its swing.'); return;
      }
      if (this.exitCarAt !== Infinity) return;
      if (!this.state.carDoorOpen && !villaCarExitClear(this.state.driving, this.scene?.drivingObstacles ?? [])) {
        this.message(this.isZhLang() ? '车门外空间不足，换个位置再开门。' : 'The door needs a clear space outside. Reposition the car.'); return;
      }
      this.closeCarAt = Infinity; this.state.carDoorOpen = !this.state.carDoorOpen;
      this.doorReadyAt = this.time + CAR_DOOR_SECONDS;
      this.message(this.isZhLang() ? (this.state.carDoorOpen ? '正在打开车门。' : '正在关闭车门。') : (this.state.carDoorOpen ? 'Opening the door.' : 'Closing the door.'));
    } else if (this.state.seated === 'racing' || id === 'media' || id === 'racing') {
      this.state.screenSource = nextVillaScreen(this.state.screenSource);
      const name = this.state.screenSource === 'pc' ? 'PC' : this.state.screenSource === 'ps' ? 'PlayStation' : 'Switch';
      this.message(this.isZhLang() ? `大屏虚拟信号源：${name}` : `Virtual screen input: ${name}`);
    }
    this.scene?.updateActivities(this.time, this.state); this.publishState();
  }

  private interactionHint(): string | null {
    const zh = this.isZhLang();
    if (this.exitCarAt !== Infinity) return zh ? '车门正在打开…' : 'Opening the door…';
    if (this.inElevator()) {
      const lift = this.state.elevator;
      if (lift.phase === 'open') return zh ? '1 / 2 / 3 选择楼层 · 开门后步行进出' : '1 / 2 / 3 select floor · Walk through open doors';
      if (lift.phase === 'closed') return zh ? 'E 打开电梯门' : 'E open elevator doors';
      return zh ? `电梯 → ${lift.target + 1}F · 请稍候，可自由环顾` : `Elevator → ${lift.target + 1}F · Please wait, look around`;
    }
    if (this.state.snookerActive) return zh ? '鼠标 / ←→ 瞄准 · ↑↓ 力度 · 空格击球 · R 重摆 · E 离开' : 'Mouse / ←→ aim · ↑↓ power · Space shoot · R reset · E leave';
    if (this.state.seated === 'car') return zh ? 'W/S 前进倒车 · A/D 转向 · 空格刹车 · 停稳后 E 下车 · R 复位' : 'W/S drive/reverse · A/D steer · Space brake · E exit when stopped · R reset';
    if (this.state.seated === 'racing') return zh ? `W/S 油门刹车 · A/D 转向 · 空格制动 · R 重开 · E 起身 · Q ${this.state.screenSource.toUpperCase()}` : `W/S throttle/brake · A/D steer · Space brake · R restart · E exit · Q ${this.state.screenSource.toUpperCase()}`;
    const hotspot = this.hotspot();
    if (!hotspot) return null;
    if (hotspot.id === 'car') return zh ? (this.state.carDoorOpen ? 'E 坐进驾驶位 · Q 关门' : 'E 打开驾驶位车门') : (this.state.carDoorOpen ? 'E take a seat · Q close door' : 'E open the driver door');
    return `E  ${zh ? hotspot.zh : hotspot.name}`;
  }

  private interact() {
    if (this.transition || this.exitCarAt !== Infinity || this.motion.offset > .001 || this.motion.velocity) return;
    if (this.state.snookerActive) {
      const from = this.view(); this.state.snookerActive = false; this.transition = { from, at: this.time }; this.clearInput(); this.publishState(); return;
    }
    const hotspot = this.hotspot();
    const zh = this.isZhLang();
    if (this.inElevator()) {
      if (this.state.elevator.phase === 'closed') requestVillaElevator(this.state.elevator, this.state.elevator.floor);
      this.message(this.interactionHint() ?? ''); this.publishState(); return;
    }
    if (this.state.seated === 'car') {
      if (Math.abs(this.state.driving.speed) > .12) { this.message(zh ? '请先踩刹车停稳，再下车。' : 'Brake to a complete stop before getting out.'); return; }
      if (!villaCarExitClear(this.state.driving, this.scene?.drivingObstacles ?? [])) { this.message(zh ? '车门外被挡住了，请换个停车位置。' : 'The exit is obstructed. Reposition the car first.'); return; }
      this.closeCarAt = Infinity;
      this.exitCarAt = this.time + (this.state.carDoorOpen ? Math.max(0, this.doorReadyAt - this.time) : CAR_DOOR_SECONDS);
      this.state.carDoorOpen = true; this.clearInput(); this.message(zh ? '打开车门后下车…' : 'Opening the door to step outside…');
      this.scene?.updateActivities(this.time, this.state); this.publishState(); return;
    }
    if (this.state.seated === 'racing') { this.leaveSeat(); this.publishState(); return; }
    if (!hotspot) { this.message(zh ? '走近可互动的家具、车门或驾驶座，再按 E。' : 'Walk closer to a furnishing, driver door or simulator seat, then press E.'); return; }
    switch (hotspot.id) {
      case 'snooker': {
        const from = this.view(); this.state.snookerActive = true; this.motion = createVillaMotion();
        this.transition = { from, at: this.time }; this.clearInput();
        this.message(zh ? '单人练习：先红球，再彩球。鼠标瞄准，空格击球。' : 'Solo practice: red, then colour. Mouse aims; Space shoots.'); break;
      }
      case 'elevator': {
        const accepted = requestVillaElevator(this.state.elevator, villaFloor(this.position.y));
        this.message(zh ? (accepted ? '电梯已呼叫。开门后走入，按 1 / 2 / 3 选层。' : '电梯正在运行，请稍候。')
          : (accepted ? 'Elevator called. Walk inside, then press 1 / 2 / 3.' : 'The elevator is busy. Please wait.'));
        break;
      }
      case 'car':
        if (!villaCarExitClear(this.state.driving, this.scene?.drivingObstacles ?? [])) { this.message(zh ? '车门通道被挡住了，请从空旷处入座。' : 'The doorway is obstructed. Use a clear approach.'); break; }
        if (!this.atDriverDoor()) { this.message(zh ? '请站在打开车门的外侧，稍微后退，再按 E。' : 'Stand outside the driver doorway, a step back, then press E.'); break; }
        if (!this.state.carDoorOpen) this.secondaryInteraction();
        else if (this.time < this.doorReadyAt) this.message(zh ? '等车门完全打开，再按 E 入座。' : 'Wait for the door to open, then press E to sit.');
        else this.takeSeat('car');
        break;
      case 'racing': this.takeSeat('racing'); break;
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
      case 'roof': this.state.evening = true; this.message(zh ? '晚风、灯串，还有一个属于你的家。' : 'An evening breeze, warm lights, and a place of your own.'); break;
    }
    this.publishState();
  }

  private hit(point: Point, b: { x: number; y: number; w: number; h: number }) {
    return point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h;
  }

  private clickUi(point: Point): boolean {
    if (this.mapOpen || this.helpOpen) {
      const p = this.panelRect();
      if (!this.hit(point, p) || this.hit(point, this.closeButton())) {
        this.mapOpen = false; this.helpOpen = false; this.clearInput(); this.mouseLookEnabled = true; this.lockPointer(); this.publishState(); return true;
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
      const s = this.uiScale();
      if (Math.hypot(point.x - (this.width - 38 * s), point.y - (this.height - 75 * s)) < 31 * s) { this.interact(); return true; }
    }
    return false;
  }

  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (!this.running) return;
    if (e instanceof KeyboardEvent) {
      const key = e.key.toLowerCase();
      if (e.type === 'keyup') { this.keys.delete(key); return; }
      const target = e.target instanceof Element ? e.target : null;
      if (this.shellOpen() || target?.closest('input, textarea, select, [contenteditable="true"], .header-actions')) { this.clearInput(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(key)) {
        e.preventDefault(); if (!this.mapOpen && !this.helpOpen) this.keys.add(key); return;
      }
      if (key === ' ') {
        e.preventDefault();
        if (!this.mapOpen && !this.helpOpen) {
          if (this.state.seated) this.keys.add(key);
          else if (!e.repeat) this.activate(this.state.snookerActive ? 'shoot' : 'jump');
        }
        return;
      }
      if (e.repeat) return;
      if (key === 'escape') {
        const wasPanel = this.mapOpen || this.helpOpen;
        this.mapOpen = false; this.helpOpen = false; this.clearInput(); this.unlock(); this.mouseLookEnabled = wasPanel;
      }
      else if (this.mapOpen && ['1', '2', '3'].includes(key)) this.mapFloor = Number(key) - 1;
      else if (!this.helpOpen && ['1', '2', '3'].includes(key) && this.inElevator()) this.selectElevatorFloor(Number(key) - 1);
      else if (key === 'm') this.activate('map');
      else if (key === 't') this.activate('time');
      else if (key === 'h') this.activate('home');
      else if (key === '?' || key === '/') this.activate('help');
      else if (key === 'e' && !this.mapOpen && !this.helpOpen) this.interact();
      else if (key === 'q' && !this.mapOpen && !this.helpOpen) this.secondaryInteraction();
      else if (key === 'l' && !this.mapOpen && !this.helpOpen) this.lockPointer();
      else if (key === 'i') this.activate('immersion');
      else if (key === 'c' && !this.mapOpen && !this.helpOpen) this.activate('crouch');
      else if (key === 'r' && !this.mapOpen && !this.helpOpen) this.activate('reset-activity');
      this.publishState();
    } else if (e instanceof MouseEvent) {
      if (document.pointerLockElement === this.canvas || this.shellOpen()) return;
      const point = this.canvasPoint(e.clientX, e.clientY);
      if (e.type === 'mousedown' && e.button === 0) {
        if (this.clickUi(point)) return;
        this.mouseLookEnabled = true; this.lastMouse = point; this.lockPointer();
      } else if (e.type === 'mousemove') {
        const overControl = this.buttons().some(b => this.hit(point, b));
        if (this.mouseLookEnabled && this.lastMouse && !this.mapOpen && !this.helpOpen && !overControl) {
          const sensitivity = 0.0023 * (this.canvas.clientWidth || this.width) / this.width;
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
          const button = !this.mapOpen && !this.helpOpen && this.buttons().find(b => this.hit(point, b));
          if (button && ['brake', 'aim-left', 'aim-right', 'power-up', 'power-down'].includes(button.id)) {
            this.touchActions.set(touch.identifier, button.id); continue;
          }
          if (this.clickUi(point)) continue;
          if (point.x < this.width * 0.44 && !this.joystick) this.joystick = { id: touch.identifier, origin: point, point };
          else if (!this.lookTouch) this.lookTouch = { id: touch.identifier, point };
        } else if (e.type === 'touchmove') {
          if (this.joystick?.id === touch.identifier) this.joystick.point = point;
          if (this.lookTouch?.id === touch.identifier) {
            this.look(point.x - this.lookTouch.point.x, point.y - this.lookTouch.point.y, 0.0036); this.lookTouch.point = point;
          }
        }
      }
    }
  }

  private rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius = 8) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
  }

  draw(ctx: CanvasRenderingContext2D) {
    const zh = this.isZhLang(), dark = this.isDarkTheme();
    if (zh !== this.lastLang) {
      this.lastLang = zh;
      this.canvas.setAttribute('aria-label', zh ? '暖居别墅。WASD 行走或驾驶，Shift 跑步，C 蹲下，空格跳跃、刹车或击球。I 切换仅显示当前位置的沉浸模式，R 重开当前练习。移动鼠标环顾或斯诺克瞄准，Esc 释放光标。沿楼梯上下楼，或在走廊尽头 E 呼叫电梯，进入后按 1、2、3 选层。E 互动或入座，Q 车门或屏幕信号，M 导览图，T 日光黄昏，H 回门口。' : 'Warm Villa. WASD walk or drive, Shift run, C crouch, Space jump, brake or shoot. I toggles location-only immersive mode, R resets the current activity. Mouse looks or aims at snooker; Esc releases cursor. Use stairs or press E to call the elevator at the gallery end, then 1, 2, 3 inside. E interact or sit, Q door or screen input, M floor plan, T daylight or sunset, H entrance.');
    }
    ctx.fillStyle = dark ? '#252e2e' : '#d9d4c9'; ctx.fillRect(0, 0, this.width, this.height);
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
    if (this.helpOpen) this.drawHelp(ctx);
  }

  private drawHud(ctx: CanvasRenderingContext2D) {
    this.canvas.dataset.villaPrompt = '';
    const zh = this.isZhLang(), s = this.uiScale();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(33,35,31,.72)';
    if (this.immersive) {
      const p = this.groundPosition(), room = villaRoomAt(p), location = this.state.snookerActive ? (zh ? '斯诺克厅' : 'Snooker') : (zh ? room.zh : room.name);
      const label = `${villaFloor(p.y) + 1}F · ${location}`;
      const b = this.buttons()[0]; this.rounded(ctx, b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#fff7e9'; ctx.font = `500 ${this.touchMode ? 13 * s : 16}px ${UI_FONT}`;
      ctx.fillText(label, b.x + 14 * s, b.y + b.h / 2, b.w - 28 * s);
      ctx.textBaseline = 'alphabetic'; return;
    }
    this.rounded(ctx, 24, 22, this.touchMode ? 78 * s : 294, this.touchMode ? 42 * s : 68);
    ctx.fillStyle = '#fff7e9'; ctx.font = `500 ${this.touchMode ? 19 * s : 19}px ${UI_FONT}`;
    ctx.fillText(this.touchMode ? `${villaFloor(this.position.y) + 1}F` : (zh ? '暖居 · 一个温暖的家' : 'Warm Villa · Feel at home'), 40, this.touchMode ? 22 + 21 * s : 46);
    if (!this.touchMode) {
      ctx.fillStyle = '#d9d9c9'; ctx.font = `13px ${UI_FONT}`;
      ctx.fillText(`${villaFloor(this.position.y) + 1}F  /  ${zh ? '自在漫游' : 'Take your time'}`, 40, 73);
    }
    for (const b of this.buttons()) {
      ctx.fillStyle = b.id === `elevator-${this.state.elevator.target}` ? 'rgba(79,103,69,.92)' : 'rgba(33,35,31,.72)';
      this.rounded(ctx, b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#fff7e9'; ctx.textAlign = 'center'; ctx.font = `500 ${this.touchMode ? 17 * s : 13}px ${UI_FONT}`;
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
    }
    ctx.textAlign = 'center';
    if (this.touchMode) {
      if (!this.state.snookerActive) {
      const origin = this.joystick?.origin ?? { x: 78 * s, y: this.height - 78 * s };
      ctx.strokeStyle = 'rgba(255,251,236,.45)'; ctx.lineWidth = 1.5 * s; ctx.fillStyle = 'rgba(29,35,31,.20)';
      ctx.beginPath(); ctx.arc(origin.x, origin.y, 51 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      let dx = (this.joystick?.point.x ?? origin.x) - origin.x, dy = (this.joystick?.point.y ?? origin.y) - origin.y;
      const length = Math.hypot(dx, dy); if (length > 42 * s) { dx *= 42 * s / length; dy *= 42 * s / length; }
      ctx.fillStyle = 'rgba(255,251,236,.45)'; ctx.beginPath(); ctx.arc(origin.x + dx, origin.y + dy, 20 * s, 0, Math.PI * 2); ctx.fill();
      ctx.font = `${12 * s}px ${UI_FONT}`; ctx.fillStyle = '#fffaee'; ctx.fillText(this.state.seated ? (zh ? '驾驶' : 'Drive') : (zh ? '行走' : 'Walk'), origin.x, origin.y + 68 * s);
      }
      ctx.fillStyle = 'rgba(33,35,31,.60)'; ctx.beginPath(); ctx.arc(this.width - 38 * s, this.height - 75 * s, 29 * s, 0, Math.PI * 2); ctx.fill();
      ctx.font = `500 ${15 * s}px ${UI_FONT}`; ctx.fillStyle = '#fff7e9'; ctx.fillText(this.state.seated || this.state.snookerActive ? (zh ? '离开' : 'Exit') : (zh ? '互动' : 'Use'), this.width - 38 * s, this.height - 75 * s);
    } else if (!this.state.snookerActive) {
      ctx.fillStyle = 'rgba(255,251,238,.65)'; ctx.beginPath(); ctx.arc(this.width / 2, this.height / 2, 2, 0, Math.PI * 2); ctx.fill();
    }
    this.drawActivityHud(ctx);
    this.drawInteractionPrompt(ctx);
    if (this.touchMode && this.state.snookerActive) { ctx.textBaseline = 'alphabetic'; return; }
    const hotspot = this.hotspot();
    let hint = this.time < this.toastUntil ? this.toast : this.interactionHint()
      ?? (this.touchMode ? (zh ? '右侧拖动看四周' : 'Drag right side to look')
        : !this.mouseLookEnabled ? (zh ? '点击画面继续自动环顾 · 无需按住鼠标' : 'Click the scene to resume mouse look · No dragging')
          : (zh ? 'WASD 行走 · Shift 跑步 · 移动鼠标环顾 · Esc 释放光标' : 'WASD walk · Shift run · Move mouse to look · Esc cursor'));
    // Keep touch actions meaningful while seated, rather than repeating a room name.
    if (this.touchMode && hint.length > (zh ? 17 : 38)) {
      hint = this.inElevator() ? (this.state.elevator.phase === 'open' ? (zh ? '上方按钮选层 · 开门后进出' : 'Choose a floor above · Walk out when open')
        : (zh ? `电梯 → ${this.state.elevator.target + 1}F · 可环顾` : `Elevator → ${this.state.elevator.target + 1}F · Look around`))
        : this.state.seated ? (zh ? '左杆驾驶 · 右侧环顾 · 按住刹车' : 'Left stick drives · Hold Brake to stop')
        : hotspot?.id === 'car' ? (zh ? '互动：开门 / 坐入驾驶位' : 'Use: open door / take a seat')
          : hotspot ? (zh ? hotspot.zh : hotspot.name) : (zh ? '不赶时间，慢慢逛' : 'Take your time and explore');
    }
    const font = this.touchMode ? 12 * s : 14;
    ctx.font = `${font}px ${UI_FONT}`; const tw = Math.min(this.width - 44, ctx.measureText(hint).width + 30);
    ctx.fillStyle = 'rgba(33,35,31,.72)'; this.rounded(ctx, (this.width - tw) / 2, this.height - (this.touchMode ? 28 * s : 54), tw, this.touchMode ? 22 * s : 32);
    ctx.fillStyle = '#fff7e9'; ctx.fillText(hint, this.width / 2, this.height - (this.touchMode ? 17 * s : 38));
    ctx.textBaseline = 'alphabetic';
  }

  private drawActivityHud(ctx: CanvasRenderingContext2D) {
    const zh = this.isZhLang(), s = this.uiScale(), lines: string[] = [];
    if (this.state.snookerActive) {
      const table = this.state.snooker;
      const names: Record<string, string> = { red: '红球', color: '任意彩球', yellow: '黄球', green: '绿球', brown: '棕球', blue: '蓝球', pink: '粉球', black: '黑球' };
      const target = zh ? names[table.target] : table.target;
      const fouls: Record<string, string> = { 'Cue ball potted': '白球落袋', 'No object ball hit': '未碰到目标球', 'Wrong first ball': '首碰球不符', 'Wrong ball potted': '落袋球不符' };
      if (this.touchMode) {
        ctx.fillStyle = 'rgba(33,35,31,.76)'; this.rounded(ctx, 8 * s, 51 * s, 106 * s, 23 * s);
        ctx.textAlign = 'left'; ctx.fillStyle = '#fff7e9'; ctx.font = `${10 * s}px ${UI_FONT}`;
        const complete = table.phase === 'complete', power = `${Math.round(table.power * 100)}%`;
        const status = complete ? (zh ? '清台' : 'Cleared') : table.foul ? (zh ? '犯规' : 'Foul') : target;
        const shortFouls: Record<string, string> = { 'Cue ball potted': 'Scratch', 'No object ball hit': 'No contact', 'Wrong first ball': 'Wrong first', 'Wrong ball potted': 'Wrong pot' };
        const detail = complete ? (zh ? '点重摆再开一局' : 'Tap Reset to restart')
          : table.foul ? `${zh ? fouls[table.foul] : shortFouls[table.foul]} · ${power}`
            : `${table.moving ? (zh ? '滚动中' : 'Rolling') : (zh ? '力度' : 'Power')} ${power}`;
        ctx.fillText(`${zh ? '得分' : 'Score'} ${table.score} · ${status}`, 12 * s, 58 * s, 105 * s);
        ctx.fillText(detail, 12 * s, 69 * s, 105 * s);
        ctx.textAlign = 'center'; return;
      }
      lines.push(zh ? '斯诺克 · 单人练习' : 'Snooker · Solo practice', `${zh ? '得分' : 'Score'} ${table.score} · ${zh ? '出杆' : 'Shots'} ${table.shots}`,
        `${zh ? '目标' : 'Target'}: ${target} · ${zh ? '力度' : 'Power'} ${Math.round(table.power * 100)}%`,
        table.moving ? (zh ? '球正在滚动…' : 'Balls rolling…') : table.phase === 'complete' ? (zh ? '清台成功！R 开新局' : 'Table cleared! R for a fresh rack')
          : table.foul ? (zh ? `犯规：${fouls[table.foul] ?? '请按目标击球'}` : table.foul) : (zh ? '先红后彩；彩球清台按顺序' : 'Red, colour; then colours in order'));
    } else if (this.state.seated === 'car') {
      const car = this.state.driving;
      lines.push(`${car.speed < -.05 ? 'R' : 'D'}  ${Math.abs(car.speed * 3.6).toFixed(0)} km/h`,
        `${zh ? '倒库' : 'Reverse bay'} ${car.reverseParked ? '✓' : '—'} · ${zh ? '侧方' : 'Parallel'} ${car.parallelParked ? '✓' : '—'}`,
        `S ${car.sCheckpoint}/4 · ${zh ? '直角' : 'Corner'} ${car.cornerCheckpoint}/4`);
      if (!this.touchMode) lines.push(car.contact ? (zh ? '碰到边界，请刹停后调整' : 'Obstacle ahead — stop and adjust') : (zh ? '出车库向前，沿车道进入练习场' : 'Follow the driveway out to the course'));
    }
    if (!lines.length) return;
    const x = 24, y = this.touchMode ? 22 + 47 * s : 108, w = this.touchMode ? 168 * s : 294;
    const lineHeight = this.touchMode ? 13 * s : 22, pad = this.touchMode ? 6 * s : 14;
    ctx.fillStyle = 'rgba(33,35,31,.76)'; this.rounded(ctx, x, y, w, pad * 2 + lines.length * lineHeight);
    ctx.fillStyle = '#fff7e9'; ctx.textAlign = 'left'; ctx.font = `${this.touchMode ? 11 * s : 14}px ${UI_FONT}`;
    lines.forEach((line, i) => ctx.fillText(line, x + pad, y + pad + (i + .5) * lineHeight, w - pad * 2));
    ctx.textAlign = 'center';
  }

  private drawInteractionPrompt(ctx: CanvasRenderingContext2D) {
    if (this.mapOpen || this.helpOpen || this.state.seated || this.state.snookerActive || this.inElevator() || this.motion.offset > .001 || this.promptAlpha < .02) return;
    const target = this.hotspot(); if (!target || !this.scene) return;
    // Hotspots describe where a visitor stands; badges belong on the actual prop,
    // not at that approach point (which can be behind the camera when close).
    const anchors: Partial<Record<VillaHotspot['id'], VillaPosition>> = {
      figures: { x: 2.58, y: 1.4, z: 6.45 }, replicas: { x: 10.35, y: 1.4, z: 3.5 },
      racing: { ...VILLA_RACING.seat, y: 1.3 }, gaming: { x: 7.05, y: 1.5, z: 3.7 },
      media: { ...VILLA_RACING.screen }, snooker: { ...VILLA_SNOOKER.center, y: VILLA_SNOOKER.height + .15 },
      fireplace: { x: -10, y: 1.35, z: .78 }, aquarium: { x: -3.5, y: 1.5, z: 1.1 },
      elevator: { x: 0, y: target.y + 1.45, z: VILLA_ELEVATOR.frontZ + .06 },
    };
    const anchor = anchors[target.id] ?? { x: target.x, y: target.y + 1.4, z: target.z };
    anchor.y = Math.min(anchor.y, target.y + villaEyeHeight(this.motion) + .2);
    const point = this.scene.projectInteraction(anchor, this.width, this.height);
    if (!point) { this.canvas.dataset.villaPrompt = ''; return; }
    const zh = this.isZhLang(), s = this.touchMode ? this.uiScale() * .85 : 1;
    const labels: Record<string, [string, string]> = { car: [this.state.carDoorOpen ? '坐进驾驶位' : '打开车门', this.state.carDoorOpen ? 'Take driver seat' : 'Open door'], racing: ['开始赛车', 'Race'], snooker: ['打斯诺克', 'Play snooker'], elevator: ['呼叫电梯', 'Call lift'], figures: ['开关柜灯', 'Display lights'], replicas: ['开关柜灯', 'Display lights'], fireplace: ['开关壁炉', 'Fireplace'], aquarium: ['喂鱼', 'Feed fish'], gaming: ['开关电脑', 'PC power'], media: ['切换信号', 'Screen input'], tea: ['喝茶', 'Have tea'], roof: ['赏景', 'Enjoy the view'] };
    const label = labels[target.id]?.[zh ? 0 : 1] ?? (zh ? target.zh : target.name);
    this.canvas.dataset.villaPrompt = target.id;
    ctx.save(); ctx.globalAlpha = Math.min(1, this.promptAlpha) * .94; ctx.font = `500 ${13 * s}px ${UI_FONT}`;
    const width = ctx.measureText(label).width + 54 * s, x = Math.max(16, Math.min(this.width - width - 16, point.x - width / 2)), y = point.y - 17 * s;
    ctx.fillStyle = 'rgba(32,39,33,.82)'; this.rounded(ctx, x, y, width, 34 * s, 7 * s);
    ctx.strokeStyle = 'rgba(241,239,215,.62)'; ctx.lineWidth = s; ctx.beginPath(); ctx.roundRect(x + 6 * s, y + 6 * s, 22 * s, 22 * s, 4 * s); ctx.stroke();
    ctx.fillStyle = '#fff7e9'; ctx.textAlign = 'center'; ctx.fillText(this.touchMode ? '·' : 'E', x + 17 * s, y + 17 * s);
    ctx.textAlign = 'left'; ctx.fillText(label, x + 36 * s, y + 17 * s); ctx.restore();
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

  private drawMap(ctx: CanvasRenderingContext2D) {
    const zh = this.isZhLang(), dark = this.isDarkTheme(), s = this.uiScale();
    const p = this.panel(ctx, zh ? '家的导览图' : 'Find your way home', this.touchMode);
    for (const tab of this.mapTabs()) {
      const selected = Number(tab.id) === this.mapFloor;
      ctx.fillStyle = selected ? (dark ? '#b9c9ad' : '#46614e') : (dark ? '#344039' : '#e2dfd2');
      this.rounded(ctx, tab.x, tab.y, tab.w, tab.h);
      ctx.fillStyle = selected ? (dark ? '#24342b' : '#ffffff') : (dark ? '#eee5d5' : '#4b5a4c');
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${15 * s}px ${UI_FONT}`;
      ctx.fillText(tab.label, tab.x + tab.w / 2, tab.y + tab.h / 2);
    }
    ctx.textBaseline = 'alphabetic';
    const grounds = this.mapFloor === 0 && this.position.z >= 24;
    const range = this.mapFloor === 0 ? { x: -25, z: -17, w: grounds ? 53 : 50, d: grounds ? 74 : 41 } : { x: -13, z: -10, w: 26, d: 23 };
    const scale = Math.min((p.w - 50) / range.w, (p.h - (this.touchMode ? 80 * s : 185)) / range.d);
    const left = p.x + (p.w - range.w * scale) / 2, top = p.y + (this.touchMode ? 57 * s : 133);
    const mx = (x: number) => left + (x - range.x) * scale;
    const mz = (z: number) => top + (z - range.z) * scale;
    ctx.fillStyle = dark ? '#344736' : '#dce4ca';
    ctx.fillRect(mx(range.x), mz(range.z), range.w * scale, range.d * scale);
    ctx.fillStyle = dark ? '#707466' : '#ebe1ce'; ctx.fillRect(mx(-12), mz(-9), 24 * scale, 18 * scale);
    if (this.mapFloor === 0) {
      ctx.fillStyle = '#78b6bc'; ctx.fillRect(mx(POOL.minX), mz(POOL.minZ), (POOL.maxX - POOL.minX) * scale, (POOL.maxZ - POOL.minZ) * scale);
      ctx.fillStyle = '#37505a'; ctx.font = `${12 * s}px ${UI_FONT}`; ctx.fillText(zh ? '泳池' : 'Pool', mx(-18.25), mz(0), 7 * scale);
      ctx.fillStyle = '#e9dfcb'; ctx.fillRect(mx(-1.7), mz(9), 3.4 * scale, 14 * scale);
      ctx.fillStyle = '#85897d'; ctx.fillRect(mx(13), mz(10), 6 * scale, (grounds ? 16 : 14) * scale);
      if (grounds) {
        ctx.fillStyle = '#586366'; ctx.fillRect(mx(-10), mz(25), 34 * scale, 28 * scale);
        ctx.strokeStyle = '#f4e4a3'; ctx.lineWidth = 1;
        ctx.strokeRect(mx(-7.7), mz(27.5), 3.4 * scale, 7 * scale);
        ctx.strokeRect(mx(-8.75), mz(46.3), 7.5 * scale, 3.4 * scale);
        ctx.beginPath(); [[4,29],[7,33],[4,38],[1,42]].forEach(([x,z], i) => i ? ctx.lineTo(mx(x),mz(z)) : ctx.moveTo(mx(x),mz(z))); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mx(17),mz(37)); ctx.lineTo(mx(17),mz(47)); ctx.lineTo(mx(9),mz(47)); ctx.stroke();
      }
      ctx.fillStyle = grounds ? '#fff4d2' : '#3c4b3e'; ctx.textAlign = 'center'; ctx.font = `${this.touchMode ? 10 * s : 12}px ${UI_FONT}`;
      ctx.fillText(zh ? (grounds ? '试驾练习场' : '↓ 试驾考场') : (grounds ? 'Driving practice' : '↓ Driving course'), mx(7), mz(grounds ? 51 : 23), 25 * scale);
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
    ctx.fillStyle = dark ? '#c1b38d' : '#baab86'; ctx.fillRect(mx(2.2), mz(-7), 4 * scale, 7.5 * scale);
    ctx.strokeStyle = '#695c44'; ctx.lineWidth = 1;
    for (let z = -5.5; z < 0.5; z += 0.5) { ctx.beginPath(); ctx.moveTo(mx(2.3), mz(z)); ctx.lineTo(mx(6.1), mz(z)); ctx.stroke(); }
    ctx.fillStyle = '#334339'; ctx.font = `bold 18px ${UI_FONT}`; ctx.fillText('↑ ↓', mx(4.2), mz(-3));
    ctx.font = `12px ${UI_FONT}`; ctx.fillText(zh ? '楼梯' : 'Stairs', mx(4.2), mz(1.8));
    ctx.fillStyle = dark ? '#c1b38d' : '#b6c6aa';
    ctx.fillRect(mx(VILLA_ELEVATOR.minX), mz(VILLA_ELEVATOR.minZ), 2.2 * scale, 2.4 * scale);
    ctx.fillStyle = '#334339'; ctx.font = `bold 14px ${UI_FONT}`;
    ctx.fillText('↕', mx(0), mz(VILLA_ELEVATOR.centerZ) + 4);
    if (villaFloor(this.position.y) === this.mapFloor) {
      ctx.save(); ctx.translate(mx(this.position.x), mz(this.position.z)); ctx.rotate(-this.yaw);
      ctx.fillStyle = '#d1774d'; ctx.strokeStyle = '#fff8e9'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    ctx.fillStyle = dark ? '#d1d4c0' : '#5b6654'; ctx.font = `${this.touchMode ? 11 * s : 14}px ${UI_FONT}`; ctx.textAlign = 'left';
    const legend = this.touchMode ? (zh ? '橙色：你 · ↑↓楼梯 · ↕电梯' : 'Orange: you · ↑↓ stairs · ↕ lift')
      : (zh ? '橙色箭头是你 · ↑↓ 楼梯 · ↕ 电梯：E 呼叫，进入后 1 / 2 / 3 选层 · 地图不传送' : 'Orange: you · ↑↓ stairs · ↕ elevator: E to call, 1 / 2 / 3 inside · Map does not teleport');
    ctx.fillText(legend, p.x + 8 * s, p.y + p.h - (this.touchMode ? 8 * s : 21));
  }

  private drawHelp(ctx: CanvasRenderingContext2D) {
    const zh = this.isZhLang(), p = this.panel(ctx, zh ? '慢慢走，像在自己家一样' : 'Make yourself at home');
    const rows = zh ? [
      ['W A S D', '行走；Shift 跑步；↑↓ 行走，←→ 转向'], ['鼠标 / Esc', '移动自动环顾；Esc 释放光标，点击画面恢复'],
      ['C / 空格', '蹲下或站起 / 跳跃；头顶空间不足时不会强行站起'], ['E / Q', '互动、入座、离开 / 车门与大屏信号'],
      ['驾驶 / 赛车', 'W/S 前进倒车或制动，A/D 转向，空格刹车；R 复位'], ['斯诺克', '鼠标或←→瞄准，↑↓力度，空格击球，R重摆，E离开'],
      ['楼梯 / 电梯', 'E 呼叫电梯，进入后 1/2/3 选层；无人四秒后关门'], ['I 沉浸', '仅保留当前位置；手机点左上位置信息恢复按钮'],
      ['M / T / H', '导览图 / 日光黄昏 / 回到门口并停住车辆'], ['手机 / 平板', '左杆行走或驾驶，右侧环顾；情景按钮蹲跳、刹车、击球'],
    ] : [
      ['W A S D', 'Walk; Shift runs. Up/down walks, left/right turns.'], ['Mouse / Esc', 'Move to look. Esc frees cursor; click scene to resume.'],
      ['C / Space', 'Crouch or stand / jump, subject to head clearance.'], ['E / Q', 'Interact, sit, leave / car door and screen input.'],
      ['Drive / race', 'W/S throttle/reverse or brake; A/D steer; Space brake; R reset.'], ['Snooker', 'Mouse/←→ aim; ↑↓ power; Space shoot; R rack; E leave.'],
      ['Stairs / Lift', 'E calls lift; 1/2/3 inside. Empty doors close after four seconds.'], ['I immersive', 'Location-only HUD; touch the location to restore controls.'],
      ['M / T / H', 'Floor plan / daylight or sunset / return home and stop car.'], ['Touch', 'Left stick walks/drives; right looks; action buttons depend on activity.'],
    ];
    ctx.textAlign = 'left';
    rows.forEach(([key, description], i) => {
      const y = p.y + 94 + i * 39;
      ctx.fillStyle = this.isDarkTheme() ? '#bccbb0' : '#507050'; ctx.font = `500 17px ${UI_FONT}`; ctx.fillText(key, p.x + 32, y);
      ctx.fillStyle = this.isDarkTheme() ? '#e2e3d5' : '#4b5347'; ctx.font = `16px ${UI_FONT}`; ctx.fillText(description, p.x + 186, y);
    });
    ctx.fillStyle = this.isDarkTheme() ? '#c4c9b8' : '#747965'; ctx.font = `14px ${UI_FONT}`;
    ctx.fillText(zh ? '自由漫游；练习成绩只留在当前游戏，不上传排行榜。' : 'Explore freely. Practice scores stay local, off the leaderboard.', p.x + 32, p.y + p.h - 30);
  }

  destroy() {
    super.destroy(); this.scene?.dispose(); this.scene = null; this.unlock();
    for (const key of Object.keys(this.canvas.dataset)) if (key.startsWith('villa')) delete this.canvas.dataset[key];
    if (this.oldAriaLabel == null) this.canvas.removeAttribute('aria-label'); else this.canvas.setAttribute('aria-label', this.oldAriaLabel);
  }
}
