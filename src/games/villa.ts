import { BaseGame, createDefaultGameHost, type GameHost } from '../core/game.js';
import { VillaScene, type VillaSceneState, type VillaView } from './villaScene.js';
import { createVillaActivities, CAR_DOOR_SECONDS, VILLA_CAR, VILLA_RACING, VILLA_RUN_SPEED, VILLA_WALK_SPEED, nextVillaScreen, type VillaSeat } from './villaActivities.js';
import {
  moveVillaPlayer, nearestVillaHotspot, villaFloor, villaRoomAt,
  VILLA_BLOCKS, VILLA_ENTRANCE, VILLA_ROOMS, VILLA_SPAWN, POOL,
  EYE_HEIGHT, type VillaPosition,
} from './villaWorld.js';

interface Point { x: number; y: number }
interface Button { id: string; x: number; y: number; w: number; h: number; label: string }
const UI_FONT = 'system-ui, -apple-system, sans-serif';

/** A quiet, non-scoring first-person home. All scene resources belong to this game. */
export class VillaGame extends BaseGame {
  private scene: VillaScene | null = null;
  private unavailable = false;
  private position: VillaPosition = { ...VILLA_SPAWN };
  private yaw = -0.74;
  private pitch = 0.14;
  private eyeY = 0;
  private time = 0;
  private state: VillaSceneState = { evening: true, fireplace: true, gaming: true, fedUntil: 0, ...createVillaActivities() };
  private readonly keys = new Set<string>();
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
    this.state = { evening: true, fireplace: true, gaming: true, fedUntil: 0, ...createVillaActivities() };
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
    this.keys.clear(); this.lastMouse = null; this.joystick = null; this.lookTouch = null;
    this.canvas.style.cursor = '';
  }

  private unlock() {
    this.wantPointerLock = false; this.lockVersion++;
    if (document.pointerLockElement === this.canvas) { this.releasePending = true; document.exitPointerLock?.(); }
  }

  private look(dx: number, dy: number, sensitivity = 0.0038) {
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
    this.scene?.updateActivities(this.time, this.state);
    if (!this.mapOpen && !this.helpOpen && !this.unavailable) {
      this.yaw += (Number(this.keys.has('arrowleft')) - Number(this.keys.has('arrowright'))) * dt * 1.5;
    }
    if (!this.mapOpen && !this.helpOpen && !this.unavailable && !this.state.seated && !this.transition) {
      let forward = Number(this.keys.has('w') || this.keys.has('arrowup')) - Number(this.keys.has('s') || this.keys.has('arrowdown'));
      let side = Number(this.keys.has('d')) - Number(this.keys.has('a'));
      if (this.joystick) {
        const dx = this.joystick.point.x - this.joystick.origin.x;
        const dy = this.joystick.point.y - this.joystick.origin.y;
        const radius = 56 * this.uiScale();
        side += Math.max(-1, Math.min(1, dx / radius));
        forward -= Math.max(-1, Math.min(1, dy / radius));
      }
      const magnitude = Math.hypot(forward, side);
      if (magnitude > 1) { forward /= magnitude; side /= magnitude; }
      const speed = this.keys.has('shift') ? VILLA_RUN_SPEED : VILLA_WALK_SPEED;
      const dx = (-Math.sin(this.yaw) * forward + Math.cos(this.yaw) * side) * speed * dt;
      const dz = (-Math.cos(this.yaw) * forward - Math.sin(this.yaw) * side) * speed * dt;
      if (this.scene && (dx || dz)) this.position = moveVillaPlayer(this.position, dx, dz, this.scene.colliders);
      this.eyeY += (this.position.y - this.eyeY) * Math.min(1, dt * 18);
      this.visited.add(villaRoomAt(this.position).id);
    }
    this.publishState();
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
    data.villaRunning = String(this.keys.has('shift') && !this.state.seated && !this.mapOpen && !this.helpOpen);
    data.villaTarget = this.state.seated ?? nearestVillaHotspot(this.position)?.id ?? '';
    data.villaVisited = [...this.visited].join(',');
  }

  private uiScale() {
    if (!this.touchMode) return 1;
    const cssWidth = this.canvas.clientWidth;
    return Math.min(3.5, Math.max(1.2, this.width / (cssWidth || this.width)));
  }

  private buttons(): Button[] {
    const s = this.uiScale(), size = 42 * s, gap = 9 * s;
    const labels = this.isZhLang()
      ? (this.touchMode ? ['图', this.state.evening ? '☀' : '☾', '⌂'] : ['M  导览图', this.state.evening ? 'T  日光' : 'T  黄昏', 'H  回门口', '?  操作'])
      : (this.touchMode ? ['M', this.state.evening ? '☀' : '☾', '⌂'] : ['M  Floor plan', this.state.evening ? 'T  Daylight' : 'T  Sunset', 'H  Entrance', '?  Controls']);
    const ids = ['map', 'time', 'home', 'help'];
    const w = this.touchMode ? size : 118;
    const start = this.width - 24 - labels.length * w - (labels.length - 1) * gap;
    const buttons = labels.map((label, i) => ({ id: ids[i], x: start + i * (w + gap), y: 22, w, h: size, label }));
    const target = nearestVillaHotspot(this.position)?.id;
    if (this.touchMode && (this.state.seated || target === 'car' || target === 'media')) {
      const door = this.state.seated === 'car' || target === 'car';
      buttons.push({ id: 'secondary', x: this.width - 168 * s, y: this.height - 98 * s, w: 46 * s, h: 46 * s, label: this.isZhLang() ? (door ? '车门' : '信号') : (door ? 'Door' : 'Input') });
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
    switch (id) {
      case 'map':
        this.mapOpen = !this.mapOpen; this.helpOpen = false; this.mapFloor = villaFloor(this.position.y); this.clearInput();
        this.mouseLookEnabled = !this.mapOpen; if (this.mapOpen) this.unlock(); else this.lockPointer(); break;
      case 'time': this.state.evening = !this.state.evening; break;
      case 'home':
        this.position = { ...VILLA_ENTRANCE }; this.eyeY = 0; this.yaw = 0; this.pitch = 0.04;
        this.state.seated = null; this.state.carDoorOpen = false; this.transition = null; this.closeCarAt = this.exitCarAt = Infinity;
        this.mapOpen = false; this.helpOpen = false; this.clearInput();
        this.message(this.isZhLang() ? '回到家门口，欢迎回家。' : 'Back at the front door. Welcome home.'); break;
      case 'help':
        this.helpOpen = !this.helpOpen; this.mapOpen = false; this.clearInput(); this.mouseLookEnabled = !this.helpOpen;
        if (this.helpOpen) this.unlock(); else this.lockPointer(); break;
      case 'interact': this.interact(); break;
      case 'secondary': this.secondaryInteraction(); break;
    }
    this.publishState();
  }

  private message(text: string) { this.toast = text; this.toastUntil = this.time + 4.5; }

  private view(): VillaView {
    const eyeHeight = this.state.seated === 'car' ? VILLA_CAR.eyeHeight : this.state.seated === 'racing' ? VILLA_RACING.eyeHeight : EYE_HEIGHT;
    const target: VillaView = { ...this.position, y: this.eyeY, yaw: this.yaw, pitch: this.pitch, eyeHeight };
    if (!this.transition) return target;
    const t = Math.min(1, Math.max(0, (this.time - this.transition.at) / 0.45)), s = t * t * (3 - 2 * t), from = this.transition.from;
    const mix = (a: number, b: number) => a + (b - a) * s;
    return { x: mix(from.x, target.x), y: mix(from.y, target.y), z: mix(from.z, target.z),
      yaw: from.yaw + Math.atan2(Math.sin(target.yaw - from.yaw), Math.cos(target.yaw - from.yaw)) * s,
      pitch: mix(from.pitch, target.pitch), eyeHeight: mix(from.eyeHeight ?? EYE_HEIGHT, eyeHeight) };
  }

  private takeSeat(seat: Exclude<VillaSeat, null>) {
    const from = this.view(), layout = seat === 'car' ? VILLA_CAR : VILLA_RACING;
    this.state.seated = seat; this.position = { ...layout.seat }; this.eyeY = 0;
    this.yaw = layout.yaw; this.pitch = seat === 'car' ? -0.035 : 0.13;
    this.transition = { from, at: this.time }; this.clearInput();
    if (seat === 'car') this.closeCarAt = this.time + 0.5;
    this.message(this.isZhLang() ? (seat === 'car' ? '已坐进驾驶位 · Q 车门 · E 下车' : '驾驶模拟座舱 · Q 切换 PC / PS / Switch · E 起身')
      : (seat === 'car' ? 'Driver seat · Q door · E exit' : 'Simulator seat · Q PC / PS / Switch · E stand up'));
  }

  private leaveSeat() {
    if (!this.state.seated) return;
    const car = this.state.seated === 'car', from = this.view();
    this.position = { ...(car ? VILLA_CAR.exit : VILLA_RACING.exit) }; this.state.seated = null; this.eyeY = 0;
    this.yaw = car ? Math.PI / 2 : Math.PI; this.pitch = -0.06;
    this.transition = { from, at: this.time }; this.clearInput();
    this.message(this.isZhLang() ? '已起身，可以继续参观。' : 'Back on your feet. Continue exploring.');
  }

  private atDriverDoor(): boolean {
    // Keep the standing visitor outside the complete swing, and enter through the
    // doorway rather than diagonally through the fender / windscreen / B-pillar.
    return this.position.x >= VILLA_CAR.exit.x - 0.07 && Math.abs(this.position.z - VILLA_CAR.exit.z) <= 0.48;
  }

  private secondaryInteraction() {
    if (this.transition) return;
    const id = nearestVillaHotspot(this.position)?.id;
    if (this.state.seated === 'car' || id === 'car') {
      if (!this.state.seated && !this.atDriverDoor()) {
        this.message(this.isZhLang() ? '站到驾驶位车门外侧，后退半步留出开门空间。' : 'Face the driver door and step back to leave room for its swing.'); return;
      }
      if (this.exitCarAt !== Infinity) return;
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
    if (this.state.seated === 'car') return zh ? 'E 下车 · Q 开关车门' : 'E exit · Q door';
    if (this.state.seated === 'racing') return zh ? `E 起身 · Q 信号源 ${this.state.screenSource.toUpperCase()}` : `E stand up · Q source ${this.state.screenSource.toUpperCase()}`;
    const hotspot = nearestVillaHotspot(this.position);
    if (!hotspot) return null;
    if (hotspot.id === 'car') return zh ? (this.state.carDoorOpen ? 'E 坐进驾驶位 · Q 关门' : 'E 打开驾驶位车门') : (this.state.carDoorOpen ? 'E take a seat · Q close door' : 'E open the driver door');
    return `E  ${zh ? hotspot.zh : hotspot.name}`;
  }

  private interact() {
    if (this.transition || this.exitCarAt !== Infinity) return;
    const hotspot = nearestVillaHotspot(this.position);
    const zh = this.isZhLang();
    if (this.state.seated === 'car') {
      this.closeCarAt = Infinity;
      this.exitCarAt = this.time + (this.state.carDoorOpen ? Math.max(0, this.doorReadyAt - this.time) : CAR_DOOR_SECONDS);
      this.state.carDoorOpen = true; this.clearInput(); this.message(zh ? '打开车门后下车…' : 'Opening the door to step outside…');
      this.scene?.updateActivities(this.time, this.state); this.publishState(); return;
    }
    if (this.state.seated === 'racing') { this.leaveSeat(); this.publishState(); return; }
    if (!hotspot) { this.message(zh ? '走近可互动的家具、车门或驾驶座，再按 E。' : 'Walk closer to a furnishing, driver door or simulator seat, then press E.'); return; }
    switch (hotspot.id) {
      case 'car':
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
    if (this.touchMode) {
      const s = this.uiScale();
      if (Math.hypot(point.x - (this.width - 70 * s), point.y - (this.height - 75 * s)) < 31 * s) { this.interact(); return true; }
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
      if (e.repeat) return;
      if (key === 'escape') {
        const wasPanel = this.mapOpen || this.helpOpen;
        this.mapOpen = false; this.helpOpen = false; this.clearInput(); this.unlock(); this.mouseLookEnabled = wasPanel;
      }
      else if (this.mapOpen && ['1', '2', '3'].includes(key)) this.mapFloor = Number(key) - 1;
      else if (key === 'm') this.activate('map');
      else if (key === 't') this.activate('time');
      else if (key === 'h') this.activate('home');
      else if (key === '?' || key === '/') this.activate('help');
      else if (key === 'e' && !this.mapOpen && !this.helpOpen) this.interact();
      else if (key === 'q' && !this.mapOpen && !this.helpOpen) this.secondaryInteraction();
      else if (key === 'l' && !this.mapOpen && !this.helpOpen) this.lockPointer();
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
          if (this.joystick?.id === touch.identifier) this.joystick = null;
          if (this.lookTouch?.id === touch.identifier) this.lookTouch = null;
        } else if (e.type === 'touchstart') {
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
      this.canvas.setAttribute('aria-label', zh ? '暖居别墅。WASD 行走，Shift 跑步，移动鼠标自动环顾，Esc 释放光标。沿楼梯上下楼。E 互动或入座，Q 车门或屏幕信号，M 导览图，T 日光黄昏，H 回门口。' : 'Warm Villa. WASD walk, Shift run, move mouse to look, Esc releases cursor. Walk up the stairs. E interact or sit, Q door or screen input, M floor plan, T daylight or sunset, H entrance.');
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
    const zh = this.isZhLang(), s = this.uiScale();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(33,35,31,.72)';
    this.rounded(ctx, 24, 22, this.touchMode ? 78 * s : 294, this.touchMode ? 42 * s : 68);
    ctx.fillStyle = '#fff7e9'; ctx.font = `500 ${this.touchMode ? 19 * s : 19}px ${UI_FONT}`;
    ctx.fillText(this.touchMode ? `${villaFloor(this.position.y) + 1}F` : (zh ? '暖居 · 一个温暖的家' : 'Warm Villa · Feel at home'), 40, this.touchMode ? 22 + 21 * s : 46);
    if (!this.touchMode) {
      ctx.fillStyle = '#d9d9c9'; ctx.font = `13px ${UI_FONT}`;
      ctx.fillText(`${villaFloor(this.position.y) + 1}F  /  ${zh ? '自在漫游' : 'Take your time'}`, 40, 73);
    }
    for (const b of this.buttons()) {
      ctx.fillStyle = 'rgba(33,35,31,.72)'; this.rounded(ctx, b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#fff7e9'; ctx.textAlign = 'center'; ctx.font = `500 ${this.touchMode ? 17 * s : 13}px ${UI_FONT}`;
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
    }
    ctx.textAlign = 'center';
    if (this.touchMode) {
      const origin = this.joystick?.origin ?? { x: 78 * s, y: this.height - 78 * s };
      ctx.strokeStyle = 'rgba(255,251,236,.45)'; ctx.lineWidth = 1.5 * s; ctx.fillStyle = 'rgba(29,35,31,.20)';
      ctx.beginPath(); ctx.arc(origin.x, origin.y, 51 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      let dx = (this.joystick?.point.x ?? origin.x) - origin.x, dy = (this.joystick?.point.y ?? origin.y) - origin.y;
      const length = Math.hypot(dx, dy); if (length > 42 * s) { dx *= 42 * s / length; dy *= 42 * s / length; }
      ctx.fillStyle = 'rgba(255,251,236,.45)'; ctx.beginPath(); ctx.arc(origin.x + dx, origin.y + dy, 20 * s, 0, Math.PI * 2); ctx.fill();
      ctx.font = `${12 * s}px ${UI_FONT}`; ctx.fillStyle = '#fffaee'; ctx.fillText(this.state.seated ? (zh ? '已入座' : 'Seated') : (zh ? '行走' : 'Walk'), origin.x, origin.y + 68 * s);
      ctx.fillStyle = 'rgba(33,35,31,.60)'; ctx.beginPath(); ctx.arc(this.width - 70 * s, this.height - 75 * s, 29 * s, 0, Math.PI * 2); ctx.fill();
      ctx.font = `500 ${15 * s}px ${UI_FONT}`; ctx.fillStyle = '#fff7e9'; ctx.fillText(this.state.seated ? (zh ? '起身' : 'Exit') : (zh ? '互动' : 'Use'), this.width - 70 * s, this.height - 75 * s);
    } else {
      ctx.fillStyle = 'rgba(255,251,238,.65)'; ctx.beginPath(); ctx.arc(this.width / 2, this.height / 2, 2, 0, Math.PI * 2); ctx.fill();
    }
    const hotspot = nearestVillaHotspot(this.position);
    let hint = this.time < this.toastUntil ? this.toast : this.interactionHint()
      ?? (this.touchMode ? (zh ? '右侧拖动看四周' : 'Drag right side to look')
        : !this.mouseLookEnabled ? (zh ? '点击画面继续自动环顾 · 无需按住鼠标' : 'Click the scene to resume mouse look · No dragging')
          : (zh ? 'WASD 行走 · Shift 跑步 · 移动鼠标环顾 · Esc 释放光标' : 'WASD walk · Shift run · Move mouse to look · Esc cursor'));
    // Keep touch actions meaningful while seated, rather than repeating a room name.
    if (this.touchMode && hint.length > (zh ? 17 : 38)) {
      hint = this.state.seated ? (zh ? '互动：起身 · 旁侧按钮：车门 / 信号' : 'Use: stand up · Door / Input beside it')
        : hotspot?.id === 'car' ? (zh ? '互动：开门 / 坐入驾驶位' : 'Use: open door / take a seat')
          : hotspot ? (zh ? hotspot.zh : hotspot.name) : (zh ? '不赶时间，慢慢逛' : 'Take your time and explore');
    }
    const font = this.touchMode ? 12 * s : 14;
    ctx.font = `${font}px ${UI_FONT}`; const tw = Math.min(this.width - 44, ctx.measureText(hint).width + 30);
    ctx.fillStyle = 'rgba(33,35,31,.72)'; this.rounded(ctx, (this.width - tw) / 2, this.height - (this.touchMode ? 28 * s : 54), tw, this.touchMode ? 22 * s : 32);
    ctx.fillStyle = '#fff7e9'; ctx.fillText(hint, this.width / 2, this.height - (this.touchMode ? 17 * s : 38));
    ctx.textBaseline = 'alphabetic';
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
    const range = this.mapFloor === 0 ? { x: -25, z: -17, w: 50, d: 41 } : { x: -13, z: -10, w: 26, d: 23 };
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
    if (villaFloor(this.position.y) === this.mapFloor) {
      ctx.save(); ctx.translate(mx(this.position.x), mz(this.position.z)); ctx.rotate(-this.yaw);
      ctx.fillStyle = '#d1774d'; ctx.strokeStyle = '#fff8e9'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    ctx.fillStyle = dark ? '#d1d4c0' : '#5b6654'; ctx.font = `${this.touchMode ? 11 * s : 14}px ${UI_FONT}`; ctx.textAlign = 'left';
    const legend = this.touchMode ? (zh ? '橙色：你 · ↑↓：楼梯' : 'Orange: you · ↑↓: stairs')
      : (zh ? '橙色箭头是你 · 沿双跑楼梯上下楼 · 地图不传送位置' : 'Orange arrow: you · Walk both stair flights to change floors · Map tabs do not teleport');
    ctx.fillText(legend, p.x + 8 * s, p.y + p.h - (this.touchMode ? 8 * s : 21));
  }

  private drawHelp(ctx: CanvasRenderingContext2D) {
    const zh = this.isZhLang(), p = this.panel(ctx, zh ? '慢慢走，像在自己家一样' : 'Make yourself at home');
    const rows = zh ? [
      ['W A S D', '前后左右行走；按住 Shift 跑步'], ['方向键', '↑ ↓ 行走，← → 转向'], ['鼠标移动', '自动环顾，无需按住；Esc 释放光标，点击画面恢复'],
      ['楼梯', '一楼走廊右侧进入，走到平台转弯，再走完另一跑'], ['E', '靠近家具互动；开车门后再按入座；入座后按 E 起身'], ['Q', '驾驶位开关车门；模拟器切换 PC / PS / Switch 虚拟画面'], ['M / T / H', '查看三层导览图 / 切换日光黄昏 / 回到门口'], ['手机 / 平板', '左侧行走，右侧环顾；互动旁按钮控制车门 / 大屏信号'],
    ] : [
      ['W A S D', 'Walk; hold Shift to run'], ['Arrow keys', 'Up / down to walk, left / right to turn'], ['Mouse move', 'Look without holding. Esc frees cursor; click scene to resume.'],
      ['Staircase', 'Right of the gallery. Walk to the landing, turn, continue up.'], ['E', 'Interact; open the car door then sit; press again to stand up.'], ['Q', 'Car door; simulator virtual PC / PS / Switch screen input.'], ['M / T / H', 'Floor plan / daylight and sunset / return to the entrance'], ['Touch', 'Left walk, right look; use the Door / Input button when seated'],
    ];
    ctx.textAlign = 'left';
    rows.forEach(([key, description], i) => {
      const y = p.y + 102 + i * 49;
      ctx.fillStyle = this.isDarkTheme() ? '#bccbb0' : '#507050'; ctx.font = `500 17px ${UI_FONT}`; ctx.fillText(key, p.x + 32, y);
      ctx.fillStyle = this.isDarkTheme() ? '#e2e3d5' : '#4b5347'; ctx.font = `16px ${UI_FONT}`; ctx.fillText(description, p.x + 186, y);
    });
    ctx.fillStyle = this.isDarkTheme() ? '#c4c9b8' : '#747965'; ctx.font = `14px ${UI_FONT}`;
    ctx.fillText(zh ? '没有倒计时，没有输赢。这里是你的家。' : 'No timer. No score. Just a home to explore.', p.x + 32, p.y + p.h - 30);
  }

  destroy() {
    super.destroy(); this.scene?.dispose(); this.scene = null; this.unlock();
    for (const key of Object.keys(this.canvas.dataset)) if (key.startsWith('villa')) delete this.canvas.dataset[key];
    if (this.oldAriaLabel == null) this.canvas.removeAttribute('aria-label'); else this.canvas.setAttribute('aria-label', this.oldAriaLabel);
  }
}
