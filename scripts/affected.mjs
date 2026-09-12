import { isDeepStrictEqual } from 'node:util';

/**
 * Pure release selection: no filesystem, Git, environment, clock or task-hash cache.
 * Workspace records are { id, dir: relativePOSIX, pkg: { name, version, dependencies? } }.
 * Components are release targets; libraries select their declared reverse consumers.
 * Results are sparse, in component input order, with sorted, unique diagnostic reasons.
 * Runtime impact always requires tests. `full` means full verification, not publication.
 */

const own = (object, key) => Object.hasOwn(object, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function relativePath(value) {
  if (typeof value !== 'string') throw new TypeError('Expected a relative POSIX path');
  const path = value.replace(/^(?:\.\/)+/, '');
  if (!path || path.includes('\\') || path.includes('\0') || path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new TypeError(`Expected a relative POSIX path: ${value}`);
  }
  return path;
}

function workspaceIndex(components, libraries) {
  if (!Array.isArray(components) || !Array.isArray(libraries)) throw new TypeError('components and libraries must be arrays');
  const byId = new Map();
  const byDir = new Map();
  const byName = new Map();
  const componentIds = new Set();
  for (const [records, component] of [[components, true], [libraries, false]]) {
    for (const record of records) {
      if (!object(record) || typeof record.id !== 'string' || !record.id || !object(record.pkg) || typeof record.pkg.name !== 'string' || !record.pkg.name) {
        throw new TypeError('Workspace records require id, dir and pkg.name');
      }
      const dir = relativePath(record.dir);
      if (byId.has(record.id) || byDir.has(dir) || byName.has(record.pkg.name)) throw new TypeError('Workspace ids, dirs and package names must be unique');
      if (record.pkg.dependencies !== undefined && !object(record.pkg.dependencies)) throw new TypeError('Workspace dependencies must be an object');
      const entry = { ...record, dir, component };
      byId.set(record.id, entry);
      byDir.set(dir, entry);
      byName.set(record.pkg.name, entry);
      if (component) componentIds.add(record.id);
    }
  }
  const reverse = new Map([...byId.keys()].map(id => [id, []]));
  for (const record of byId.values()) {
    for (const name of Object.keys(record.pkg.dependencies ?? {})) {
      const dependency = byName.get(name);
      if (dependency) reverse.get(dependency.id).push(record.id);
    }
  }
  const consumers = id => {
    const source = byId.get(id);
    if (source.component) return [id]; // Games and the shell publish independently.
    const visited = new Set([id]);
    const selected = new Set();
    const queue = [id];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      for (const dependent of reverse.get(queue[cursor])) {
        if (visited.has(dependent)) continue;
        visited.add(dependent);
        if (componentIds.has(dependent)) selected.add(dependent);
        else queue.push(dependent);
      }
    }
    return [...componentIds].filter(candidate => selected.has(candidate));
  };
  return { components, byId, byDir, consumers, dirs: [...byDir.keys()].sort((a, b) => b.length - a.length) };
}

function ignoredPath(path) {
  const parts = path.toLowerCase().split('/');
  const basename = parts.at(-1);
  return parts.some(part => part === 'docs' || part === 'memory')
    || /\.(?:md|mdx|markdown)$/.test(basename)
    || /^(?:readme|agents|design)(?:\..*)?$/.test(basename)
    || basename === '.gitignore';
}

function testPath(path) {
  return path === 'tests' || path.startsWith('tests/')
    || /(?:^|\/)__tests__(?:\/|$)/.test(path)
    || /\.(?:test|spec)\.[^/]+$/.test(path)
    || /(?:^|\/)(?:playwright|vitest)(?:\.[^/]+)?\.config\.[^/]+$/.test(path);
}

function verificationPath(path) {
  return testPath(path)
    || ['scripts/check.mjs', 'scripts/ci.mjs', 'scripts/affected.mjs', 'scripts/release-store.mjs'].includes(path)
    || path.startsWith('.github/');
}

