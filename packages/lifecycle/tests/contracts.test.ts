import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hasGameLifecycle } from '../src/index';
import type { GameHost } from '@carrick/game-sdk/game';

const root = resolve(import.meta.dirname, '../../..');
const publicEntry = resolve(root, 'packages/lifecycle/src/index.ts');
const capability = { protocol: 'carrick-game-lifecycle', version: 1, awaitsDestroy: true, report() {} };

describe('public lifecycle extension', () => {
  it.each([undefined, null, {}, { ...capability, protocol: 'other' }, { ...capability, version: 2 },
    { ...capability, awaitsDestroy: false }, { ...capability, report: undefined }])('fails closed for missing/incompatible capability %j', lifecycle => {
    expect(hasGameLifecycle({ lifecycle } as unknown as GameHost)).toBe(false);
  });
  it('narrows a plain SDK host to the public optional capability', () => {
    const host = { lifecycle: capability } as unknown as GameHost;
    expect(hasGameLifecycle(host)).toBe(true);
    if (hasGameLifecycle(host)) host.lifecycle.report('stopped');
  });
  it('compiles real SDK Game/BaseGame assignments and the root export on TS 5.9', () => {
    const config = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    const filename = resolve(root, 'packages/lifecycle/tests/compile-contract.ts');
    const source = `
      import { BaseGame, type Game, type GameHost } from '@carrick/game-sdk/game';
      import type { GameModule } from '@carrick/game-sdk/catalog';
      import { hasGameLifecycle, hasLocalInputPreparation, readLocalInputPreparation, type LocalInputPreparationModule, type AwaitableDestroyGame, type LifecycleGameHost, type GameLifecycleState } from '@carrick/lifecycle';
      abstract class PersistentGame extends BaseGame implements AwaitableDestroyGame {
        override destroy(): Promise<void> { super.destroy(); return Promise.resolve(); }
      }
      declare const persistent: PersistentGame;
      declare const legacy: Game;
      const asSdk: Game = persistent;
      const asExtension: AwaitableDestroyGame = legacy;
      declare const host: GameHost;
      const optional: LifecycleGameHost = host;
      if (hasGameLifecycle(host)) {
        const exact: true = host.lifecycle.awaitsDestroy;
        host.lifecycle.report('loading'); host.lifecycle.report('running');
        host.lifecycle.report('stopped'); host.lifecycle.report('failed');
        // @ts-expect-error No game-specific state in the public contract.
        host.lifecycle.report('vm-ready');
        // @ts-expect-error The original lifecycle protocol is NOT extended.
        host.lifecycle.report('awaiting-input');
      }
      declare const gameModule: GameModule;
      const optIn: LocalInputPreparationModule = { ...gameModule, localInputPreparation: { protocol: 'carrick-local-input-preparation', version: 1, kind: 'files' } };
      const declaration = readLocalInputPreparation(optIn);
      if (hasLocalInputPreparation(host)) {
        const exact: true = host.lifecycle.awaitsDestroy;
        const accepted: boolean = host.preparation.begin('owned-files').report('awaiting-input');
        // @ts-expect-error No anonymous late binding to a future DOM element.
        host.preparation.begin();
        // @ts-expect-error Preparation is not gameplay running.
        host.preparation.begin('owned-files').report('running');
      }
      // @ts-expect-error Optional capability must be checked by consumers.
      optional.lifecycle.report('running');
      // @ts-expect-error Destroy acknowledgements must resolve without a value.
      const wrong: AwaitableDestroyGame = { ...legacy, destroy: () => Promise.resolve(1) };
      // @ts-expect-error Protocol versions are exact, never <= membership.
      const future: LifecycleGameHost = { ...host, lifecycle: { protocol: 'carrick-game-lifecycle', version: 2, awaitsDestroy: true, report() {} } };
    `;
    const options = { ...parsed.options, noEmit: true, baseUrl: root,
      paths: { '@carrick/lifecycle': ['packages/lifecycle/src/index.ts'] } };
    // Test-only alias follows the project's TS/Vite fixture convention; never
    // copies the SDK declarations or changes production package resolution.
    const compilerHost = ts.createCompilerHost(options);
    const original = compilerHost.getSourceFile.bind(compilerHost);
    compilerHost.getSourceFile = (path, languageVersion, onError, shouldCreateNewSourceFile) => path === filename
      ? ts.createSourceFile(path, source, languageVersion, true)
      : original(path, languageVersion, onError, shouldCreateNewSourceFile);
    const program = ts.createProgram([filename], options, compilerHost);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    expect(diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([]);
  }, 20_000);

  it('has only type SDK imports and no SDK implementation or environment side effects', () => {
    const source = readFileSync(publicEntry, 'utf8');
    const ast = ts.createSourceFile(publicEntry, source, ts.ScriptTarget.Latest, true);
    const imports = ast.statements.filter(ts.isImportDeclaration);
    expect(imports).toHaveLength(2);
    expect(imports.every(item => item.importClause?.isTypeOnly)).toBe(true);
    expect(imports.map(item => (item.moduleSpecifier as ts.StringLiteral).text).sort()).toEqual(['@carrick/game-sdk/catalog', '@carrick/game-sdk/game']);
    const emitted = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText;
    expect(emitted).not.toMatch(/\b(import|class|window|document|globalThis|indexedDB|requestAnimationFrame)\b/);
    const pkg = JSON.parse(readFileSync(resolve(root, 'packages/lifecycle/package.json'), 'utf8'));
    expect(pkg.name).toBe('@carrick/lifecycle');
    expect(pkg.exports['.']).toBe('./src/index.ts');
    expect(pkg.dependencies).toEqual({ '@carrick/game-sdk': '*' });
  });
});
