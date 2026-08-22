// Procedural Counter-Strike art. All textures and sprites are generated once
// and cached; the game never depends on external image assets.

import type { WeaponId } from './counterstrikeRules.js';
import type { Team } from './counterstrikeRules.js';
import type { WallTint } from './counterstrikeMap.js';

type RGB = [number, number, number];

function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function makeCanvas(w: number, h: number, pixelFn: (x: number, y: number) => RGB): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(w, h);
    const data = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [r, g, b] = pixelFn(x, y);
        const idx = (y * w + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  return canvas;
}

// ── Ice wall textures ────────────────────────────────────────────────────────

let wallTextures: Record<WallTint, HTMLCanvasElement> | null = null;

export function getWallTexture(tint: WallTint): HTMLCanvasElement {
  if (!wallTextures) {
    wallTextures = {} as Record<WallTint, HTMLCanvasElement>;
    const make = (base: RGB, crack: RGB): HTMLCanvasElement =>
      makeCanvas(64, 64, (x, y) => {
        let c = lerpColor(base, crack, y / 63);
        if ((y * 7 + x * 13) % 53 < 2) c = lerpColor(c, crack, 0.85);
        if ((x * 31 + y * 17) % 97 < 2) c = lerpColor(c, [240, 248, 255], 0.7);
        if ((x * 5 + y * 3) % 61 < 1) c = lerpColor(c, [255, 255, 255], 0.5);
        return c;
      });
    wallTextures.blue = make([214, 233, 249], [112, 148, 196]);
    wallTextures.red = make([244, 226, 223], [176, 128, 122]);
  }
  return wallTextures[tint] ?? wallTextures.blue;
}

// ── Soldier sprites ──────────────────────────────────────────────────────────

export interface SoldierFrames {
  frames: HTMLCanvasElement[]; // idle, walk1, walk2, shoot
  dead: HTMLCanvasElement;
}

const soldierFramesCache = new Map<string, SoldierFrames>();

function makeSoldierCanvas(draw: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx);
  return canvas;
}

interface TeamPalette {
  jacket: string;
  jacketDark: string;
  pants: string;
  boots: string;
  headgear: string;
  skin: string;
  accent: string;
}

function teamPalette(team: Team, variant: number): TeamPalette {
  if (team === 'CT') {
    return {
      jacket: variant === 0 ? '#2e4d78' : '#27436a',
      jacketDark: variant === 0 ? '#213a5c' : '#1c3250',
      pants: '#2c425e',
      boots: '#202933',
      headgear: '#23405f', // helmet
      skin: '#e8b98a',
      accent: '#39C5BB',
    };
  }
  return {
    jacket: variant === 0 ? '#7a5a44' : '#6b4e3b',
    jacketDark: variant === 0 ? '#5c4433' : '#4f3a2c',
    pants: '#4c4434',
    boots: '#2e2a22',
    headgear: '#41392c', // beanie / balaclava
    skin: '#dfb08a',
    accent: '#e07f3e',
  };
}

