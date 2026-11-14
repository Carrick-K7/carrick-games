import { describe, expect, it, vi } from 'vitest';
import type { GameRelease } from '@carrick/game-sdk/catalog';
import { LOCAL_INPUT_PREPARATION_PROTOCOL } from '@carrick/lifecycle';
import { validateModule } from '../src/release-loader';

const release = { id: 'fixture', version: '1.0.0', apiVersion: 1 } as GameRelease;
const requirement = { protocol: LOCAL_INPUT_PREPARATION_PROTOCOL, version: 1, kind: 'files' };
describe('release preparation opt-in preflight', () => {
  it('keeps legacy modules and accepts an explicitly declared protocol without creating it', () => {
    const create = vi.fn(), legacy = { ...release, create }, opted = { ...legacy, localInputPreparation: requirement };
    expect(validateModule(legacy, release)).toBe(legacy);
    expect(validateModule(opted, release)).toBe(opted);
    expect(create).not.toHaveBeenCalled();
  });
  it.each([undefined, null, false, { ...requirement, version: 2 }, { ...requirement, kind: 'other' },
    { ...requirement, verified: true }])('rejects present invalid declaration %j before any create', declaration => {
    const create = vi.fn();
    expect(() => validateModule({ ...release, create, localInputPreparation: declaration }, release)).toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
