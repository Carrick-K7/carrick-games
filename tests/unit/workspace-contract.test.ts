import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import ts from 'typescript';
import { getCanvasPoint } from '@carrick/game-sdk/render';
import { GAME_GROUP_MAP, GAME_GROUPS, GAME_LIST_ORDER, GAMES } from '../support/catalog';
import { ALL_GAME_IDS } from '../support/profiles';

const root = process.cwd();
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : /\.(?:ts|js)$/.test(entry.name) ? [file] : [];
  });
}
const workspaces = GAMES.map(meta => ({
  meta,
  dir: join(root, 'games', meta.id),
  files: sourceFiles(join(root, 'games', meta.id, 'src')),
}));
const gameClassFiles = workspaces.flatMap(workspace => workspace.files
  .filter(file => /export class \w+ extends BaseGame/.test(readFileSync(file, 'utf8')))
  .map(file => ({ id: workspace.meta.id, file })));

describe('game workspace contracts', () => {
  it('published game catalog matches source and README', () => {
    const ids = GAMES.map(game => game.id);
    expect(ids).toHaveLength(28);
    expect(new Set(ids).size).toBe(ids.length);
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    expect(readme).toContain('Carrick Games currently ships 28 playable games');
    const readmeNames = [...readme.matchAll(/^\| ([^|]+?) \| [^|]+? \| (?:Casual|Action|Puzzle|Board & Card) \|$/gm)]
      .map(match => match[1]);
    expect(readmeNames).toHaveLength(ids.length);
    expect(new Set(readmeNames)).toEqual(new Set(GAMES.map(game => game.name)));
    expect(gameClassFiles).toHaveLength(ids.length);
    expect(new Set(gameClassFiles.map(game => game.id))).toEqual(new Set(ids));
    expect(new Set(ALL_GAME_IDS)).toEqual(new Set(ids));
  });

  it('catalog uses four App Store-style primary groups', () => {
    expect(GAME_GROUPS.filter(group => group.id !== 'other')).toEqual([
      { id: 'casual', name: 'Casual', nameZh: '休闲' },
      { id: 'action', name: 'Action', nameZh: '动作' },
      { id: 'puzzle', name: 'Puzzle', nameZh: '益智' },
      { id: 'tabletop', name: 'Board & Card', nameZh: '棋牌' },
    ]);
    expect(GAME_GROUPS.find(group => group.id === 'other')).toEqual({ id: 'other', name: 'Other', nameZh: '其他' });
    const ids = GAMES.map(game => game.id);
    expect(new Set(Object.keys(GAME_GROUP_MAP))).toEqual(new Set(ids));
    expect(new Set(GAME_LIST_ORDER)).toEqual(new Set(ids));
    for (const id of ids) expect(GAME_GROUPS.some(group => group.id === GAME_GROUP_MAP[id])).toBe(true);
  });

  it('canvas font literals stay within UI bounds', () => {
    const oversizedFonts: string[] = [];
    const fontRegex = /ctx\.font\s*=\s*(['"`])(?:[^'"`]*?\s)?(\d+)px\b/g;
    for (const file of workspaces.flatMap(workspace => workspace.files).filter(file => file.endsWith('.ts'))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(fontRegex)) {
        const size = Number(match[2]);
        if (size > 56) oversizedFonts.push(`${relative(root, file)}: ${size}px`);
      }
    }
    expect(oversizedFonts).toEqual([]);
  });

  it('games use shared terminal, input, locale, and score infrastructure', () => {
    const terminalGameFiles = [
      'aimlab.ts', 'asteroids.ts', 'breakout.ts', 'bubbleshooter.ts', 'checkers.ts',
      'chess.ts', 'connectfour.ts', 'doodlejump.ts', 'flappybird.ts', 'galaga.ts',
      'game2048.ts', 'counterstrike.ts', 'cs.ts', 'iwanna.ts', 'minesweeper.ts',
      'parking.ts', 'pong.ts', 'simon.ts', 'snake.ts', 'solitaire.ts', 'spaceshooter.ts',
      'stacker.ts', 'sudoku.ts', 'tetris.ts', 'texashold.ts', 'wordle.ts',
    ];
    const bypasses: string[] = [];
    for (const { file } of gameClassFiles) {
      const source = readFileSync(file, 'utf8');
      if (/window\.reportScore/.test(source)) bypasses.push(`${file}: direct score callback`);
      if (/document\.documentElement.*data-lang/.test(source)) bypasses.push(`${file}: direct locale lookup`);
      if (/getBoundingClientRect\(/.test(source)) bypasses.push(`${file}: manual pointer mapping`);
    }
    expect(bypasses).toEqual([]);
    for (const name of terminalGameFiles) {
      const candidates = gameClassFiles.filter(({ file }) => basename(file) === name);
      expect(candidates, name).toHaveLength(1);
      const source = readFileSync(candidates[0].file, 'utf8');
      if (name === 'cs.ts') {
        // The port's interactive result HUD is retained, not painted twice.
        expect(source).toContain('this.publishResult(');
        expect(source).not.toContain('this.drawResultOverlay(');
      } else expect(source, `${name} should use the shared result overlay`).toContain('this.drawResultOverlay(');
      expect(source, `${name} should use the shared restart action`).toContain('this.isRestartInput(');
      expect(source, `${name} should reset one-shot score reporting on restart`).toContain('this.resetScoreReport(');
    }
  });

  it('workspace metadata, assets, and entrypoints are independent', () => {
    for (const { meta, dir } of workspaces) {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      const sourceMeta = JSON.parse(readFileSync(join(dir, 'game.json'), 'utf8'));
      expect(sourceMeta).not.toHaveProperty('loader');
      expect(sourceMeta.id).toBe(meta.id);
      expect(pkg.name).toBe(`@carrick/game-${meta.id}`);
      expect(pkg.private).toBe(true);
      expect(pkg.version).toMatch(/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/);
      expect(existsSync(join(dir, 'public', sourceMeta.icon))).toBe(true);
      const entry = readFileSync(join(dir, 'src/index.ts'), 'utf8');
      expect(entry).toContain('export const apiVersion = 1');
      expect(entry).toContain(`export const id = '${meta.id}'`);
      expect(entry).toContain('export const version = packageJson.version');
      expect(entry).toContain('export function create(host: GameHost)');
    }
  });

  it('game runtime imports remain within their package or declared shared dependencies', () => {
    const violations: string[] = [];
    for (const { dir, files } of workspaces) {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      for (const file of files) {
        for (const { fileName: specifier } of ts.preProcessFile(readFileSync(file, 'utf8'), true, true).importedFiles) {
          if (specifier.startsWith('.')) {
            const destination = join(file, '..', specifier);
            if (relative(dir, destination).startsWith('..')) violations.push(`${file}: ${specifier}`);
          } else {
            const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
            if (!pkg.dependencies?.[name] || (name.startsWith('@carrick/game-') && name !== '@carrick/game-sdk')) violations.push(`${file}: ${specifier}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('shell source owns only its module bootstrap', () => {
    const index = readFileSync(join(root, 'apps/shell/index.html'), 'utf8');
    expect(index).not.toContain('modulepreload');
    expect(index).toContain('<script type="module" src="/src/main.ts"></script>');
  });

  it('canvas coordinates map through displayed size', () => {
    const canvas = {
      getBoundingClientRect: () => ({ left: 100, top: 50, width: 800, height: 1200 }),
    } as HTMLCanvasElement;
    expect(getCanvasPoint(canvas, 400, 600, 500, 650)).toEqual({ x: 200, y: 300 });
  });
});
