import { appendFile, cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { ROOT, DIST, fileDigests, filesUnder, gameIds, gameWorkspace, json, posix, shellWorkspace } from './workspaces.mjs';
import { classifyLockChanges, classifyManifestChanges, compareSemver, impactOfPaths, selectAffected } from './affected.mjs';
import { canonical, fetchProductionSnapshot, fetchReleaseJSON, installPublishedArtifact, isIntentionalDelist, validateProductionCatalog, validateProductionSnapshot, RELEASE_ORIGIN } from './release-store.mjs';

const SHA = /^[0-9a-f]{40}$/;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CI_DIR = join(ROOT, '.ci');
const PLAN = join(CI_DIR, 'plan.json');
const FULL_STAMP = join(CI_DIR, 'full-verified.json');
const goodInteger = value => Number.isSafeInteger(value) && value >= 0;
function assert(value, message) { if (!value) throw new Error(message); }
function git(args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
export function ciSequence(environment = process.env) {
  const run = Number(environment.GITHUB_RUN_NUMBER);
  const attempt = Number(environment.GITHUB_RUN_ATTEMPT);
  assert(goodInteger(run) && run > 0 && goodInteger(attempt) && attempt > 0 && attempt < 1000, 'CI requires a valid workflow run number/attempt');
  const sequence = run * 1000 + attempt;
  assert(Number.isSafeInteger(sequence), 'CI sequence exhausted');
  return sequence;
}
export function componentState(snapshot, id) {
  const empty = { generation: 0, sequence: 0, handledRevision: null };
  if (id === 'shell') return snapshot.catalog.shell ?? empty;
  const tombstones = snapshot.catalog.tombstones ?? {};
  return snapshot.catalog.games.find(game => game.id === id) ?? (Object.hasOwn(tombstones, id) ? tombstones[id] : empty);
}
export function isHiddenTarget(snapshot, id) {
  if (id === 'shell') return false;
  const tombstones = snapshot.catalog.tombstones ?? {};
  return Object.hasOwn(tombstones, id) && isIntentionalDelist(tombstones[id]);
}
export function isInitialTarget(snapshot, id) {
  if (id === 'shell') return !snapshot.catalog.shell || snapshot.catalog.shell.legacy === true;
  return !isHiddenTarget(snapshot, id) && !snapshot.catalog.games.some(game => game.id === id)
    && componentState(snapshot, id).handledRevision === null;
}
/** Hidden history cannot select automatic publication, but current edits still select tests. */
export function selectReleaseTargets({ snapshot, ...inputs }) {
  const hidden = new Set(Object.entries(snapshot.catalog.tombstones ?? {}).filter(([, state]) => isIntentionalDelist(state)).map(([id]) => id));
  assert(!(inputs.bootstrap && (inputs.mode ?? 'main') === 'main' && hidden.size),
    'Main bootstrap with intentional delists requires explicit recovery before builds; automatic relisting is forbidden');
  const selection = selectAffected({ ...inputs,
    pendingPathsById: Object.fromEntries(Object.entries(inputs.pendingPathsById ?? {}).filter(([id]) => !hidden.has(id))),
    unknownBaseIds: (inputs.unknownBaseIds ?? []).filter(id => !hidden.has(id)) });
  const trigger = impactOfPaths(inputs.triggerPaths ?? [], { ...inputs, lockChanges: inputs.triggerLockChanges, manifestChanges: inputs.triggerManifestChanges });
  return { ...selection, targets: selection.targets.map(target => hidden.has(target.id)
    ? { ...target, hidden: true, publish: false, runtime: target.runtime || !!trigger.targets[target.id]?.runtime }
    : target) };
}
export function assertPublicationVisible(plan, id, snapshot) {
  const target = targetPlan(plan, id);
  const hidden = isHiddenTarget(snapshot, id);
  assert(!target.publish || !hidden, `${id}: intentional delist forbids automatic publication`);
  return hidden;
}
function hasCommit(revision) {
  if (!SHA.test(revision ?? '')) return false;
  try { git(['cat-file', '-e', `${revision}^{commit}`]); return true; } catch { return false; }
}
function ancestor(base, head) {
  if (!hasCommit(base) || !hasCommit(head)) return false;
  try { git(['merge-base', '--is-ancestor', base, head]); return true; } catch { return false; }
}
export function sourceBaseStatus(base, candidate, { initial = false, hasSource = hasCommit, isAncestor = ancestor } = {}) {
  if (!base) return initial ? 'initial' : 'unknown';
  if (!hasSource(base)) return 'unknown';
  if (isAncestor(base, candidate)) return 'handled';
  return isAncestor(candidate, base) ? 'ahead' : 'unknown';
}
function changedPaths(base, head) {
  assert(SHA.test(base) && SHA.test(head), 'Git diff requires full commit revisions');
  return execFileSync('git', ['diff', '--name-only', '-z', base, head, '--'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
}
function jsonAt(revision, path) {
  assert(SHA.test(revision), 'Git object requires full revision');
  try { return JSON.parse(git(['show', `${revision}:${path}`])); } catch { return null; }
}
async function rawWorkspace(dir, id, expectedName) {
  try {
    const pkg = await json(join(ROOT, dir, 'package.json'));
    if (pkg.name !== expectedName) throw new Error(`Expected package name ${expectedName}`);
    return { id, dir, pkg };
  } catch (error) {
    // An unrelated malformed game's metadata/package cannot break discovery for
    // a valid target. The selected cell fails its own validation instead.
    return { id, dir, pkg: { name: expectedName, dependencies: {} }, discoveryError: error.message };
  }
}
export async function discoverComponents() {
  const components = [await rawWorkspace('apps/shell', 'shell', '@carrick/shell')];
  for (const id of await gameIds()) components.push(await rawWorkspace(`games/${id}`, id, `@carrick/game-${id}`));
  const libraries = [];
  for (const entry of await readdir(join(ROOT, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = `packages/${entry.name}`;
    const pkg = await json(join(ROOT, dir, 'package.json'));
    assert(pkg.name && typeof pkg.name === 'string', `Invalid shared package ${dir}`);
    libraries.push({ id: entry.name, dir, pkg });
  }
  return { components, libraries };
}
function lockChanges(base, head, records) {
  return classifyLockChanges(jsonAt(base, 'package-lock.json'), jsonAt(head, 'package-lock.json'), records);
}
function manifestChanges(base, head) {
  return classifyManifestChanges(jsonAt(base, 'package.json'), jsonAt(head, 'package.json'));
}
export function requireVersionBump(target, component, previousPackage) {
  if (component.discoveryError) return `${component.id}: ${component.discoveryError}`;
  try {
    compareSemver(component.pkg.version, component.pkg.version);
    if (target.runtime && !target.hidden && previousPackage?.version && compareSemver(component.pkg.version, previousPackage.version) <= 0) {
      // Name the shared inputs that widened this target. A root manifest or
      // toolchain change otherwise looks like a demand that the component's own
      // unchanged source take a version it does not need.
      const reasons = target.reasons ?? [];
      const shared = reasons.filter(reason => reason.includes('shared-'));
      const causes = (shared.length ? shared : reasons).slice(0, 3);
      return `${component.id}: runtime publication requires version > ${previousPackage.version}; found ${component.pkg.version}`
        + (causes.length ? ` [affected by ${causes.join('; ')}]` : '');
    }
  } catch (error) { return `${component.id}: ${error.message}`; }
  return null;
}
export function guardedTargetFence(plan, id, snapshot, { sequence, isAncestor = ancestor, packageAt = jsonAt } = {}) {
  const target = targetPlan(plan, id);
  // This guard precedes even equal-generation/already-current shortcuts. A plan
  // artifact is not authorization to relist a target hidden since planning.
  const hidden = assertPublicationVisible(plan, id, snapshot);
  const state = componentState(snapshot, id);
  if ((hidden && !target.publish) || plan.mode === 'pr' || state.generation === target.expectedGeneration) return state.generation;
  if (state.revision === plan.revision && state.handledRevision === plan.revision && state.version === target.version) return state.generation;
  assert(goodInteger(sequence) && sequence > state.sequence, 'A newer CI intent already owns this target');
  assert(state.revision && state.revision === state.handledRevision && !state.legacy && state.active !== false, 'Target was rolled back or is inactive; refusing automatic fence refresh');
  assert(isAncestor(state.handledRevision, plan.revision), 'Changed target source is not a known candidate ancestor');
  const component = plan.components.find(component => component.id === id);
  const previous = packageAt(state.handledRevision, `${component.dir}/package.json`);
  assert(previous?.version && compareSemver(target.version, previous.version) > 0, 'Queued publication must exceed the newly handled package version');
  return state.generation;
}
async function saveJSON(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
export async function createPlan({ environment = process.env, snapshot = null } = {}) {
  const mode = environment.GITHUB_EVENT_NAME === 'pull_request' ? 'pr' : 'main';
  const revision = environment.GITHUB_SHA || git(['rev-parse', 'HEAD']);
  assert(SHA.test(revision) && revision === git(['rev-parse', 'HEAD']), 'Checkout must match the workflow commit');
  const event = environment.GITHUB_EVENT_PATH ? await json(environment.GITHUB_EVENT_PATH) : {};
  const records = await discoverComponents();
  snapshot ??= await fetchProductionSnapshot();
  let triggerBase;
  if (mode === 'pr') {
    const base = event.pull_request?.base?.sha;
    assert(hasCommit(base), 'PR base commit is unavailable; checkout full history');
    triggerBase = git(['merge-base', base, revision]);
  } else {
    triggerBase = event.before;
    if (!ancestor(triggerBase, revision)) {
      // Push event history may be missing after a force push: perform full source
      // verification. Per-component handled baselines still fence publication.
      triggerBase = null;
    }
  }
  const triggerPaths = triggerBase ? changedPaths(triggerBase, revision) : ['tsconfig.json'];
  const triggerLockChanges = triggerBase ? lockChanges(triggerBase, revision, records) : { global: true, owners: [] };
  const triggerManifestChanges = triggerBase ? manifestChanges(triggerBase, revision) : { runtime: true };
  const pendingPathsById = {};
  const lockChangesById = {};
  const manifestChangesById = {};
  const unknownBaseIds = [];
  const aheadIds = new Set();
  const bases = {};
  for (const component of records.components) {
    const state = componentState(snapshot, component.id);
    const base = mode === 'pr' ? triggerBase : state.handledRevision;
    bases[component.id] = base;
    if (mode === 'pr' || isHiddenTarget(snapshot, component.id)) continue;
    const status = sourceBaseStatus(base, revision, { initial: isInitialTarget(snapshot, component.id) });
    if (status === 'initial') {
      pendingPathsById[component.id] = [`${component.dir}/package.json`];
    } else if (status === 'ahead') {
      aheadIds.add(component.id);
      if (snapshot.bootstrap) unknownBaseIds.push(component.id);
      else pendingPathsById[component.id] = [];
    } else if (status === 'unknown') {
      unknownBaseIds.push(component.id);
    } else {
      pendingPathsById[component.id] = changedPaths(base, revision);
      lockChangesById[component.id] = lockChanges(base, revision, records);
      manifestChangesById[component.id] = manifestChanges(base, revision);
    }
  }
  const selection = selectReleaseTargets({ snapshot, ...records, pendingPathsById, triggerPaths, lockChangesById, triggerLockChanges,
    manifestChangesById, triggerManifestChanges,
    unknownBaseIds, bootstrap: snapshot.bootstrap && mode === 'main', mode });
  const targets = selection.targets.filter(target => snapshot.bootstrap || !aheadIds.has(target.id)).map(selected => {
    const target = { ...selected };
    if (aheadIds.has(target.id)) target.error = `${target.id}: newer source already handled; replan bootstrap from latest main`;
    const component = records.components.find(component => component.id === target.id);
    const state = componentState(snapshot, target.id);
    // Successful seeds survive an interrupted initial rollout. Reusing a seed
    // with identical runtime inputs does not invent another runtime release.
    if (snapshot.bootstrap && mode === 'main' && target.id !== 'shell' && state.handledRevision && !unknownBaseIds.includes(target.id)) {
      const pending = impactOfPaths(pendingPathsById[target.id] ?? [], { ...records, lockChanges: lockChangesById[target.id], manifestChanges: manifestChangesById[target.id] });
      if (!pending.targets[target.id]?.runtime) { target.runtime = false; target.publish = false; }
    }
    // Version validation is per cell, not a global gate that could block a
    // second independent game when one author forgot their version bump.
    const previous = bases[target.id] && hasCommit(bases[target.id]) ? jsonAt(bases[target.id], `${component.dir}/package.json`) : null;
    const error = target.error || requireVersionBump(target, component, previous);
    return { ...target, publish: mode === 'main' && target.publish && !error, ...(error ? { error } : {}),
      version: component.pkg.version ?? null, expectedGeneration: state.generation, baseline: bases[target.id] ?? null };
  });
  return { schemaVersion: 1, mode, revision, bootstrap: snapshot.bootstrap,
    full: selection.full || !triggerBase || (snapshot.bootstrap && targets.length > 0),
    sourceOnly: snapshot.bootstrap, sequence: environment.GITHUB_RUN_NUMBER ? ciSequence(environment) : null,
    snapshot, components: records.components, libraries: records.libraries, alreadyHandledAhead: [...aheadIds], targets };
}
function targetPlan(plan, id) {
  assert(plan.schemaVersion === 1 && SHA.test(plan.revision), 'Invalid CI plan');
  assert(id === 'shell' || ID.test(id), 'Invalid CI target');
  const target = plan.targets.find(target => target.id === id);
  assert(target, `Target ${id} was not selected`);
  if (target.error) throw new Error(target.error);
  return target;
}
async function run(command, args, extraEnv = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...extraEnv } });
    child.on('error', reject);
    child.on('exit', (code, signal) => code === 0 ? resolvePromise() : reject(new Error(`${command} failed (${signal || code})`)));
  });
}
const node = (script, args = [], environment = {}) => run(process.execPath, [script, ...args], environment);
export function exactTestPath(path) {
  // Playwright CLI filters are regular expressions over absolute paths. A bare
  // "tests/" also matches games/<other>/tests and destroys cell isolation.
  return `^${posix(resolve(ROOT, path)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
}
export function unitTestOwners(plan, id) {
  const component = plan.components.find(component => component.id === id);
  assert(component, 'Unknown unit-test owner');
  const owners = [component];
  const seen = new Set([component.pkg.name]);
  const libraries = new Map(plan.libraries.map(library => [library.pkg.name, library]));
  for (let cursor = 0; cursor < owners.length; cursor++) {
    for (const name of Object.keys(owners[cursor].pkg.dependencies ?? {})) {
      if (seen.has(name) || !libraries.has(name)) continue;
      seen.add(name); owners.push(libraries.get(name));
    }
  }
  return owners;
}
async function unitFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'public', '.git'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await unitFiles(path));
    else if (entry.isFile() && /\.test\.[cm]?[jt]sx?$/.test(entry.name)) files.push(path);
  }
  return files;
}
async function packageUnitTests(plan, id) {
  const tests = [];
  for (const owner of unitTestOwners(plan, id)) tests.push(...await unitFiles(join(ROOT, owner.dir)));
  if (tests.length) await node('node_modules/vitest/vitest.mjs', ['run', ...tests.map(path => posix(relative(ROOT, path)))], { CG_TEST_CATALOG: '' });
}
async function artifactFor(id, revision) {
  const workspace = id === 'shell' ? await shellWorkspace() : await gameWorkspace(id);
  const directory = id === 'shell' ? join(DIST, 'shell', revision) : join(DIST, 'games', id, workspace.pkg.version, revision);
  const descriptor = id === 'shell' ? 'manifest.json' : 'game.json';
  const artifact = await json(join(directory, descriptor));
  assert(artifact.revision === revision && artifact.kind === (id === 'shell' ? 'shell' : 'game') && artifact.version === workspace.pkg.version, 'Candidate artifact identity mismatch');
  assert(canonical(await fileDigests(directory, [descriptor])) === canonical(artifact.files), 'Candidate bytes differ from tested inventory');
  return { directory, artifact, descriptor };
}
export async function prepareStore(plan, id) {
  targetPlan(plan, id);
  // Check live visibility before importing build tooling or preparing any bytes.
  // Fence refresh remains pre-test only and limited to known automatic ancestors.
  const snapshot = await fetchProductionSnapshot();
  const expectedGeneration = guardedTargetFence(plan, id, snapshot, { sequence: process.env.GITHUB_RUN_NUMBER ? ciSequence() : 0 });
  const { buildGame, buildShell, assembleCatalog, atomicJson, installPreviewShell } = await import('./build.mjs');
  const hasFull = existsSync(FULL_STAMP) && (await json(FULL_STAMP)).revision === plan.revision;
  if (plan.sourceOnly) {
    assert(hasFull, 'Bootstrap/source-only verification requires the successful full-source store');
    assert(snapshot.bootstrap, 'Bootstrap ended during this run; replan against the modern published shell');
    const candidate = await artifactFor(id, plan.revision);
    return { ...candidate, snapshot, expectedGeneration };
  }
  assert(!snapshot.bootstrap, 'Production reverted to legacy during verification');
  let savedCandidate = null;
  if (hasFull) {
    const candidate = await artifactFor(id, plan.revision);
    savedCandidate = join(CI_DIR, 'candidates', id);
    await rm(savedCandidate, { recursive: true, force: true });
    await mkdir(dirname(savedCandidate), { recursive: true });
    await cp(candidate.directory, savedCandidate, { recursive: true });
  }
  await rm(DIST, { recursive: true, force: true });
  const shell = await installPublishedArtifact(snapshot.manifest, 'shell', { dist: DIST });
  for (const game of snapshot.catalog.games) await installPublishedArtifact(game, 'game', { dist: DIST });
  await installPreviewShell(shell.directory);
  await atomicJson(join(DIST, 'games/index.json'), snapshot.catalog);
  let artifact;
  if (savedCandidate) {
    const descriptor = id === 'shell' ? 'manifest.json' : 'game.json';
    artifact = await json(join(savedCandidate, descriptor));
    const destination = id === 'shell' ? join(DIST, 'shell', plan.revision) : join(DIST, 'games', id, artifact.version, plan.revision);
    await mkdir(dirname(destination), { recursive: true });
    await rm(destination, { recursive: true, force: true });
    await cp(savedCandidate, destination, { recursive: true });
    if (id === 'shell') await installPreviewShell(destination);
  } else artifact = id === 'shell' ? await buildShell(plan.revision) : await buildGame(await gameWorkspace(id), plan.revision);
  if (id !== 'shell') await assembleCatalog([artifact]);
  return { ...await artifactFor(id, plan.revision), snapshot, expectedGeneration };
}
export function counterpartGeneration(snapshot, id) {
  return id === 'shell' ? snapshot.catalog.generation : snapshot.catalog.shell?.generation ?? 0;
}
export function gameIdentities(catalog) {
  return canonical(catalog.games.map(({ id, version, revision, apiVersion }) => ({ id, version, revision, apiVersion })).sort((a, b) => a.id.localeCompare(b.id)));
}
export function counterpartFingerprint(snapshot, id) {
  if (id !== 'shell') return canonical(snapshot.catalog.shell ?? { legacyRevision: snapshot.manifest.revision });
  return canonical(snapshot.catalog.games.map(game => ({ id: game.id, version: game.version, revision: game.revision, generation: game.generation })).sort((a, b) => a.id.localeCompare(b.id)));
}
export async function verify(plan, id) {
  assert(git(['rev-parse', 'HEAD']) === plan.revision, 'CI checkout differs from plan');
  if (id === 'all') {
    assert(plan.full, 'A full build was not selected');
    await rm(FULL_STAMP, { force: true });
    await node('scripts/check.mjs', ['types', 'all']);
    await run('npm', ['run', 'test:release']);
    await node('node_modules/vitest/vitest.mjs', ['run'], { CG_TEST_CATALOG: '' });
    await rm(DIST, { recursive: true, force: true });
    await node('scripts/build.mjs', ['all'], { RELEASE_SHA: plan.revision });
    if (plan.bootstrap) {
      // A resumed bootstrap may reuse successful older seeds. Test those exact
      // immutable identities, not merely a rebuild believed to be equivalent.
      const { assembleCatalog } = await import('./build.mjs');
      for (const game of plan.snapshot.catalog.games) {
        if (plan.targets.find(target => target.id === game.id)?.runtime) continue;
        const installed = await installPublishedArtifact(game, 'game', { dist: DIST });
        await assembleCatalog([installed.artifact]);
      }
    }
    await node('node_modules/@playwright/test/cli.js', ['test'], { CG_TEST_CATALOG: join(DIST, 'games/index.json'), GAME_ID: '' });
    const artifacts = {};
    for (const component of plan.components) artifacts[component.id] = (await artifactFor(component.id, plan.revision)).artifact;
    await saveJSON(FULL_STAMP, { revision: plan.revision, artifacts, catalog: await json(join(DIST, 'games/index.json')) });
    return;
  }
  targetPlan(plan, id);
  await rm(join(CI_DIR, `verified-${id}.json`), { force: true });
  const candidate = await prepareStore(plan, id);
  await node('scripts/check.mjs', ['types', id]);
  await packageUnitTests(plan, id);
  const environment = { CG_TEST_CATALOG: join(DIST, 'games/index.json'), GAME_ID: id === 'shell' ? '' : id };
  if (id === 'shell') {
    // Generic shell tests never import a game's implementation. The store is
    // the candidate shell plus every current published game, not source games.
    const tests = (await filesUnder(join(ROOT, 'tests'))).filter(path => path.endsWith('.spec.ts'));
    assert(tests.length, 'Missing generic shell browser tests');
    await node('node_modules/@playwright/test/cli.js', ['test', ...tests.map(exactTestPath)], environment);
  } else {
    const directory = join(ROOT, 'games', id, 'tests');
    const tests = existsSync(directory) ? (await filesUnder(directory)).filter(path => path.endsWith('.spec.ts')) : [];
    await node('node_modules/@playwright/test/cli.js', ['test', ...[...tests, 'tests/contract.spec.ts'].map(exactTestPath)], environment);
  }
  const verified = await artifactFor(id, plan.revision);
  await saveJSON(join(CI_DIR, `verified-${id}.json`), { revision: plan.revision, id,
    digest: createHash('sha256').update(canonical(verified.artifact)).digest('hex'),
    counterpart: counterpartFingerprint(candidate.snapshot, id), expectedGeneration: candidate.expectedGeneration,
    expectedCounterpartGeneration: counterpartGeneration(candidate.snapshot, id) });
}
export async function requireFreshInputs(plan, id) {
  // Read-only remote fetch; checkout's contents:read credential is sufficient.
  git(['fetch', '--no-tags', 'origin', 'main']);
  const latest = git(['rev-parse', 'FETCH_HEAD']);
  assert(ancestor(plan.revision, latest), 'main history changed; refusing stale publication');
  const records = { components: plan.components, libraries: plan.libraries };
  const paths = changedPaths(plan.revision, latest);
  const impact = impactOfPaths(paths, { ...records, lockChanges: lockChanges(plan.revision, latest, records), manifestChanges: manifestChanges(plan.revision, latest) });
  assert(!impact.targets[id]?.runtime && !impact.targets[id]?.test, 'Newer relevant source/dependency/test changes exist; refusing stale publication');
}
export function deploymentPort(value = '') {
  const port = value === '' ? '22' : value;
  assert(typeof port === 'string' && /^[1-9][0-9]{0,4}$/.test(port) && Number(port) <= 65535, 'Invalid deployment SSH port');
  return port;
}
export function deploymentConnection(environment = process.env, { unlist = false } = {}) {
  const host = environment.SSH_HOST;
  const port = deploymentPort(environment.DEPLOY_PORT);
  const user = environment.SSH_USER;
  assert(/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(host ?? '') && /^[A-Za-z_][A-Za-z0-9_-]*$/.test(user ?? ''), 'Invalid deployment SSH host/user');
  assert(environment.SSH_KEY && environment.DEPLOY_KNOWN_HOSTS, 'Missing pinned deployment credentials');
  if (environment.DEPLOY_URL || unlist) assert(environment.DEPLOY_URL?.replace(/\/$/, '') === RELEASE_ORIGIN, 'Unexpected production origin');
  if (unlist) assert(user === 'ubuntu' && port === '2222', 'Unlist requires the existing ubuntu/2222 restricted publisher');
  return { host, port, user };
}
async function withDeploymentSSH(operation, { environment = process.env, unlist = false } = {}) {
  const { host, port, user } = deploymentConnection(environment, { unlist });
  const directory = await mkdtemp(join(environment.RUNNER_TEMP || tmpdir(), 'carrick-ssh-'));
  const key = join(directory, 'key');
  const known = join(directory, 'known_hosts');
  try {
    await writeFile(key, environment.SSH_KEY + '\n', { mode: 0o600 });
    await writeFile(known, environment.DEPLOY_KNOWN_HOSTS + '\n', { mode: 0o600 });
    return await operation(['-p', port, '-i', key, '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${known}`, '--', `${user}@${host}`]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
export async function publish(plan, id) {
  const target = targetPlan(plan, id);
  if (!target.publish) { console.log(`${id}: verification only; no publication selected`); return; }
  assert(process.env.GITHUB_EVENT_NAME === 'push' && process.env.GITHUB_REF === 'refs/heads/main' && process.env.GITHUB_REPOSITORY === 'Carrick-K7/carrick-games', 'Production publication is restricted to this repository main push');
  assert(plan.mode === 'main' && process.env.GITHUB_SHA === plan.revision && git(['rev-parse', 'HEAD']) === plan.revision, 'Publication commit differs from plan');
  const verified = await json(join(CI_DIR, `verified-${id}.json`));
  const candidate = await artifactFor(id, plan.revision);
  assert(verified.revision === plan.revision && verified.id === id && verified.digest === createHash('sha256').update(canonical(candidate.artifact)).digest('hex'), 'Artifact is not the verified candidate');
  await requireFreshInputs(plan, id);
  const snapshot = await fetchProductionSnapshot();
  assertPublicationVisible(plan, id, snapshot);
  const state = componentState(snapshot, id);
  const sequence = ciSequence();
  if (state.revision === plan.revision && state.handledRevision === plan.revision && state.version === target.version) {
    const prefix = id === 'shell' ? `/shell/${plan.revision}/` : `/games/${id}/${target.version}/${plan.revision}/`;
    const published = await fetchReleaseJSON(prefix + candidate.descriptor);
    assert(canonical(published) === canonical(candidate.artifact), 'Already-active artifact bytes differ from this candidate');
    console.log(JSON.stringify({ status: 'already-current', id, revision: plan.revision, generation: state.generation }));
    return;
  }
  assert(goodInteger(verified.expectedGeneration) && state.generation === verified.expectedGeneration && sequence > state.sequence, 'Stale generation/CI sequence; replan rather than overwrite');
  if (plan.bootstrap && id !== 'shell') assert(snapshot.bootstrap, 'Bootstrap ended before publication; replan against the modern shell');
  let expectedCounterpartGeneration = verified.expectedCounterpartGeneration;
  if (plan.bootstrap && id === 'shell') {
    // One-time aggregate gate: bind the now-published COMPLETE identity set to
    // the actual full-suite store. Extra entries are as unsafe as missing seeds.
    const full = await json(FULL_STAMP);
    assert(full.revision === plan.revision && full.catalog && gameIdentities(full.catalog) === gameIdentities(snapshot.catalog), 'Bootstrap catalog does not equal the complete full-suite-tested game set');
    expectedCounterpartGeneration = snapshot.catalog.generation;
  } else {
    assert(counterpartFingerprint(snapshot, id) === verified.counterpart, 'Counterpart changed after testing; rerun this cell to verify the new pairing');
  }
  assert(goodInteger(expectedCounterpartGeneration), 'Missing tested counterpart generation');
  const archive = join(CI_DIR, `${id}.tar.gz`);
  try {
    await withDeploymentSSH(async sshArgs => {
      await run('tar', ['-C', candidate.directory, '-czf', archive, '.']);
      const command = id === 'shell' ? `deploy ${plan.revision} ${verified.expectedGeneration} ${sequence} ${expectedCounterpartGeneration}` : `deploy-game ${id} ${target.version} ${plan.revision} ${verified.expectedGeneration} ${sequence} ${expectedCounterpartGeneration}`;
      const input = await import('node:fs').then(module => module.createReadStream(archive));
      await new Promise((resolvePromise, reject) => {
        const child = spawn('ssh', [...sshArgs, command], { cwd: ROOT, stdio: ['pipe', 'inherit', 'inherit'] });
        input.on('error', error => { child.kill(); reject(error); });
        child.stdin.on('error', error => { if (error.code !== 'EPIPE') reject(error); });
        child.on('error', error => { input.destroy(); reject(error); });
        child.on('exit', code => { input.destroy(); code === 0 ? resolvePromise() : reject(new Error(`Restricted publication failed (${code})`)); });
        input.pipe(child.stdin);
      });
      const observed = componentState(await fetchProductionSnapshot(), id);
      assert(observed.revision === plan.revision && observed.version === target.version, 'Public state does not identify the published target');
      console.log(JSON.stringify({ status: 'deployed', id, revision: plan.revision, generation: observed.generation, sequence: observed.sequence }));
    });
  } finally {
    await rm(archive, { force: true });
  }
}
export function validateUnlistContext(environment, checkoutRevision) {
  assert(environment.GITHUB_EVENT_NAME === 'workflow_dispatch'
    && environment.GITHUB_REPOSITORY === 'Carrick-K7/carrick-games'
    && environment.GITHUB_REPOSITORY_OWNER === 'Carrick-K7'
    && environment.GITHUB_REF === 'refs/heads/main', 'Unlist is restricted to this repository main dispatch');
  assert(environment.GITHUB_ACTOR === 'Carrick-K7' && environment.GITHUB_TRIGGERING_ACTOR === 'Carrick-K7', 'Unlist requires the authenticated owner and triggering actor');
  assert(environment.GITHUB_RUN_ATTEMPT === '1', 'Unlist reruns are forbidden; inspect state and create a new dispatch');
  assert(SHA.test(environment.GITHUB_SHA ?? '') && checkoutRevision === environment.GITHUB_SHA, 'Unlist checkout must match the exact event SHA');
}
export function parseUnlistIds(input) {
  assert(typeof input === 'string', 'game_ids must be a nonempty string');
  const ids = [...new Set(input.split(/[\s,]+/).filter(Boolean))];
  assert(ids.length > 0, 'game_ids must contain at least one game');
  assert(ids.every(id => id.length <= 80 && ID.test(id) && id !== 'shell'), 'game_ids must contain only canonical game IDs, never shell');
  return ids;
}
function targetObservation(catalog, id) {
  const active = catalog.games.find(game => game.id === id);
  const tombstones = catalog.tombstones ?? {};
  const state = active ?? (Object.hasOwn(tombstones, id) ? tombstones[id] : null);
  if (!state) return { active: false, missing: true };
  return { active: !!active, version: active?.version ?? null, revision: active?.revision ?? null,
    generation: state.generation, sequence: state.sequence, handledRevision: state.handledRevision,
    ...(Object.hasOwn(state, 'delisted') ? { delisted: state.delisted } : {}) };
}
export function createUnlistIntent(input, snapshot) {
  validateProductionSnapshot(snapshot.catalog, snapshot.manifest);
  assert(snapshot.catalog.shell && !snapshot.catalog.shell.legacy, 'Unlist requires a modern pinned shell');
  const ids = parseUnlistIds(input);
  const catalog = snapshot.catalog;
  // Validate the ENTIRE set and every increment before a transport is opened.
  const targets = ids.map(id => {
    const before = targetObservation(catalog, id);
    assert(!before.missing, `Unknown game ID: ${id}`);
    const hidden = isHiddenTarget(snapshot, id);
    const sequence = hidden ? null : before.sequence + 1;
    // No increment is needed for zero-write hidden targets. A real removal must
    // leave room for both promotion and the publisher's failure compensation.
    assert(hidden || (goodInteger(sequence) && sequence > before.sequence && before.generation <= Number.MAX_SAFE_INTEGER - 2), `Unlist fence exhausted: ${id}`);
    return Object.freeze({ id, hidden, before: Object.freeze(before),
      expected: Object.freeze({ generation: before.generation, sequence, shellGeneration: catalog.shell.generation }) });
  });
  return Object.freeze({ catalogGeneration: catalog.generation, shellGeneration: catalog.shell.generation, targets: Object.freeze(targets) });
}
export function unlistCommand(target) {
  const { id, expected } = target;
  const ids = parseUnlistIds(id);
  assert(ids.length === 1 && ids[0] === id, 'Invalid unlist command target');
  assert(goodInteger(expected.generation) && goodInteger(expected.sequence) && expected.sequence > 0 && goodInteger(expected.shellGeneration), 'Invalid unlist command fences');
  return `remove-game ${id} ${expected.generation} ${expected.sequence} ${expected.shellGeneration}`;
}
function observedUnlistStatus(target, catalog) {
  const observed = targetObservation(catalog, target.id);
  if (target.hidden) return isHiddenTarget({ catalog }, target.id) ? 'already-unlisted' : 'failed';
  return !observed.active && !observed.missing && observed.delisted === true
    && observed.generation === target.expected.generation + 1 && observed.sequence === target.expected.sequence
    && observed.handledRevision === target.before.handledRevision ? 'removed' : 'failed';
}
/** No retries, refreshed fences, batch transaction, restoration or durable intent ledger. */
export async function executeUnlistIntent(intent, { transport, readCatalog }) {
  const results = intent.targets.map(target => ({ id: target.id, before: target.before, expected: target.expected,
    attempted: false, transport: null, status: target.hidden ? 'already-unlisted' : 'not-attempted', observed: null }));
  let stopped = false;
  for (const [index, target] of intent.targets.entries()) {
    if (target.hidden) continue;
    const result = results[index];
    result.attempted = true;
    try {
      const outcome = await transport(unlistCommand(target));
      result.transport = ['ok', 'failed', 'unknown'].includes(outcome) ? outcome : 'unknown';
    } catch { result.transport = 'unknown'; }
    // A visible tombstone may still be provisional while the publisher runs its
    // public check and can compensate. Failed/uncertain SSH always stops here.
    if (result.transport !== 'ok') { stopped = true; break; }
    try {
      const catalog = validateProductionCatalog(await readCatalog());
      if (observedUnlistStatus(target, catalog) !== 'removed'
        || catalog.shell?.generation !== intent.shellGeneration) { stopped = true; break; }
    } catch { stopped = true; break; }
  }
  // Reconcile ALL targets against one final read-only catalog, including prior
  // successes, zero-write targets and targets never attempted after a failure.
  let finalCatalog = null;
  try { finalCatalog = validateProductionCatalog(await readCatalog()); } catch { /* truth is unknown, never assume SSH success */ }
  for (const [index, target] of intent.targets.entries()) {
    const result = results[index];
    if (finalCatalog) result.observed = targetObservation(finalCatalog, target.id);
    // Only a completed successful command plus exact observed state proves a
    // removal. A provisional tombstone cannot upgrade failed/uncertain transport.
    if (result.attempted && result.transport !== 'ok') result.status = result.transport;
    else if (target.hidden || result.attempted) result.status = finalCatalog ? observedUnlistStatus(target, finalCatalog) : 'unknown';
  }
  return { schemaVersion: 1, action: 'unlist', ok: results.every(result => ['removed', 'already-unlisted'].includes(result.status)),
    catalogGeneration: intent.catalogGeneration, shellGeneration: intent.shellGeneration,
    finalCatalogGeneration: finalCatalog?.generation ?? null, stopped, results };
}
function removeOverSSH(sshArgs, command) {
  return new Promise(resolvePromise => {
    // No shell, stdin/archive, remote output or secrets in the operation report.
    const child = spawn('ssh', ['-o', 'ConnectTimeout=15', '-o', 'ConnectionAttempts=1', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=2', ...sshArgs, command],
      { cwd: ROOT, stdio: 'ignore', timeout: 120000 });
    child.on('error', () => resolvePromise('unknown'));
    child.on('exit', (code, signal) => resolvePromise(signal || code === null || code === 255 ? 'unknown' : code === 0 ? 'ok' : 'failed'));
  });
}
export async function unlistGames({ input, environment = process.env, checkoutRevision = git(['rev-parse', 'HEAD']), fetcher = fetch, transport, onIntent = () => {} } = {}) {
  validateUnlistContext(environment, checkoutRevision);
  parseUnlistIds(input); // Reject syntax/injection even before read-only network I/O.
  // One sampling attempt only; no retry can silently replace this run's intent.
  const catalog = await fetchReleaseJSON('/games/index.json', { fetcher });
  const manifest = await fetchReleaseJSON('/manifest.json', { fetcher });
  const intent = createUnlistIntent(input, { catalog, manifest });
  const readCatalog = () => fetchReleaseJSON('/games/index.json', { fetcher });
  const execute = transport => executeUnlistIntent(intent, { transport, readCatalog });
  let report;
  try {
    onIntent(intent); // Safe public before-identities/fences survive a runner interruption in its log.
    if (transport || intent.targets.every(target => target.hidden)) report = await execute(transport);
    else {
      try {
        await withDeploymentSSH(async sshArgs => { report = await execute(command => removeOverSSH(sshArgs, command)); }, { environment, unlist: true });
      } catch (error) {
        if (!report) throw error;
        // A credential cleanup failure must not erase already observed outcomes.
        report = { ...report, ok: false, error: 'credential-cleanup-failed' };
      }
    }
  } catch {
    // Once an intent exists an unexpected interruption cannot claim zero writes.
    // Never replay it; retain the tuple and query public truth read-only instead.
    let observed = null;
    try { observed = validateProductionCatalog(await readCatalog()); } catch { /* unknown */ }
    report = { schemaVersion: 1, action: 'unlist', ok: false, phase: 'after-intent', error: 'operation-interrupted; inspect public state',
      catalogGeneration: intent.catalogGeneration, shellGeneration: intent.shellGeneration, stopped: true,
      finalCatalogGeneration: observed?.generation ?? null, results: intent.targets.map(target => ({
        id: target.id, before: target.before, expected: target.expected, attempted: null, transport: 'unknown',
        status: target.hidden && observed ? observedUnlistStatus(target, observed) : 'unknown',
        observed: observed ? targetObservation(observed, target.id) : null })) };
  }
  return { ...report, revision: environment.GITHUB_SHA };
}
export function unlistSummary(report) {
  const rows = (report.results ?? []).map(result => {
    const before = result.before;
    const expected = result.expected;
    const observed = result.observed;
    return `| ${result.id} | ${result.status} | ${before.version ?? '-'} / ${before.revision ?? '-'} | ${expected.generation} / ${expected.sequence ?? '-'} / ${expected.shellGeneration} | ${observed ? `${observed.active ? 'active' : 'absent'} / ${observed.generation ?? '-'} / ${observed.sequence ?? '-'}` : 'unknown'} |`;
  });
  return `## Game unlist: ${report.ok ? 'success' : 'not all successful'}\n\n`
    + (report.error ? `${report.error}\n\n` : '')
    + '| Game | Result | Before actual version / revision | Expected target generation / sequence / shell generation | Final presence / generation / sequence |\n'
    + '| --- | --- | --- | --- | --- |\n' + rows.join('\n')
    + '\n\nNo automatic retry or restore. Inspect public state; a new dispatch is a new intent.\n';
}
async function unlist() {
  let report;
  try {
    report = await unlistGames({ input: process.env.GAME_IDS,
      onIntent: intent => console.log(JSON.stringify({ action: 'unlist', phase: 'intent', revision: process.env.GITHUB_SHA, ...intent })) });
  } catch {
    // Do not echo arbitrary exception/transport/JSON text into Actions logs.
    report = { schemaVersion: 1, action: 'unlist', ok: false, phase: 'preflight', error: 'preflight-failed; no operations attempted', results: [] };
  }
  console.log(JSON.stringify(report, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, unlistSummary(report));
  if (!report.ok) process.exitCode = 1;
}
export function planOutputs(plan) {
  const games = plan.targets.filter(target => target.id !== 'shell');
  return { matrix: JSON.stringify({ include: games.map(target => ({ id: target.id, publish: target.publish })) }),
    games: String(games.length > 0), shell: String(plan.targets.some(target => target.id === 'shell')),
    shell_publish: String(plan.targets.some(target => target.id === 'shell' && target.publish)),
    bootstrap: String(plan.bootstrap), full: String(plan.full) };
}
async function main() {
  const [command, suppliedTarget, ...options] = process.argv.slice(2);
  // Dispatch does not consume .ci/plan.json, install dependencies or build/test.
  if (command === 'unlist') {
    assert(!suppliedTarget && !options.length, 'unlist accepts game_ids only through the environment');
    await unlist();
    return;
  }
  let planPath = PLAN;
  if (options.length) {
    assert(options.length === 2 && options[0] === '--plan', 'Only --plan <path> is supported');
    planPath = resolve(options[1]);
  }
  if (command === 'plan') {
    assert(!suppliedTarget, 'plan does not accept a target');
    const plan = await createPlan();
    await saveJSON(planPath, plan);
    const outputs = planOutputs(plan);
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`).join(''));
    console.log(JSON.stringify({ revision: plan.revision, bootstrap: plan.bootstrap, full: plan.full, targets: plan.targets }, null, 2));
    return;
  }
  const plan = await json(planPath);
  const id = suppliedTarget || 'all';
  if (command === 'verify') await verify(plan, id);
  else if (command === 'prepare') await prepareStore(plan, id);
  else if (command === 'publish') await publish(plan, id);
  else throw new Error('Usage: node scripts/ci.mjs unlist | plan | verify|prepare|publish <id|shell|all> [--plan <path>]');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
