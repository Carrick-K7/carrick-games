// csEngine.js — carrick-cs v13 game core, restructured as a DOM-free class.
//
// This is a faithful port of the standalone app's game.js: same simulation,
// same round/economy/bot logic, same rendering. The original module-level
// state becomes instance fields; every DOM HUD write becomes a mutation of
// the plain `hud` view-model (drawn by csHud.ts); pointer lock, shell canvas
// and score reporting arrive through `hooks`. The shell drives the loop via
// update(dt) + render() instead of three's setAnimationLoop.

import * as T from 'three';
import { SnowWorld } from './csWorld.js';
import { WEAPONS, SOLDIER_HITBOX, makeWeapon, makeSoldier, attachSoldierWeapon, poseSoldierWeapon } from './csWeapons.js';
import { applyWeaponAnimation, reloadCues, reloadLabel } from './csWeaponMotion.js';
import { DEPLOY, deployCues } from './csWeaponDeploy.js';
import { GameAudio } from './csAudio.js';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, lookSensitivity } from './csSettings.js';
import { GameFocusGuard } from './csInputFocus.js';
import { RECOIL, shotRecoil, recoverRecoil, viewMuzzle, actorMuzzle, KEY_ACTIONS } from './csWeaponBehavior.js';
import { assignRoute, routeDestination, chooseRespawn, assignDustRoute, createDustPlan, dustGuardPoint } from './csTactics.js';
import { MAPS } from './csMaps.js';
import { BombRound, BOMB_RULES } from './csBombMode.js';
import { SHOP, BUY_CATEGORIES, awardMoney, settleRound } from './csEconomy.js';

const RESPAWN_DELAY = 3, PICKUP_REFRESH = 8, GRENADE_PIN_TIME = .42;
const CONFIGS = { easy: { reaction: .65, accuracy: .26, damage: .68, speed: 2.8 }, normal: { reaction: .4, accuracy: .43, damage: .82, speed: 3.2 }, hard: { reaction: .23, accuracy: .64, damage: 1, speed: 3.6 } };
const BOT_NAMES = { ct: ['FROST', 'NOVA', 'ECHO', 'GHOST', 'ATLAS'], t: ['VIPER', 'RAZE', 'EMBER', 'WOLF', 'HAVOC'] };
const RADIO = {
  radio1: ['掩护我', '你们守住这里', '坚守阵地', '重新集合', '跟我来', '请求支援'],
  radio2: ['冲锋', '撤退', '集合行动', '守住这个区域', '向前推进', '报告情况'],
  radio3: ['收到', '发现敌人', '需要增援', '区域安全', '我正在赶来', '炸弹即将爆炸', '拒绝', '击毙敌人'],
};
const RADIO_EN = {
  radio1: ['Cover me', 'Hold this position', 'Hold your ground', 'Regroup', 'Follow me', 'Need backup'],
  radio2: ['Charge', 'Fall back', 'Group up', 'Hold this area', 'Push forward', 'Report in'],
  radio3: ['Roger', 'Enemy spotted', 'Need reinforcements', 'Area clear', 'On my way', 'Bomb about to blow', 'Negative', 'Enemy down'],
};
const RADIO_FOLLOW = ['跟我来', '重新集合', '集合行动', '需要增援', '请求支援'];

export function freeGeometry(group) { group?.traverse(o => { if (o.isMesh) o.geometry?.dispose(); }); }