function drawSoldierBody(c: CanvasRenderingContext2D, team: Team, variant: number, frame: string) {
  const p = teamPalette(team, variant);

  c.fillStyle = 'rgba(15,35,55,0.20)';
  c.beginPath();
  c.ellipse(32, 93, 23, 7, 0, 0, Math.PI * 2);
  c.fill();

  const bob = frame === 'walk1' || frame === 'walk2' ? 1 : 0;

  let legA: [number, number] = [15, 62];
  let legB: [number, number] = [39, 62];
  if (frame === 'walk1') {
    legA = [11, 66];
    legB = [43, 62];
  } else if (frame === 'walk2') {
    legA = [17, 62];
    legB = [37, 66];
  }
  c.fillStyle = p.pants;
  c.fillRect(legA[0], legA[1] - bob, 12, 34 - (legA[1] - 62));
  c.fillRect(legB[0], legB[1] - bob, 12, 34 - (legB[1] - 62));
  c.fillStyle = p.boots;
  c.fillRect(legA[0] - 1, 89 - bob, 15, 7);
  c.fillRect(legB[0] - 1, 89 - bob, 15, 7);

  c.fillStyle = p.jacket;
  c.fillRect(9, 30 - bob, 46, 34);
  c.fillStyle = p.jacketDark;
  c.fillRect(9, 44 - bob, 46, 6);
  c.fillRect(21, 30 - bob, 8, 12);
  c.fillRect(35, 42 - bob, 12, 8);
  c.fillStyle = '#3c4655';
  c.fillRect(9, 62 - bob, 46, 4);

  c.fillStyle = p.accent;
  c.fillRect(24, 30 - bob, 16, 5);

  const raise = frame === 'shoot' ? -5 : 0;
  c.fillStyle = '#2b3038';
  c.save();
  c.translate(32, 46 - bob + raise);
  c.rotate(raise === 0 ? 0.03 : 0.22);
  c.fillRect(-24, -3, 48, 6);
  c.fillRect(14, -5, 10, 4);
  c.restore();

  c.fillStyle = p.jacket;
  c.fillRect(7, 32 - bob, 10, 28);
  c.fillRect(47, 32 - bob, 10, 28);
  c.fillStyle = p.skin;
  c.fillRect(7, 46 - bob + raise, 10, 8);
  c.fillRect(47, 46 - bob + raise, 10, 8);

  c.fillStyle = p.skin;
  c.fillRect(20, 14 - bob, 24, 18);
  c.fillStyle = p.headgear;
  if (team === 'CT') {
    c.fillRect(16, 8 - bob, 32, 13);
    c.fillRect(14, 16 - bob, 36, 4);
  } else {
    c.fillRect(18, 8 - bob, 28, 11);
    c.fillRect(18, 22 - bob, 28, 6);
  }
}