function addImpact(targets, id, runtime, reason) {
  if (!targets.has(id)) targets.set(id, { runtime: false, test: true, reasons: new Set() });
  const target = targets.get(id);
  target.runtime ||= runtime;
  target.reasons.add(reason);
}

function pathImpact(paths, index, lockChanges, runtimeOnly = false) {
  if (!Array.isArray(paths)) throw new TypeError('paths must be an array');
  const targets = new Map();
  let full = false;
  const all = (runtime, reason) => {
    if (runtimeOnly && !runtime) return;
    full = true;
    for (const { id } of index.components) addImpact(targets, id, runtime, reason);
  };
  const ownerImpact = (id, runtime, reason) => {
    if (runtimeOnly && !runtime) return;
    for (const consumer of index.consumers(id)) addImpact(targets, consumer, runtime, reason);
  };
  for (const path of [...new Set(paths.map(relativePath))].sort()) {
    const dir = index.dirs.find(candidate => path === candidate || path.startsWith(`${candidate}/`));
    const local = dir ? path.slice(dir.length + 1) : path;
    // Vite copies the whole public tree. Served bytes stay runtime inputs even
    // when named tests, fixtures, README.md or foo.test.json; not test sources.
    const publicAsset = !!dir && (local === 'public' || local.startsWith('public/'));
    if (!publicAsset && ignoredPath(local)) continue;
    if (dir) {
      const owner = index.byDir.get(dir);
      const runtime = publicAsset || !testPath(local);
      ownerImpact(owner.id, runtime, `${runtime ? 'runtime' : 'test'}:${owner.id}:${path}`);
    } else if (path === 'package-lock.json') {
      // A lock summary is considered only when the corresponding lock path changed.
      const valid = object(lockChanges) && typeof lockChanges.global === 'boolean'
        && Array.isArray(lockChanges.owners) && lockChanges.owners.every(id => index.byId.has(id));
      if (!valid || lockChanges.global) all(true, `shared-lock:${path}`);
      else for (const id of new Set(lockChanges.owners)) ownerImpact(id, true, `workspace-lock:${id}`);
    } else if (verificationPath(path)) {
      all(false, `verification:${path}`);
    } else {
      // Includes root package.json, build/workspace/catalog scripts, Vite/TS/config,
      // .npmrc, toolchain/other lockfiles. Unknown non-document paths fail safe too.
      all(true, `shared-runtime:${path}`);
    }
  }
  return { targets, full };
}

/**
 * impactOfPaths(paths, {components, libraries=[], lockChanges=null})
 * -> { targets: { [componentId]: {runtime:boolean, test:boolean, reasons:string[]} }, full:boolean }
 * `lockChanges` is classifyLockChanges's result for a changed root package-lock.json.
 * Missing/invalid lock summaries conservatively affect every component at runtime.
 * Workspace tests (including colocated *.test.* / *.spec.*) affect only that owner
 * or a library's consumers. Workspace public/ always means runtime bytes, ahead
 * of test/docs naming rules. Root verification infrastructure never changes runtime.
 */
export function impactOfPaths(paths, { components, libraries = [], lockChanges = null }) {
  const index = workspaceIndex(components, libraries);
  const impact = pathImpact(paths, index, lockChanges);
  return {
    targets: Object.fromEntries(components.filter(({ id }) => impact.targets.has(id)).map(({ id }) => {
      const target = impact.targets.get(id);
      return [id, { runtime: target.runtime, test: target.test, reasons: [...target.reasons].sort() }];
    })),
    full: impact.full,
  };
}

function jsonValue(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (!object(value) && !Array.isArray(value)) return false;
  if (ancestors.has(value)) return false;
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  ancestors.add(value);
  const valid = Object.values(value).every(child => jsonValue(child, ancestors));
  ancestors.delete(value);
  return valid;
}

