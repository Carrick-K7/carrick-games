import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyLockChanges, compareSemver, impactOfPaths, selectAffected } from '../../scripts/affected.mjs';

// Tiny data-only fixtures: deliberately no application parser, Git, filesystem or cache.
const workspace = (id, dir, dependencies = {}) => ({ id, dir, pkg: { name: `@fixture/${id}`, version: '1.0.0', dependencies } });
const sdk = { '@fixture/game-sdk': '*' };
const art = { ...sdk, '@fixture/weapon-art': 'workspace:*' };
const components = [
  workspace('snake', 'games/snake', sdk),
  workspace('pong', 'games/pong', sdk),
  workspace('cs-kimi', 'games/cs-kimi', art),
  workspace('gacha', 'games/gacha', art),
  workspace('shell', 'apps/shell', sdk),
  workspace('standalone', 'games/standalone'),
];
const libraries = [workspace('game-sdk', 'packages/game-sdk'), workspace('weapon-art', 'packages/weapon-art')];
const context = { components, libraries };
const ids = components.map(({ id }) => id);
const sdkConsumers = ids.filter(id => id !== 'standalone');
const impact = (paths, options = {}) => impactOfPaths(paths, { ...context, ...options });
const select = (options = {}) => selectAffected({ ...context, ...options });
const lockChanges = (before, after, options = {}) => classifyLockChanges(before, after, { ...context, ...options });
const targetIds = selection => selection.targets.map(({ id }) => id);
const flags = selection => selection.targets.map(({ id, runtime, test, publish, full }) => ({ id, runtime, test, publish, full }));
const expected = (selected, runtime, publish, full = false) => selected.map(id => ({ id, runtime, test: true, publish, full }));
const pendingForAll = paths => Object.fromEntries(ids.map(id => [id, [...paths]]));
const assertImpact = (result, selected, runtime, full = false) => {
  assert.deepEqual(Object.keys(result.targets), selected);
  assert.equal(result.full, full);
  for (const target of Object.values(result.targets)) {
    assert.equal(target.runtime, runtime);
    assert.equal(target.test, true);
    assert.ok(target.reasons.length > 0);
    assert.deepEqual(target.reasons, [...new Set(target.reasons)].sort());
  }
};

function lock() {
  const packages = {
    '': { name: 'fixture', version: '0.1.0', workspaces: ['apps/*', 'games/*', 'packages/*'], devDependencies: { vite: '^7.0.0' } },
  };
  for (const record of [...components, ...libraries]) {
    packages[record.dir] = { name: record.pkg.name, version: record.pkg.version, dependencies: { ...record.pkg.dependencies } };
    packages[`node_modules/${record.pkg.name}`] = { resolved: record.dir, link: true };
  }
  packages['node_modules/vite'] = { version: '7.0.0', resolved: 'https://registry.invalid/vite-7.0.0.tgz', integrity: 'sha512-example' };
  return { name: 'fixture', version: '0.1.0', lockfileVersion: 3, requires: true, packages };
}

for (const path of ['games/snake/src/index.ts', 'games/snake/public/icon.svg', 'games/snake/game.json', 'games/snake/package.json']) {
  test(`independent game runtime stays owner-only: ${path}`, () => assertImpact(impact([path]), ['snake'], true));
}

test('game directory matching has a slash boundary, not a prefix match', () => {
  const extra = workspace('snake-two', 'games/snake-two', sdk);
  assertImpact(impact(['games/snake-two/src/index.ts'], { components: [...components, extra] }), ['snake-two'], true);
});

for (const path of ['games/snake/tests/mechanics.test.mjs', 'games/snake/tests/cover.mjs', 'games/snake/tests/fixtures/data.json', 'games/snake/src/mechanics.test.ts', 'games/snake/src/__tests__/fixtures/input.json', 'games/snake/src/logic.spec.ts']) {
  test(`game tests never count as runtime: ${path}`, () => assertImpact(impact([path]), ['snake'], false));
}

