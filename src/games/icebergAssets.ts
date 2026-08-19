// Procedural Iceberg Strike art. Textures are generated once and cached; the
// game never depends on external image assets.

import { TileKind } from './icebergMap.js';
import type { TeamSide } from './icebergRules.js';

function makeCanvas(w: number, h: number, pixelFn: (x: number, y: number) => [number, number, number]): HTMLCanvasElement {
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

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

let wallTextures: Record<number, HTMLCanvasElement> | null = null;

export function getWallTexture(kind: TileKind): HTMLCanvasElement {
  if (!wallTextures) {
    wallTextures = {};
    wallTextures[TileKind.IceWall] = makeCanvas(64, 64, (x, y) => {
      let c = lerpColor([216, 235, 249], [126, 165, 208], y / 63);
      if ((y * 7 + x * 13) % 53 < 2) c = lerpColor(c, [96, 133, 176], 0.85);
      if ((x * 31 + y * 17) % 97 < 2) c = lerpColor(c, [240, 248, 255], 0.7);
      if ((x * 5 + y * 3) % 61 < 1) c = lerpColor(c, [255, 255, 255], 0.5);
      return c;
    });
    wallTextures[TileKind.Crate] = makeCanvas(64, 64, (x, y) => {
      let c = lerpColor([190, 144, 102], [150, 106, 70], (y % 16) / 15);
      if (y % 16 < 1) c = lerpColor(c, [104, 72, 46], 0.9);
      if (x % 32 === 0 || x % 32 === 31) c = lerpColor(c, [104, 72, 46], 0.75);
      const plank = Math.floor(y / 16);
      if (plank % 2 === 0 && ((x + y) % 37) < 2) c = lerpColor(c, [222, 178, 132], 0.8);
      if (((x * 13 + y * 7) % 64) === 0) c = lerpColor(c, [70, 46, 28], 0.8);
      return c;
    });
    wallTextures[TileKind.Container] = makeCanvas(64, 64, (x, y) => {
      const band = Math.floor(x / 8) % 2 === 0;
      let c: [number, number, number] = band ? [74, 109, 148] : [86, 122, 162];
      if (y < 2 || y > 61) c = lerpColor(c, [150, 178, 208], 0.7);
      if (y > 30 && y < 34) c = lerpColor(c, [40, 62, 88], 0.6);
      if ((x * 3 + y * 5) % 71 < 1) c = lerpColor(c, [200, 220, 240], 0.35);
      return c;
    });
    wallTextures[TileKind.SnowBank] = makeCanvas(64, 64, (x, y) => {
      let c = lerpColor([250, 252, 254], [208, 224, 240], y / 63);
      if ((x * 11 + y * 7) % 41 < 1) c = lerpColor(c, [255, 255, 255], 0.6);
      if (y > 52) c = lerpColor(c, [176, 198, 222], 0.7);
      return c;
    });
  }
  return wallTextures[kind] ?? wallTextures[TileKind.IceWall];
}

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

function teamPalette(team: TeamSide, variant: number): TeamPalette {
  if (team === 'CT') {
    return {
      jacket: variant === 0 ? '#3d5470' : '#354a64',
      jacketDark: variant === 0 ? '#2c405a' : '#26374c',
      pants: '#33465c',
      boots: '#222b35',
      headgear: '#2c4258', // helmet
      skin: '#e8b98a',
      accent: '#39C5BB',
    };
  }
  return {
    jacket: variant === 0 ? '#6d5b3f' : '#5e4f38',
    jacketDark: variant === 0 ? '#54452f' : '#4a3e2b',
    pants: '#4c4434',
    boots: '#2e2a22',
    headgear: '#41392c', // beanie / balaclava
    skin: '#dfb08a',
    accent: '#e07f3e',
  };
}

function drawSoldierBody(c: CanvasRenderingContext2D, team: TeamSide, variant: number, frame: string) {
  const p = teamPalette(team, variant);

  // soft ground shadow
  c.fillStyle = 'rgba(15,35,55,0.20)';
  c.beginPath();
  c.ellipse(32, 93, 23, 7, 0, 0, Math.PI * 2);
  c.fill();

  const bob = frame === 'walk1' || frame === 'walk2' ? 1 : 0;

  // legs
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

  // torso
  c.fillStyle = p.jacket;
  c.fillRect(9, 30 - bob, 46, 34);
  c.fillStyle = p.jacketDark;
  c.fillRect(9, 44 - bob, 46, 6);
  c.fillRect(21, 30 - bob, 8, 12);
  c.fillRect(35, 42 - bob, 12, 8);
  c.fillStyle = '#3c4655';
  c.fillRect(9, 62 - bob, 46, 4); // belt

  // team accent scarf / armband
  c.fillStyle = p.accent;
  c.fillRect(24, 30 - bob, 16, 5);

  // rifle (held across chest)
  const raise = frame === 'shoot' ? -5 : 0;
  c.fillStyle = '#2b3038';
  c.save();
  c.translate(32, 46 - bob + raise);
  c.rotate(raise === 0 ? 0.03 : 0.22);
  c.fillRect(-24, -3, 48, 6);
  c.fillRect(14, -5, 10, 4);
  c.restore();

  // arms
  c.fillStyle = p.jacket;
  c.fillRect(7, 32 - bob, 10, 28);
  c.fillRect(47, 32 - bob, 10, 28);
  c.fillStyle = p.skin;
  c.fillRect(7, 46 - bob + raise, 10, 8);
  c.fillRect(47, 46 - bob + raise, 10, 8);

  // head + team headgear (CT helmet / T beanie)
  c.fillStyle = p.skin;
  c.fillRect(20, 14 - bob, 24, 18);
  c.fillStyle = p.headgear;
  if (team === 'CT') {
    c.fillRect(16, 8 - bob, 32, 13);
    c.fillRect(14, 16 - bob, 36, 4);
  } else {
    c.fillRect(18, 8 - bob, 28, 11);
    c.fillRect(18, 22 - bob, 28, 6); // face wrap
  }
}

export function getSoldierFrames(team: TeamSide, variant: number): SoldierFrames {
  const key = `${team}:${variant === 0 ? 0 : 1}`;
  const cached = soldierFramesCache.get(key);
  if (cached) return cached;
  const frames: HTMLCanvasElement[] = [];
  for (const frame of ['idle', 'walk1', 'walk2', 'shoot']) {
    frames.push(makeSoldierCanvas((c) => drawSoldierBody(c, team, variant === 0 ? 0 : 1, frame)));
  }
  const p = teamPalette(team, variant === 0 ? 0 : 1);
  const dead = makeSoldierCanvas((c) => {
    // soldier down in the snow — calm, non-gory
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

let bombSprite: HTMLCanvasElement | null = null;

export function getBombSprite(): HTMLCanvasElement {
  if (!bombSprite) {
    bombSprite = document.createElement('canvas');
    bombSprite.width = 40;
    bombSprite.height = 40;
    const ctx = bombSprite.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(15,35,55,0.25)';
      ctx.beginPath();
      ctx.ellipse(20, 34, 14, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#303844';
      ctx.fillRect(10, 14, 20, 18);
      ctx.fillStyle = '#202631';
      ctx.fillRect(10, 14, 20, 4);
      ctx.fillStyle = '#d94b43';
      ctx.fillRect(14, 20, 12, 6);
      ctx.fillStyle = '#f5c46a';
      ctx.fillRect(27, 18, 3, 10);
      ctx.fillStyle = '#39C5BB';
      ctx.fillRect(14, 28, 5, 2);
    }
  }
  return bombSprite;
}

let grenadeSprite: HTMLCanvasElement | null = null;

export function getGrenadeSprite(): HTMLCanvasElement {
  if (!grenadeSprite) {
    grenadeSprite = document.createElement('canvas');
    grenadeSprite.width = 24;
    grenadeSprite.height = 24;
    const ctx = grenadeSprite.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#3d4a3a';
      ctx.beginPath();
      ctx.arc(12, 14, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2c362a';
      ctx.fillRect(4, 13, 16, 3);
      ctx.fillStyle = '#6b7683';
      ctx.fillRect(9, 3, 6, 4);
    }
  }
  return grenadeSprite;
}