export function getSoldierFrames(team: Team, variant: number): SoldierFrames {
  const key = `${team}:${variant === 0 ? 0 : 1}`;
  const cached = soldierFramesCache.get(key);
  if (cached) return cached;
  const frames: HTMLCanvasElement[] = [];
  for (const frame of ['idle', 'walk1', 'walk2', 'shoot']) {
    frames.push(makeSoldierCanvas((c) => drawSoldierBody(c, team, variant === 0 ? 0 : 1, frame)));
  }
  const p = teamPalette(team, variant === 0 ? 0 : 1);
  const dead = makeSoldierCanvas((c) => {
    c.fillStyle = 'rgba(15,35,55,0.20)';
    c.beginPath();
    c.ellipse(32, 56, 30, 9, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = p.jacket;
    c.fillRect(8, 42, 40, 22);
    c.fillStyle = p.jacketDark;
    c.fillRect(8, 54, 40, 6);
    c.fillStyle = p.skin;
    c.fillRect(6, 44, 12, 12);
    c.fillStyle = p.headgear;
    c.fillRect(4, 42, 12, 8);
    c.fillStyle = p.pants;
    c.fillRect(46, 44, 14, 18);
    c.fillStyle = p.boots;
    c.fillRect(56, 42, 6, 20);
    c.fillStyle = '#2b3038';
    c.fillRect(2, 58, 26, 5);
  });
  const soldier = { frames, dead };
  soldierFramesCache.set(key, soldier);
  return soldier;
}

// ── Ground pickups ───────────────────────────────────────────────────────────

type WeaponClass = 'pistol' | 'smg' | 'rifle' | 'sniper' | 'shotgun' | 'mg' | 'knife';

const CLASS_IDS: Record<WeaponId, WeaponClass> = {
  knife: 'knife',
  glock: 'pistol', usp: 'pistol', p228: 'pistol', deagle: 'pistol',
  fiveseven: 'pistol', elite: 'pistol',
  m3: 'shotgun', xm1014: 'shotgun',
  tmp: 'smg', mac10: 'smg', mp5: 'smg', ump45: 'smg', p90: 'smg',
  galil: 'rifle', famas: 'rifle', ak47: 'rifle', sg552: 'rifle', m4a1: 'rifle', aug: 'rifle',
  scout: 'sniper', awp: 'sniper', g3sg1: 'sniper', sg550: 'sniper',
  m249: 'mg',
};

const weaponSprites = new Map<WeaponClass, HTMLCanvasElement>();

function drawWeaponSprite(cls: WeaponClass): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 24;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.fillStyle = 'rgba(15,35,55,0.25)';
  ctx.beginPath();
  ctx.ellipse(24, 21, 19, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  const body = '#2b3038';
  const dark = '#1e232b';
  const grip = '#4a3b2c';
  if (cls === 'knife') {
    ctx.fillStyle = '#9fb2c4';
    ctx.fillRect(22, 6, 14, 4);
    ctx.beginPath();
    ctx.moveTo(36, 8); ctx.lineTo(42, 14); ctx.lineTo(36, 14); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.fillRect(18, 8, 5, 9);
  } else if (cls === 'pistol') {
    ctx.fillStyle = body;
    ctx.fillRect(8, 8, 20, 7);
    ctx.fillStyle = dark;
    ctx.fillRect(26, 9, 8, 3);
    ctx.fillStyle = grip;
    ctx.fillRect(13, 14, 6, 7);
  } else if (cls === 'smg') {
    ctx.fillStyle = body;
    ctx.fillRect(4, 9, 30, 7);
    ctx.fillStyle = dark;
    ctx.fillRect(32, 10, 9, 3);
    ctx.fillStyle = grip;
    ctx.fillRect(16, 15, 7, 6);
    ctx.fillRect(8, 13, 4, 8);
  } else if (cls === 'rifle') {
    ctx.fillStyle = body;
    ctx.fillRect(2, 9, 40, 7);
    ctx.fillStyle = dark;
    ctx.fillRect(38, 10, 8, 3);
    ctx.fillStyle = grip;
    ctx.fillRect(18, 15, 8, 6);
    ctx.fillRect(6, 13, 4, 8);
  } else if (cls === 'sniper') {
    ctx.fillStyle = body;
    ctx.fillRect(0, 9, 46, 6);
    ctx.fillStyle = dark;
    ctx.fillRect(42, 10, 5, 3);
    ctx.fillStyle = '#3d5570';
    ctx.fillRect(12, 5, 8, 4);
    ctx.fillStyle = grip;
    ctx.fillRect(20, 14, 7, 7);
  } else if (cls === 'shotgun') {
    ctx.fillStyle = '#3d352a';
    ctx.fillRect(2, 9, 34, 7);
    ctx.fillStyle = dark;
    ctx.fillRect(34, 10, 10, 4);
    ctx.fillStyle = grip;
    ctx.fillRect(14, 15, 7, 6);
  } else {
    // mg
    ctx.fillStyle = body;
    ctx.fillRect(0, 8, 44, 8);
    ctx.fillStyle = dark;
    ctx.fillRect(40, 10, 7, 4);
    ctx.fillStyle = '#3a4a3a';
    ctx.fillRect(8, 13, 7, 8);
    ctx.fillStyle = grip;
    ctx.fillRect(20, 15, 8, 6);
  }
  return canvas;
}

export function getWeaponSprite(id: WeaponId): HTMLCanvasElement {
  const cls = CLASS_IDS[id];
  const cached = weaponSprites.get(cls);
  if (cached) return cached;
  const sprite = drawWeaponSprite(cls);
  weaponSprites.set(cls, sprite);
  return sprite;
}

// ── Grenades ─────────────────────────────────────────────────────────────────

const grenadeSprites = new Map<string, HTMLCanvasElement>();

export function getGrenadeSprite(type: 'he' | 'flash' | 'smoke'): HTMLCanvasElement {
  const cached = grenadeSprites.get(type);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 20;
  canvas.height = 20;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const body = type === 'he' ? '#41523c' : type === 'flash' ? '#9aa3af' : '#6b7076';
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(10, 12, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = type === 'he' ? '#2c362a' : '#787f88';
    ctx.fillRect(3, 11, 14, 3);
    ctx.fillStyle = '#c9ced6';
    ctx.fillRect(8, 2, 4, 4);
  }
  grenadeSprites.set(type, canvas);
  return canvas;
}