for (const local of ['tests/data.json', 'foo.test.json', 'assets/fixtures/map.json', '__tests__/map.bsp', 'assets/__mocks__/texture.png', 'README.md', 'docs/defaults.json', 'memory/words.txt', '.gitignore']) {
  const path = `games/snake/public/${local}`;
  test(`every served public file stays owner-scoped runtime: ${path}`, () => {
    assertImpact(impact([path]), ['snake'], true);
    assert.deepEqual(flags(select({ pendingPathsById: pendingForAll([path]), triggerPaths: ['README.md'] })), expected(['snake'], true, true));
    assert.deepEqual(flags(select({ mode: 'pr', triggerPaths: [path] })), expected(['snake'], true, false));
  });
}

for (const local of ['src/test/state.ts', 'src/tests/production.ts', 'src/e2e/codec.ts', 'src/__mocks__/adapter.ts', 'publicity/engine.ts']) {
  test(`production source names do not imply test ownership: ${local}`, () => assertImpact(impact([`games/snake/${local}`]), ['snake'], true));
}

test('workspace names are not mistaken for documentation folders', () => {
  const records = [workspace('memory', 'games/memory'), workspace('docs', 'games/docs')];
  assertImpact(impactOfPaths(['games/memory/src/index.ts'], { components: records }), ['memory'], true);
  assertImpact(impactOfPaths(['games/docs/package.json'], { components: records }), ['docs'], true);
});

test('shell source and static assets select only shell, never games', () => {
  assertImpact(impact(['apps/shell/src/main.ts', 'apps/shell/public/brand.svg', 'apps/shell/index.html', 'apps/shell/package.json']), ['shell'], true);
});

test('shell public files also override test and documentation names', () => {
  const paths = ['apps/shell/public/tests/data.json', 'apps/shell/public/foo.spec.json', 'apps/shell/public/README.md'];
  for (const path of paths) {
    assertImpact(impact([path]), ['shell'], true);
    assert.deepEqual(flags(select({ pendingPathsById: pendingForAll([path]), triggerPaths: ['README.md'] })), expected(['shell'], true, true));
  }
});

test('shell tests select only shell without runtime', () => {
  assertImpact(impact(['apps/shell/tests/navigation.spec.ts', 'apps/shell/src/main.test.ts']), ['shell'], false);
});

test('docs, Markdown, README, AGENTS, DESIGN, memory and gitignore do not select', () => {
  assert.deepEqual(impact([
    'README.md', 'AGENTS.md', 'DESIGN.md', '.gitignore', 'docs/example.ts', 'memory/release.json',
    'games/snake/README', 'games/pong/README.txt', 'games/snake/.gitignore', 'games/snake/src/notes.MD',
    'games/snake/docs/example.ts', 'packages/game-sdk/AGENTS.md', 'packages/weapon-art/DESIGN.md',
    'tests/release/README.md', 'scripts/memory/state.json', 'notes.markdown', 'docs.mdx',
  ]), { targets: {}, full: false });
  assert.deepEqual(select({ triggerPaths: ['README.md'] }), { targets: [], full: false });
});

test('SDK changes reach declared consumers only, not unrelated targets', () => {
  assertImpact(impact(['packages/game-sdk/src/game.ts']), sdkConsumers, true);
});

test('weapon-art changes select only the declared shooter/gacha subset', () => {
  assertImpact(impact(['packages/weapon-art/src/silhouettes.ts', 'packages/weapon-art/package.json']), ['cs-kimi', 'gacha'], true);
});

test('library tests verify reverse consumers but cannot publish runtime', () => {
  assertImpact(impact(['packages/weapon-art/tests/shape.test.ts', 'packages/weapon-art/tests/fixtures/data.json']), ['cs-kimi', 'gacha'], false);
});

