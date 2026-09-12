import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ID_PATTERN, REVISION_PATTERN, VERSION_PATTERN, parseGameMeta } from '../packages/game-sdk/src/catalog.ts';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DIST = join(ROOT, 'dist');
export async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
export const posix = value => value.split(sep).join('/');
export function sourceRevision() {
  const revision = process.env.RELEASE_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (!REVISION_PATTERN.test(revision)) throw new Error('RELEASE_SHA must be a complete lowercase commit SHA');
  return revision;
}
export async function gameIds(root = ROOT) {
  if (!existsSync(join(root, 'games'))) return [];
  return (await readdir(join(root, 'games'), { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort();
}
export async function gameWorkspace(id, root = ROOT) {
  if (!ID_PATTERN.test(id)) throw new Error(`Invalid game workspace: ${id}`);
  const dir = join(root, 'games', id);
  const pkg = await json(join(dir, 'package.json'));
  const meta = parseGameMeta(await json(join(dir, 'game.json')));
  if (meta.id !== id || pkg.name !== `@carrick/game-${id}` || !VERSION_PATTERN.test(pkg.version)) throw new Error(`Invalid workspace identity/version: ${id}`);
  if (!existsSync(join(dir, 'src', 'index.ts'))) throw new Error(`Missing entry: ${id}`);
  return { id, dir, pkg, meta };
}
export async function gameWorkspaces() {
  const games = [];
  for (const id of await gameIds()) games.push(await gameWorkspace(id));
  return games;
}
export async function shellWorkspace() {
  const dir = join(ROOT, 'apps', 'shell');
  const pkg = await json(join(dir, 'package.json'));
  if (pkg.name !== '@carrick/shell' || !VERSION_PATTERN.test(pkg.version)) throw new Error('Invalid shell workspace');
  return { id: 'shell', dir, pkg };
}
export async function filesUnder(dir) {
  const paths = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not release files: ${path}`);
    if (entry.isDirectory()) paths.push(...await filesUnder(path));
    else if (entry.isFile()) paths.push(path);
    else throw new Error(`Unsupported release file: ${path}`);
  }
  return paths.sort();
}
export async function fileDigests(dir, omit = []) {
  const excluded = new Set(omit);
  const files = {};
  for (const path of await filesUnder(dir)) {
    const name = posix(relative(dir, path));
    if (name.split('/').some(part => part.startsWith('.'))) throw new Error(`Hidden paths cannot be published or fetched as release files: ${name}`);
    if (!excluded.has(name)) files[name] = createHash('sha256').update(await readFile(path)).digest('hex');
  }
  return files;
}
export async function workspaceTargets(args) {
  const names = args.filter(arg => !['--game', 'game', '--shell'].includes(arg));
  if (args.includes('--shell')) names.push('shell');
  if (!names.length || names.includes('all')) return [...await gameWorkspaces(), await shellWorkspace()];
  const targets = [];
  for (const name of new Set(names)) {
    targets.push(name === 'shell' ? await shellWorkspace() : await gameWorkspace(name));
  }
  return targets;
}
export async function isFile(path) {
  try { return (await stat(path)).isFile(); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
