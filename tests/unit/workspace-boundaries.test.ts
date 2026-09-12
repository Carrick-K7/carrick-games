import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkBoundaries, dependencyClosure } from '../../scripts/check.mjs';
import { fileDigests } from '../../scripts/workspaces.mjs';
import { isReleaseRelativePath } from '../../packages/game-sdk/src/catalog.ts';

type Workspace = { id: string; dir: string; pkg: { name: string; dependencies: Record<string, string> } };
async function fixture(run: (value: { root: string; target: Workspace }) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'carrick-boundaries-'));
  try {
    const dir = join(root, 'games', 'one');
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(join(dir, 'src', 'index.ts'), "import { value } from '@fixture/a'; export { value };\n");
    const target = { id: 'one', dir, pkg: { name: '@carrick/game-one', dependencies: { '@fixture/a': '*' } } };
    const libraries: Array<[string, Record<string, string>, string]> = [
      ['a', { '@fixture/b': '*' }, "export { value } from '@fixture/b';"],
      ['b', {}, 'export const value = 1;'],
      ['unrelated', {}, "import '../../../games/broken/src/index';"],
    ];
    for (const [id, dependencies, source] of libraries) {
      const lib = join(root, 'packages', id); await mkdir(join(lib, 'src'), { recursive: true });
      await writeFile(join(lib, 'package.json'), JSON.stringify({ name: `@fixture/${id}`, dependencies }));
      await writeFile(join(lib, 'src', 'index.ts'), source);
    }
    await run({ root, target });
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('boundary checks follow only declared transitive libraries', async () => fixture(async ({ root, target }) => {
  assert.deepEqual((await dependencyClosure([target], root)).map(value => value.id), ['one', '@fixture/a', '@fixture/b']);
  await checkBoundaries([target], root); // Unrelated broken source is deliberately not inspected.
  await writeFile(join(root, 'packages/b/src/index.ts'), "export { value } from '../../../games/other/src/index';");
  await assert.rejects(checkBoundaries([target], root), /source import escapes workspace/);
}));

test('a library cannot smuggle a declared game dependency into another game', async () => fixture(async ({ root, target }) => {
  await writeFile(join(root, 'packages/b/package.json'), JSON.stringify({ name: '@fixture/b', dependencies: { '@carrick/game-other': '*' } }));
  await writeFile(join(root, 'packages/b/src/index.ts'), "import '@carrick/game-other';");
  await assert.rejects(checkBoundaries([target], root), /games cannot depend on games/);
}));

test('public asset symlinks are rejected before a build can dereference them', async () => fixture(async ({ root, target }) => {
  await mkdir(join(target.dir, 'public'));
  await symlink(join(root, 'packages/b/package.json'), join(target.dir, 'public', 'leak.json'));
  await assert.rejects(checkBoundaries([target], root), /Symlinks are not release files/);
}));

test('modern file inventories and resource URLs reject hidden path segments', async () => fixture(async ({ target }) => {
  const dir = join(target.dir, 'public'); await mkdir(join(dir, '.private'), { recursive: true });
  await writeFile(join(dir, '.private', 'cache.js'), 'export const value=1;');
  await assert.rejects(fileDigests(dir), /Hidden paths cannot be published/);
  for (const path of ['.gitkeep', '.vite/manifest.json', 'assets/.private/a.js']) assert.equal(isReleaseRelativePath(path), false);
  assert.equal(isReleaseRelativePath('assets/image.v2.webp'), true);
}));