test('reverse closure traverses libraries transitively and terminates on cycles', () => {
  const libs = [
    workspace('base', 'packages/base', { '@fixture/bridge': '*' }),
    workspace('bridge', 'packages/bridge', { '@fixture/base': 'workspace:^' }),
  ];
  const consumers = [workspace('consumer', 'games/consumer', { '@fixture/bridge': '*' }), workspace('other', 'games/other')];
  assertImpact(impactOfPaths(['packages/base/src/index.ts'], { components: consumers, libraries: libs }), ['consumer'], true);
});

test('component sources stay independent even if another component declares their package', () => {
  const records = [workspace('a', 'games/a'), workspace('b', 'games/b', { '@fixture/a': '*' })];
  assertImpact(impactOfPaths(['games/a/src/index.ts'], { components: records }), ['a'], true);
});

for (const path of [
  'scripts/build.mjs', 'scripts/workspaces.mjs', 'scripts/vite-catalog.mjs', 'vite.config.ts', 'vite.game.config.mjs',
  'tsconfig.json', 'tsconfig.base.json', 'config/build.json', '.npmrc', '.nvmrc', '.node-version', '.tool-versions',
  'package.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'unrecognized-runtime-input.js',
]) {
  test(`shared build/config/toolchain input requires full runtime: ${path}`, () => assertImpact(impact([path]), ids, true, true));
}

for (const path of [
  'scripts/check.mjs', 'scripts/ci.mjs', 'scripts/affected.mjs', 'scripts/release-store.mjs', '.github/workflows/deploy.yml',
  'tests/release/affected.test.mjs', 'tests/fixtures/state.json', 'tests/support/cover.mjs', 'playwright.config.ts', 'playwright.smoke.config.mjs', 'vitest.config.ts',
]) {
  test(`root verification infrastructure is full test-only: ${path}`, () => {
    assertImpact(impact([path]), ids, false, true);
    assert.deepEqual(flags(select({ pendingPathsById: pendingForAll([path]), triggerPaths: [path] })), expected(ids, false, false, true));
  });
}

test('unchanged locks and JSON key reordering do not select', () => {
  const before = lock();
  const after = { packages: Object.fromEntries(Object.entries(before.packages).reverse()), requires: true, lockfileVersion: 3, version: '0.1.0', name: 'fixture' };
  assert.deepEqual(lockChanges(before, after), { global: false, owners: [] });
  assert.deepEqual(lockChanges(JSON.stringify(before), JSON.stringify(after)), { global: false, owners: [] });
});

test('independent game version-only package-lock updates stay owner-scoped', () => {
  const before = lock();
  const after = structuredClone(before);
  after.packages['games/snake'].version = '1.0.1';
  const change = lockChanges(before, after);
  assert.deepEqual(change, { global: false, owners: ['snake'] });
  assertImpact(impact(['games/snake/package.json', 'package-lock.json'], { lockChanges: change }), ['snake'], true);
  assert.deepEqual(flags(select({
    pendingPathsById: pendingForAll(['games/snake/package.json', 'package-lock.json']),
    lockChangesById: Object.fromEntries(ids.map(id => [id, change])), triggerPaths: ['README.md'],
  })), expected(['snake'], true, true));
});

test('workspace name changes and renamed link metadata stay owner-scoped', () => {
  const before = lock();
  const after = structuredClone(before);
  after.packages['games/snake'].name = '@fixture/renamed-snake';
  delete after.packages['node_modules/@fixture/snake'];
  after.packages['node_modules/@fixture/renamed-snake'] = { resolved: 'games/snake', link: true, version: '1.0.1', dev: true };
  assert.deepEqual(lockChanges(before, after), { global: false, owners: ['snake'] });
});

test('root lock name/version alone can be ignored at both metadata levels', () => {
  const before = lock();
  const after = structuredClone(before);
  after.name = 'renamed-root';
  delete after.version;
  after.packages[''].name = 'renamed-root';
  after.packages[''].version = '99.0.0';
  const change = lockChanges(before, after);
  assert.deepEqual(change, { global: false, owners: [] });
  assert.deepEqual(impact(['package-lock.json'], { lockChanges: change }), { targets: {}, full: false });
});