export class CsEngine {
  /**
   * @param opts { width, height, isZh: () => boolean, hooks: {
   *   requestCapture?: () => void, releaseCapture?: () => void,
   *   pointerLocked?: () => boolean, onMatchEnd?: (result) => void } }
   */
  constructor(opts = {}) {
    this.width = opts.width || 1280;
    this.height = opts.height || 720;
    this.isZh = opts.isZh || (() => true);
    this.hooks = opts.hooks || {};
    this.canvas3d = opts.canvas || (typeof document !== 'undefined' ? document.createElement('canvas') : null);

    this.audio = new GameAudio();
    this.controlSettings = loadSettings();
    this.quality = 'high';

    this.scene = new T.Scene();
    this.scene.background = new T.Color(0xa9c4d8);
    this.scene.fog = new T.Fog(0xa9c4d8, 48, 145);
    const aspect = this.width / this.height;
    this.camera = new T.PerspectiveCamera(76, aspect, .045, 250);
    this.camera.rotation.order = 'YXZ';
    this.gunScene = new T.Scene();
    this.gunCamera = new T.PerspectiveCamera(62, aspect, .01, 10);
    this.gunScene.add(new T.HemisphereLight(0xf2f8ff, 0x54718b, 2.4));
    const gunLight = new T.DirectionalLight(0xffedcf, 3);
    gunLight.position.set(-2, 4, 3);
    this.gunScene.add(gunLight);
    this.ambient = new T.HemisphereLight(0xe1f0ff, 0x687d8d, 2.3);
    this.scene.add(this.ambient);
    this.sun = new T.DirectionalLight(0xffeeda, 2.7);
    this.sun.position.set(-25, 48, 18);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 140 });
    this.sun.shadow.bias = -.00025;
    this.sun.shadow.normalBias = .035;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Full match state (module-level `let`s in the standalone build).
    /** @type {T.WebGLRenderer | null} */ this.renderer = null;
    /** @type {any} */ this.world = null;
    this.ready = false; this.phase = 'menu';
    this.selectedTeam = 'ct'; this.difficulty = 'normal'; this.round = 0;
    this.scores = { ct: 0, t: 0 }; this.roundTime = 105; this.freezeTime = 0;
    this.transitionTime = 0; this.phaseBeforePause = ''; this.roundWinner = '';
    /** @type {any} */ this.player = null;
    /** @type {any[]} */ this.bots = [];
    /** @type {any[]} */ this.all = [];
    /** @type {any[]} */ this.pickupItems = [];
    this.effects = []; this.selectedPickup = null; this.clock = 0;
    this.frameCount = 0; this.fpsTime = 0; this.fps = 60;
    this.hitOpacity = 0; this.hitHead = false; this.damageOpacity = 0; this.noticeTime = 0;
    this.gun = null; this.gunId = ''; this.recoil = 0; this.kickPitch = 0; this.kickYaw = 0;
    this.zoom = 0; this.sensitivity = this.controlSettings.sensitivity;
    this.fireHeld = false; this.shotPressed = false; this.mouseLocked = false;
    this.dragLook = false; this.dragX = 0; this.dragY = 0; this.crouching = false;
    this.stepTimer = 0; this.viewBob = 0; this.spectating = null; this.autoSpectateDelay = 0;
    this.aimedEnemy = null; this.skipPointerPause = false; this.matchActive = false;
    this.touchMode = typeof matchMedia !== 'undefined' ? matchMedia('(pointer:coarse)').matches : false;
    this.grenades = []; this.corpses = [];
    this.radioMenu = null; this.grenadePrime = null; this.bomb = null; this.bombMesh = null;
    this.bombBeepAt = 0; this.bombLastBeep = -99; this.buyOpen = false;
    this.mapLoading = false; this.buyCategory = 'pistol'; this.dustPlan = null;
    this.settingsOpen = false; this.settingsOrigin = 'menu'; this.mapOpen = false;
    this.selectedMode = 'elimination'; this.mode = 'elimination';
    this.selectedKillLimit = 50; this.killLimit = 50; this.matchElapsed = 0;
    this.selectedMap = 'fy_snow'; this.selectedPistol = 'default';
    this.radarBase = null; this.bootError = '';
    this.settingsNote = '';

    this.keys = new Set();
    this.touchMove = { x: 0, y: 0 };

    // View-model read by the canvas HUD every frame.
    /** @type {import('./csHud.js').CsHudView} */
    this.hud = {
      fps: '60', notice: null, center: null,
      health: 100, armor: 100, killCount: 0, grenadeCount: 0,
      weaponName: '', ammoText: '', reserveText: '', reloadState: '',
      slots: [], pickup: null, crosshairHidden: true, crosshairGap: 2,
      scope: false, scopeLabel: '', hitOpacity: 0, hitHead: false, damageOpacity: 0,
      location: '', roundLabel: '', timerText: '', timerUrgent: false,
      ctScore: 0, tScore: 0, alivePips: { ct: [], t: [] },
      objective: null, objectiveAction: null, money: null,
      buyTimeText: '', matchEnd: null, radio: null, killfeed: [],
      menuStart: { enabled: false, label: '' }, menuError: '',
      bombMarker: null, scoreboardOpen: false, healthPct: 100, healthLow: false,
    };

    this.focusGuard = new GameFocusGuard({
      active: () => this.matchActive && ['active', 'freeze', 'round-end'].includes(this.phase),
      modalOpen: () => this.overlayOpen(),
      pause: () => this.pauseGame(),
      clearInput: () => this.clearHeldInput(),
      hidden: () => typeof document !== 'undefined' && !!document.hidden,
      focused: () => typeof document === 'undefined' || document.hasFocus?.() !== false,
    });
  }

  L(zh, en) { return this.isZh() ? zh : en; }
  modeName() { return this.mode === 'tdm' ? this.L('团队竞技', 'Team Deathmatch') : this.mode === 'defusal' ? this.L('经典爆破', 'Defusal') : this.L('回合歼灭', 'Elimination'); }
  teamName(team) { return team === 'ct' ? this.L('反恐精英', 'Counter-Terrorists') : this.L('恐怖分子', 'Terrorists'); }
  winTarget() { return this.mode === 'tdm' ? this.killLimit : 7; }

  // ── Boot / renderer ──────────────────────────────────────────────────────

  async init() {
    this.audio.preload();
    try {
      this.renderer = new T.WebGLRenderer({ canvas: this.canvas3d, antialias: true, powerPreference: 'high-performance' });
      this.renderer.setSize(this.width, this.height, false);
      this.renderer.outputColorSpace = T.SRGBColorSpace;
      this.renderer.toneMapping = T.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.0;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = T.PCFSoftShadowMap;
      this.renderer.autoClear = false;
      this.applyQuality();
      await this.loadMap(this.selectedMap);
    } catch (e) {
      console.error(e);
      this.bootError = e?.message || String(e);
      this.hud.menuError = this.bootError.includes('WebGL')
        ? this.L('请启用浏览器硬件加速，然后重新开始。', 'Enable browser hardware acceleration, then restart.')
        : this.L('地图或渲染器加载失败，请重新开始。', 'Map or renderer failed to load. Restart the game.');
      this.notify(this.L('未能加载游戏：', 'Failed to load: ') + this.bootError, 120);
    }
  }

  dispose() {
    try { this.renderer?.setAnimationLoop(null); } catch { /* noop */ }
    try {
      for (const a of this.all) if (a.mesh) { this.scene.remove(a.mesh); freeGeometry(a.mesh); }
      this.clearEffects(); this.clearCorpses();
      for (const p of this.pickupItems) { this.scene.remove(p.mesh); freeGeometry(p.mesh); }
      if (this.gun) { this.gunScene.remove(this.gun); freeGeometry(this.gun); }
      this.world?.dispose?.();
      this.renderer?.dispose();
    } catch { /* best effort */ }
    this.renderer = null;
  }

  applyQuality() {
    if (!this.renderer) return;
    const low = this.quality === 'low';
    const dpr = typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1;
    this.renderer.setPixelRatio(Math.min(dpr, low ? 1 : 2, Math.sqrt(4500000 / (this.width * this.height))));
    this.renderer.shadowMap.enabled = !low;
    this.sun.shadow.needsUpdate = true;
    if (this.world?.snow) this.world.snow.visible = !low;
  }

  setQuality(q) { this.quality = q === 'low' ? 'low' : 'high'; this.applyQuality(); }
  toggleSound() { this.audio.enabled = !this.audio.enabled; this.audio.init(); }

  // ── Map loading ──────────────────────────────────────────────────────────

  async loadMap(id) {
    if (this.mapLoading || this.matchActive || !MAPS[id]) return false;
    if (this.ready && this.world?.config.id === id) return true;
    this.mapLoading = true; this.ready = false;
    this.hud.menuStart = { enabled: false, label: this.L('正在装载 ', 'Loading ') + MAPS[id].name + '…' };
    const candidate = new SnowWorld(this.scene, MAPS[id]);
    candidate.mapGroup.visible = false; candidate.environment.visible = false;
    try {
      await candidate.load(MAPS[id].asset);
      if (!candidate.spawns.ct.length || !candidate.spawns.t.length || (id === 'de_dust2' && candidate.bombSites.length !== 2)) throw new Error(this.L('地图出生点或包点不完整', 'Map spawns or bomb sites incomplete'));
      for (const a of this.all) { if (a.mesh) { this.scene.remove(a.mesh); freeGeometry(a.mesh); } }
      this.all = []; this.bots = []; this.player = null; this.clearEffects(); this.clearCorpses(); this.clearBomb();
      this.world?.dispose?.(); this.world = candidate; this.selectedMap = id;
      this.world.mapGroup.visible = true; this.world.environment.visible = true;
      if (!MAPS[id].modes.includes(this.selectedMode)) this.selectedMode = MAPS[id].defaultMode;
      const desert = this.world.theme === 'desert', sky = desert ? 0xc7c4b1 : 0xa9c4d8;
      this.scene.background = new T.Color(sky);
      this.scene.fog = new T.Fog(sky, desert ? 110 : 48, desert ? 245 : 145);
      this.ambient.color.setHex(desert ? 0xfff1d4 : 0xe1f0ff);
      this.ambient.groundColor.setHex(desert ? 0x877256 : 0x687d8d);
      this.sun.target.position.copy(this.world.center);
      this.sun.position.copy(this.world.center).add(new T.Vector3(-35, 70, 25));
      const size = Math.max(36, this.world.size * .55);
      Object.assign(this.sun.shadow.camera, { left: -size, right: size, top: size, bottom: -size, far: 240 });
      this.sun.shadow.camera.updateProjectionMatrix();
      this.populatePickups(); this.makeRadarBase();
      this.ready = true;
      this.hud.menuStart = { enabled: true, label: this.L('进入战场', 'Enter the Arena') + ' ↗' };
      this.applyQuality();
      return true;
    } catch (e) {
      candidate.dispose?.();
      this.ready = !!this.world;
      this.hud.menuStart = { enabled: true, label: this.ready ? this.L('进入战场', 'Enter the Arena') + ' ↗' : this.L('重试加载地图', 'Retry Map Load') };
      this.notify(this.L('地图加载失败：', 'Map load failed: ') + e.message + this.L(' · 可重新选择或重试', ' · pick another map or retry'), 8);
      return false;
    } finally { this.mapLoading = false; }
  }

  selectMap(id) { if (id !== this.selectedMap) this.loadMap(id); }
  selectMode(m) { if (MAPS[this.selectedMap].modes.includes(m)) this.selectedMode = m; }
  selectTeam(t) { this.selectedTeam = t === 't' ? 't' : 'ct'; }
  setDifficulty(d) { if (CONFIGS[d]) this.difficulty = d; }
  setPistol(v) { this.selectedPistol = v === 'deagle' ? 'deagle' : 'default'; }
  setKillLimit(v) { this.selectedKillLimit = [30, 50, 100].includes(+v) ? +v : 50; }
  primaryAction() { if (this.ready) this.startMatch(); else this.loadMap(this.selectedMap); }

  // ── HUD events ───────────────────────────────────────────────────────────

  notify(msg, dur = 3) { this.hud.notice = { text: msg }; this.noticeTime = dur; }
  center(kicker, title, detail) { this.hud.center = { kicker, title, detail }; }
  hideCenter() { this.hud.center = null; }

  addKill(a, b, w, head) {
    this.hud.killfeed.push({ aName: a.name, aTeam: a.team, aMe: a.isPlayer, bName: b.name, bTeam: b.team, weapon: WEAPONS[w]?.name || w, head, time: this.clock });
    while (this.hud.killfeed.length > 6) this.hud.killfeed.shift();
  }

  updateAlive() {
    for (const team of ['ct', 't']) {
      this.hud.alivePips[team] = this.all.filter(a => a.team === team).map(a => a.alive ? (a.isPlayer ? 'me' : 'alive') : 'dead');
    }
  }

  // ── Bomb mode glue ───────────────────────────────────────────────────────

  clearBomb() {
    if (this.bombMesh) { this.scene.remove(this.bombMesh); freeGeometry(this.bombMesh); this.bombMesh.userData.led?.material.dispose(); this.bombMesh = null; }
    this.bomb = null;
    this.hud.objective = null; this.hud.objectiveAction = null;
  }

  makeBombVisual() {
    this.bombMesh = makeWeapon('c4');
    const led = new T.Mesh(new T.SphereGeometry(.018, 8, 6), new T.MeshBasicMaterial({ color: 0xff573f }));
    led.position.set(.07, .10, -.075);
    this.bombMesh.add(led);
    this.bombMesh.userData.led = led;
    this.scene.add(this.bombMesh);
    this.bombMesh.visible = false;
    this.bombBeepAt = this.clock; this.bombLastBeep = -99;
  }

  syncBombInventory() {
    for (const a of this.all) {
      const carried = this.bomb?.status === 'carried' && this.bomb.carrier === a;
      if (carried) { if (!a.inventory.bomb) a.inventory.bomb = this.inventoryWeapon('c4'); }
      else {
        a.inventory.bomb = null;
        if (a.slot === 'bomb') { a.slot = a.inventory.primary ? 'primary' : 'pistol'; if (a.isPlayer) this.setGun(); else this.equipBotModel(a); }
      }
    }
  }

  handleBombEvents(events) {
    for (const e of events) {
      if (e.type === 'picked') { this.syncBombInventory(); if (e.actor === this.player) this.notify(this.L('已拾取 C4 · 按 5 切换，前往 A 或 B 包点', 'Picked up the C4 · press 5, head to site A or B'), 3); }
      if (e.type === 'planted') {
        awardMoney(e.actor, 300); this.syncBombInventory(); this.audio.tone(980, .2, .22);
        this.notify(this.L(e.site + ' 点炸弹已安放 · 40 秒后爆炸', 'Bomb planted at ' + e.site + ' · explodes in 40s'), 4);
        for (const b of this.bots) { b.path = []; b.pathTime = 0; b.route = []; b.routeIndex = 0; b.guardPoint = null; b.guardUntil = 0; }
      }
      if (e.type === 'defused') { awardMoney(e.actor, 300); this.audio.tone(1300, .4, .25); }
      if (e.type === 'exploded') {
        this.audio.burst(.8, 2.2, 1000); this.audio.tone(45, .8, .85, 'triangle', 18);
        const glow = new T.Mesh(new T.SphereGeometry(2, 18, 12), new T.MeshBasicMaterial({ color: 0xffb66a, transparent: true, opacity: .65, depthWrite: false }));
        glow.position.copy(this.bomb.pos); this.scene.add(glow);
        this.effects.push({ mesh: glow, life: .9, total: .9, disposeMat: true, expand: true });
        for (const a of this.all) {
          if (!a.alive) continue;
          const d = a.pos.distanceTo(this.bomb.pos);
          if (d > 35) continue;
          const source = { team: a.team === 't' ? 'ct' : 't', name: 'C4', pos: this.bomb.pos, kills: 0, headshots: 0, damageDealt: 0 };
          this.damageActor(a, 600 * Math.exp(-((d / 14) ** 2)), source, 'c4');
        }
        this.damageOpacity = Math.max(this.damageOpacity, this.player.pos.distanceTo(this.bomb.pos) < 30 ? .5 : .08);
      }
      if (e.type === 'win') this.endRound(e.team, e.reason);
    }
  }

  updateBomb(dt) {
    if (!this.bomb) return;
    const requests = new Set(this.bots.filter(b => b.alive && b.objectiveUse));
    if (this.player.alive && !this.overlayOpen() && (this.keys.has('KeyE') || (this.player.slot === 'bomb' && this.fireHeld)) && this.player.reload <= 0) {
      if (this.bomb.canPlant(this.player) && this.player.slot !== 'bomb') this.switchWeapon('bomb');
      requests.add(this.player);
    }
    const events = this.bomb.tick(dt, this.all, requests);
    this.roundTime = this.bomb.remaining;
    this.handleBombEvents(events);
    this.syncBombInventory();
    if (this.bombMesh) {
      this.bombMesh.visible = ['dropped', 'planted'].includes(this.bomb.status);
      this.bombMesh.position.copy(this.bomb.pos);
      this.bombMesh.userData.led.visible = this.bomb.status === 'planted' && this.clock - this.bombLastBeep < .10;
    }
    if (this.bomb.status === 'planted' && this.phase === 'active' && this.clock >= this.bombBeepAt) {
      const distance = this.camera.position.distanceTo(this.bomb.pos);
      this.audio.tone(1700, .055, Math.max(.015, .19 / (1 + distance * .09)), 'sine');
      this.bombLastBeep = this.clock;
      this.bombBeepAt = this.clock + Math.max(.13, this.bomb.fuse / 40 * .92);
    }
  }

  updateObjectiveHud() {
    const hud = this.hud, bomb = this.bomb, player = this.player;
    hud.buyTimeText = this.mode === 'tdm'
      ? this.L('在出生购买区内更换装备', 'Swap equipment inside your spawn buy zone')
      : this.L('购买时间剩余 ', 'Buy time left ') + Math.ceil(Math.max(0, BOMB_RULES.buyTime - (bomb?.elapsed || 0))) + this.L(' 秒', 's');
    hud.money = this.world?.theme === 'desert'
      ? (this.mode === 'defusal' ? '$ ' + player.money + ' · B ' + this.L('购买', 'Buy') : 'B ' + this.L('更换装备', 'Swap gear'))
      : null;
    if (this.mode !== 'defusal' || !bomb) { hud.objective = null; hud.objectiveAction = null; return; }
    const carrier = bomb.carrier;
    const text = bomb.status === 'defused' ? this.L('炸弹已拆除', 'Bomb defused')
      : bomb.status === 'exploded' ? this.L('炸弹已爆炸', 'Bomb exploded')
      : bomb.status === 'planted' ? bomb.site.id + this.L(' 点已安放 · ', ' planted · ') + Math.ceil(bomb.fuse) + 's'
      : bomb.status === 'dropped' ? (player.team === 't' ? this.L('C4 已掉落 · 前往雷达标记拾取', 'C4 dropped · grab it at the radar mark') : this.L('防守 A / B 包点', 'Defend sites A / B'))
      : carrier === player ? this.L('你携带 C4 · 前往 A / B 包点', 'You carry the C4 · head to site A / B')
      : player.team === 't' ? this.L('掩护 ', 'Escort ') + (carrier?.name || this.L('队友', 'teammate')) + this.L(' 进攻包点', ' to the site')
      : this.L('防守 A / B 包点 · ', 'Defend A / B · ') + (player.defuseKit ? this.L('已携带拆弹器', 'kit carried') : this.L('拆弹需 10 秒', 'defuse takes 10s'));
    let hint = '';
    if (player.alive && this.phase === 'active') {
      if (bomb.canPlant(player)) hint = this.L('按住 E 或切换 5 后按住左键安放', 'Hold E, or press 5 then hold fire, to plant');
      else if (bomb.canDefuse(player)) hint = this.L('按住 E 拆除 · ', 'Hold E to defuse · ') + (player.defuseKit ? '5' : '10') + 's';
    }
    hud.objective = { text, plantVerb: bomb.canPlant(player), defuseVerb: bomb.canDefuse(player) };
    const action = bomb.action?.actor === player ? bomb.action : null;
    hud.objectiveAction = (action || hint) ? {
      text: action ? (action.kind === 'plant' ? this.L('正在安放', 'Planting') : this.L('正在拆除', 'Defusing')) + ' · ' + Math.max(0, action.duration - action.progress).toFixed(1) + 's' : hint,
      progress01: action ? Math.min(1, action.progress / action.duration) : 0,
    } : null;
  }

  updateBotObjective(b) {
    b.objectiveUse = false;
    if (!this.bomb || this.mode !== 'defusal') return false;
    const bomb = this.bomb, clock = this.clock;
    const danger = b.target?.alive && b.pos.distanceTo(b.target.pos) < 18,
      plant = bomb.carrier === b && bomb.canPlant(b) && (!danger || bomb.remaining < 5),
      defuse = bomb.canDefuse(b) && (!danger || bomb.fuse < (b.defuseKit ? 7 : 12));
    if (plant || defuse) {
      b.objectiveUse = true; b.moveSpeed = 0; b.moveVel.set(0, 0, 0);
      if (plant && b.slot !== 'bomb') { b.slot = 'bomb'; this.equipBotModel(b); }
      b.mesh.position.copy(b.pos); b.mesh.position.y += b.mesh.userData.groundOffset || 0;
      for (const leg of b.mesh.userData.legs) leg.rotation.x = 0;
      this.updateBotWeapon(b);
      return true;
    }
    if (b.slot === 'bomb') { b.slot = b.inventory.primary ? 'primary' : 'pistol'; this.equipBotModel(b); }
    return false;
  }

  botGuard(b, pos) {
    if (!b.guardPoint || this.clock >= b.guardUntil) { b.guardPoint = dustGuardPoint(this.world, b, pos); b.guardUntil = this.clock + 5 + Math.random() * 7; }
    return b.pos.distanceTo(b.guardPoint) > .65 ? b.guardPoint : null;
  }

  objectiveDestination(b, opponents) {
    const bomb = this.bomb, world = this.world, clock = this.clock;
    if (!bomb || this.mode !== 'defusal') {
      if (world.theme === 'desert' && !routeDestination(b, []) && clock >= (b.patrolAt || 0)) {
        assignDustRoute(world, b, this.bots.indexOf(b), this.round);
        b.openingWait = 0; b.patrolAt = clock + 10 + Math.random() * 10;
      }
      return routeDestination(b, opponents);
    }
    if (bomb.status === 'planted') {
      if (b.team === 'ct') {
        const activeDefuser = bomb.action?.kind === 'defuse' ? bomb.action.actor : null;
        const defuser = activeDefuser || this.bots.filter(a => a.alive && a.team === 'ct').sort((a, c) => (a.pos.distanceTo(bomb.pos) - (a.defuseKit ? 7 : 0)) - (c.pos.distanceTo(bomb.pos) - (c.defuseKit ? 7 : 0)))[0];
        if (b === defuser) return bomb.pos;
      }
      return this.botGuard(b, bomb.pos);
    }
    if (bomb.status === 'dropped' && b.team === 't') return bomb.pos;
    if (b.team === 'ct' && clock >= b.tacticAt) {
      b.tacticAt = clock + 3 + Math.random() * 4;
      const sighting = this.all.filter(a => a.team === b.team && a.alive && a.lastSeen && clock - a.lastSeen.time < 6).sort((a, c) => c.lastSeen.time - a.lastSeen.time)[0]?.lastSeen;
      const hot = sighting && world.bombSites.find(site => site.pos.distanceTo(sighting.pos) < 20);
      const guards = this.bots.filter(a => a.alive && a.team === 'ct' && a.objectiveSite === b.objectiveSite);
      if (hot && hot.id !== b.objectiveSite && guards.length > 1 && Math.random() < .72) { b.objectiveSite = hot.id; b.route = []; b.routeIndex = 0; b.guardPoint = null; b.path = []; }
    }
    const opening = routeDestination(b, []);
    if (opening) return opening;
    const site = b.team === 't' ? bomb.targetSite : world.bombSites.find(s => s.id === b.objectiveSite) || world.bombSites[0];
    if (bomb.carrier === b) return b.pos.distanceTo(site.pos) > 1 ? site.pos : null;
    return this.botGuard(b, site.pos);
  }

  // ── Economy / buy menu ───────────────────────────────────────────────────

  canBuy(a) {
    if (!a?.alive || this.world?.theme !== 'desert' || !['freeze', 'active'].includes(this.phase)) return false;
    if (this.mode === 'defusal' && this.phase === 'active' && this.bomb.elapsed > BOMB_RULES.buyTime) return false;
    return this.world.buyZones.some(z => (!z.team || z.team === a.team) && z.box.containsPoint(a.pos.clone().add(new T.Vector3(0, .4, 0))));
  }

  buyItem(a, id) {
    if (!this.canBuy(a)) return false;
    const item = SHOP.find(x => x.id === id);
    if (!item || item.team && item.team !== a.team) return false;
    const free = this.mode === 'tdm', price = free ? 0 : id === 'armor' && a.armor >= 100 && !a.helmet ? 350 : item.price;
    if (a.money < price || id === 'kit' && a.defuseKit || id === 'armor' && a.armor >= 100 && a.helmet || id === 'vest' && a.armor >= 100 || id === 'he' && a.grenades >= 1) return false;
    if (id === 'kit') a.defuseKit = true;
    else if (['armor', 'vest'].includes(id)) { a.armor = 100; if (id === 'armor') a.helmet = true; }
    else if (id === 'he') { a.grenades = 1; a.inventory.grenade = this.inventoryWeapon('he'); }
    else {
      const slot = WEAPONS[id].pistol ? 'pistol' : 'primary', old = a.inventory[slot];
      if (old?.id === id) return false;
      if (old && a.isPlayer) this.dropWeapon(old.id, a.pos, false, old, a);
      a.inventory[slot] = this.inventoryWeapon(id); a.slot = slot; this.cancelReload(a);
    }
    a.money -= price;
    if (a.isPlayer) {
      if (!['kit', 'armor', 'vest', 'he'].includes(id)) this.setGun();
      this.computeHud();
      this.audio.mechanic('mag-in');
    }
    return true;
  }

  autoBuy(a, index) {
    if (index === 0 && a.team === 'ct' && !a.defuseKit) this.buyItem(a, 'kit');
    if (!a.inventory.primary) {
      const rifle = a.team === 'ct' ? 'm4a1' : 'ak47', cheap = a.team === 'ct' ? 'tmp' : 'mac10';
      if (index === 1 && a.money >= 5400) this.buyItem(a, 'awp');
      else if (!this.buyItem(a, rifle) && a.money >= 1800) this.buyItem(a, cheap);
    }
    if (!this.buyItem(a, 'armor')) this.buyItem(a, 'vest');
    if (a.team === 'ct') this.buyItem(a, 'kit');
    if (a.inventory.primary) this.buyItem(a, 'he');
  }

  /** View-model for the canvas buy menu. */
  shopView() {
    const player = this.player, L = (zh, en) => this.L(zh, en);
    const items = [];
    for (const item of SHOP) {
      if (item.category !== this.buyCategory || item.team && item.team !== player.team) continue;
      const owned = item.id === 'kit' ? player.defuseKit
        : item.id === 'armor' ? player.armor >= 100 && player.helmet
        : item.id === 'vest' ? player.armor >= 100
        : item.id === 'he' ? player.grenades >= 1
        : Object.values(player.inventory).some(w => w?.id === item.id);
      const cost = item.id === 'armor' && player.armor >= 100 && !player.helmet ? 350 : item.price;
      items.push({
        id: item.id,
        label: item.name || WEAPONS[item.id].name,
        detail: WEAPONS[item.id]?.type.split(' · ')[0] || this.L('辅助装备', 'Equipment'),
        priceText: owned ? L('已装备', 'Owned') : this.mode === 'tdm' ? L('免费', 'Free') : '$ ' + cost,
        disabled: owned || this.mode !== 'tdm' && player.money < cost,
      });
    }
    return {
      money: this.mode === 'tdm' ? L('团队竞技 · 装备免费', 'Team Deathmatch · gear is free') : '$ ' + player.money,
      timeText: this.hud.buyTimeText,
      categories: BUY_CATEGORIES.map((c, i) => ({ id: c.id, name: c.name, nameEn: ['Pistols', 'SMGs', 'Rifles', 'Snipers', 'Heavy', 'Gear'][i] || c.name, active: this.buyCategory === c.id })),
      categoryTitle: BUY_CATEGORIES.find(c => c.id === this.buyCategory)?.name || '',
      items,
    };
  }

  setBuyCategory(id) { if (BUY_CATEGORIES.some(c => c.id === id)) this.buyCategory = id; }
  cycleBuyCategory(dir) {
    const i = BUY_CATEGORIES.findIndex(c => c.id === this.buyCategory);
    this.buyCategory = BUY_CATEGORIES[(i + dir + BUY_CATEGORIES.length) % BUY_CATEGORIES.length].id;
  }
  buy(id) {
    if (!this.buyItem(this.player, id)) this.notify(this.L('无法购买：检查金额、购买区域或已有装备', 'Cannot buy: check funds, buy zone or owned gear'), 2);
  }

  // ── Overlays ─────────────────────────────────────────────────────────────

  overlayOpen() { return this.buyOpen || this.mapOpen || this.settingsOpen; }

  toggleBuy() {
    if (this.buyOpen) { this.closeBuy(); return; }
    if (!this.canBuy(this.player)) {
      this.notify(this.world.theme === 'desert'
        ? this.L('请在回合开始的购买时间内，回到己方购买区', 'Return to your buy zone during buy time')
        : this.L('雪地竞技场没有购买区 · 武器在地面拾取', 'No buy zone on fy_snow · grab weapons from the ground'), 2);
      return;
    }
    this.closeMap(false); this.clearHeldInput();
    this.buyOpen = true;
    this.hooks.releaseCapture?.();
  }
  closeBuy(capture = true) {
    if (!this.buyOpen) return;
    this.buyOpen = false; this.clearHeldInput();
    if (capture && ['active', 'freeze', 'round-end'].includes(this.phase)) this.requestCapture();
  }

  toggleMap() {
    if (this.mapOpen) { this.closeMap(); return; }
    if (!this.matchActive || !['active', 'freeze', 'round-end'].includes(this.phase)) return;
    this.closeBuy(false); this.clearHeldInput();
    this.mapOpen = true;
    this.hooks.releaseCapture?.();
  }
  closeMap(capture = true) {
    if (!this.mapOpen) return;
    this.mapOpen = false; this.clearHeldInput();
    if (capture && ['active', 'freeze', 'round-end'].includes(this.phase)) this.requestCapture();
  }

  openSettings() {
    if (this.settingsOpen) return;
    this.settingsOrigin = this.phase;
    if (['active', 'freeze', 'round-end', 'spectate'].includes(this.phase)) this.pauseGame();
    this.settingsOpen = true;
    this.settingsNote = '';
  }
  closeSettings() {
    if (!this.settingsOpen) return;
    this.settingsOpen = false;
    if (this.phase === 'paused' && this.settingsOrigin !== 'menu') this.resumeGame();
  }
  applySettings() {
    this.sensitivity = this.controlSettings.sensitivity;
    this.settingsNote = saveSettings(this.controlSettings)
      ? this.L('灵敏度已保存', 'Sensitivity saved')
      : this.L('已应用本次设置，浏览器未允许保存', 'Applied for this session; the browser blocked saving');
  }
  setSensitivity(v) { this.controlSettings.sensitivity = Math.max(.1, Math.min(4, +v || .8)); this.applySettings(); }
  setScopeSensitivity(v) { this.controlSettings.scopeSensitivity = Math.max(.1, Math.min(2, +v || 1)); this.applySettings(); }
  resetSettings() { Object.assign(this.controlSettings, DEFAULT_SETTINGS); this.applySettings(); }
  currentLookSensitivity() {
    const d = this.player ? WEAPONS[this.weaponOf(this.player).id] : {};
    return lookSensitivity(this.controlSettings, !!this.zoom, this.zoom ? (d.scope ? (this.zoom === 2 ? 10 : 40) : 55) : 76);
  }

  // ── Actors / weapons ─────────────────────────────────────────────────────

  makeActor(team, name, isPlayer = false) {
    return {
      team, name, isPlayer, money: 800, losses: 0, defuseKit: false, helmet: true, objectiveUse: false,
      pos: new T.Vector3(), moveVel: new T.Vector3(), moveSpeed: 0, yaw: 0, pitch: 0, vy: 0, grounded: false,
      health: 100, armor: 100, alive: true, kills: 0, deaths: 0, headshots: 0, damageDealt: 0, grenades: 0,
      inventory: { primary: null, pistol: this.inventoryWeapon(team === 'ct' ? 'usp' : 'glock'), knife: this.inventoryWeapon('knife') },
      slot: 'pistol', lastSlot: 'knife', inspectAt: -99, respawnAt: 0, spawnShield: 0, spawnCount: 0,
      route: [], routeIndex: 0, lane: 0, cooldown: 0, reload: 0, reloadTotal: 0, shotsFired: 0, lastShot: -99,
      mesh: null, aiThink: Math.random() * .25, path: [], pathTime: 0, target: null, reaction: 0, aiBurst: 0,
      strafe: Math.random() > .5 ? 1 : -1, moveTime: 0, stuckTime: 0, lastPos: new T.Vector3(), deathTime: 0, ragdoll: null,
    };
  }
  inventoryWeapon(id) { return { id, ammo: WEAPONS[id].mag, reserve: WEAPONS[id].reserve, readyAt: 0, shotAt: -99, cycleAt: -99, cyclePending: false, resumeScope: 0, suppressed: !!WEAPONS[id].silencer, burst: false, burstRemaining: 0 }; }
  weaponOf(a) { return a.inventory[a.slot] || a.inventory.pistol || a.inventory.knife; }
  eyeOf(a) { return a.pos.clone().add(new T.Vector3(0, a.isPlayer && this.crouching ? 1.03 : 1.61, 0)); }

  populatePickups() {
    for (const p of this.pickupItems) { this.scene.remove(p.mesh); freeGeometry(p.mesh); p.ring && p.ring.material.dispose(); }
    this.pickupItems = [];
    for (const p of this.world.pickups) {
      const g = new T.Group(), weapon = makeWeapon(p.weapon);
      weapon.rotation.z = Math.PI / 2;
      const bounds = new T.Box3().setFromObject(weapon);
      weapon.position.y = -bounds.min.y - .027;
      g.add(weapon); g.position.copy(p.pos); g.rotation.y = p.yaw;
      const ring = new T.Mesh(new T.RingGeometry(.27, .285, 28), new T.MeshBasicMaterial({ color: p.weapon === 'awp' ? 0xf5be67 : 0x9ecee8, transparent: true, opacity: .40, side: T.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = -.034;
      g.add(ring); this.scene.add(g);
      this.pickupItems.push({ pos: p.pos.clone(), weapon: p.weapon, mesh: g, active: true, ring, spawn: true, sourceOrigin: p.sourceOrigin, respawnAt: 0 });
    }
  }

  dropWeapon(id, pos, spawn = false, state = null, owner = null) {
    if (!WEAPONS[id] || id === 'knife') return null;
    const g = makeWeapon(id);
    g.position.copy(pos);
    g.position.y = (this.world.ground(pos.x, pos.z, pos.y + 2) ?? pos.y) + .11;
    g.rotation.z = Math.PI / 2; g.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(g);
    const item = { pos: g.position.clone(), weapon: id, mesh: g, active: true, spawn, state: state ? { ...state } : null, respawnAt: 0, expiresAt: spawn || this.mode !== 'tdm' ? Infinity : this.clock + 25, blockedFor: owner, blockedUntil: this.clock + 1.25 };
    this.pickupItems.push(item);
    return item;
  }
  consumePickup(item) { item.active = false; item.mesh.visible = false; item.respawnAt = this.mode === 'tdm' && item.spawn ? this.clock + PICKUP_REFRESH : Infinity; }

  updatePickups() {
    for (let i = this.pickupItems.length - 1; i >= 0; i--) {
      const p = this.pickupItems[i];
      if (this.mode === 'tdm' && p.spawn && !p.active && this.clock >= p.respawnAt) { p.active = true; p.mesh.visible = true; p.respawnAt = 0; }
      if (!p.spawn && this.clock >= p.expiresAt) {
        if (this.selectedPickup === p) this.selectedPickup = null;
        this.scene.remove(p.mesh); freeGeometry(p.mesh); this.pickupItems.splice(i, 1);
      }
    }
  }

  clearCorpses() { for (const a of this.corpses) { this.scene.remove(a.mesh); freeGeometry(a.mesh); } this.corpses = []; }
  storeCorpse(a) {
    if (!a.mesh) return;
    this.corpses.push({ pos: a.pos.clone(), yaw: a.yaw, alive: false, mesh: a.mesh, ragdoll: a.ragdoll, expiresAt: this.clock + 17 });
    a.mesh = null;
    while (this.corpses.length > 24) { const old = this.corpses.shift(); this.scene.remove(old.mesh); freeGeometry(old.mesh); }
  }
  equipBotModel(a) {
    if (!a.mesh) return;
    this.beginDeploy(a);
    const old = a.mesh.userData.gun;
    if (old) { a.mesh.remove(old); freeGeometry(old); }
    const model = makeWeapon(this.weaponOf(a).id);
    attachSoldierWeapon(a.mesh, model);
  }

  spawnActor(a, spawn, primaryId = null, respawning = false) {
    if (respawning) { this.storeCorpse(a); if (!a.isPlayer) { a.mesh = makeSoldier(a.team); this.scene.add(a.mesh); } }
    a.pos.copy(spawn.pos); a.pos.y += .04;
    const enemy = this.world.spawns[a.team === 'ct' ? 't' : 'ct'][0].pos;
    a.yaw = Math.atan2(a.pos.x - enemy.x, a.pos.z - enemy.z);
    a.pitch = 0; a.vy = 0; a.moveVel.set(0, 0, 0); a.moveSpeed = 0; a.grounded = true; a.alive = true;
    a.health = 100; a.armor = 100; a.cooldown = 0; this.cancelReload(a); a.shotsFired = 0; a.lastShot = -99;
    a.target = null; a.path = []; a.pathTime = 0; a.aiThink = Math.random() * .3; a.reaction = 0;
    a.stuckTime = 0; a.deathTime = 0; a.ragdoll = null; a.inspectAt = -99; a.respawnAt = 0;
    a.spawnShield = respawning ? this.clock + 1.2 : 0; a.spawnCount++;
    a.grenades = this.mode === 'tdm' && respawning ? 1 : 0; a.defuseKit = false;
    a.helmet = this.mode !== 'defusal'; a.objectiveUse = false;
    a.inventory = {
      primary: primaryId ? this.inventoryWeapon(primaryId) : null,
      pistol: this.inventoryWeapon(a.isPlayer && this.selectedPistol === 'deagle' ? 'deagle' : a.team === 'ct' ? 'usp' : 'glock'),
      knife: this.inventoryWeapon('knife'), grenade: a.grenades ? this.inventoryWeapon('he') : null,
    };
    a.slot = primaryId ? 'primary' : 'pistol'; a.lastSlot = 'knife';
    if (a.mesh) {
      const ud = a.mesh.userData;
      a.mesh.visible = true; a.mesh.rotation.set(0, a.yaw, 0); a.mesh.scale.setScalar(ud.baseScale || 1);
      a.mesh.position.copy(a.pos); a.mesh.position.y += ud.groundOffset || 0;
      for (const limb of [...(ud.legs || []), ...(ud.arms || [])]) limb.rotation.set(0, 0, 0);
      this.equipBotModel(a);
    }
    if (!a.isPlayer) {
      const index = this.bots.filter(b => b.team === a.team).indexOf(a);
      assignRoute(this.world, a, index, this.round - 1 + (respawning ? a.spawnCount - 1 : 0));
    }
    if (a.isPlayer && respawning) {
      this.selectedPickup = null; this.spectating = null; this.grenadePrime = null;
      this.radioMenu = null; this.zoom = 0; this.recoil = this.kickPitch = this.kickYaw = 0;
      this.crouching = false; this.fireHeld = this.shotPressed = false;
      this.setGun(); this.hideCenter(); this.computeHud();
      this.notify(this.L('已复活 · 短暂无敌保护，开火后解除', 'Respawned · brief spawn protection, removed when you fire'), 1.3);
    }
  }

  updateRespawns() {
    if (this.mode !== 'tdm' || this.phase !== 'active') return;
    let changed = false;
    for (const a of this.all) {
      if (!a.alive && a.respawnAt && this.clock >= a.respawnAt) {
        this.spawnActor(a, chooseRespawn(this.world, a, this.all), a.respawnWeapon || (a.team === 'ct' ? 'm4a1' : 'ak47'), true);
        changed = true;
      }
    }
    if (changed) this.updateAlive();
  }

  dropCurrent() {
    const player = this.player;
    if (!player?.alive || !['active', 'freeze'].includes(this.phase)) return;
    const slot = player.slot, w = this.weaponOf(player);
    if (w.id === 'knife') return;
    if (w.id === 'c4') { this.bomb?.drop(player); this.syncBombInventory(); this.notify(this.L('已丢下 C4 · 队友可路过拾取', 'Dropped the C4 · teammates can pick it up'), 2); return; }
    this.cancelReload(player); w.burstRemaining = 0;
    const forward = new T.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)), pos = player.pos.clone().addScaledVector(forward, .9);
    const wall = this.world.raycast(this.eyeOf(player), forward, .95);
    if (wall) pos.copy(player.pos).addScaledVector(forward, Math.max(0, wall.distance - .35));
    this.dropWeapon(w.id, pos, false, w, player);
    if (slot === 'grenade') { player.grenades--; player.inventory.grenade = player.grenades ? this.inventoryWeapon('he') : null; }
    else player.inventory[slot] = null;
    const next = ['primary', 'pistol', 'knife'].find(key => player.inventory[key]);
    player.slot = next; player.lastSlot = 'knife'; player.cooldown = .24;
    this.setGun();
    this.notify(this.L('已丢弃 ', 'Dropped ') + WEAPONS[w.id].name, 1.3);
  }

  clearEffects() {
    for (const e of this.effects) { e.mesh.removeFromParent(); e.mesh.geometry?.dispose(); e.disposeMat && e.mesh.material?.dispose(); }
    this.effects = [];
    for (const g of this.grenades) { this.scene.remove(g.mesh); freeGeometry(g.mesh); }
    this.grenades = [];
  }

  // ── Match flow ───────────────────────────────────────────────────────────

  startMatch() {
    if (!this.ready) return;
    this.audio.init();
    this.mode = MAPS[this.selectedMap].modes.includes(this.selectedMode) ? this.selectedMode : MAPS[this.selectedMap].defaultMode;
    this.closeBuy(false); this.clearBomb();
    this.killLimit = this.selectedKillLimit; this.matchElapsed = 0;
    this.clearCorpses();
    if (this.player?.mesh) { this.scene.remove(this.player.mesh); freeGeometry(this.player.mesh); }
    this.scores = { ct: 0, t: 0 }; this.round = 0; this.matchActive = true;
    for (const b of this.bots) if (b.mesh) { this.scene.remove(b.mesh); freeGeometry(b.mesh); }
    this.bots = [];
    this.player = this.makeActor(this.selectedTeam, 'YOU', true);
    this.all = [this.player];
    for (const team of ['ct', 't']) {
      const n = team === this.selectedTeam ? 4 : 5;
      for (let i = 0; i < n; i++) {
        const b = this.makeActor(team, BOT_NAMES[team][i]);
        b.mesh = makeSoldier(team);
        this.scene.add(b.mesh);
        this.bots.push(b); this.all.push(b);
      }
    }
    this.hud.matchEnd = null;
    this.nextRound();
    this.requestCapture();
  }

  nextRound() {
    this.round++;
    this.closeMap(false); this.closeBuy(false);
    this.freezeTime = 4;
    this.roundTime = this.mode === 'defusal' ? BOMB_RULES.roundTime : 105;
    this.phase = 'freeze'; this.transitionTime = 0;
    this.selectedPickup = null; this.spectating = null; this.grenadePrime = null; this.radioMenu = null;
    this.zoom = 0; this.recoil = this.kickPitch = this.kickYaw = 0; this.crouching = false; this.stepTimer = 0;
    this.clearEffects(); this.clearCorpses(); this.clearBomb(); this.populatePickups();
    this.hud.killfeed = [];
    const counters = { ct: 0, t: 0 };
    for (const a of this.all) {
      const index = counters[a.team]++, spawns = this.world.spawns[a.team],
        spawn = spawns[(index * 3 + (index % 2 ? 8 : 0)) % spawns.length],
        saved = this.mode === 'defusal' && this.round > 1 && a.alive ? { inventory: a.inventory, armor: a.armor, defuseKit: a.defuseKit, helmet: a.helmet, grenades: a.grenades } : null;
      if (a.isPlayer && a.mesh) { this.scene.remove(a.mesh); freeGeometry(a.mesh); a.mesh = null; }
      this.spawnActor(a, spawn, this.world.theme === 'desert' && this.mode === 'tdm' ? (a.team === 'ct' ? 'm4a1' : 'ak47') : null);
      if (this.mode === 'defusal') {
        a.armor = 0;
        if (saved) { Object.assign(a, saved); a.slot = a.inventory.primary ? 'primary' : 'pistol'; }
        else if (a.isPlayer && this.selectedPistol === 'deagle' && a.money >= 700) { a.money -= 700; }
        else a.inventory.pistol = this.inventoryWeapon(a.team === 'ct' ? 'usp' : 'glock');
        if (!a.isPlayer) { this.autoBuy(a, index); this.equipBotModel(a); }
        continue;
      }
      if (!a.isPlayer) {
        let near = null, dist = Infinity;
        for (const p of this.pickupItems) {
          if (!p.active || WEAPONS[p.weapon].pistol || WEAPONS[p.weapon].utility) continue;
          const d = p.pos.distanceTo(a.pos);
          if (d < dist) { dist = d; near = p; }
        }
        const id = near?.weapon || (a.team === 'ct' ? 'm4a1' : 'ak47');
        a.inventory.primary = this.inventoryWeapon(id); a.slot = 'primary';
        if (near) this.consumePickup(near);
        this.equipBotModel(a);
      }
    }
    if (this.mode === 'defusal') {
      this.dustPlan = createDustPlan(this.world);
      this.bomb = new BombRound(this.world);
      this.bomb.reset(this.all, this.round, this.dustPlan.site);
      for (const a of this.bots) assignDustRoute(this.world, a, this.bots.filter(b => b.team === a.team).indexOf(a), this.round - 1, this.bomb.targetSite.id, this.dustPlan);
      this.syncBombInventory();
      this.makeBombVisual();
    }
    this.setGun(); this.computeHud(); this.updateAlive();
    this.center(
      this.mode === 'tdm' ? 'TEAM DEATHMATCH' : 'ROUND ' + String(this.round).padStart(2, '0'),
      this.L('准备交战', 'Get ready'),
      this.L('准备期间无法移动 · ', 'Frozen during prep · ') + (this.mode === 'tdm' ? this.L('先达 ', 'first to ') + this.killLimit + this.L(' 次团队击杀获胜', ' team kills wins') : this.mode === 'defusal' ? this.L('B 购买装备 · T 安放 / CT 拆除', 'B to buy · T plants / CT defuses') : this.L('消灭敌方全队', 'eliminate the enemy team')) + this.L(' · 4 秒后开始', ' · starts in 4s'),
    );
  }

  beginDeploy(a) { const w = this.weaponOf(a); a.deployAt = this.clock; a.deployFor = DEPLOY[w.id].duration; a.deployWeapon = w.id; a.deployCues = deployCues(w.id); a.deployCue = 0; a.cooldown = Math.max(a.cooldown, a.deployFor); a.inspectAt = -99; }
  isDeploying(a) { return a.deployAt >= 0 && a.deployWeapon === this.weaponOf(a).id && this.clock < a.deployAt + a.deployFor; }

  setGun(animate = true) {
    if (!this.player) return;
    const id = this.weaponOf(this.player).id;
    if (animate) this.beginDeploy(this.player); else { this.player.deployAt = -99; this.player.deployCues = []; }
    if (this.gun) { this.gunScene.remove(this.gun); freeGeometry(this.gun); }
    this.gun = makeWeapon(id, true); this.gunId = id;
    this.gun.position.set(.25, -.225, -.40);
    this.gun.rotation.set(.012, -.04, 0);
    applyWeaponAnimation(this.gun, this.weaponAnimationState(this.player));
    this.gunScene.add(this.gun);
    this.zoom = 0;
    this.computeHud();
  }

  cancelReload(a) { a.reload = 0; a.reloadSlot = null; a.reloadCues = []; a.reloadEmpty = false; a.reloadInserted = 0; a.reloadRounds = 0; }

  switchWeapon(slot) {
    const player = this.player;
    if (!player?.alive || !['active', 'freeze', 'round-end'].includes(this.phase) || !player.inventory[slot] || slot === player.slot) return;
    this.grenadePrime = null;
    this.bomb?.cancel(player);
    const previous = this.weaponOf(player);
    previous.resumeScope = 0; previous.burstRemaining = 0;
    this.cancelReload(player);
    player.inspectAt = -99; player.shotsFired = 0; player.lastShot = -99;
    this.recoil = this.kickPitch = this.kickYaw = 0;
    player.lastSlot = player.slot; player.slot = slot; player.cooldown = .24;
    this.setGun();
    this.audio.mechanic('cloth');
  }
  lastWeapon() { this.switchWeapon(this.player.inventory[this.player.lastSlot] ? this.player.lastSlot : 'knife'); }
  inspectWeapon() { if (this.player?.alive && this.player.reload <= 0 && !this.isDeploying(this.player) && !this.isCycling(this.weaponOf(this.player))) { this.player.inspectAt = this.clock; this.zoom = 0; } }

  secondaryAttack() {
    const player = this.player;
    if (!player?.alive || !['active', 'freeze'].includes(this.phase)) return;
    const w = this.weaponOf(player), d = WEAPONS[w.id];
    if (d.scope || d.optics) { this.toggleZoom(); return; }
    if (w.id === 'knife') { this.fire(true); return; }
    if (w.id === 'he') { this.throwGrenade(.35); return; }
    if (player.reload > 0 || player.cooldown > 0 || this.clock < (w.readyAt || 0)) return;
    if (w.id === 'glock') { w.burst = !w.burst; w.burstRemaining = 0; player.cooldown = .3; this.notify(w.burst ? 'Glock-18 · ' + this.L('三连发模式', 'burst mode') : 'Glock-18 · ' + this.L('半自动模式', 'semi-auto'), 1.4); }
    if (['m4a1', 'usp'].includes(w.id)) { w.suppressed = !w.suppressed; w.readyAt = this.clock + 1.5; player.inspectAt = this.clock; this.notify(w.suppressed ? this.L('安装消音器', 'Suppressor on') : this.L('卸下消音器', 'Suppressor off'), 1.5); }
  }

  pickup() {
    const player = this.player;
    if (!this.selectedPickup || !this.selectedPickup.active || !player?.alive || !['active', 'freeze'].includes(this.phase)) return;
    const item = this.selectedPickup, id = item.weapon;
    if (WEAPONS[id].utility) {
      if (id === 'he') {
        if (player.grenades >= 1) { this.notify(this.L('已携带 HE Grenade', 'Already carrying an HE Grenade'), 1.2); return; }
        player.grenades++; player.inventory.grenade = this.inventoryWeapon('he');
        this.notify(this.L('已拾取 HE Grenade · 按 4 切换，按住左键拉环，松开投掷', 'Picked up HE Grenade · press 4, hold fire to pull the pin, release to throw'), 2);
      } else { player.armor = 100; this.notify(this.L('护甲已补满', 'Armor topped up'), 1.6); }
      this.consumePickup(item); this.selectedPickup = null; this.audio.reload(); this.computeHud();
      return;
    }
    const slot = WEAPONS[id].pistol ? 'pistol' : 'primary', old = player.inventory[slot];
    if (old) this.dropWeapon(old.id, player.pos.clone().add(new T.Vector3(.5, .1, .5)), false, old, player);
    player.inventory[slot] = { ...this.inventoryWeapon(id), ...(item.state || {}), burstRemaining: 0 };
    this.consumePickup(item); this.selectedPickup = null;
    player.lastSlot = player.slot; player.slot = slot; this.cancelReload(player);
    player.inspectAt = -99; player.cooldown = .22; this.recoil = this.kickPitch = this.kickYaw = 0;
    this.setGun(); this.audio.reload();
    this.notify(this.L('已拾取 ', 'Picked up ') + WEAPONS[id].name, 1.6);
  }

  isCycling(w) { const d = WEAPONS[w.id]; return (d.boltAction || d.pumpAction) && w.cyclePending && this.clock < (w.readyAt || 0); }

  beginReload(a) {
    const w = this.weaponOf(a), d = WEAPONS[w.id];
    if (a.reload > 0 || this.isDeploying(a) || d.utility || w.id === 'knife' || w.ammo >= d.mag || w.reserve <= 0 || this.isCycling(w)) return false;
    const rounds = Math.min(d.mag - w.ammo, w.reserve);
    a.inspectAt = -99; w.burstRemaining = 0;
    a.reloadEmpty = w.ammo === 0; a.reloadRounds = rounds; a.reloadInserted = 0; a.reloadSlot = a.slot;
    a.reloadCues = reloadCues(w.id, a.reloadEmpty, rounds);
    a.reload = a.reloadTotal = d.pellets ? .55 + rounds * .42 + .45 : d.reload + (a.reloadEmpty && !d.boltAction ? .30 : 0);
    w.resumeScope = false;
    if (a.isPlayer) { this.zoom = 0; this.computeHud(); }
    return true;
  }
  reload() { if (!this.player?.alive || !['active', 'freeze'].includes(this.phase)) return; this.beginReload(this.player); }

  weaponAnimationState(a) {
    const w = this.weaponOf(a), d = WEAPONS[w.id], clock = this.clock;
    return {
      grenadeProgress: a.isPlayer && this.grenadePrime && clock >= this.grenadePrime.startAt ? Math.min(1, (clock - this.grenadePrime.startAt) / GRENADE_PIN_TIME) : -1,
      deployProgress: this.isDeploying(a) ? (clock - a.deployAt) / a.deployFor : -1,
      reloadProgress: a.reload > 0 ? 1 - a.reload / a.reloadTotal : -1,
      empty: !!a.reloadEmpty, rounds: a.reloadRounds || 1,
      cycleProgress: this.isCycling(w) ? (clock - w.cycleAt) / d.rate : -1,
      shotAge: clock - (w.shotAt ?? -99), ammo: w.ammo,
      inspectProgress: a.inspectAt >= 0 ? (clock - a.inspectAt) / 2.5 : -1,
      suppressed: w.suppressed,
    };
  }

  beginShot(a) {
    const w = this.weaponOf(a), d = WEAPONS[w.id];
    w.shotAt = this.clock; w.readyAt = this.clock + d.rate; a.lastShot = this.clock;
    if (d.boltAction || d.pumpAction) {
      w.cycleAt = this.clock; w.cyclePending = true; w.cycleCue = 0;
      w.resumeScope = a.isPlayer && this.zoom;
      if (a.isPlayer) this.zoom = 0;
    }
  }

  updateWeapon(a, dt) {
    if (a.deployAt >= 0 && a.deployWeapon === this.weaponOf(a).id) {
      const p = (this.clock - a.deployAt) / a.deployFor;
      while (a.deployCue < a.deployCues.length && p >= a.deployCues[a.deployCue].at) { if (a.isPlayer) this.audio.mechanic(a.deployCues[a.deployCue].sound); a.deployCue++; }
    }
    a.cooldown = Math.max(0, a.cooldown - dt);
    if (this.clock - a.lastShot > (RECOIL[this.weaponOf(a).id]?.reset || .4)) a.shotsFired = 0;
    for (const w of Object.values(a.inventory)) {
      if (!w?.cyclePending) continue;
      const d = WEAPONS[w.id], p = (this.clock - w.cycleAt) / d.rate;
      const marks = d.boltAction ? [[.25, 'bolt-lift'], [.42, 'bolt-open'], [.72, 'bolt-close'], [.87, 'bolt-lock']] : [[.39, 'bolt-open'], [.80, 'bolt-close']];
      while ((w.cycleCue || 0) < marks.length && p >= marks[w.cycleCue || 0][0]) { if (a.isPlayer && w === this.weaponOf(a)) this.audio.mechanic(marks[w.cycleCue || 0][1]); w.cycleCue = (w.cycleCue || 0) + 1; }
      if (p >= 1) {
        w.cyclePending = false;
        if (a.isPlayer && w === this.weaponOf(a) && w.resumeScope && w.ammo > 0 && a.reload <= 0 && this.phase === 'active') this.zoom = w.resumeScope;
        w.resumeScope = 0;
      }
    }
    if (a.reload > 0) {
      const w = a.inventory[a.reloadSlot], d = w && WEAPONS[w.id];
      if (!w || a.reloadSlot !== a.slot) { this.cancelReload(a); return; }
      const previous = 1 - a.reload / a.reloadTotal;
      a.reload = Math.max(0, a.reload - dt);
      const p = 1 - a.reload / a.reloadTotal;
      for (const cue of a.reloadCues || []) { if (previous < cue.at && p >= cue.at && a.isPlayer) this.audio.mechanic(cue.sound); }
      const loaded = d.pellets ? Math.min(a.reloadRounds, Math.max(0, Math.floor((p - .20) / .60 * a.reloadRounds + .20))) : p >= .71 ? a.reloadRounds : 0;
      if (loaded > a.reloadInserted) {
        const n = Math.min(loaded - a.reloadInserted, d.mag - w.ammo, w.reserve);
        w.ammo += n; w.reserve -= n; a.reloadInserted += n;
        if (!d.pellets) w.readyAt = Math.max(w.readyAt || 0, this.clock + a.reload);
      }
      if (a.reload <= 0) { this.cancelReload(a); if (a.isPlayer) this.computeHud(); }
    }
  }

  toggleZoom() {
    const player = this.player;
    if (!player?.alive || !['active', 'freeze', 'round-end'].includes(this.phase)) return;
    const w = this.weaponOf(player), d = WEAPONS[w.id];
    if (!(d.scope || d.optics) || player.reload > 0 || this.isDeploying(player) || this.isCycling(w)) return;
    this.zoom = d.scope ? ((Number(this.zoom) || 0) + 1) % 3 : this.zoom ? 0 : 1;
    w.resumeScope = 0; player.inspectAt = -99;
  }

  // ── Pointer capture / focus (shell hooks) ────────────────────────────────

  requestCapture() { this.audio.init(); if (this.touchMode || this.hooks.pointerLocked?.()) return; this.hooks.requestCapture?.(); }
  releaseCapture() { if (this.hooks.pointerLocked?.()) { this.skipPointerPause = true; this.hooks.releaseCapture?.(); } }

  clearHeldInput() {
    this.fireHeld = this.shotPressed = this.dragLook = false;
    this.grenadePrime = null;
    this.keys.clear();
    this.touchMove.x = this.touchMove.y = 0;
    this.hud.scoreboardOpen = false;
  }

  gameInputActive() { return this.matchActive && ['active', 'freeze', 'round-end'].includes(this.phase) && !this.overlayOpen(); }

  pauseGame() {
    this.closeMap(false); this.closeBuy(false); this.bomb?.cancel();
    if (!['active', 'freeze', 'round-end', 'spectate'].includes(this.phase)) return;
    this.phaseBeforePause = this.phase; this.phase = 'paused';
    this.fireHeld = false; this.shotPressed = false; this.grenadePrime = null; this.radioMenu = null;
    this.keys.clear(); this.touchMove.x = this.touchMove.y = 0;
    this.releaseCapture();
  }
  resumeGame() {
    if (this.phase !== 'paused') return;
    this.phase = this.phaseBeforePause || 'active';
    this.requestCapture();
  }

  toMenu() {
    this.closeSettings(); this.closeMap(false); this.closeBuy(false); this.clearBomb();
    this.grenadePrime = null; this.radioMenu = null;
    this.matchActive = false; this.phase = 'menu';
    this.releaseCapture();
    this.fireHeld = false; this.keys.clear();
    for (const b of this.all) if (b.mesh) b.mesh.visible = false;
    this.clearEffects(); this.clearCorpses(); this.populatePickups();
    this.damageOpacity = 0;
    this.hud.matchEnd = null;
    this.computeHud();
  }

  // ── Effects ──────────────────────────────────────────────────────────────

  tracer(from, to, color = 0xffe7ae, owner = null) {
    const geom = new T.BufferGeometry().setFromPoints([from, to]), mat = new T.LineBasicMaterial({ color, transparent: true, opacity: .72 });
    const line = new T.Line(geom, mat);
    this.scene.add(line);
    this.effects.push({ mesh: line, life: .055, total: .055, disposeMat: true, muzzleOwner: owner, weapon: this.gunId });
  }
  flash(pos, view = false) {
    const mesh = new T.Mesh(new T.SphereGeometry(view ? .023 : .055, 7, 5), new T.MeshBasicMaterial({ color: 0xffcc75, transparent: true, opacity: .9, depthWrite: false }));
    if (view && this.gun) { const r = this.gun.userData.rig; mesh.position.copy(r.muzzle); mesh.scale.set(.65, .8, 2.1); r.core.add(mesh); }
    else { mesh.position.copy(pos); this.scene.add(mesh); }
    this.effects.push({ mesh, life: .035, total: .035, disposeMat: true });
  }
  impact(pos, normal) {
    const mesh = new T.Mesh(new T.SphereGeometry(.032, 6, 4), new T.MeshBasicMaterial({ color: 0x4a5b67 }));
    mesh.position.copy(pos).addScaledVector(normal || new T.Vector3(0, 1, 0), .005);
    mesh.scale.setScalar(.85 + Math.random() * .6);
    this.scene.add(mesh);
    this.effects.push({ mesh, life: 8, total: 8, disposeMat: true, static: true });
  }
  deathImpact(target, head, attacker) {
    const hitPos = target.pos.clone().add(new T.Vector3(0, head ? 1.62 : 1.08, 0)),
      away = target.pos.clone().sub(attacker.pos).setY(.18).normalize();
    for (let i = 0; i < 7; i++) {
      const mesh = new T.Mesh(new T.SphereGeometry(.018 + Math.random() * .018, 5, 4), new T.MeshBasicMaterial({ color: i < 2 ? 0x9b1818 : 0x5f1114, transparent: true, opacity: .72 }));
      mesh.position.copy(hitPos).addScaledVector(away, .04 + i * .025).add(new T.Vector3((Math.random() - .5) * .10, (Math.random() - .5) * .10, (Math.random() - .5) * .10));
      this.scene.add(mesh);
      this.effects.push({ mesh, life: .18 + Math.random() * .18, total: .36, disposeMat: true });
    }
    const stain = new T.Mesh(new T.CircleGeometry(head ? .16 : .22, 16), new T.MeshBasicMaterial({ color: 0x4d1115, transparent: true, opacity: .38, depthWrite: false, side: T.DoubleSide }));
    stain.rotation.x = -Math.PI / 2;
    stain.position.copy(target.pos); stain.position.y += .017;
    this.scene.add(stain);
    this.effects.push({ mesh: stain, life: 6, total: 6, disposeMat: true, static: true });
  }

  // ── Combat ───────────────────────────────────────────────────────────────

  hitActor(origin, dir, max, shooter) {
    const actorRay = new T.Ray(origin, dir);
    let closest = null, best = max, head = false;
    const bbox = new T.Box3();
    for (const a of this.all) {
      if (!a.alive || a === shooter) continue;
      const crouched = a.isPlayer && this.crouching, top = crouched ? 1.26 : SOLDIER_HITBOX.top, neck = crouched ? .98 : SOLDIER_HITBOX.neck;
      for (const volume of [{ x: .34, z: .30, low: .10, high: neck, head: false }, { x: SOLDIER_HITBOX.halfWidth, z: SOLDIER_HITBOX.halfDepth, low: neck, high: top, head: true }]) {
        bbox.set(a.pos.clone().add(new T.Vector3(-volume.x, volume.low, -volume.z)), a.pos.clone().add(new T.Vector3(volume.x, volume.high, volume.z)));
        const point = actorRay.intersectBox(bbox, new T.Vector3());
        if (point) { const distance = origin.distanceTo(point); if (distance < best) { best = distance; closest = a; head = volume.head; } }
      }
    }
    return closest ? { actor: closest, distance: best, head } : null;
  }

  fire(secondary = false, burstContinuation = false) {
    const player = this.player;
    if (!player?.alive || this.phase !== 'active' || this.overlayOpen() || this.isDeploying(player) || this.bomb?.action?.actor === player) return;
    const w = this.weaponOf(player), def = WEAPONS[w.id];
    if (w.id === 'he') { this.primeGrenade(secondary ? 2 : 1); return; }
    if (def.utility) return;
    if (player.reload > 0) { if (def.pellets && w.ammo > 0) { this.cancelReload(player); player.cooldown = .18; } return; }
    if (player.cooldown > 0 || this.clock < (w.readyAt || 0)) return;
    if (w.id !== 'knife' && w.ammo <= 0) { this.reload(); return; }
    player.inspectAt = -99; player.spawnShield = 0;
    const scoped = !!this.zoom, index = player.shotsFired, profile = RECOIL[w.id];
    this.syncPlayerView(0, false);
    const origin = this.eyeOf(player), baseDir = new T.Vector3(0, 0, -1).applyEuler(new T.Euler(player.pitch + this.kickPitch, player.yaw + this.kickYaw, 0, 'YXZ'));
    const muzzle = viewMuzzle(this.gun, this.gunCamera, this.camera), speed = Math.min(1, player.moveSpeed / 5.3);
    let spread = def.spread + speed * speed * (profile?.move || 0) + (player.grounded ? 0 : .045) + index * (profile?.growth || 0);
    if (this.crouching) spread *= .72;
    if (scoped) spread *= def.scope ? .12 : .5; else if (def.scope) spread += .045;
    if (w.id !== 'knife') w.ammo--;
    player.cooldown = secondary && w.id === 'knife' ? 1 : def.rate;
    player.shotsFired++;
    this.audio.shot(w.id, 1, 0, w.suppressed);
    if (w.id !== 'knife') this.flash(muzzle, true);
    const obstruction = this.world.raycast(origin, muzzle.clone().sub(origin).normalize(), origin.distanceTo(muzzle));
    for (let pellet = 0; pellet < (def.pellets || 1); pellet++) {
      const dir = baseDir.clone().add(new T.Vector3((Math.random() - .5) * spread, (Math.random() - .5) * spread, (Math.random() - .5) * spread)).normalize();
      const range = secondary && w.id === 'knife' ? 1.5 : def.range, mapHit = this.world.raycast(origin, dir, range), max = mapHit ? mapHit.distance : range;
      let hit = this.hitActor(origin, dir, max, player), end = origin.clone().addScaledVector(dir, hit ? hit.distance : max), blocked = null;
      if (w.id !== 'knife') {
        const path = end.clone().sub(muzzle), distance = path.length();
        blocked = obstruction || this.world.raycast(muzzle, path.normalize(), Math.max(0, distance - .015));
        if (blocked) { end.copy(blocked.point); hit = null; }
        this.tracer(muzzle, end, 0xffe7ae, player);
      }
      if (hit) {
        if (hit.actor.team !== player.team) {
          const falloff = def.pellets ? Math.max(.3, 1 - hit.distance / 50) : 1,
            damage = secondary && w.id === 'knife' ? 90 : def.damage,
            applied = this.damageActor(hit.actor, damage * (hit.head && w.id !== 'knife' ? 3.8 : 1) * falloff, player, w.id, hit.head);
          if (applied) { this.hitOpacity = 1; this.hitHead = hit.head; this.audio.hit(hit.head); }
        } else if (pellet === 0) this.notify(this.L('队友 · 友军伤害已关闭', 'Teammate · friendly fire is off'), 1);
      } else if ((blocked || mapHit) && w.id !== 'knife') {
        const h = blocked || mapHit;
        this.impact(h.point, h.face?.normal);
      }
    }
    if (w.id !== 'knife') {
      const kick = shotRecoil(w.id, index), scale = (this.crouching ? .88 : 1) * (scoped && def.optics ? .65 : 1);
      this.recoil = Math.min(.18, this.recoil + kick.view);
      this.kickPitch = Math.min(.30, this.kickPitch + kick.pitch * scale);
      this.kickYaw = T.MathUtils.clamp(this.kickYaw + kick.yaw * scale, -.19, .19);
    }
    this.beginShot(player);
    if (w.id === 'glock' && w.burst) {
      if (!burstContinuation) w.burstRemaining = 2; else w.burstRemaining--;
      if (w.burstRemaining > 0 && w.ammo > 0) { w.readyAt = this.clock + .075; player.cooldown = .075; }
      else { w.burstRemaining = 0; w.readyAt = this.clock + .40; player.cooldown = .40; }
    }
    if (secondary && w.id === 'knife') w.readyAt = this.clock + 1;
    this.computeHud();
  }

  primeGrenade(button = 1) {
    const player = this.player;
    if (player?.slot !== 'grenade') return false;
    this.fireHeld = this.shotPressed = false;
    if (!player.alive || this.phase !== 'active' || this.overlayOpen() || !player.grenades) return true;
    if (this.grenadePrime?.released) return true;
    if (!this.grenadePrime) {
      const startAt = Math.max(this.clock + Math.max(0, player.cooldown), this.isDeploying(player) ? player.deployAt + player.deployFor : this.clock);
      this.grenadePrime = { buttons: 0, strength: button === 2 ? .35 : 1, startAt, readyAt: startAt + GRENADE_PIN_TIME, released: false, cue: false };
    }
    this.grenadePrime.buttons |= button;
    this.grenadePrime.strength = this.grenadePrime.buttons === 3 ? .65 : this.grenadePrime.buttons === 2 ? .35 : 1;
    player.inspectAt = -99;
    return true;
  }
  releaseGrenade(button = 1) {
    if (!this.grenadePrime || !(this.grenadePrime.buttons & button)) return;
    this.grenadePrime.buttons &= ~button;
    if (!this.grenadePrime.buttons) { this.grenadePrime.released = true; this.updateGrenadePrime(); }
  }
  updateGrenadePrime() {
    const p = this.grenadePrime, player = this.player;
    if (!p) return;
    if (!player?.alive || player.slot !== 'grenade' || this.phase !== 'active' || this.overlayOpen()) { this.grenadePrime = null; return; }
    if (this.clock >= p.startAt && !p.cue) { p.cue = true; this.audio.mechanic('bolt-lift'); }
    if (p.released && this.clock >= p.readyAt && !this.isDeploying(player) && player.cooldown <= 0) {
      const strength = p.strength;
      this.grenadePrime = null;
      this.throwGrenade(strength);
    }
  }
  throwGrenade(strength = 1) {
    const player = this.player;
    if (!player?.alive || this.phase !== 'active' || player.slot !== 'grenade' || player.cooldown > 0 || this.isDeploying(player) || this.overlayOpen()) return;
    if (player.grenades <= 0) return;
    player.spawnShield = 0; player.grenades--;
    const dir = new T.Vector3(0, 0, -1).applyEuler(new T.Euler(player.pitch + .12, player.yaw, 0, 'YXZ')), eye = this.eyeOf(player),
      wall = this.world.raycast(eye, dir, .55), origin = eye.addScaledVector(dir, wall ? Math.max(.05, wall.distance - .1) : .45),
      mesh = makeWeapon('he');
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.grenades.push({ mesh, pos: origin, velocity: dir.multiplyScalar(12 * strength).add(new T.Vector3(player.moveVel.x, 2.3 * strength, player.moveVel.z)), fuse: 1.65, owner: player });
    player.inventory.grenade = player.grenades ? this.inventoryWeapon('he') : null;
    const next = player.inventory[player.lastSlot] ? player.lastSlot : player.inventory.primary ? 'primary' : 'pistol';
    this.switchWeapon(next);
    this.audio.mechanic('cloth');
    this.computeHud();
  }

  updateGrenades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;
      g.velocity.y -= 14 * dt;
      const next = g.pos.clone().addScaledVector(g.velocity, dt), delta = next.clone().sub(g.pos), len = delta.length(),
        hit = this.world.raycast(g.pos, delta.normalize(), len + .1);
      if (hit) { g.pos.copy(hit.point).addScaledVector(hit.face.normal, .12); g.velocity.reflect(hit.face.normal).multiplyScalar(.44); }
      else g.pos.copy(next);
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += dt * 6; g.mesh.rotation.z += dt * 3;
      if (g.fuse <= 0) {
        for (const a of this.all) {
          if (!a.alive || a.team === g.owner.team) continue;
          const eye = this.eyeOf(a), dist = eye.distanceTo(g.pos);
          if (dist < 9 && this.world.lineClear(g.pos, eye)) this.damageActor(a, 140 * (1 - dist / 9), g.owner, 'he');
        }
        this.audio.burst(.38, 1.4, 1700);
        this.audio.tone(62, .4, .7, 'triangle', 25);
        const mesh = new T.Mesh(new T.SphereGeometry(1, 14, 10), new T.MeshBasicMaterial({ color: 0xffc46e, transparent: true, opacity: .45, depthWrite: false }));
        mesh.position.copy(g.pos);
        this.scene.add(mesh);
        this.effects.push({ mesh, life: .35, total: .35, disposeMat: true, expand: true });
        this.scene.remove(g.mesh); freeGeometry(g.mesh);
        this.grenades.splice(i, 1);
      }
    }
  }

  damageActor(target, raw, attacker, weapon, head = false) {
    if (!target.alive || target.team === attacker.team || this.clock < (target.spawnShield || 0) || this.phase !== 'active') return false;
    const absorbed = head && !target.helmet ? 0 : Math.min(target.armor, raw * (head ? .13 : .28)),
      damage = WEAPONS[weapon]?.oneHitKill ? target.health : raw - absorbed;
    target.armor = Math.max(0, target.armor - absorbed);
    target.health -= damage;
    attacker.damageDealt += Math.min(Math.max(target.health + damage, 0), damage);
    if (target.isPlayer) { this.damageOpacity = Math.min(.8, this.damageOpacity + .45); this.computeHud(); }
    if (target.health <= 0) {
      target.health = 0; target.alive = false;
      if (target.isPlayer) { this.grenadePrime = null; this.radioMenu = null; }
      target.deaths++; attacker.kills++;
      if (this.mode === 'defusal' && weapon !== 'c4') awardMoney(attacker, weapon === 'knife' ? 1500 : 300);
      if (this.bomb?.carrier === target) { this.bomb.drop(target); this.syncBombInventory(); }
      if (target.isPlayer) this.closeBuy(false);
      if (head) attacker.headshots++;
      target.deathTime = this.clock; target.moveVel.set(0, 0, 0);
      target.respawnWeapon = target.inventory.primary?.id || target.respawnWeapon;
      target.respawnAt = this.mode === 'tdm' ? this.clock + RESPAWN_DELAY : 0;
      const away = target.pos.clone().sub(attacker.pos).setY(0);
      if (away.lengthSq() < .01) away.set(.3, 0, .5);
      away.normalize();
      const local = away.applyAxisAngle(new T.Vector3(0, 1, 0), -target.yaw);
      target.ragdoll = { age: 0, duration: .58 + Math.random() * .18, finalX: local.z * 1.40, finalZ: -local.x * 1.40, spin: (Math.random() - .5) * .22, side: Math.random() > .5 ? 1 : -1 };
      if (target.isPlayer && !target.mesh) {
        target.mesh = makeSoldier(target.team);
        target.mesh.position.copy(target.pos); target.mesh.rotation.y = target.yaw;
        this.scene.add(target.mesh);
      }
      const dropped = target.inventory.primary || target.inventory.pistol;
      if (dropped) this.dropWeapon(dropped.id, target.pos, false, dropped);
      this.deathImpact(target, head, attacker);
      this.addKill(attacker, target, weapon, head);
      this.updateAlive();
      if (target.isPlayer) {
        this.zoom = 0; this.fireHeld = this.shotPressed = false;
        this.autoSpectateDelay = this.mode === 'tdm' ? .7 : 2;
        this.spectating = null;
        this.center('ELIMINATED', this.L('你已阵亡', 'You are down'), attacker.name + ' · ' + WEAPONS[weapon].name + ' · ' + (this.mode === 'tdm' ? this.L('3 秒后复活', 'respawn in 3s') : this.L('等待下一回合', 'wait for the next round')));
      }
      if (target.mesh?.userData.gun) target.mesh.userData.gun.visible = false;
      if (this.mode === 'tdm') {
        this.scores[attacker.team]++;
        if (this.scores[attacker.team] >= this.killLimit) this.finishMatch();
      } else this.checkRound();
    }
    return true;
  }

  updateRagdolls(dt) {
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      if (this.clock >= c.expiresAt) { this.scene.remove(c.mesh); freeGeometry(c.mesh); this.corpses.splice(i, 1); }
    }
    for (const a of [...this.all, ...this.corpses]) {
      if (a.alive || !a.ragdoll || !a.mesh) continue;
      const r = a.ragdoll;
      r.age += dt;
      const p = Math.min(1, r.age / r.duration), ease = 1 - Math.pow(1 - p, 3), settle = p < .78 ? ease : ease + Math.sin((p - .78) / .22 * Math.PI) * .025;
      a.mesh.position.copy(a.pos);
      a.mesh.position.y += (a.mesh.userData.groundOffset || 0) + .235 * ease;
      a.mesh.rotation.set(r.finalX * settle, a.yaw + r.spin * ease, r.finalZ * settle, 'YXZ');
      const { arms = [], legs = [] } = a.mesh.userData;
      if (arms[0]) { arms[0].rotation.x = -.55 * ease; arms[0].rotation.z = .38 * r.side * ease; }
      if (arms[1]) { arms[1].rotation.x = .42 * ease; arms[1].rotation.z = -.62 * r.side * ease; }
      if (legs[0]) { legs[0].rotation.x = .30 * r.side * ease; legs[0].rotation.z = .12 * ease; }
      if (legs[1]) { legs[1].rotation.x = -.22 * r.side * ease; legs[1].rotation.z = -.10 * ease; }
    }
  }

  checkRound() {
    if (this.phase !== 'active' || this.mode === 'tdm') return;
    if (this.mode === 'defusal') { this.bomb.resolve(this.all); this.handleBombEvents(this.bomb.drain()); return; }
    const ct = this.all.filter(a => a.team === 'ct' && a.alive), t = this.all.filter(a => a.team === 't' && a.alive);
    if (!ct.length || !t.length) this.endRound(ct.length ? 'ct' : t.length ? 't' : 'draw');
  }

  endRound(winner, reason = '') {
    if (this.phase === 'round-end' || this.phase === 'match-end') return;
    this.closeMap(false); this.closeBuy(false);
    this.phase = 'round-end'; this.roundWinner = winner; this.transitionTime = 5;
    this.fireHeld = false; this.zoom = 0;
    if (winner !== 'draw') this.scores[winner]++;
    if (this.mode === 'defusal' && winner !== 'draw') settleRound(this.all, winner, this.bomb);
    this.audio.round(winner === this.player.team);
    this.center(
      winner === 'draw' ? 'ROUND DRAW' : 'ROUND WON',
      winner === 'draw' ? this.L('本回合平局', 'Round draw') : this.teamName(winner) + this.L('获胜', ' win'),
      (reason ? reason + ' · ' : '') + this.L('下一回合即将开始 · 你的战绩 ', 'Next round soon · your K/D ') + this.player.kills + ' / ' + this.player.deaths,
    );
  }

  finishMatch() {
    this.phase = 'match-end';
    const won = this.scores[this.player.team] >= this.winTarget();
    this.grenadePrime = null; this.radioMenu = null;
    this.fireHeld = this.shotPressed = false; this.keys.clear(); this.zoom = 0;
    this.audio.round(won);
    this.hud.matchEnd = {
      won,
      title: won ? this.L('胜利属于你。', 'Victory is yours.') : this.L('下次再战。', 'Next time.'),
      score: this.scores.ct + ' : ' + this.scores.t,
      stats: this.player.kills + this.L(' 次击杀 · ', ' kills · ') + this.player.deaths + this.L(' 次阵亡 · ', ' deaths · ') + this.player.headshots + this.L(' 次爆头', ' headshots'),
    };
    this.releaseCapture();
    this.hideCenter();
    this.hooks.onMatchEnd?.({
      won, kills: this.player.kills, deaths: this.player.deaths, headshots: this.player.headshots,
      ctScore: this.scores.ct, tScore: this.scores.t, mode: this.mode,
    });
  }

  // ── Bots ─────────────────────────────────────────────────────────────────

  updateAI(b, dt) {
    if (!b.alive) return;
    this.updateWeapon(b, dt);
    b.aiThink -= dt; b.pathTime -= dt;
    const config = CONFIGS[this.difficulty], clock = this.clock, world = this.world, all = this.all;
    if (b.aiThink <= 0) {
      b.aiThink = .20 + Math.random() * .16;
      const eye = this.eyeOf(b);
      let enemy = null, dist = Infinity;
      for (const a of all) {
        if (!a.alive || a.team === b.team) continue;
        const d = b.pos.distanceToSquared(a.pos);
        if (d < dist && world.lineClear(eye, this.eyeOf(a))) { enemy = a; dist = d; }
      }
      if (enemy) b.lastSeen = { pos: enemy.pos.clone(), time: clock };
      if (b.target !== enemy) { b.target = enemy; b.reaction = config.reaction + Math.random() * .25; }
    }
    let moveX = 0, moveZ = 0;
    if (this.updateBotObjective(b)) return;
    if (world.theme === 'desert') {
      b.openingWait = Math.max(0, (b.openingWait || 0) - dt);
      if (!b.target && b.openingWait > 0) { b.moveSpeed = 0; return; }
      if (clock >= (b.strafeAt || 0)) { b.strafe = Math.random() < .5 ? -1 : 1; b.strafeAt = clock + 1.1 + Math.random() * 2.7; }
    }
    if (b.target?.alive && b.routeIndex < b.route.length && b.pos.distanceTo(b.target.pos) > 16) b.target = null;
    if (b.target?.alive) {
      const a = b.target, dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z, len = Math.hypot(dx, dz);
      b.yaw = Math.atan2(-dx, -dz);
      b.reaction -= dt;
      const w = this.weaponOf(b), def = WEAPONS[w.id];
      if (b.reaction <= 0 && b.cooldown <= 0 && b.reload <= 0 && clock >= (w.readyAt || 0)) {
        if (w.ammo === 0) {
          if (w.reserve > 0) this.beginReload(b);
          else if (b.slot !== 'pistol') { b.slot = 'pistol'; b.cooldown = .3; this.equipBotModel(b); }
          else { w.reserve = WEAPONS[w.id].reserve; this.beginReload(b); }
        } else {
          b.cooldown = def.rate * (1.55 + Math.random() * 1.5);
          if (def.scope) b.cooldown = Math.max(def.rate, 1.8);
          w.ammo--; b.spawnShield = 0; this.beginShot(b);
          const origin = actorMuzzle(b.mesh.userData.gun, this.eyeOf(b)), target = this.eyeOf(a).add(new T.Vector3(0, -.3, 0)),
            clear = world.lineClear(origin, target);
          if (clear) {
            const isPlayer = a.isPlayer, acc = config.accuracy * (len > 25 ? .55 : len > 15 ? .8 : 1.1) * (isPlayer ? 1 : .9),
              hit = Math.random() < acc;
            const end = target.clone();
            if (!hit) end.add(new T.Vector3((Math.random() - .5) * 2.4, Math.random() * 1.3 + .35, (Math.random() - .5) * 2.4));
            const dd = end.clone().sub(origin).normalize(), mh = world.raycast(origin, dd, origin.distanceTo(end));
            if (mh) end.copy(mh.point);
            this.tracer(origin, end, 0xffd6a5);
            this.flash(origin);
            if (this.player?.alive) {
              const distance = this.player.pos.distanceTo(b.pos), vol = Math.max(.025, Math.min(.36, 4 / (distance + 3))),
                diff = b.pos.clone().sub(this.player.pos);
              this.audio.shot(w.id, vol, Math.sin(Math.atan2(diff.x, diff.z) - this.player.yaw), w.suppressed, distance);
            }
            if (hit && !mh) {
              const blocker = this.hitActor(origin, dd, origin.distanceTo(target) + .4, b);
              if (blocker?.actor === a) {
                const head = Math.random() < .035;
                this.damageActor(a, def.damage * config.damage * (head ? 2 : 1) * (def.pellets ? Math.min(def.pellets, Math.max(1, def.pellets - len / 4)) : 1), b, w.id, head);
              }
            }
          } else { b.target = null; b.aiThink = 0; }
        }
      }
      if (len > (def.scope ? 24 : 13) && b.routeIndex >= b.route.length) { moveX = dx / len * config.speed * .55; moveZ = dz / len * config.speed * .55; }
      if (len < 24 && !def.scope) { moveX += Math.cos(b.yaw) * b.strafe * .8; moveZ -= Math.sin(b.yaw) * b.strafe * .8; }
    } else {
      if (b.pathTime <= 0 || !b.path.length) {
        const opponents = all.filter(a => a.alive && a.team !== b.team), destination = this.objectiveDestination(b, opponents);
        if (destination) b.path = world.path(b.pos, destination);
        b.pathTime = 1.4 + Math.random() * .8;
      }
      while (b.path.length && Math.hypot(b.path[0].x - b.pos.x, b.path[0].z - b.pos.z) < (world.theme === 'desert' ? .15 : .42) && Math.abs(b.path[0].y - b.pos.y) < (world.theme === 'desert' ? .17 : .8)) b.path.shift();
      if (b.path.length) {
        const p = b.path[0], dx = p.x - b.pos.x, dz = p.z - b.pos.z, len = Math.hypot(dx, dz);
        if (len > .01) { moveX = dx / len * config.speed * (b.pace || 1); moveZ = dz / len * config.speed * (b.pace || 1); b.yaw = Math.atan2(-dx, -dz); }
      }
    }
    // Soft separation avoids a squad becoming a single stack of bots.
    for (const a of all) {
      if (a === b || !a.alive) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d2 = dx * dx + dz * dz;
      if (d2 > .001 && d2 < .64) { const len = Math.sqrt(d2); moveX += dx / len * (.8 - len) * 2; moveZ += dz / len * (.8 - len) * 2; }
    }
    const old = b.pos.clone();
    world.move(b, moveX * dt, moveZ * dt, dt, !!b.path[0]?.jump && b.grounded);
    const moved = old.distanceToSquared(b.pos);
    b.moveSpeed = Math.hypot(old.x - b.pos.x, old.z - b.pos.z) / dt;
    if (moved < .000002 && (Math.abs(moveX) + Math.abs(moveZ)) > .3) b.stuckTime += dt; else b.stuckTime = 0;
    if (b.stuckTime > .7) {
      b.pathTime = 0; b.strafe *= -1;
      const n = world.closest(b.pos);
      if (n) b.path.unshift(new T.Vector3(n.x, n.y, n.z));
      if (b.grounded) b.vy = 3.2;
      b.stuckTime = 0;
    }
    b.mesh.position.copy(b.pos);
    b.mesh.position.y += b.mesh.userData.groundOffset || 0;
    b.mesh.rotation.set(0, b.yaw, 0);
    b.moveTime += Math.sqrt(moved) * 2.8;
    const moving = moved > .00001;
    for (let i = 0; i < 2; i++) {
      const leg = b.mesh.userData.legs[i], stride = Math.sin(b.moveTime + i * Math.PI);
      leg.rotation.x = moving ? stride * .31 : 0;
      leg.userData.knee.rotation.x = moving ? Math.max(0, -stride) * .38 : .035;
    }
    if (moving) b.mesh.position.y += Math.abs(Math.sin(b.moveTime)) * .014;
    this.updateBotWeapon(b);
  }

  updateBotWeapon(b) {
    if (!b.alive) return;
    const model = b.mesh?.userData.gun;
    if (!model) return;
    const state = this.weaponAnimationState(b), pose = applyWeaponAnimation(model, state);
    if (pose) {
      model.position.set(.060 + pose.offset[0] * .3, 1.29 + pose.offset[1] * .3, -.205 + pose.offset[2] * .3);
      model.rotation.set(pose.rotation[0], .22 + pose.rotation[1], pose.rotation[2]);
      poseSoldierWeapon(b.mesh, pose);
    }
  }

  // ── Player ───────────────────────────────────────────────────────────────

  updatePlayer(dt) {
    const player = this.player;
    if (!player.alive) return;
    this.updateWeapon(player, dt);
    const movable = this.phase !== 'freeze' && !this.overlayOpen(), w = this.weaponOf(player), d = WEAPONS[w.id];
    if (movable) {
      const wantsCrouch = this.keys.has('ControlLeft') || this.keys.has('ControlRight');
      if (wantsCrouch) this.crouching = true;
      else if (this.world.canStand(player.pos.x, player.pos.y + .02, player.pos.z, false)) this.crouching = false;
    }
    let mx = movable ? (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0) + this.touchMove.x : 0,
      mz = movable ? (this.keys.has('KeyS') ? 1 : 0) - (this.keys.has('KeyW') ? 1 : 0) + this.touchMove.y : 0;
    const inputLen = Math.hypot(mx, mz);
    if (inputLen > 1) { mx /= inputLen; mz /= inputLen; }
    const slow = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      speed = (this.crouching ? 2.2 : slow ? 2.5 : w.id === 'knife' ? 6 : d.scope ? 4.5 : 5.3) * (this.zoom ? .7 : 1);
    const desiredX = (mx * Math.cos(player.yaw) + mz * Math.sin(player.yaw)) * speed,
      desiredZ = (-mx * Math.sin(player.yaw) + mz * Math.cos(player.yaw)) * speed,
      dot = player.moveVel.x * desiredX + player.moveVel.z * desiredZ,
      response = !player.grounded ? 3 : inputLen > .03 ? (dot < -.05 ? 23 : 13) : 10,
      blend = 1 - Math.exp(-dt * response);
    player.moveVel.x = T.MathUtils.lerp(player.moveVel.x, desiredX, blend);
    player.moveVel.z = T.MathUtils.lerp(player.moveVel.z, desiredZ, blend);
    if (Math.hypot(player.moveVel.x, player.moveVel.z) < .025) player.moveVel.set(0, 0, 0);
    const before = player.pos.clone();
    if (movable) {
      const jump = this.keys.has('Space') && player.grounded;
      this.world.move(player, player.moveVel.x * dt, player.moveVel.z * dt, dt, jump, this.crouching);
      this.keys.delete('Space');
    } else { player.moveVel.set(0, 0, 0); player.vy = 0; }
    player.moveSpeed = Math.hypot(player.pos.x - before.x, player.pos.z - before.z) / Math.max(dt, .001);
    const moving = player.moveSpeed > .12;
    if (moving && player.grounded) {
      this.viewBob += dt * (slow ? 8 : 12);
      this.stepTimer -= dt;
      if (this.stepTimer <= 0 && !slow && !this.crouching) { this.audio.step(); this.stepTimer = .35; }
    } else this.viewBob += dt * 2;
    const recovered = recoverRecoil(w.id, { pitch: this.kickPitch, yaw: this.kickYaw, view: this.recoil }, this.clock - player.lastShot, dt);
    this.kickPitch = recovered.pitch; this.kickYaw = recovered.yaw; this.recoil = recovered.view;
    this.updateGrenadePrime();
    if (this.phase === 'active' && !this.overlayOpen()) {
      if (w.burstRemaining > 0) this.fire(false, true);
      else if ((d.auto && this.fireHeld) || this.shotPressed) this.fire();
      this.shotPressed = false;
    }
    this.selectedPickup = null;
    let near = 1.55;
    for (const item of this.pickupItems) {
      if (!item.active || (item.blockedFor === player && this.clock < item.blockedUntil)) continue;
      const dist = player.pos.distanceTo(item.pos);
      if (dist < near && this.world.lineClear(this.eyeOf(player), item.pos.clone().add(new T.Vector3(0, .10, 0)))) { near = dist; this.selectedPickup = item; }
    }
    if (!player.inventory.primary && this.selectedPickup && !WEAPONS[this.selectedPickup.weapon].pistol && !WEAPONS[this.selectedPickup.weapon].utility) this.pickup();
    this.syncPlayerView(dt, moving);
  }

  syncPlayerView(dt, moving) {
    const player = this.player, w = this.weaponOf(player), d = WEAPONS[w.id];
    player.pitch = T.MathUtils.clamp(player.pitch, -1.48, 1.48);
    this.camera.rotation.set(player.pitch + this.kickPitch, player.yaw + this.kickYaw, 0, 'YXZ');
    this.camera.position.copy(this.eyeOf(player));
    if (moving && player.grounded) this.camera.position.y += Math.sin(this.viewBob) * .022;
    const targetFov = this.zoom ? (d.scope ? (this.zoom === 2 ? 10 : 40) : 55) : 76;
    this.camera.fov = T.MathUtils.lerp(this.camera.fov, targetFov, dt ? 1 - Math.exp(-dt * 18) : 0);
    this.camera.updateProjectionMatrix();
    if (this.gun) {
      const motion = applyWeaponAnimation(this.gun, this.weaponAnimationState(player)),
        off = motion?.offset || [0, 0, 0], rot = motion?.rotation || [0, 0, 0],
        kick = RECOIL[w.id], viewScale = d.pistol ? 1.6 : d.pellets ? 1.25 : 1;
      this.gun.position.set(
        T.MathUtils.lerp(.25, .10, this.zoom ? .8 : 0) + (moving ? Math.cos(this.viewBob * .5) * .009 : 0) + off[0],
        -.225 + (moving ? Math.sin(this.viewBob) * .007 : 0) + off[1],
        -.40 + this.recoil * viewScale + off[2],
      );
      this.gun.rotation.set(.012 + this.recoil * (d.pistol ? 2.4 : 1.1) + rot[0], -.04 - this.kickYaw * .7 + rot[1], this.recoil * (kick?.yaw || 0) * 12 + rot[2]);
      if (w.id === 'c4') {
        this.gun.position.x = .06; this.gun.rotation.x = .40;
        if (this.bomb?.action?.actor === player) {
          const p = this.bomb.action.progress / this.bomb.action.duration;
          this.gun.position.y = -.18 - Math.max(0, p - .75) * .6;
          this.gun.rotation.x = .6;
          const hand = this.gun.userData.rig.right?.hand;
          if (hand) hand.position.set(.03, .095 + Math.sin(p * 80) * .004, -.018 + (Math.floor(p * 9) % 4) * .02);
        }
      }
      if (w.id === 'knife' && !this.isDeploying(player) && player.cooldown > .15) {
        this.gun.rotation.z -= Math.sin(player.cooldown / (player.cooldown > .5 ? 1 : .5) * Math.PI) * .8;
        this.gun.position.x -= Math.sin(player.cooldown / .5 * Math.PI) * .22;
      }
    }
  }

  updateSpectator(dt) {
    const player = this.player;
    this.autoSpectateDelay -= dt;
    if (this.mode === 'tdm' && this.phase === 'active') this.center('RESPAWNING', Math.max(1, Math.ceil(player.respawnAt - this.clock)) + this.L(' 秒后复活', 's to respawn'), this.L('团队竞技 · 无限复活', 'Team Deathmatch · infinite respawns'));
    const mates = this.all.filter(a => a.alive && a.team === player.team && !a.isPlayer);
    if (this.autoSpectateDelay <= 0 && mates.length) {
      if (!this.spectating?.alive) this.spectating = mates[0];
      const a = this.spectating, desired = this.eyeOf(a).add(new T.Vector3(Math.sin(a.yaw) * 2, .8, Math.cos(a.yaw) * 2));
      const eye = this.eyeOf(a), dir = desired.clone().sub(eye).normalize(),
        wall = this.world.raycast(eye, dir, eye.distanceTo(desired));
      if (wall) desired.copy(wall.point).addScaledVector(dir, -.25);
      this.camera.position.lerp(desired, 1 - Math.exp(-dt * 6));
      this.camera.lookAt(eye.clone().add(new T.Vector3(-Math.sin(a.yaw) * 8, 0, -Math.cos(a.yaw) * 8)));
      if (this.phase === 'active') this.center(
        'SPECTATING · ' + a.name,
        this.mode === 'tdm' ? Math.max(1, Math.ceil(player.respawnAt - this.clock)) + this.L(' 秒后复活', 's to respawn') : this.L('观战队友', 'Spectating'),
        this.mode === 'tdm' ? this.L('团队竞技 · 无限复活 · 先达 ', 'TDM · infinite respawns · first to ') + this.killLimit + this.L(' 次击杀获胜', ' kills wins') : this.L('阵亡后等待下一回合 · 点击切换队友', 'Wait for the next round · click to cycle teammates'),
      );
    } else if (this.autoSpectateDelay > 0) {
      this.camera.position.y = T.MathUtils.lerp(this.camera.position.y, player.pos.y + .5, dt * 4);
    }
  }

  cycleSpectate() {
    if (!this.player || this.player.alive) return;
    const mates = this.all.filter(a => a.alive && a.team === this.player.team);
    const index = mates.indexOf(this.spectating);
    this.spectating = mates[(index + 1) % mates.length] || null;
  }

  // ── Radar ────────────────────────────────────────────────────────────────

  makeRadarBase() {
    const world = this.world;
    this.radarBase = document.createElement('canvas');
    this.radarBase.width = this.radarBase.height = 440;
    const ctx = this.radarBase.getContext('2d');
    ctx.fillStyle = '#152c3b'; ctx.fillRect(0, 0, 440, 440);
    const scale = 390 / world.size;
    const tx = x => 220 + (x - world.center.x) * scale, tz = z => 220 + (z - world.center.z) * scale;
    const tris = [...world.radarTriangles].sort((a, c) => a[0][1] - c[0][1]);
    for (const tri of tris) {
      const h = tri[0][1], shade = Math.max(43, Math.min(160, 60 + h * 12));
      ctx.fillStyle = `rgb(${shade * .74},${shade},${shade * 1.12})`;
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = .7;
      ctx.beginPath();
      ctx.moveTo(tx(tri[0][0]), tz(tri[0][2]));
      ctx.lineTo(tx(tri[1][0]), tz(tri[1][2]));
      ctx.lineTo(tx(tri[2][0]), tz(tri[2][2]));
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    for (const team of ['ct', 't']) {
      const avg = world.spawns[team].reduce((v, s) => v.add(s.pos), new T.Vector3()).multiplyScalar(1 / world.spawns[team].length);
      ctx.fillStyle = team === 'ct' ? '#80caf7' : '#f6ae57';
      ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center';
      ctx.fillText(team.toUpperCase(), tx(avg.x), tz(avg.z));
    }
    for (const site of world.bombSites) {
      ctx.font = 'bold 26px Arial'; ctx.fillStyle = '#ffb75b'; ctx.textAlign = 'center';
      ctx.fillText(site.id, tx(site.pos.x), tz(site.pos.z));
    }
  }

  /** Composite radar picture into any 2D context at (x,y) with edge length `size`. */
  drawRadarContent(ctx, x, y, size) {
    if (!this.player || !this.radarBase) return;
    const world = this.world, u = size / 220;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2 - 2 * u, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(this.radarBase, x, y, size, size);
    const scale = (195 / 220) * size / world.size;
    const cx = x + size / 2, cy = y + size / 2;
    ctx.strokeStyle = '#aacdd718'; ctx.lineWidth = .5;
    ctx.beginPath();
    ctx.moveTo(x, cy); ctx.lineTo(x + size, cy);
    ctx.moveTo(cx, y); ctx.lineTo(cx, y + size);
    ctx.stroke();
    for (const a of this.all) {
      if (!a.alive) continue;
      const friendly = a.team === this.player.team;
      if (!friendly && !this.bots.some(b => b.alive && b.team === this.player.team && b.target === a) && a !== this.aimedEnemy) continue;
      const px = cx + (a.pos.x - world.center.x) * scale, pz = cy + (a.pos.z - world.center.z) * scale;
      ctx.fillStyle = a.isPlayer ? '#fff' : friendly ? '#81cafa' : '#f3a94b';
      ctx.beginPath();
      ctx.arc(px, pz, a.isPlayer ? 4 * u : 2.8 * u, 0, Math.PI * 2);
      ctx.fill();
      if (a.isPlayer) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px, pz);
        ctx.lineTo(px - Math.sin(a.yaw) * 9 * u, pz - Math.cos(a.yaw) * 9 * u);
        ctx.stroke();
      }
    }
    for (const p of this.pickupItems) {
      if (!p.spawn || p.weapon !== 'awp') continue;
      const px = cx + (p.pos.x - world.center.x) * scale, pz = cy + (p.pos.z - world.center.z) * scale;
      ctx.globalAlpha = p.active ? 1 : .35;
      ctx.fillStyle = '#ffd28b';
      ctx.fillRect(px - 3 * u, pz - 2 * u, 6 * u, 4 * u);
      ctx.font = `bold ${10 * u}px Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('AWP', px, pz + (pz > cy ? -7 * u : 13 * u));
    }
    ctx.globalAlpha = 1;
    if (this.bomb && ['dropped', 'planted', 'carried'].includes(this.bomb.status) && (this.bomb.status === 'planted' || this.player.team === 't')) {
      const p = this.bomb.pos, px = cx + (p.x - world.center.x) * scale, pz = cy + (p.z - world.center.z) * scale;
      ctx.fillStyle = this.bomb.status === 'planted' ? '#ff6653' : '#ffe18f';
      ctx.fillRect(px - 3 * u, pz - 3 * u, 6 * u, 6 * u);
    }
    ctx.restore();
  }

  computeLocation() {
    const player = this.player, world = this.world;
    if (!player || !world) return '';
    const ours = world.spawns[player.team][0].pos, enemy = world.spawns[player.team === 'ct' ? 't' : 'ct'][0].pos;
    let text = player.pos.distanceTo(ours) < 12 ? player.team.toUpperCase() + this.L(' 出生点', ' spawn')
      : player.pos.distanceTo(enemy) < 12 ? this.L('敌方出生点', 'Enemy spawn')
      : player.pos.y > 2 ? this.L('高台', 'Balcony')
      : this.L('中央交战区', 'Mid arena');
    if (world.theme === 'desert') {
      const site = world.bombSites.find(s => player.pos.distanceTo(s.pos) < 10);
      if (site) text = site.id + this.L(' 包点', ' site');
      else if (player.pos.x > 30) text = this.L('长 A', 'Long A');
      else if (player.pos.x < -22) text = this.L('B 洞 / 隧道', 'B tunnels');
      else if (player.pos.z < -10 && player.pos.y > 3) text = this.L('A 小道', 'Catwalk');
      else if (player.pos.distanceTo(ours) >= 12 && player.pos.distanceTo(enemy) >= 12) text = this.L('中路 / 中门', 'Mid / Mid doors');
    }
    return text;
  }

  // ── HUD view-model ───────────────────────────────────────────────────────

  computeHud() {
    const hud = this.hud, player = this.player;
    hud.scoreboardOpen = hud.scoreboardOpen ?? false;
    if (!player) return;
    const w = this.weaponOf(player), def = WEAPONS[w.id], clock = this.clock;
    hud.health = Math.ceil(Math.max(0, player.health));
    hud.armor = Math.ceil(player.armor);
    hud.healthPct = Math.max(0, player.health);
    hud.healthLow = player.health < 30;
    hud.killCount = player.kills;
    hud.grenadeCount = player.grenades;
    hud.weaponName = def.name;
    hud.ammoText = ['knife', 'c4'].includes(w.id) ? '—' : w.id === 'he' ? String(player.grenades) : String(w.ammo);
    hud.reserveText = ['knife', 'c4'].includes(w.id) ? '—' : String(w.reserve);
    hud.reloadState = this.grenadePrime
      ? (clock < this.grenadePrime.readyAt ? this.L('正在拉环…', 'Pulling pin…') : this.grenadePrime.released ? this.L('投掷中', 'Throwing') : this.L('已拉环 · 松开鼠标投掷', 'Pin pulled · release to throw'))
      : this.isDeploying(player) ? this.L('取出武器 · ', 'Deploying · ') + Math.max(0, player.deployAt + player.deployFor - clock).toFixed(1) + 's'
      : player.reload > 0 ? reloadLabel(w.id, 1 - player.reload / player.reloadTotal, !this.isZh()) + ' · ' + player.reload.toFixed(1) + 's'
      : this.isCycling(w) ? (def.boltAction ? this.L('拉栓中', 'Cycling bolt') : this.L('泵动上膛', 'Pumping')) + ' · ' + Math.max(0, w.readyAt - clock).toFixed(1) + 's'
      : w.id === 'glock' ? (w.burst ? this.L('三连发模式', 'Burst mode') : this.L('半自动模式', 'Semi-auto'))
      : ['m4a1', 'usp'].includes(w.id) ? (w.suppressed ? this.L('消音器已安装', 'Suppressor on') : this.L('消音器已卸下', 'Suppressor off'))
      : this.L(def.type, WEAPON_TYPE_EN[w.id] || def.type);
    hud.slots = ['primary', 'pistol', 'knife', 'grenade', 'bomb'].map((slot, i) => {
      const item = player.inventory[slot];
      return {
        key: slot, num: i + 1, equipped: player.slot === slot,
        label: item ? WEAPONS[item.id].name : slot === 'primary' ? this.L('主武器', 'Primary') : slot === 'pistol' ? this.L('手枪', 'Pistol') : slot === 'grenade' ? 'HE Grenade' : slot === 'bomb' ? 'C4 Explosive' : 'Knife',
        empty: !item, hidden: slot === 'bomb' && !item,
      };
    }).filter(s => !s.hidden);
    hud.pickup = this.selectedPickup ? {
      name: WEAPONS[this.selectedPickup.weapon].name,
      verb: WEAPONS[this.selectedPickup.weapon].utility ? this.L('拾取', 'Pick up') : this.L('更换', 'Swap'),
    } : null;
    hud.crosshairHidden = !!def.scope || !player.alive;
    hud.crosshairGap = 2 + Math.min(7, Math.abs(this.kickPitch) * 32 + player.shotsFired * .16 + player.moveSpeed * .45);
    hud.scope = !!(this.zoom && def.scope) && player.alive;
    hud.scopeLabel = this.zoom === 2 ? this.L('二级瞄准', '2× zoom') : this.L('一级瞄准', '1× zoom');
    hud.hitOpacity = this.hitOpacity;
    hud.hitHead = this.hitHead;
    hud.damageOpacity = this.damageOpacity;
    hud.location = this.computeLocation();
    hud.ctScore = this.scores.ct;
    hud.tScore = this.scores.t;
    hud.roundLabel = this.mode === 'tdm' ? this.L('团队竞技 · ', 'TDM · ') + this.killLimit + this.L(' 击杀', ' kills') : this.L('回合 ', 'Round ') + this.round;
    hud.radio = this.radioMenu ? {
      title: this.radioMenu === 'radio1' ? this.L('无线电指令', 'Radio commands') : this.radioMenu === 'radio2' ? this.L('团队战术', 'Team tactics') : this.L('无线电报告', 'Radio reports'),
      options: (this.isZh() ? RADIO : RADIO_EN)[this.radioMenu],
    } : null;
    this.updateObjectiveHud();
  }

  // ── Radio ────────────────────────────────────────────────────────────────

  openRadio(menu) { if (!this.player?.alive) return; this.radioMenu = menu; this.computeHud(); }
  chooseRadio(index) {
    const table = this.isZh() ? RADIO : RADIO_EN;
    const message = table[this.radioMenu]?.[index];
    if (message) {
      this.notify(this.L('无线电 · ', 'Radio · ') + message, 1.8);
      const zhOptions = RADIO[this.radioMenu] || [];
      const zhMessage = zhOptions[index];
      if (RADIO_FOLLOW.includes(zhMessage)) {
        for (const b of this.bots.filter(b => b.alive && b.team === this.player.team)) { b.route = [this.player.pos.clone()]; b.routeIndex = 0; b.pathTime = 0; }
      }
    }
    this.radioMenu = null;
    this.computeHud();
  }

  // ── Input (forwarded by the shell adapter) ───────────────────────────────

  onPointerLockChange(locked) {
    this.mouseLocked = locked;
    if (locked) { this.focusGuard.acquired(); return; }
    const expected = this.skipPointerPause;
    this.skipPointerPause = false;
    this.focusGuard.pointerLost(expected);
  }
  onPointerLockError() { this.mouseLocked = false; this.notify(this.L('按住鼠标拖动视角；点击射击。', 'Drag to look around; click to fire.'), 4); }

  onMouseMove(e) {
    if (!this.player?.alive || !this.gameInputActive()) return;
    const aimSensitivity = this.currentLookSensitivity();
    if (this.mouseLocked) {
      this.player.yaw -= e.movementX * .0022 * aimSensitivity;
      this.player.pitch -= e.movementY * .0022 * aimSensitivity;
    } else if (this.dragLook) {
      this.player.yaw -= (e.clientX - this.dragX) * .003 * aimSensitivity;
      this.player.pitch -= (e.clientY - this.dragY) * .003 * aimSensitivity;
      this.dragX = e.clientX; this.dragY = e.clientY;
    }
  }

  onMouseDown(button, clientX = 0, clientY = 0) {
    if (!this.gameInputActive() || ![0, 2].includes(button)) return;
    if (button === 2) this.focusGuard.secondary();
    if (!this.mouseLocked) this.requestCapture();
    this.audio.init();
    if (!this.player.alive) { this.cycleSpectate(); return; }
    if (button === 0) {
      if (this.primeGrenade(1)) return;
      this.fireHeld = true;
      this.shotPressed = this.phase === 'active';
      if (!this.mouseLocked) { this.dragLook = true; this.dragX = clientX; this.dragY = clientY; }
    }
    if (button === 2 && !this.primeGrenade(2)) this.secondaryAttack();
  }

  onMouseUp(button) {
    if (button === 0) { this.releaseGrenade(1); this.fireHeld = false; this.dragLook = false; }
    else if (button === 2) this.releaseGrenade(2);
  }

  onWheel(deltaY) {
    const player = this.player;
    if (!player?.alive || !this.gameInputActive()) return;
    const slots = ['primary', 'pistol', 'knife', 'grenade', 'bomb'].filter(s => player.inventory[s]),
      i = slots.indexOf(player.slot);
    this.switchWeapon(slots[(i + (deltaY > 0 ? 1 : slots.length - 1)) % slots.length]);
  }

  onKeyDown(e) {
    const code = e.code;
    if (code === 'Escape') {
      e.preventDefault();
      if (e.repeat) return;
      if (this.settingsOpen) { this.focusGuard.consumeEscape(); this.closeSettings(); return; }
      if (this.mapOpen) { this.focusGuard.consumeEscape(); this.closeMap(); return; }
      if (this.buyOpen) { this.focusGuard.consumeEscape(); this.closeBuy(); return; }
      if (this.radioMenu) { this.focusGuard.consumeEscape(); this.radioMenu = null; this.computeHud(); this.clearHeldInput(); return; }
      if (this.hud.scoreboardOpen) { this.focusGuard.consumeEscape(); this.hud.scoreboardOpen = false; this.keys.delete('Tab'); return; }
      if (!this.matchActive) return;
      this.focusGuard.escape();
      if (this.phase === 'paused') this.resumeGame(); else this.pauseGame();
      return;
    }
    if (this.settingsOpen) return;
    if (!this.matchActive) return;
    if (this.mapOpen) {
      if (code === 'KeyM' && !e.repeat) { e.preventDefault(); this.closeMap(); }
      return;
    }
    if (this.buyOpen) {
      if (code === 'KeyB' && !e.repeat) { e.preventDefault(); this.closeBuy(); }
      else if (code === 'ArrowRight') { e.preventDefault(); this.cycleBuyCategory(1); }
      else if (code === 'ArrowLeft') { e.preventDefault(); this.cycleBuyCategory(-1); }
      return;
    }
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ControlLeft', 'ControlRight'].includes(code)) e.preventDefault();
    if (this.phase === 'paused' || this.phase === 'match-end' || e.repeat) return;
    if (code === 'KeyM') { e.preventDefault(); this.toggleMap(); return; }
    this.keys.add(code);
    if (this.radioMenu && /^Digit[0-9]$/.test(code)) { this.chooseRadio(Number(code.slice(5)) - 1); return; }
    if (code === 'Tab') { this.hud.scoreboardOpen = true; return; }
    const action = KEY_ACTIONS[code];
    if (action === 'reload') this.reload();
    else if (action === 'use') { if (this.bomb?.canPlant(this.player)) this.switchWeapon('bomb'); else if (!this.bomb?.canDefuse(this.player)) this.pickup(); }
    else if (action === 'drop') this.dropCurrent();
    else if (action === 'lastinv') this.lastWeapon();
    else if (action === 'inspect') this.inspectWeapon();
    else if (['primary', 'pistol', 'knife', 'grenade', 'bomb'].includes(action)) this.switchWeapon(action);
    else if (action === 'buy') this.toggleBuy();
    else if (action?.startsWith('radio')) this.openRadio(action);
  }

  onKeyUp(e) {
    this.keys.delete(e.code);
    if (e.code === 'Tab') this.hud.scoreboardOpen = false;
  }

  onWindowBlur() { this.focusGuard.blurred(); }
  onWindowFocus() { this.focusGuard.regained(); }
  onVisibilityChange() { this.focusGuard.visibilityChanged(); }
  onContextLost() {
    this.pauseGame();
    this.notify(this.L('图形上下文已丢失，请重新开始游戏。', 'Graphics context lost. Restart the game.'), 30);
  }

  // Touch input from the canvas controls.
  setTouchMove(x, y) { this.touchMove.x = x; this.touchMove.y = y; }
  touchLook(dx, dy) {
    if (!this.player?.alive || !this.gameInputActive()) return;
    const aimSensitivity = this.currentLookSensitivity();
    this.player.yaw -= dx * .0045 * aimSensitivity;
    this.player.pitch -= dy * .0045 * aimSensitivity;
  }
  touchFireStart() {
    this.audio.init();
    if (this.primeGrenade(1)) return;
    this.fireHeld = true;
    this.shotPressed = this.phase === 'active';
  }
  touchFireEnd() { this.releaseGrenade(1); this.fireHeld = false; }
  touchSwitch() {
    const player = this.player;
    if (!player) return;
    const slots = ['primary', 'pistol', 'knife', 'grenade', 'bomb'].filter(s => player.inventory[s]);
    this.switchWeapon(slots[(slots.indexOf(player.slot) + 1) % slots.length]);
  }
  touchUse() {
    this.keys.add('KeyE');
    if (this.bomb?.canPlant(this.player)) this.switchWeapon('bomb');
    else this.pickup();
  }
  touchUseEnd() { this.keys.delete('KeyE'); }

  // ── Main loop (driven by the shell) ──────────────────────────────────────

  update(dt) {
    dt = Math.min(.04, dt);
    this.fpsTime += dt; this.frameCount++;
    if (this.fpsTime > .75) { this.fps = Math.round(this.frameCount / this.fpsTime); this.hud.fps = String(this.fps); this.fpsTime = 0; this.frameCount = 0; }
    if (this.phase !== 'paused' && this.phase !== 'match-end') this.clock += dt;
    if (this.noticeTime > 0) { this.noticeTime -= dt; if (this.noticeTime <= 0) this.hud.notice = null; }
    if (!this.world) return;
    const clock = this.clock, world = this.world, player = this.player;

    if (this.phase === 'menu') {
      const a = .65 + Math.sin(clock * .035) * .08, r = world.size * .64;
      this.camera.position.set(world.center.x + Math.sin(a) * r, world.size * .40, world.center.z + Math.cos(a) * r);
      const target = world.center.clone();
      target.x -= world.size * .13; target.y = 1.5;
      this.camera.lookAt(target);
      this.camera.fov = 63;
      this.camera.updateProjectionMatrix();
      world.update(dt, clock);
    } else if (['active', 'freeze', 'round-end'].includes(this.phase)) {
      world.update(dt, clock);
      if (this.phase === 'freeze') {
        this.freezeTime -= dt;
        if (this.freezeTime <= 0) {
          this.phase = 'active';
          this.hideCenter();
          this.audio.tone(880, .18, .2);
          this.notify(this.mode === 'tdm' ? this.L('交战开始 · 先达 ', 'Engage · first to ') + this.killLimit + this.L(' 次团队击杀获胜', ' team kills wins') : this.mode === 'defusal' ? this.L('爆破开始 · T 进攻包点 / CT 防守', 'Engage · T attack the sites / CT defend') : this.L('交战开始 · 消灭敌方全队', 'Engage · eliminate the enemy team'), 2);
        } else if (this.hud.center) {
          this.hud.center = { ...this.hud.center, detail: this.L('准备期间无法移动 · ', 'Frozen during prep · ') + Math.ceil(this.freezeTime) + this.L(' 秒后交战', 's to engage') };
        }
      }
      if (this.phase === 'active') {
        if (this.mode === 'tdm') this.matchElapsed += dt;
        else if (this.mode !== 'defusal') this.roundTime = Math.max(0, this.roundTime - dt);
        this.updateRespawns();
        this.updatePickups();
        for (const b of this.bots) { if (this.phase !== 'active') break; this.updateAI(b, dt); }
        if (this.phase === 'active') this.updateGrenades(dt);
      } else {
        for (const b of this.bots) { if (b.alive) { this.updateWeapon(b, dt); this.updateBotWeapon(b); } }
      }
      this.updateRagdolls(dt);
      if (this.phase === 'round-end') {
        this.transitionTime -= dt;
        if (this.transitionTime <= 0) {
          if (this.scores.ct >= 7 || this.scores.t >= 7) this.finishMatch();
          else this.nextRound();
        }
      }
      if (this.phase !== 'match-end') { if (player.alive) this.updatePlayer(dt); else this.updateSpectator(dt); }
      if (this.phase === 'active' && this.mode === 'defusal') this.updateBomb(dt);
      if (this.buyOpen && !this.canBuy(player)) this.closeBuy();
      const sec = Math.max(0, Math.ceil(this.phase === 'freeze' ? this.freezeTime : this.mode === 'tdm' ? this.matchElapsed : this.bomb?.status === 'planted' ? this.bomb.fuse : this.roundTime));
      this.hud.timerText = this.phase === 'freeze' ? '0:0' + sec : sec === 0 && this.mode === 'elimination' ? this.L('加时', 'OT') : Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
      this.hud.timerUrgent = this.phase === 'active' && this.mode !== 'tdm' && (this.bomb?.status === 'planted' || this.roundTime < 15);
      for (let i = this.effects.length - 1; i >= 0; i--) {
        const e = this.effects[i];
        e.life -= dt;
        if (e.muzzleOwner?.isPlayer && this.gunId === e.weapon && player.alive) {
          const muzzle = viewMuzzle(this.gun, this.gunCamera, this.camera);
          e.mesh.geometry.attributes.position.setXYZ(0, muzzle.x, muzzle.y, muzzle.z);
          e.mesh.geometry.attributes.position.needsUpdate = true;
          e.mesh.geometry.computeBoundingSphere();
        }
        if (e.expand) e.mesh.scale.setScalar(1 + (1 - e.life / e.total) * 4);
        if (!e.static && e.mesh.material.opacity !== undefined) e.mesh.material.opacity = Math.max(0, e.life / e.total);
        if (e.life <= 0) {
          e.mesh.removeFromParent(); e.mesh.geometry?.dispose();
          e.disposeMat && e.mesh.material.dispose();
          this.effects.splice(i, 1);
        }
      }
    }
    this.hitOpacity = Math.max(0, this.hitOpacity - dt * 5);
    this.damageOpacity = Math.max(0, this.damageOpacity - dt * 1.5);
    this.computeHud();
  }

  /** Render the 3D scene into the offscreen WebGL canvas. */
  render() {
    if (!this.renderer || !this.world) return;
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (this.player?.alive && this.gun && this.phase !== 'menu' && !(this.zoom && WEAPONS[this.gunId].scope)) {
      this.renderer.clearDepth();
      this.renderer.render(this.gunScene, this.gunCamera);
    }
  }
}

// English weapon-type captions (the source data carries Chinese in `type`).
const WEAPON_TYPE_EN = {
  ak47: 'Assault rifle', m4a1: 'Suppressed rifle', awp: 'Bolt-action sniper', mp5: 'Suppressed SMG',
  tmp: 'Stealth SMG', p90: 'High-capacity SMG', mac10: 'Rapid-fire SMG', sg552: 'Scoped rifle',
  aug: 'Scoped rifle', scout: 'Bolt-action sniper', g3sg1: 'Semi-auto sniper', m3: 'Pump shotgun',
  xm1014: 'Auto shotgun', m249: 'Light machine gun', he: 'Left far throw · right lob',
  armor: 'Refill armor', deagle: 'Heavy pistol', usp: 'Suppressed pistol', glock: 'Burst-capable pistol',
  knife: 'Left slash · right stab', c4: 'Hold fire in site to plant',
};
