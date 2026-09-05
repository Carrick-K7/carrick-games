import { BaseGame, createDefaultGameHost, type GameHost } from '../core/game.js';
import { VillaScene } from './villaScene.js';
import {
  moveVillaPlayer, nearestVillaHotspot, villaFloor, villaRoomAt,
  VILLA_BLOCKS, VILLA_ENTRANCE, VILLA_ROOMS, VILLA_SPAWN, POOL,
  type VillaPosition,
} from './villaWorld.js';
import type { VillaFurnishingState } from './villaFurnishings.js';

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
  private state: VillaFurnishingState = { evening: true, fireplace: true, gaming: true, fedUntil: 0 };
  private readonly keys = new Set<string>();
  private drag: Point | null = null;
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
    this.state = { evening: true, fireplace: true, gaming: true, fedUntil: 0 };
    this.toast = ''; this.toastUntil = 0; this.visited = new Set(['garden']);
    this.touchMode = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    if (!this.scene) {
      try { this.scene = new VillaScene(); this.unavailable = false; }
      catch { this.unavailable = true; }
    }
    this.publishState();
  }

  protected onStart() {
    const blur = () => this.clearInput();
    const visibility = () => { if (document.hidden) this.clearInput(); };
    const pointerMove = (e: MouseEvent) => {
      if (document.pointerLockElement === this.canvas && !this.mapOpen && !this.helpOpen && !this.shellOpen()) this.look(e.movementX, e.movementY, 0.0023);
    };
    const lockChange = () => this.clearInput();
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('mousemove', pointerMove);
    document.addEventListener('pointerlockchange', lockChange);
    this.canvas.addEventListener('touchcancel', blur);
    this.registerCleanup(() => {
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('mousemove', pointerMove);
      document.removeEventListener('pointerlockchange', lockChange);
      this.canvas.removeEventListener('touchcancel', blur);
      this.clearInput(); this.unlock();
    });
  }

  private shellOpen(): boolean {
    return !!document.getElementById('gameLibrary')?.classList.contains('open')
      || document.getElementById('overflowMenu')?.hidden === false;
  }

  private clearInput() {
    this.keys.clear(); this.drag = null; this.joystick = null; this.lookTouch = null;
    this.canvas.style.cursor = '';
  }

  private unlock() { if (document.pointerLockElement === this.canvas) document.exitPointerLock?.(); }

  private look(dx: number, dy: number, sensitivity = 0.0038) {
    this.yaw -= dx * sensitivity;
    this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));
    this.pitch = Math.max(-1.14, Math.min(1.14, this.pitch - dy * sensitivity));
  }

  update(dt: number) {
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(0.05, dt)) : 0;
    this.time += dt;
    if (this.shellOpen() || document.hidden) { this.clearInput(); this.unlock(); }
    if (!this.mapOpen && !this.helpOpen && !this.unavailable) {
      let forward = Number(this.keys.has('w') || this.keys.has('arrowup')) - Number(this.keys.has('s') || this.keys.has('arrowdown'));
      let side = Number(this.keys.has('d')) - Number(this.keys.has('a'));
      this.yaw += (Number(this.keys.has('arrowleft')) - Number(this.keys.has('arrowright'))) * dt * 1.5;
      if (this.joystick) {
        const dx = this.joystick.point.x - this.joystick.origin.x;
        const dy = this.joystick.point.y - this.joystick.origin.y;
        const radius = 56 * this.uiScale();
        side += Math.max(-1, Math.min(1, dx / radius));
        forward -= Math.max(-1, Math.min(1, dy / radius));
      }
      const magnitude = Math.hypot(forward, side);
      if (magnitude > 1) { forward /= magnitude; side /= magnitude; }
      const speed = this.keys.has('shift') ? 4.6 : 2.75;
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
    return labels.map((label, i) => ({ id: ids[i], x: start + i * (w + gap), y: 22, w, h: size, label }));
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
        this.mapOpen = !this.mapOpen; this.helpOpen = false; this.mapFloor = villaFloor(this.position.y); this.clearInput(); this.unlock(); break;
      case 'time': this.state.evening = !this.state.evening; break;
      case 'home':
        this.position = { ...VILLA_ENTRANCE }; this.eyeY = 0; this.yaw = 0; this.pitch = 0.04;
        this.mapOpen = false; this.helpOpen = false; this.clearInput();
        this.message(this.isZhLang() ? '回到家门口，欢迎回家。' : 'Back at the front door. Welcome home.'); break;
      case 'help': this.helpOpen = !this.helpOpen; this.mapOpen = false; this.clearInput(); this.unlock(); break;
      case 'interact': this.interact(); break;
    }
    this.publishState();
  }

  private message(text: string) { this.toast = text; this.toastUntil = this.time + 4.5; }

  private interact() {
    const hotspot = nearestVillaHotspot(this.position);
    const zh = this.isZhLang();
    if (!hotspot) { this.message(zh ? '走近鱼缸、壁炉、茶桌或电竞桌，再按 E。' : 'Walk closer to the aquarium, fireplace, tea or gaming desk.'); return; }
    switch (hotspot.id) {
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
        this.mapOpen = false; this.helpOpen = false; this.publishState(); return true;
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
        e.preventDefault(); this.keys.add(key); return;
      }
      if (e.repeat) return;
      if (key === 'escape') { this.mapOpen = false; this.helpOpen = false; this.clearInput(); this.unlock(); }
      else if (this.mapOpen && ['1', '2', '3'].includes(key)) this.mapFloor = Number(key) - 1;
      else if (key === 'm') this.activate('map');
      else if (key === 't') this.activate('time');
      else if (key === 'h') this.activate('home');
      else if (key === '?' || key === '/') this.activate('help');
      else if (key === 'e' && !this.mapOpen && !this.helpOpen) this.interact();
      else if (key === 'l' && !this.mapOpen && !this.helpOpen) {
        try {
          const request = this.canvas.requestPointerLock?.();
          if (request && typeof request.catch === 'function') request.catch(() => this.message(this.isZhLang() ? '可继续按住鼠标拖动视角。' : 'You can still drag to look around.'));
        } catch { this.message(this.isZhLang() ? '请按住鼠标拖动视角。' : 'Hold and drag to look around.'); }
      }
      this.publishState();
    } else if (e instanceof MouseEvent) {
      if (e.type === 'mouseup') { this.drag = null; this.canvas.style.cursor = ''; return; }
      if (document.pointerLockElement === this.canvas) return;
      if (e.type === 'mousedown' && e.button === 0) {
        const point = this.canvasPoint(e.clientX, e.clientY);
        if (this.clickUi(point)) return;
        this.drag = point; this.canvas.style.cursor = 'grabbing';
      } else if (e.type === 'mousemove' && this.drag) {
        const point = this.canvasPoint(e.clientX, e.clientY);
        this.look(point.x - this.drag.x, point.y - this.drag.y); this.drag = point;
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
      this.canvas.setAttribute('aria-label', zh ? '暖居别墅。WASD 行走，拖动视角，沿楼梯上下楼。E 互动，M 导览图，T 日光黄昏，H 回门口。' : 'Warm Villa. WASD to walk, drag to look, walk up the stairs. E interact, M floor plan, T daylight or sunset, H entrance.');
    }
    ctx.fillStyle = dark ? '#252e2e' : '#d9d4c9'; ctx.fillRect(0, 0, this.width, this.height);
    const rendered = this.scene?.render(ctx, this.width, this.height, this.pixelRatio, { ...this.position, y: this.eyeY, yaw: this.yaw, pitch: this.pitch }, this.time, this.state);
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
    const zh = this.isZhLang(), s = this.uiScale(), room = villaRoomAt(this.position);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(33,35,31,.72)';
    this.rounded(ctx, 24, 22, this.touchMode ? 78 * s : 294, this.touchMode ? 42 * s : 68);
    ctx.fillStyle = '#fff7e9'; ctx.font = `500 ${this.touchMode ? 19 * s : 19}px ${UI_FONT}`;
    ctx.fillText(this.touchMode ? `${villaFloor(this.position.y) + 1}F` : (zh ? '暖居 · 一个温暖的家' : 'Warm Villa · Feel at home'), 40, this.touchMode ? 22 + 21 * s : 46);
    if (!this.touchMode) {
      ctx.fillStyle = '#d9d9c9'; ctx.font = `13px ${UI_FONT}`;
      ctx.fillText(`${villaFloor(this.position.y) + 1}F  /  ${zh ? room.zh : room.name}`, 40, 73);
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
      ctx.font = `${12 * s}px ${UI_FONT}`; ctx.fillStyle = '#fffaee'; ctx.fillText(zh ? '行走' : 'Walk', origin.x, origin.y + 68 * s);
      ctx.fillStyle = 'rgba(33,35,31,.60)'; ctx.beginPath(); ctx.arc(this.width - 70 * s, this.height - 75 * s, 29 * s, 0, Math.PI * 2); ctx.fill();
      ctx.font = `500 ${15 * s}px ${UI_FONT}`; ctx.fillStyle = '#fff7e9'; ctx.fillText(zh ? '互动' : 'Use', this.width - 70 * s, this.height - 75 * s);
    } else {
      ctx.fillStyle = 'rgba(255,251,238,.65)'; ctx.beginPath(); ctx.arc(this.width / 2, this.height / 2, 2, 0, Math.PI * 2); ctx.fill();
    }
    const hotspot = nearestVillaHotspot(this.position);
    let hint = this.time < this.toastUntil ? this.toast : hotspot ? `${this.touchMode ? '' : 'E  ·  '}${zh ? hotspot.zh : hotspot.name}`
      : this.touchMode ? (zh ? '右侧拖动看四周' : 'Drag right side to look')
        : this.time < 22 ? (zh ? 'WASD 行走 · 按住鼠标环顾 · M 查看路线 · H 回门口' : 'WASD to walk · Hold and drag to look · M floor plan · H entrance')
          : (zh ? '不赶时间，慢慢逛。楼梯就在一楼走廊右侧。' : 'Take your time. The staircase is on the right of the gallery.');
    // Keep mobile hints short; long interaction messages still remain visible on desktop.
    if (this.touchMode && hint.length > (zh ? 17 : 38)) hint = hotspot ? (zh ? hotspot.zh : hotspot.name) : (zh ? room.zh : room.name);
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
      ['W A S D', '前后左右行走；Shift 加快脚步'], ['方向键', '↑ ↓ 行走，← → 转向'], ['鼠标拖动', '按住鼠标环顾四周；L 可锁定鼠标，Esc 释放'],
      ['楼梯', '一楼走廊右侧进入，走到平台转弯，再走完另一跑'], ['E', '靠近鱼缸喂鱼、开关壁炉和电竞设备、喝茶'], ['M / T / H', '查看三层导览图 / 切换日光黄昏 / 回到门口'], ['手机 / 平板', '左侧摇杆行走，右侧拖动视角，点击“互动”'],
    ] : [
      ['W A S D', 'Walk; hold Shift for a brisker pace'], ['Arrow keys', 'Up / down to walk, left / right to turn'], ['Mouse drag', 'Hold to look; optional L pointer lock, Esc to release'],
      ['Staircase', 'Right of the gallery. Walk to the landing, turn, continue up.'], ['E', 'Feed fish, toggle fireplace and gaming setup, enjoy warm tea'], ['M / T / H', 'Floor plan / daylight and sunset / return to the entrance'], ['Touch', 'Left joystick to walk, right drag to look, tap Use to interact'],
    ];
    ctx.textAlign = 'left';
    rows.forEach(([key, description], i) => {
      const y = p.y + 108 + i * 55;
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