test('added and removed declared workspace package/link records identify their owner', () => {
  const complete = lock();
  const removed = structuredClone(complete);
  delete removed.packages['games/pong'];
  delete removed.packages['node_modules/@fixture/pong'];
  assert.deepEqual(lockChanges(complete, removed), { global: false, owners: ['pong'] });
  assert.deepEqual(lockChanges(removed, complete), { global: false, owners: ['pong'] });
});

test('retargeted declared workspace links include both owners', () => {
  const before = lock();
  const after = structuredClone(before);
  after.packages['node_modules/@fixture/snake'].resolved = 'games/pong';
  assert.deepEqual(lockChanges(before, after), { global: false, owners: ['pong', 'snake'] });
});

test('library workspace lock changes select its consumers, not every game', () => {
  const before = lock();
  const after = structuredClone(before);
  after.packages['packages/weapon-art'].version = '1.1.0';
  const change = lockChanges(before, after);
  assert.deepEqual(change, { global: false, owners: ['weapon-art'] });
  assertImpact(impact(['package-lock.json'], { lockChanges: change }), ['cs-kimi', 'gacha'], true);
});

test('per-workspace dependency records remain owner-scoped until external resolution changes', () => {
  const before = lock();
  const after = structuredClone(before);
  after.packages['games/snake'].dependencies.external = '^2.0.0';
  assert.deepEqual(lockChanges(before, after), { global: false, owners: ['snake'] });
  after.packages['node_modules/external'] = { version: '2.0.0', resolved: 'https://registry.invalid/external.tgz' };
  assert.deepEqual(lockChanges(before, after), { global: true, owners: ['snake'] });
});

for (const field of ['version', 'resolved', 'integrity']) {
  test(`external package ${field} changes force global runtime`, () => {
    const before = lock();
    const after = structuredClone(before);
    after.packages['node_modules/vite'][field] += '-changed';
    const change = lockChanges(before, after);
    assert.deepEqual(change, { global: true, owners: [] });
    assertImpact(impact(['package-lock.json'], { lockChanges: change }), ids, true, true);
  });
}

test('external addition/removal and workspace-nested external packages are global', () => {
  const before = lock();
  const after = structuredClone(before);
  delete after.packages['node_modules/vite'];
  assert.equal(lockChanges(before, after).global, true);
  assert.equal(lockChanges(after, before).global, true);
  const nested = structuredClone(before);
  nested.packages['games/snake/node_modules/external'] = { version: '2.0.0' };
  assert.equal(lockChanges(before, nested).global, true);
});

test('package-name resemblance does not prove ownership; only declared dirs/links do', () => {
  const before = lock();
  for (const [path, entry] of [
    ['games/undeclared', { name: '@fixture/snake', version: '1.0.1' }],
    ['node_modules/@fixture/undeclared', { resolved: 'games/undeclared', link: true }],
    ['node_modules/@fixture/snake-copy', { name: '@fixture/snake', version: '1.0.1', resolved: 'https://registry.invalid/snake.tgz' }],
    ['node_modules/@fixture/traversal', { resolved: '../games/snake', link: true }],
  ]) {
    const after = structuredClone(before);
    after.packages[path] = entry;
    assert.equal(lockChanges(before, after).global, true, path);
  }
  const after = structuredClone(before);
  after.packages['node_modules/not-a-matching-name'] = { resolved: './games/snake', link: true };
  assert.deepEqual(lockChanges(before, after), { global: false, owners: ['snake'] });
});

test('replacing an external package with a declared workspace link is still global', () => {
  const before = lock();
  const after = structuredClone(before);
  after.packages['node_modules/vite'] = { resolved: 'games/snake', link: true };
  assert.deepEqual(lockChanges(before, after), { global: true, owners: ['snake'] });
});