function parseLock(input) {
  try {
    const lock = typeof input === 'string' ? JSON.parse(input) : input;
    if (!object(lock) || !jsonValue(lock) || ![2, 3].includes(lock.lockfileVersion)
      || !object(lock.packages) || !own(lock.packages, '') || !object(lock.packages[''])) return null;
    for (const field of ['name', 'version']) {
      if (own(lock, field) && typeof lock[field] !== 'string') return null;
    }
    if (own(lock, 'requires') && typeof lock.requires !== 'boolean') return null;
    for (const entry of Object.values(lock.packages)) {
      if (!object(entry)) return null;
      for (const field of ['name', 'version', 'resolved', 'integrity']) {
        if (own(entry, field) && typeof entry[field] !== 'string') return null;
      }
      if (own(entry, 'link') && (typeof entry.link !== 'boolean' || (entry.link && typeof entry.resolved !== 'string'))) return null;
      for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        if (own(entry, field) && (!object(entry[field]) || !Object.values(entry[field]).every(value => typeof value === 'string'))) return null;
      }
    }
    return lock;
  } catch {
    return null;
  }
}

const without = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));

/**
 * classifyLockChanges(beforeLock, afterLock, {components, libraries=[]})
 * -> { global:boolean, owners:string[] } (owner ids sorted; may include libraries).
 * Accepts parsed npm lockfile v2/v3 objects or JSON strings. Unavailable, malformed,
 * or unsupported locks are global. Only exact declared workspace package records
 * and link:true node_modules entries whose resolved path maps to a declared dir
 * are owner-scoped; package-name resemblance alone is never proof of ownership.
 * Added/removed records and renamed/retargeted links include all recognized owners.
 * Root name/version (top level and packages['']) are ignored; all other root fields
 * and any external resolved-package changes are global. Inputs are never mutated.
 */
export function classifyLockChanges(beforeLock, afterLock, { components, libraries = [] }) {
  const index = workspaceIndex(components, libraries);
  const before = parseLock(beforeLock);
  const after = parseLock(afterLock);
  if (!before || !after) return { global: true, owners: [] };
  let global = !isDeepStrictEqual(without(before, ['name', 'version', 'packages']), without(after, ['name', 'version', 'packages']))
    || !isDeepStrictEqual(without(before.packages[''], ['name', 'version']), without(after.packages[''], ['name', 'version']));
  const owners = new Set();
  const linkOwner = entry => {
    if (entry?.link !== true || typeof entry.resolved !== 'string') return undefined;
    try { return index.byDir.get(relativePath(entry.resolved.replace(/^file:/, '')))?.id; }
    catch { return undefined; }
  };
  for (const path of new Set([...Object.keys(before.packages), ...Object.keys(after.packages)])) {
    if (path === '' || isDeepStrictEqual(before.packages[path], after.packages[path])) continue;
    const workspace = index.byDir.get(path);
    if (workspace) {
      owners.add(workspace.id);
      continue;
    }
    if (/(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/]+$/.test(path)) {
      for (const lock of [before, after]) {
        if (!own(lock.packages, path)) continue;
        const id = linkOwner(lock.packages[path]);
        if (id === undefined) global = true;
        else owners.add(id);
      }
    } else global = true;
  }
  return { global, owners: [...owners].sort() };
}

/**
 * selectAffected({components, libraries=[], pendingPathsById={}, triggerPaths=[],
 *   lockChangesById={}, triggerLockChanges=null, unknownBaseIds=[], bootstrap=false,
 *   mode='main'})
 * -> {targets:[{id, runtime, test, publish, full, error?, reasons:string[]}], full}
 *
 * Main: inspect EACH component's own handledRevision..HEAD paths for runtime only;
 * never union baselines. Event before..HEAD paths select verification only. Thus an
 * unshipped runtime edit survives a later docs push, but old test/CI changes do not.
 * PR: trigger paths are merge-base..merge-commit; ignore pending diffs, never publish.
 * Shared pending runtime changes require full verification, but only components
 * whose own baselines contain them can publish. `full` is copied to each target.
 * Unknown bases force full verification and a per-id publication-blocking error;
 * they do not invent runtime changes or block independent targets. Bootstrap
 * explicitly selects all runtime/tests/full (unknown-id errors still take priority).
 * Semver policy and all Git/lock acquisition remain the caller's responsibility.
 */
