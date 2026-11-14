import { describe, expect, it, vi } from 'vitest';
import type { GameHost } from '@carrick/game-sdk/game';
import type { GameModule } from '@carrick/game-sdk/catalog';
import { hasLocalInputPreparation, isLocalInputPreparationDeclaration, readLocalInputPreparation, LOCAL_INPUT_PREPARATION_PROTOCOL } from '../src/index';

const requirement = { protocol: LOCAL_INPUT_PREPARATION_PROTOCOL, version: 1, kind: 'files' };
const lifecycle = { protocol: 'carrick-game-lifecycle', version: 1, awaitsDestroy: true, report() {} };
const preparation = { ...requirement, begin: () => ({ report: () => false }) };
const moduleWith = (value: unknown) => ({ localInputPreparation: value }) as GameModule;

describe('optional release-module preparation declaration', () => {
  it('distinguishes a legacy absent export from a valid immutable opt-in', () => {
    expect(readLocalInputPreparation({} as GameModule)).toBeUndefined();
    const declaration = readLocalInputPreparation(moduleWith(requirement));
    expect(declaration).toEqual(requirement); expect(Object.isFrozen(declaration)).toBe(true);
    expect(declaration).not.toBe(requirement);
  });

  it.each([undefined, null, [], 'files', {}, { ...requirement, protocol: 'other' },
    { ...requirement, version: 2 }, { ...requirement, version: '1' }, { ...requirement, kind: 'directory' },
    { ...requirement, verified: true }, { ...requirement, [Symbol('extra')]: true }])('rejects present invalid/unknown declaration %j before mount', value => {
    expect(isLocalInputPreparationDeclaration(value)).toBe(false);
    expect(() => readLocalInputPreparation(moduleWith(value))).toThrow();
  });

  it('rejects executable getters without invoking them', () => {
    const getter = vi.fn(() => requirement);
    const module = Object.defineProperty({}, 'localInputPreparation', { get: getter });
    expect(() => readLocalInputPreparation(module as GameModule)).toThrow(); expect(getter).not.toHaveBeenCalled();
    const declaration = { ...requirement };
    Object.defineProperty(declaration, 'version', { get: getter });
    expect(isLocalInputPreparationDeclaration(declaration)).toBe(false); expect(getter).not.toHaveBeenCalled();
  });

  it('rejects an inherited declaration rather than silently treating it as legacy', () => {
    const module = Object.create({ localInputPreparation: requirement });
    expect(() => readLocalInputPreparation(module)).toThrow('Inherited');
  });
});

describe('independent preparation host capability', () => {
  it('requires safe-close support as well as the exact preparation protocol', () => {
    const host = { lifecycle, preparation } as unknown as GameHost;
    expect(hasLocalInputPreparation(host)).toBe(true);
    if (hasLocalInputPreparation(host)) expect(host.preparation.begin('file').report('awaiting-input')).toBe(false);
  });

  it.each([
    {}, { preparation }, { lifecycle },
    { lifecycle: { ...lifecycle, awaitsDestroy: false }, preparation },
    { lifecycle, preparation: null },
    { lifecycle, preparation: { ...preparation, protocol: 'other' } },
    { lifecycle, preparation: { ...preparation, version: 2 } },
    { lifecycle, preparation: { ...preparation, kind: 'other' } },
    { lifecycle, preparation: { ...preparation, begin: undefined } },
  ])('fails closed for unsupported host %j', host => {
    expect(hasLocalInputPreparation(host as unknown as GameHost)).toBe(false);
  });
});