for (const [label, change] of [
  ['root dependencies', value => { value.packages[''].dependencies = { shared: '^1' }; }],
  ['root devDependencies', value => { value.packages[''].devDependencies.vite = '^8'; }],
  ['root scripts', value => { value.packages[''].scripts = { build: 'new-build' }; }],
  ['root workspace config', value => { value.packages[''].workspaces.push('extra/*'); }],
  ['root engines', value => { value.packages[''].engines = { node: '>=24' }; }],
  ['top-level lock config', value => { value.requires = false; }],
  ['lockfile format', value => { value.lockfileVersion = 2; }],
  ['legacy dependency section', value => { value.dependencies = { vite: { version: '8.0.0' } }; }],
]) {
  test(`${label} changes are global`, () => {
    const before = lock();
    const after = structuredClone(before);
    change(after);
    assert.deepEqual(lockChanges(before, after), { global: true, owners: [] });
  });
}

test('unavailable, malformed and unsupported locks are conservatively global', () => {
  const cyclic = lock();
  cyclic.self = cyclic;
  for (const bad of [undefined, null, '', '{', 'null', '[]', {}, { lockfileVersion: 1, dependencies: {} },
    { lockfileVersion: 3, packages: {} }, { lockfileVersion: 3, packages: { '': null } },
    { ...lock(), name: 42 }, { ...lock(), requires: 'true' },
    { ...lock(), packages: { '': {}, 'games/snake': { version: 3 } } },
    { ...lock(), packages: { '': {}, 'node_modules/link': { link: true } } }, cyclic,
  ]) {
    assert.deepEqual(lockChanges(bad, lock()), { global: true, owners: [] });
    assert.deepEqual(lockChanges(lock(), bad), { global: true, owners: [] });
  }
});

test('missing or invalid lock summaries fail safe; summaries without a lock path do nothing', () => {
  for (const change of [null, {}, { global: false }, { global: false, owners: ['undeclared'] }]) {
    assertImpact(impact(['package-lock.json'], { lockChanges: change }), ids, true, true);
  }
  assert.deepEqual(impact(['README.md'], { lockChanges: { global: true, owners: [] } }), { targets: {}, full: false });
});

test('cancelled unshipped runtime followed by a docs trigger still publishes its target', () => {
  const result = select({
    pendingPathsById: { snake: ['games/snake/src/index.ts', 'games/snake/package.json'] },
    triggerPaths: ['README.md', 'docs/release.md'],
  });
  assert.deepEqual(flags(result), expected(['snake'], true, true));
  assert.ok(result.targets[0].reasons.some(reason => reason.startsWith('pending:runtime:snake:')));
});

test('old test-only pending changes plus a docs trigger select nothing', () => {
  const pending = ['games/snake/tests/state.test.ts', 'games/snake/src/state.test.ts', 'tests/release/old.test.mjs', 'scripts/ci.mjs'];
  assert.deepEqual(select({ pendingPathsById: pendingForAll(pending), triggerPaths: ['README.md'] }), { targets: [], full: false });
});

test('old verification paths do not turn an independent pending runtime edit into full verification', () => {
  const result = select({
    pendingPathsById: { snake: ['games/snake/src/index.ts', 'scripts/check.mjs', 'tests/release/old.test.mjs'] },
    triggerPaths: ['README.md'],
  });
  assert.deepEqual(flags(result), expected(['snake'], true, true));
  assert.ok(result.targets[0].reasons.every(reason => !reason.includes('check.mjs') && !reason.includes('old.test.mjs')));
});

test('current game test changes verify without publication even when pending contains those tests', () => {
  const path = 'games/pong/tests/physics.test.ts';
  const result = select({ pendingPathsById: { pong: [path] }, triggerPaths: [path] });
  assert.deepEqual(flags(result), expected(['pong'], false, false));
});

test('main source triggers without a pending runtime diff are verification-only', () => {
  assert.deepEqual(flags(select({ triggerPaths: ['games/pong/src/index.ts'] })), expected(['pong'], false, false));
});