export function selectAffected({
  components, libraries = [], pendingPathsById = {}, triggerPaths = [],
  lockChangesById = {}, triggerLockChanges = null, unknownBaseIds = [],
  bootstrap = false, mode = 'main',
}) {
  if (!['main', 'pr'].includes(mode)) throw new TypeError(`Unknown selection mode: ${mode}`);
  if (!object(pendingPathsById) || !object(lockChangesById) || !Array.isArray(unknownBaseIds)) throw new TypeError('Invalid baseline inputs');
  const index = workspaceIndex(components, libraries);
  const targets = new Map();
  let full = false;
  const verifyAll = reason => {
    full = true;
    for (const { id } of components) addImpact(targets, id, false, reason);
  };
  const merge = (id, target, prefix, runtime) => {
    for (const reason of target.reasons) addImpact(targets, id, runtime, `${prefix}:${reason}`);
  };
  const trigger = pathImpact(triggerPaths, index, triggerLockChanges);
  full ||= trigger.full;
  for (const [id, target] of trigger.targets) merge(id, target, 'trigger', mode === 'pr' && target.runtime);
  if (mode === 'main') {
    for (const { id } of components) {
      const pending = pathImpact(own(pendingPathsById, id) ? pendingPathsById[id] : [], index, own(lockChangesById, id) ? lockChangesById[id] : null, true);
      const target = pending.targets.get(id);
      if (!target?.runtime) continue;
      merge(id, target, 'pending', true);
      if (pending.full) verifyAll(`pending:${id}:full-runtime-verification`);
    }
  }
  if (bootstrap) {
    verifyAll('bootstrap');
    for (const { id } of components) addImpact(targets, id, true, 'bootstrap');
  }
  const unknown = new Set(unknownBaseIds);
  for (const id of unknown) {
    if (!index.byId.get(id)?.component) throw new TypeError(`Unknown component baseline id: ${id}`);
    verifyAll(`unknown-base:${id}`);
  }
  return {
    targets: components.filter(({ id }) => targets.has(id)).map(({ id }) => {
      const target = targets.get(id);
      const error = unknown.has(id) ? `Cannot publish ${id}: handled source baseline is unavailable; recover or explicitly establish it before publishing.` : undefined;
      return {
        id, runtime: target.runtime, test: target.test,
        publish: mode === 'main' && target.runtime && !error, full,
        ...(error ? { error } : {}), reasons: [...target.reasons].sort(),
      };
    }),
    full,
  };
}

function semver(value) {
  const match = typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/.exec(value);
  const prerelease = match?.[4]?.split('.') ?? [];
  const build = match?.[5]?.split('.') ?? [];
  if (!match || prerelease.some(part => !part || /^0\d+$/.test(part)) || build.some(part => !part)) throw new TypeError(`Invalid SemVer: ${value}`);
  return { core: match.slice(1, 4).map(part => BigInt(part)), prerelease };
}

/** Compare strict SemVer strings by precedence: -1, 0 or 1; ignore build metadata. Invalid input throws TypeError. */
export function compareSemver(a, b) {
  const left = semver(a);
  const right = semver(b);
  for (let index = 0; index < 3; index++) {
    if (left.core[index] !== right.core[index]) return left.core[index] < right.core[index] ? -1 : 1;
  }
  if (!left.prerelease.length || !right.prerelease.length) {
    return left.prerelease.length === right.prerelease.length ? 0 : left.prerelease.length ? -1 : 1;
  }
  for (let index = 0; index < Math.max(left.prerelease.length, right.prerelease.length); index++) {
    const x = left.prerelease[index];
    const y = right.prerelease[index];
    if (x === y) continue;
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xNumeric = /^\d+$/.test(x);
    const yNumeric = /^\d+$/.test(y);
    if (xNumeric && yNumeric) return BigInt(x) < BigInt(y) ? -1 : 1;
    if (xNumeric !== yNumeric) return xNumeric ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}
