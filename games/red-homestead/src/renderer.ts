import type { World, Building, Unit, BuildingKind } from './types.js';
import { BUILDINGS } from './content.js';
import type { ClassicView } from './classicView.js';
import type { Resident } from './cityLife.js';

export interface Camera { x: number; y: number; zoom: number }
export interface Point { x: number; y: number }
export interface SceneState { selected: number | string | null; hover: Point | null; building: BuildingKind | null; valid: boolean; grid: boolean; classic?: ClassicView | null; residents?: readonly Resident[]; facings?: Map<string, number> }
const TW = 60, TH = 30;
export function project(x: number, y: number, camera: Camera): Point {
  return { x: (x - y) * TW / 2 * camera.zoom + camera.x, y: (x + y) * TH / 2 * camera.zoom + camera.y };
}
export function unproject(x: number, y: number, camera: Camera): Point {
  const a = (x - camera.x) / camera.zoom / (TW / 2), b = (y - camera.y) / camera.zoom / (TH / 2);
  return { x: Math.floor((a + b) / 2), y: Math.floor((b - a) / 2) };
}
export function groundHeight(world: World, x: number, y: number): number {
  return world.source ? world.terrain[Math.floor(y) * world.width + Math.floor(x)]?.height ?? 0 : 0;
}
export function pickTile(world: World, x: number, y: number, camera: Camera): Point {
  if (!world.source) return unproject(x, y, camera);
  for (let level = 15; level >= 0; level--) {
    const point = unproject(x, y + level * 15 * camera.zoom, camera);
    if (point.x < 0 || point.y < 0 || point.x >= world.width || point.y >= world.height) continue;
    const cell = world.terrain[point.y * world.width + point.x]!;
    if (cell.kind !== 'void' && cell.height === level) return point;
  }
  return unproject(x, y, camera);
}
export function centerCamera(world: World, width: number, height: number, zoom = 1): Camera {
  const unit = world.units.find(unit => unit.kind === 'mcv') ?? world.buildings[0] ?? { x: 7, y: 7 };
  return { x: width / 2 - (unit.x - unit.y) * 30 * zoom, y: height * .47 - (unit.x + unit.y + 1 - groundHeight(world, unit.x, unit.y)) * 15 * zoom, zoom };
}
function polygon(ctx: CanvasRenderingContext2D, points: Point[], fill: string, stroke?: string) {
  ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}