test('each handled baseline is evaluated independently rather than unioned', () => {
  const result = select({
    pendingPathsById: { snake: ['packages/game-sdk/src/game.ts'], pong: ['games/snake/src/index.ts'], shell: [] },
    triggerPaths: ['README.md'],
  });
  assert.deepEqual(flags(result), expected(['snake'], true, true));
});

test('runtime and current test-only targets can coexist without publishing the test-only target', () => {
  const result = select({ pendingPathsById: { snake: ['games/snake/src/index.ts'] }, triggerPaths: ['games/pong/tests/state.test.ts'] });
  assert.deepEqual(flags(result), [...expected(['snake'], true, true), ...expected(['pong'], false, false)]);
});

test('shared runtime pending requires all verification but only proven pending owners publish', () => {
  const result = select({ pendingPathsById: { snake: ['scripts/build.mjs'], pong: [] }, triggerPaths: ['README.md'] });
  assert.equal(result.full, true);
  assert.deepEqual(flags(result), ids.map(id => ({ id, runtime: id === 'snake', test: true, publish: id === 'snake', full: true })));
});

test('lock summaries use each target handled baseline, independently of the trigger summary', () => {
  const result = select({
    pendingPathsById: { snake: ['package-lock.json'], pong: ['package-lock.json'] },
    lockChangesById: { snake: { global: true, owners: [] }, pong: { global: false, owners: [] } },
    triggerPaths: ['package-lock.json'], triggerLockChanges: { global: false, owners: [] },
  });
  assert.deepEqual(flags(result), ids.map(id => ({ id, runtime: id === 'snake', test: true, publish: id === 'snake', full: true })));
});

test('an external lock event verifies all but cannot invent a main publication', () => {
  const result = select({ triggerPaths: ['package-lock.json'], triggerLockChanges: { global: true, owners: [] } });
  assert.deepEqual(flags(result), expected(ids, false, false, true));
});

test('PR source changes verify changed runtime with publish=false', () => {
  assert.deepEqual(flags(select({ mode: 'pr', triggerPaths: ['games/snake/src/index.ts'] })), expected(['snake'], true, false));
});

test('PR library changes verify only reverse consumers and do not publish', () => {
  assert.deepEqual(flags(select({ mode: 'pr', triggerPaths: ['packages/weapon-art/src/index.ts'] })), expected(['cs-kimi', 'gacha'], true, false));
});

test('PR ignores pending baselines and docs-only PRs select nothing', () => {
  assert.deepEqual(select({ mode: 'pr', pendingPathsById: { snake: ['games/snake/src/index.ts'] }, triggerPaths: ['README.md'] }), { targets: [], full: false });
  assert.deepEqual(flags(select({ mode: 'pr', triggerPaths: ['games/snake/tests/input.test.ts'] })), expected(['snake'], false, false));
});

test('PR version-only workspace lock changes stay owner-only and never publish', () => {
  assert.deepEqual(flags(select({ mode: 'pr', triggerPaths: ['package-lock.json'], triggerLockChanges: { global: false, owners: ['snake'] } })), expected(['snake'], true, false));
});

test('unknown source baseline forces full verification and blocks only its target', () => {
  const result = select({
    unknownBaseIds: ['snake'], pendingPathsById: { pong: ['games/pong/src/index.ts'] },
    triggerPaths: ['README.md'],
  });
  assert.equal(result.full, true);
  assert.deepEqual(targetIds(result), ids);
  assert.deepEqual(flags(result), ids.map(id => ({ id, runtime: id === 'pong', test: true, publish: id === 'pong', full: true })));
  assert.match(result.targets.find(target => target.id === 'snake').error, /baseline.*unavailable/);
  for (const target of result.targets.filter(target => target.id !== 'snake')) assert.equal('error' in target, false);
});

test('unknown baseline prevents publication even when runtime paths are supplied', () => {
  const result = select({ unknownBaseIds: ['snake'], pendingPathsById: { snake: ['games/snake/src/index.ts'] } });
  const target = result.targets.find(target => target.id === 'snake');
  assert.equal(target.runtime, true);
  assert.equal(target.publish, false);
  assert.equal(target.full, true);
  assert.equal(typeof target.error, 'string');
});

