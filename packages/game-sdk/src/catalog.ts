import type { Game, GameHost } from './game.js';

/** Protocol epoch is a behavioral contract, not the SDK/package SemVer. */
export const HOST_API_VERSION = 1 as const;
export const CATALOG_SCHEMA_VERSION = 1 as const;
export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const REVISION_PATTERN = /^[a-f0-9]{40}$/;
export const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export type GameInstance = Game;
export type GameCtor = new (host: GameHost) => Game;
export interface GameModule {
  apiVersion: number;
  id: string;
  version: string;
  create(host: GameHost): Game;
}
export interface VirtualKeySpec {
  label: string;
  key: string;
  aliases?: string[];
  classes?: string;
  hint?: string;
}
export interface KeyboardControl { keys: string[]; action: string; actionZh: string }
export interface TouchControl {
  icon: 'tap' | 'swipe' | 'swipe-up' | 'swipe-down' | 'swipe-left' | 'swipe-right' | 'hold';
  action: string;
  actionZh: string;
}
export interface ControlNote { text: string; textZh: string; audience?: 'all' | 'keyboard' | 'touch' }
export interface ControlSection {
  id?: string;
  title: string;
  titleZh: string;
  keyboard?: KeyboardControl[];
  touch?: TouchControl[];
  notes?: ControlNote[];
}
export interface GameControls {
  keyboard?: KeyboardControl[];
  keyboardPanel?: VirtualKeySpec[];
  touch?: TouchControl[];
  notes?: ControlNote[];
  sections?: ControlSection[];
}
export interface GameMeta {
  id: string;
  group: string;
  order: number;
  icon: string;
  name: string;
  nameZh: string;
  desc: string;
  descZh: string;
  canvasSize: { width: number; height: number };
  controls: GameControls;
  cover?: { src: string; width: number; height: number; focalPoint?: { x: number; y: number } };
}
export interface PromotionState {
  generation: number;
  sequence: number;
  handledRevision: string | null;
}
export interface GameRelease extends GameMeta, PromotionState {
  apiVersion: 1;
  version: string;
  revision: string;
  entry: string;
  styles: string[];
  assetBase: string;
}
export interface GameArtifact {
  schemaVersion: 1;
  kind: 'game';
  apiVersion: 1;
  id: string;
  version: string;
  revision: string;
  entry: string;
  styles: string[];
  files: Record<string, string>;
  meta: GameMeta;
}
export interface ShellRelease extends PromotionState {
  revision: string;
  version: string;
  apiVersions: number[];
}
export interface GameCatalog {
  schemaVersion: 1;
  apiVersion: 1;
  generation: number;
  games: GameRelease[];
  shell?: ShellRelease;
  tombstones?: Record<string, PromotionState>;
}
export interface GameGroup { id: string; name: string; nameZh: string }
export const GAME_GROUPS: GameGroup[] = [
  { id: 'casual', name: 'Casual', nameZh: '休闲' },
  { id: 'action', name: 'Action', nameZh: '动作' },
  { id: 'puzzle', name: 'Puzzle', nameZh: '益智' },
  { id: 'tabletop', name: 'Board & Card', nameZh: '棋牌' },
  { id: 'other', name: 'Other', nameZh: '其他' },
];

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max = 2048): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}
function finite(value: unknown, label: string, min = 0, max = 1_000_000): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${label}`);
  return value;
}
function array<T>(value: unknown, label: string, parse: (item: unknown) => T, max = 100): T[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > max) throw new Error(`Invalid ${label}`);
  return value.map(parse);
}
export function isReleaseRelativePath(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 512 && /^[A-Za-z0-9_./+-]+$/.test(value)
    && !value.startsWith('/') && value.split('/').every(part => part !== '' && !part.startsWith('.'));
}
export function gameAssetBase(id: string, version: string, revision: string): string {
  if (!ID_PATTERN.test(id) || !VERSION_PATTERN.test(version) || !REVISION_PATTERN.test(revision)) throw new Error('Invalid game release identity');
  return `/games/${id}/${version}/${revision}/`;
}
function keyboard(value: unknown): KeyboardControl {
  const row = object(value, 'keyboard control');
  const keys = array(row.keys, 'keys', key => text(key, 'key', 40), 64);
  if (!keys?.length) throw new Error('Missing control keys');
  return { keys, action: text(row.action, 'control action'), actionZh: text(row.actionZh, 'control actionZh') };
}
function touch(value: unknown): TouchControl {
  const row = object(value, 'touch control');
  const icon = text(row.icon, 'gesture') as TouchControl['icon'];
  if (!['tap', 'swipe', 'swipe-up', 'swipe-down', 'swipe-left', 'swipe-right', 'hold'].includes(icon)) throw new Error('Invalid gesture');
  return { icon, action: text(row.action, 'touch action'), actionZh: text(row.actionZh, 'touch actionZh') };
}
function note(value: unknown): ControlNote {
  const row = object(value, 'control note');
  if (row.audience !== undefined && !['all', 'keyboard', 'touch'].includes(String(row.audience))) throw new Error('Invalid note audience');
  return { text: text(row.text, 'note', 4096), textZh: text(row.textZh, 'noteZh', 4096), ...(row.audience ? { audience: row.audience as ControlNote['audience'] } : {}) };
}
function controls(value: unknown): GameControls {
  const row = object(value, 'controls');
  return {
    keyboard: array(row.keyboard, 'keyboard controls', keyboard),
    touch: array(row.touch, 'touch controls', touch),
    notes: array(row.notes, 'control notes', note),
    keyboardPanel: array(row.keyboardPanel, 'keyboard panel', value => {
      const key = object(value, 'virtual key');
      const classes = key.classes === undefined ? undefined : text(key.classes, 'key classes', 120);
      if (classes && !/^[A-Za-z0-9_ -]+$/.test(classes)) throw new Error('Invalid key class');
      return {
        label: text(key.label, 'key label', 80), key: text(key.key, 'key', 40), classes,
        aliases: array(key.aliases, 'key aliases', v => text(v, 'key alias', 40), 20),
        hint: key.hint === undefined ? undefined : text(key.hint, 'key hint', 200),
      };
    }),
    sections: array(row.sections, 'control sections', value => {
      const section = object(value, 'control section');
      return {
        id: section.id === undefined ? undefined : text(section.id, 'section id', 80),
        title: text(section.title, 'section title', 120), titleZh: text(section.titleZh, 'section titleZh', 120),
        keyboard: array(section.keyboard, 'section keyboard', keyboard),
        touch: array(section.touch, 'section touch', touch), notes: array(section.notes, 'section notes', note),
      };
    }, 20),
  };
}

/** Sanitizes metadata, not markup. URL ownership is checked separately at each boundary. */
export function parseGameMeta(value: unknown): GameMeta {
  const row = object(value, 'game metadata');
  const id = text(row.id, 'game id', 64);
  const group = text(row.group, 'game group', 64);
  if (!ID_PATTERN.test(id) || !ID_PATTERN.test(group)) throw new Error('Invalid game id/group');
  const size = object(row.canvasSize, 'canvas size');
  const meta: GameMeta = {
    id, group, order: finite(row.order, 'game order'), icon: text(row.icon, 'game icon', 512),
    name: text(row.name, 'game name', 160), nameZh: text(row.nameZh, 'game nameZh', 160),
    desc: text(row.desc, 'game description'), descZh: text(row.descZh, 'game descriptionZh'),
    canvasSize: { width: finite(size.width, 'canvas width', 1, 16384), height: finite(size.height, 'canvas height', 1, 16384) },
    controls: controls(row.controls),
  };
  if (row.cover !== undefined) {
    const cover = object(row.cover, 'game cover');
    meta.cover = { src: text(cover.src, 'cover path', 512), width: finite(cover.width, 'cover width', 1, 16384), height: finite(cover.height, 'cover height', 1, 16384) };
    if (cover.focalPoint !== undefined) {
      const point = object(cover.focalPoint, 'cover focal point');
      meta.cover.focalPoint = { x: finite(point.x, 'cover x', 0, 1), y: finite(point.y, 'cover y', 0, 1) };
    }
  }
  return meta;
}

/** Only same-origin, query-free paths inside exactly this immutable release are allowed. */
export function releaseResource(path: string, assetBase: string, origin: string): string {
  const base = new URL(assetBase, origin);
  const url = new URL(path, base);
  if (url.origin !== new URL(origin).origin || url.search || url.hash || !url.pathname.startsWith(base.pathname)) throw new Error('Resource outside game release');
  const relative = url.pathname.slice(base.pathname.length);
  if (!isReleaseRelativePath(relative)) throw new Error('Invalid release resource');
  return url.pathname;
}
export function parseGameRelease(value: unknown, origin: string): GameRelease {
  const row = object(value, 'game release');
  if (row.apiVersion !== HOST_API_VERSION) throw new Error('Unsupported game protocol');
  const meta = parseGameMeta(row);
  const version = text(row.version, 'game version', 100);
  const revision = text(row.revision, 'game revision', 40);
  const assetBase = gameAssetBase(meta.id, version, revision);
  if (row.assetBase !== assetBase) throw new Error('Invalid release asset base');
  const resource = (value: unknown) => releaseResource(text(value, 'resource path', 512), assetBase, origin);
  meta.icon = resource(meta.icon);
  if (meta.cover) meta.cover.src = resource(meta.cover.src);
  const entry = resource(row.entry);
  if (!entry.endsWith('.js')) throw new Error('Invalid game module');
  const styles = array(row.styles, 'game styles', value => {
    const path = resource(value);
    if (!path.endsWith('.css')) throw new Error('Invalid stylesheet');
    return path;
  }, 20) ?? [];
  const handledRevision = row.handledRevision === null || row.handledRevision === undefined ? null : text(row.handledRevision, 'handled revision', 40);
  if (handledRevision !== null && !REVISION_PATTERN.test(handledRevision)) throw new Error('Invalid handled revision');
  return {
    ...meta, apiVersion: HOST_API_VERSION, version, revision, assetBase, entry, styles,
    generation: finite(row.generation ?? 0, 'game generation', 0, Number.MAX_SAFE_INTEGER),
    sequence: finite(row.sequence ?? 0, 'game sequence', 0, Number.MAX_SAFE_INTEGER), handledRevision,
  };
}
export function parseCatalog(value: unknown, origin: string): { catalog: GameCatalog; rejected: string[] } {
  const row = object(value, 'catalog');
  if (row.schemaVersion !== CATALOG_SCHEMA_VERSION || row.apiVersion !== HOST_API_VERSION) throw new Error('Unsupported game catalog');
  if (!Array.isArray(row.games) || row.games.length > 1000) throw new Error('Invalid game list');
  const games: GameRelease[] = [];
  const rejected: string[] = [];
  const ids = new Set<string>();
  for (const value of row.games) {
    try {
      const game = parseGameRelease(value, origin);
      if (ids.has(game.id)) throw new Error(`Duplicate game id: ${game.id}`);
      ids.add(game.id);
      games.push(game);
    } catch (error) { rejected.push(error instanceof Error ? error.message : String(error)); }
  }
  games.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return { catalog: { schemaVersion: 1, apiVersion: 1, generation: finite(row.generation ?? 0, 'catalog generation', 0, Number.MAX_SAFE_INTEGER), games }, rejected };
}