function iso(x: number, y: number, z = 0): Point { return { x: (x - y) * 30, y: (x + y) * 15 - z }; }
function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, d: number, h: number, top: string, left: string, right: string) {
  const a = iso(x, y, h), b = iso(x + w, y, h), c = iso(x + w, y + d, h), e = iso(x, y + d, h);
  polygon(ctx, [b, c, iso(x + w, y + d), iso(x + w, y)], right);
  polygon(ctx, [c, e, iso(x, y + d), iso(x + w, y + d)], left);
  polygon(ctx, [a, b, c, e], top);
}
function roof(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, d: number, h: number, rise: number, color: string) {
  polygon(ctx, [iso(x, y, h), iso(x + w, y, h), iso(x + w, y + d / 2, h + rise), iso(x, y + d / 2, h + rise)], color);
  polygon(ctx, [iso(x, y + d, h), iso(x + w, y + d, h), iso(x + w, y + d / 2, h + rise), iso(x, y + d / 2, h + rise)], '#774c3d');
  polygon(ctx, [iso(x + w, y, h), iso(x + w, y + d, h), iso(x + w, y + d / 2, h + rise)], '#a88062');
}
function windows(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, d: number, h: number, rows: number) {
  for (let row = 0; row < rows; row++) {
    const z = 7 + row * 10;
    for (let i = 0; i < Math.max(1, Math.floor(w * 2)); i++) {
      const a = x + .18 + i * .45;
      polygon(ctx, [iso(a, y + d + .01, z + 5), iso(a + .20, y + d + .01, z + 5), iso(a + .20, y + d + .01, z), iso(a, y + d + .01, z)], '#f2d48e');
    }
    for (let i = 0; i < Math.max(1, Math.floor(d * 2)); i++) {
      const a = y + .16 + i * .45;
      polygon(ctx, [iso(x + w + .01, a, z + 5), iso(x + w + .01, a + .20, z + 5), iso(x + w + .01, a + .20, z), iso(x + w + .01, a, z)], '#bbd1bc');
    }
  }
}
function tree(ctx: CanvasRenderingContext2D, x: number, y: number, snow = false) {
  const p = iso(x, y);
  ctx.fillStyle = '#554d3a'; ctx.fillRect(p.x - 2, p.y - 20, 4, 22);
  for (let n = 0; n < 3; n++) {
    const width = 15 - n * 3, bottom = p.y - 8 - n * 9;
    polygon(ctx, [{ x: p.x, y: bottom - 25 }, { x: p.x + width, y: bottom }, { x: p.x - width, y: bottom }], snow ? ['#a8c0bd', '#c8d8cf', '#e1e8d9'][n]! : ['#354e3a', '#466345', '#628155'][n]!);
  }
}
function cylinder(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, h: number, fill: string) {
  const p = iso(x, y);
  ctx.fillStyle = fill; ctx.fillRect(p.x - radius, p.y - h, radius * 2, h);
  ctx.beginPath(); ctx.ellipse(p.x, p.y, radius, radius * .45, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c2c6ad'; ctx.beginPath(); ctx.ellipse(p.x, p.y - h, radius, radius * .45, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#4b5d52'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(p.x, p.y - h, radius, radius * .45, 0, 0, Math.PI * 2); ctx.stroke();
}
const buildingCache = new Map<string, HTMLCanvasElement>();
function makeBuilding(kind: BuildingKind): HTMLCanvasElement {
  const cached = buildingCache.get(kind); if (cached) return cached;
  const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 280;
  const ctx = canvas.getContext('2d')!; ctx.translate(180, 140);
  const def = BUILDINGS[kind], w = def.footprint.width, d = def.footprint.height;
  const name: string = kind;
  const shadow = [iso(.15, .1), iso(w + .55, .1), iso(w + .55, d + .4), iso(.15, d + .4)];
  if (!['road', 'tree', 'park'].includes(name)) polygon(ctx, shadow, '#20332d44');
  if (name === 'road') {
    polygon(ctx, [iso(0, 0), iso(1, 0), iso(1, 1), iso(0, 1)], '#6a756c');
    ctx.strokeStyle = '#b7b6a1'; ctx.lineWidth = 1.4; ctx.beginPath(); const a = iso(.5, .18), b = iso(.5, .82); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  } else if (name === 'tree') tree(ctx, .5, .5);
  else if (name === 'park') {
    box(ctx, .03, .03, w - .06, d - .06, 3, '#76935e', '#526f4a', '#58774f');
    polygon(ctx, [iso(.1, d * .45, 4), iso(w, d * .45, 4), iso(w, d * .60, 4), iso(.1, d * .60, 4)], '#d2c39d');
    tree(ctx, .5, .5); tree(ctx, w - .4, d - .4);
    box(ctx, .3, d - .4, .7, .17, 8, '#bd9670', '#785945', '#927052');
  } else if (name === 'lamp') {
    const p = iso(.5, .5); ctx.fillStyle = '#4e665c'; ctx.fillRect(p.x - 1.5, p.y - 35, 3, 36);
    ctx.fillStyle = '#f0d389'; ctx.fillRect(p.x - 4, p.y - 39, 8, 8);
    ctx.fillStyle = '#3a5047'; ctx.fillRect(p.x - 5, p.y - 41, 10, 3);
  } else if (name === 'fountain') {
    box(ctx, .15, .15, w - .3, d - .3, 7, '#b4c4b5', '#7e958b', '#92a89b');
    polygon(ctx, [iso(.3, .3, 8), iso(w - .3, .3, 8), iso(w - .3, d - .3, 8), iso(.3, d - .3, 8)], '#78aaa9');
    cylinder(ctx, w / 2, d / 2, 5, 22, '#b7c7b8');
  } else if (name === 'power' || name === 'refinery') {
    box(ctx, .12, .12, w - .24, d - .24, 7, '#a1aa8e', '#626f5e', '#71836f');
    box(ctx, .2, .15, Math.max(.8, w * .5), d - .45, 27, '#b39d73', '#8a7857', '#a18d63');
    for (let i = 0; i < 2; i++) cylinder(ctx, w - .48, .45 + i * .65, name === 'power' ? 10 : 12, name === 'power' ? 48 : 34, '#687e70');
    box(ctx, .25, .18, w * .40, .35, 36, '#a25242', '#733e36', '#8b493b');
    windows(ctx, .2, .15, Math.max(.8, w * .5), d - .45, 25, 1);
  } else if (name === 'yard' || name === 'workshop' || name === 'warehouse') {
    box(ctx, .10, .15, w - .25, d - .30, 26, '#b8ad8a', '#8b8469', '#a59b77');
    roof(ctx, .08, .10, w - .20, d - .20, 27, 12, '#9a5e49');
    const p = iso(w - .14, d * .5); ctx.fillStyle = '#415b50'; ctx.fillRect(p.x - 12, p.y - 20, 23, 20);
    for (let i = 0; i < 4; i++) { ctx.strokeStyle = '#728476'; ctx.beginPath(); ctx.moveTo(p.x - 10, p.y - 3 - i * 4); ctx.lineTo(p.x + 10, p.y - 3 - i * 4); ctx.stroke(); }
    if (name === 'yard') {
      const a = iso(.30, .35); ctx.strokeStyle = '#c5b475'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x, a.y - 68); ctx.lineTo(a.x + 49, a.y - 68); ctx.stroke();
      ctx.strokeStyle = '#4b5147'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x + 43, a.y - 68); ctx.lineTo(a.x + 43, a.y - 35); ctx.stroke();
    }
  } else if (name === 'greenhouse') {
    box(ctx, .1, .1, w - .2, d - .2, 23, '#a7c5b5', '#689787', '#7aa99a');
    roof(ctx, .1, .1, w - .2, d - .2, 23, 14, '#b9d1bc');
    for (let i = 0; i < w * 3; i++) { const p = iso(.1 + i / 3, d - .1, 0); ctx.fillStyle = '#c9d8be'; ctx.fillRect(p.x - 1, p.y - 23, 2, 23); }
  } else if (name === 'wind') {
    cylinder(ctx, w / 2, d / 2, 4, 65, '#bcc5b5');
    const p = iso(w / 2, d / 2, 65); ctx.strokeStyle = '#e4e6cf'; ctx.lineWidth = 4;
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.sin(a) * 25, p.y + Math.cos(a) * 25); ctx.stroke(); }
  } else {
    const tall = name === 'apartment', height = tall ? 64 : 28;
    box(ctx, .15, .15, w - .30, d - .30, height, '#c8c1a1', '#b4a688', '#c4b798');
    if (tall) box(ctx, .10, .10, w - .20, d - .20, height + 4, '#8b9d8b', '#7e8c79', '#97a58c');
    else roof(ctx, .08, .08, w - .16, d - .16, height + 1, 13, name === 'house' ? '#b77352' : '#667f6c');
    windows(ctx, .15, .15, w - .30, d - .30, height, tall ? 5 : 2);
    if (name === 'clinic') { const p = iso(w / 2, .15, height + 5); ctx.fillStyle = '#f2e9ce'; ctx.fillRect(p.x - 6, p.y - 8, 12, 12); ctx.fillStyle = '#a65549'; ctx.fillRect(p.x - 1.5, p.y - 6, 3, 8); ctx.fillRect(p.x - 4, p.y - 3.5, 8, 3); }
    if (name === 'market') { const p = iso(w * .5, d - .05, 12); for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? '#ded2aa' : '#a66d50'; ctx.fillRect(p.x - 20 + i * 8, p.y - 4, 8, 8); } }
  }
  buildingCache.set(kind, canvas); return canvas;
}
function drawUnit(ctx: CanvasRenderingContext2D, unit: Unit, selected: boolean) {
  const kind: string = unit.kind;
  ctx.fillStyle = '#213b3155'; ctx.beginPath(); ctx.ellipse(2, 3, kind === 'engineer' ? 5 : 16, kind === 'engineer' ? 3 : 7, 0, 0, Math.PI * 2); ctx.fill();
  if (selected) { ctx.strokeStyle = '#e9d998'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, 2, 21, 10, 0, 0, Math.PI * 2); ctx.stroke(); }
  if (kind === 'engineer') {
    ctx.fillStyle = '#414e46'; ctx.fillRect(-3, -6, 2, 7); ctx.fillRect(1, -6, 2, 7);
    ctx.fillStyle = '#cbb378'; ctx.fillRect(-4, -15, 8, 9); ctx.fillStyle = '#e0c397'; ctx.fillRect(-3, -20, 6, 6);
    ctx.fillStyle = '#e7d46f'; ctx.fillRect(-4, -22, 8, 3);
  } else {
    box(ctx, -.38, -.26, .76, .52, 6, '#4a5650', '#354a40', '#30463f');
    box(ctx, -.34, -.22, .68, .44, 12, kind === 'miner' ? '#baad74' : '#b7bda4', '#797c59', '#8e9470');
    box(ctx, -.30, -.19, .22, .38, 20, '#b4b897', '#778b7b', '#8ba08a');
    const p = iso(-.30, .02, 15); ctx.fillStyle = '#446f70'; ctx.fillRect(p.x - 4, p.y - 3, 7, 5);
    if (kind === 'mcv') { box(ctx, .02, -.20, .35, .40, 21, '#bbc2a6', '#8b9d82', '#a3ae8f'); ctx.fillStyle = '#b36b50'; ctx.fillRect(0, -19, 8, 3); }
    if (kind === 'miner') { const p = iso(.2, .05, 15); ctx.fillStyle = '#dbc56e'; ctx.fillRect(p.x - 7, p.y - 4, 13, 6); }
  }
}
export function renderWorld(ctx: CanvasRenderingContext2D, world: World, camera: Camera, state: SceneState, width: number, height: number) {
  ctx.fillStyle = '#283f3c'; ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;
  const occupied = new Set<string>();
  for (const b of world.buildings) { const f = BUILDINGS[b.kind].footprint; for (let y = b.y; y < b.y + f.height; y++) for (let x = b.x; x < b.x + f.width; x++) occupied.add(`${x},${y}`); }
  const terrains: Record<string, string[]> = { grass: ['#81916b', '#87976e', '#7c8d68', '#8a9870'], snow: ['#c6d4cb', '#cedbd1', '#c1d0c9', '#d1dbd0'], sand: ['#c7bb8e', '#c1b389', '#ccbf92', '#bcb187'], water: ['#527d7a', '#527e7b', '#4d7877', '#557f7a'], rock: ['#8a9280', '#929887', '#818a7c', '#949a87'], ore: ['#a4a074', '#9b976b', '#a6a174', '#9d9a6e'], road: ['#7e8475', '#7e8475', '#7e8475', '#7e8475'] };
  if (!world.source) for (let depth = 0; depth < world.width + world.height; depth++) for (let y = 0; y < world.height; y++) {
    const x = depth - y; if (x < 0 || x >= world.width) continue;
    const cell = world.terrain[y * world.width + x]!;
    const p = project(x, y, camera); if (p.x < -70 || p.x > width + 70 || p.y < -60 || p.y > height + 60) continue;
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(camera.zoom, camera.zoom);
    const n = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    const color = (terrains[cell.kind] ?? terrains.grass)![n % 4]!;
    polygon(ctx, [iso(0, 0), iso(1, 0), iso(1, 1), iso(0, 1)], color, state.grid ? '#314e352b' : undefined);
    if (cell.kind === 'water') { ctx.strokeStyle = '#b1cdc52b'; ctx.beginPath(); ctx.moveTo(-10, 15 + n % 5); ctx.lineTo(7, 15 + n % 5); ctx.stroke(); }
    else if (cell.kind === 'ore' && cell.ore > 0) {
      for (let i = 0; i < 5; i++) { const px = (n >> i * 3) % 23 - 11, py = 9 + (n >> i * 2) % 11; polygon(ctx, [{ x: px, y: py - 4 }, { x: px + 4, y: py }, { x: px, y: py + 2 }, { x: px - 3, y: py }], i % 2 ? '#d9bf69' : '#eee1a1'); }
    } else if (!occupied.has(`${x},${y}`) && cell.kind === 'rock') { box(ctx, .2, .2, .6, .6, 9 + n % 8, '#a9afa0', '#7e877a', '#929b8b'); }
    else if (cell.kind === 'grass' && n % 3 === 0) { ctx.fillStyle = '#afba8c66'; ctx.fillRect(n % 12 - 6, 12 + n % 6, 2, 1); ctx.fillRect(n % 9, 18, 2, 1); }
    ctx.restore();
  }
  type Entity = { depth: number; building?: Building; unit?: Unit; resident?: Resident };
  const entities: Entity[] = world.buildings.map(b => ({ depth: b.x + b.y + BUILDINGS[b.kind].footprint.width + BUILDINGS[b.kind].footprint.height - .1, building: b }));
  for (const unit of world.units) entities.push({ depth: unit.x + unit.y + 1.5, unit });
  for (const resident of state.residents ?? []) entities.push({ depth: resident.x + resident.y + 1.5, resident });
  entities.sort((a, b) => a.depth - b.depth);
  const drawEntity = (entry: Entity) => {
    if (entry.building) {
      const b = entry.building, p = project(b.x, b.y, camera), f = BUILDINGS[b.kind].footprint;
      p.y -= groundHeight(world, b.x, b.y) * 15 * camera.zoom;
      if (p.x < -500 || p.x > width + 500 || p.y < -500 || p.y > height + 500) return;
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(camera.zoom, camera.zoom);
      if (state.selected === b.id) polygon(ctx, [iso(0, 0), iso(f.width, 0), iso(f.width, f.height), iso(0, f.height)], '#f1e2a12a', '#f5df9a');
      ctx.globalAlpha = b.progress < 1 ? .4 + b.progress * .6 : 1;
      const binding = state.classic?.bundle.buildings[b.kind];
      if (binding && state.classic) { const anchor = iso(f.width / 2, f.height / 2); state.classic.drawBinding(ctx, binding, anchor.x, anchor.y); }
      else ctx.drawImage(makeBuilding(b.kind), -180, -140);
      if (b.progress < 1) {
        ctx.globalAlpha = 1; const p = iso(f.width / 2, f.height / 2, 64);
        ctx.fillStyle = '#263d35'; ctx.fillRect(p.x - 22, p.y, 44, 5); ctx.fillStyle = '#e2c680'; ctx.fillRect(p.x - 21, p.y + 1, 42 * b.progress, 3);
      }
      ctx.restore();
    } else if (entry.unit) {
      const unit = entry.unit;
      const step = unit.path?.[0]; const amount = unit.moveProgress ?? 0;
      const x = unit.x + (step ? (step.x - unit.x) * amount : 0), y = unit.y + (step ? (step.y - unit.y) * amount : 0);
      const h0 = groundHeight(world, unit.x, unit.y), h1 = step ? groundHeight(world, step.x, step.y) : h0;
      const p = project(x + .5, y + .5, camera); p.y -= (h0 + (h1 - h0) * amount) * 15 * camera.zoom;
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(camera.zoom, camera.zoom);
      const binding = state.classic?.bundle.units[unit.kind];
      if (binding && state.classic) {
        let facing = state.facings?.get(unit.id) ?? 0;
        if (step) { facing = (Math.round(Math.atan2(step.y - unit.y, step.x - unit.x) / (Math.PI / 4)) + 8) % 8; state.facings?.set(unit.id, facing); }
        if (state.selected === unit.id) { ctx.strokeStyle = '#e9d998'; ctx.beginPath(); ctx.ellipse(0, 2, 21, 10, 0, 0, Math.PI * 2); ctx.stroke(); }
        state.classic.drawBinding(ctx, binding, 0, 0, facing);
      } else drawUnit(ctx, unit, state.selected === unit.id);
      ctx.restore();
    } else if (entry.resident) {
      const r = entry.resident, next = r.path[0], progress = r.progress;
      const x = r.x + (next ? (next.x - r.x) * progress : 0), y = r.y + (next ? (next.y - r.y) * progress : 0);
      const p = project(x + .5, y + .5, camera); p.y -= groundHeight(world, r.x, r.y) * 15 * camera.zoom;
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(camera.zoom, camera.zoom);
      ctx.fillStyle = '#243c3555'; ctx.beginPath(); ctx.ellipse(1, 1, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
      const step = next ? Math.sin(progress * Math.PI * 2) : 0;
      ctx.fillStyle = '#354539'; ctx.fillRect(-2, -5 + step, 2, 6); ctx.fillRect(1, -5 - step, 2, 6);
      ctx.fillStyle = r.color; ctx.fillRect(-3, -12, 6, 8); ctx.fillStyle = '#d7b98e'; ctx.fillRect(-2, -17, 4, 5); ctx.restore();
    }
  };
  if (world.source && state.classic) {
    let next = 0;
    for (let depth = 0; depth < world.width + world.height + 8; depth++) {
      state.classic.drawDepth(ctx, world, camera, width, height, depth);
      while (next < entities.length && entities[next]!.depth <= depth + 1) drawEntity(entities[next++]!);
    }
  } else for (const entry of entities) drawEntity(entry);
  if (state.hover && state.building) {
    const p = project(state.hover.x, state.hover.y, camera), f = BUILDINGS[state.building].footprint;
    p.y -= groundHeight(world, state.hover.x, state.hover.y) * 15 * camera.zoom;
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(camera.zoom, camera.zoom);
    polygon(ctx, [iso(0, 0), iso(f.width, 0), iso(f.width, f.height), iso(0, f.height)], state.valid ? '#b5d18a55' : '#de826655', state.valid ? '#d4e9a9' : '#f2a188');
    ctx.globalAlpha = .55;
    const binding = state.classic?.bundle.buildings[state.building];
    if (binding && state.classic) { const anchor = iso(f.width / 2, f.height / 2); state.classic.drawBinding(ctx, binding, anchor.x, anchor.y); }
    else ctx.drawImage(makeBuilding(state.building), -180, -140);
    ctx.restore();
  }
}
export function pickClassicBuilding(world: World, camera: Camera, point: Point, classic: ClassicView | null): Building | undefined {
  if (!classic) return undefined;
  const buildings = [...world.buildings].sort((a,b) => (b.x+b.y+BUILDINGS[b.kind].footprint.width+BUILDINGS[b.kind].footprint.height) - (a.x+a.y+BUILDINGS[a.kind].footprint.width+BUILDINGS[a.kind].footprint.height));
  for (const building of buildings) {
    const binding = classic.bundle.buildings[building.kind]; if (!binding) continue;
    const image = classic.bundle.images[binding.image]!; const size = BUILDINGS[building.kind].footprint;
    const anchor = project(building.x + size.width/2, building.y + size.height/2, camera);
    anchor.y -= groundHeight(world,building.x,building.y)*15*camera.zoom;
    const x = Math.floor((point.x-anchor.x)/camera.zoom + image.anchorX), y = Math.floor((point.y-anchor.y)/camera.zoom + image.anchorY);
    if (x>=0 && y>=0 && x<image.width && y<image.height && image.rgba[(y*image.width+x)*4+3]! > 16) return building;
  }
  return undefined;
}
export function clearRendererCache() { buildingCache.clear(); }