for (const mode of ['main', 'pr']) {
  test(`bootstrap explicitly selects runtime and full verification in ${mode} mode`, () => {
    const result = select({ bootstrap: true, mode });
    assert.equal(result.full, true);
    assert.deepEqual(flags(result), expected(ids, true, mode === 'main', true));
  });
}

test('an explicit unknown baseline error takes priority over bootstrap publication', () => {
  const result = select({ bootstrap: true, unknownBaseIds: ['snake'] });
  assert.equal(result.targets.find(target => target.id === 'snake').publish, false);
  assert.equal(result.targets.find(target => target.id === 'pong').publish, true);
});

test('results are deterministic and inputs are not mutated; there is no task-hash cache', () => {
  const freeze = value => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const inputs = freeze(structuredClone({ ...context,
    pendingPathsById: { snake: ['games/snake/src/index.ts', 'games/snake/src/index.ts'] },
    triggerPaths: ['games/pong/tests/input.test.ts'],
  }));
  const first = selectAffected(inputs);
  assert.deepEqual(selectAffected(inputs), first);
  first.targets[0].reasons.push('caller mutation');
  assert.ok(!selectAffected(inputs).targets[0].reasons.includes('caller mutation'));
  assert.deepEqual(impact(['games/snake/src/index.ts', 'games/snake/package.json']), impact(['games/snake/package.json', 'games/snake/src/index.ts', 'games/snake/src/index.ts']));
  assert.deepEqual(classifyLockChanges(freeze(lock()), freeze(lock()), inputs), { global: false, owners: [] });
  assert.deepEqual(select({ triggerPaths: ['README.md'] }), { targets: [], full: false });
  assert.deepEqual(flags(select({ pendingPathsById: { snake: ['games/snake/src/index.ts'] } })), expected(['snake'], true, true));
});

test('caller mistakes are rejected instead of silently widening publication', () => {
  assert.throws(() => select({ mode: 'typo' }), TypeError);
  assert.throws(() => select({ unknownBaseIds: ['not-a-component'] }), TypeError);
  assert.throws(() => impact(['../games/snake/src/index.ts']), TypeError);
  assert.throws(() => impact(['games\\snake\\src\\index.ts']), TypeError);
  assert.throws(() => impact([], { components: [workspace('snake', '/absolute/games/snake')] }), TypeError);
  assert.throws(() => impact([], { components: [components[0], components[0]] }), TypeError);
});

test('SemVer precedence follows numeric core and prerelease ordering', () => {
  const versions = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.0.1', '1.1.0', '2.0.0'];
  for (let index = 0; index < versions.length; index++) {
    assert.equal(compareSemver(versions[index], versions[index]), 0);
    if (!index) continue;
    assert.equal(compareSemver(versions[index - 1], versions[index]), -1);
    assert.equal(compareSemver(versions[index], versions[index - 1]), 1);
  }
});

test('SemVer ignores build metadata and compares arbitrarily large numbers exactly', () => {
  assert.equal(compareSemver('1.0.0+build.001', '1.0.0+different'), 0);
  assert.equal(compareSemver('1.0.0-alpha+one', '1.0.0-alpha+two'), 0);
  assert.equal(compareSemver('9007199254740992.0.0', '9007199254740993.0.0'), -1);
  assert.equal(compareSemver('1.0.0-9007199254740992', '1.0.0-9007199254740993'), -1);
});

test('SemVer rejects non-strict and malformed versions without dependencies', () => {
  for (const version of [null, 1, '', 'v1.0.0', '1.0', '01.0.0', '1.01.0', '1.0.01', '1.0.0-01', '1.0.0-a..b', '1.0.0+', '1.0.0+build..id', ' 1.0.0', '1.0.0\n']) {
    assert.throws(() => compareSemver(version, '1.0.0'), TypeError, String(version));
    assert.throws(() => compareSemver('1.0.0', version), TypeError, String(version));
  }
});
