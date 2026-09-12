import ts from 'typescript';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, filesUnder, gameWorkspaces, json, posix, workspaceTargets } from './workspaces.mjs';

export function compilerConfig() {
  const path = join(ROOT, 'tsconfig.json');
  const config = ts.readConfigFile(path, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  return ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT);
}
/** Visit declared libraries only: broken unrelated game source is never read. */
export async function dependencyClosure(targets, root = ROOT) {
  const libraries = new Map();
  const directory = join(root, 'packages');
  if (existsSync(directory)) for (const entry of await readdir(directory, { withFileTypes: true })) {
    const dir = join(directory, entry.name);
    if (!entry.isDirectory() || !existsSync(join(dir, 'package.json'))) continue;
    const pkg = await json(join(dir, 'package.json'));
    libraries.set(pkg.name, { id: pkg.name, dir, pkg });
  }
  const queue = [...targets], seen = new Set(targets.map(target => target.dir));
  for (const target of queue) for (const name of Object.keys(target.pkg.dependencies ?? {})) {
    const library = libraries.get(name);
    if (library && !seen.has(library.dir)) { seen.add(library.dir); queue.push(library); }
  }
  return queue;
}
export async function checkBoundaries(targets, root = ROOT) {
  targets ??= await gameWorkspaces();
  const problems = [];
  for (const workspace of await dependencyClosure(targets, root)) {
    const sourceDir = join(workspace.dir, 'src');
    if (!existsSync(sourceDir)) throw new Error(`Missing source directory: ${sourceDir}`);
    for (const directory of [sourceDir, join(workspace.dir, 'public')].filter(existsSync)) {
      if ((await lstat(directory)).isSymbolicLink()) throw new Error(`${directory}: workspace source/assets cannot be symlinks`);
      if (directory !== sourceDir) await filesUnder(directory); // Also rejects nested asset symlinks before Vite can dereference them.
    }
    for (const file of await filesUnder(sourceDir)) {
      if (!/\.[cm]?[jt]sx?$/.test(file) || /\.(test|spec)\.[jt]sx?$/.test(file) || file.includes('/__tests__/')) continue;
      const imports = ts.preProcessFile(await readFile(file, 'utf8'), true, true).importedFiles;
      for (const imported of imports) {
        const specifier = imported.fileName;
        const location = posix(relative(ROOT, file));
        if (specifier.startsWith('.')) {
          const resolved = resolve(file, '..', specifier);
          const within = relative(workspace.dir, resolved);
          if (within.startsWith('..') || within.startsWith('/')) problems.push(`${location}: source import escapes workspace: ${specifier}`);
        } else if (specifier.startsWith('/') || /^(https?:|node:)/.test(specifier)) {
          problems.push(`${location}: forbidden runtime source import: ${specifier}`);
        } else {
          const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
          if (!workspace.pkg.dependencies?.[name]) problems.push(`${location}: undeclared dependency: ${name}`);
          if (name.startsWith('@carrick/game-') && name !== '@carrick/game-sdk') problems.push(`${location}: games cannot depend on games: ${name}`);
        }
      }
    }
  }
  if (problems.length) throw new Error(`Workspace boundary violations:\n${problems.join('\n')}`);
}
export async function typecheck(targets) {
  const config = compilerConfig();
  const roots = [];
  for (const target of await dependencyClosure(targets)) roots.push(...ts.sys.readDirectory(join(target.dir, 'src'), ['.ts', '.tsx', '.js'], ['**/node_modules/**', '**/*.test.*', '**/*.spec.*', '**/__tests__/**'], ['**/*']));
  const program = ts.createProgram(roots, { ...config.options, noEmit: true, rootDir: ROOT });
  const errors = ts.getPreEmitDiagnostics(program);
  if (errors.length) {
    console.error(ts.formatDiagnosticsWithColorAndContext(errors, {
      getCanonicalFileName: file => file, getCurrentDirectory: () => ROOT, getNewLine: () => '\n',
    }));
    throw new Error(`Typecheck failed (${errors.length} diagnostics)`);
  }
  console.log(`Typecheck passed: ${targets.map(target => target.id).join(', ')}`);
}
async function main() {
  const [mode = 'types', ...args] = process.argv.slice(2);
  const targets = await workspaceTargets(args);
  if (mode === 'types') {
    await checkBoundaries(targets);
    await typecheck(targets);
  } else if (mode === 'boundaries') {
    await checkBoundaries(targets);
    console.log(`Boundary checks passed: ${targets.length} workspaces`);
  } else throw new Error(`Unknown check: ${mode}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
