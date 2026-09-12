import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Source ownership is checked in the candidate's unit job, not against published shell games.
describe('Game rules', () => {
  test('Gacha shares photo artwork across revealed prizes and silhouettes for locked items', () => {
    const gachaSource = readFileSync(join(process.cwd(), 'games/gacha/src/gacha.ts'), 'utf8');
    const reelSource = readFileSync(join(process.cwd(), 'games/gacha/src/gachaModeCsgo.ts'), 'utf8');
    const profileSource = readFileSync(join(process.cwd(), 'packages/weapon-art/src/index.ts'), 'utf8');
    expect(gachaSource).not.toContain('gunImages');
    expect(gachaSource).toContain('drawWeaponIcon(ctx, iconId');
    expect(gachaSource.match(/drawWeaponPhoto/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(reelSource).toContain('drawWeaponPhoto');
    expect(profileSource).toContain('orthographic front');
    expect(profileSource).toContain('supersample');
  });
});
