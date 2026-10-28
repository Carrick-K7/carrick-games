import { describe, expect, it, vi } from 'vitest';
import { compileClassicBundle } from '../src/classicBundle.js';
import { validateClassicBundle, CLASSIC_IMAGE_BUDGET } from '../src/classicValidation.js';
import { createImportedWorld, deployBase, build, stepWorld, validateWorld } from '../src/simulation.js';
import { classicFixtureFiles, fixtureLargeShp, fixturePalette } from './classicFixture.js';
import { pickTile, project, groundHeight } from '../src/renderer.js';

describe('playable local material bundles', () => {
  it('compiles actual tile images, ore positions and peaceful sprite bindings', async () => {
    const bundle = await compileClassicBundle(classicFixtureFiles(), { mapFile: 'fixture.map', label: 'Fixture' });
    expect(bundle.id).toMatch(/^[a-f0-9]{64}$/); expect(bundle.map?.spawn).toEqual({x:12,y:12});
    expect(bundle.map?.terrain[12 * 25 + 19]).toMatchObject({kind:'ore',ore:100});
    expect(bundle.buildings.power?.sourceName).toBe('gapowr.shp');
    expect(bundle.images['building:power']?.rgba.slice(0,4)).toEqual(new Uint8ClampedArray([255,0,125,255]));
    expect(bundle.map?.tiles.some(tile => tile.layer === 'ground')).toBe(true);
    expect(bundle.map?.tiles.some(tile => tile.layer === 'overlay' && tile.ore)).toBe(true);
    const world = createImportedWorld({mode:'homestead',economy:'classic'},bundle.map!,bundle.id);
    expect(deployBase(world)).toBe(true); expect(build(world,'power',16,12).ok).toBe(true); expect(build(world,'refinery',16,16).ok).toBe(true);
    for(let i=0;i<1800;i++) stepWorld(world,.1);
    expect(world.oreDelivered).toBeGreaterThan(0); expect(validateWorld(world)).toEqual(world);
  });
  it('gives identical resources the same identity after folder rename or unrelated files are added', async () => {
    const a = classicFixtureFiles(false), b = new Map([...a].map(([name,bytes]) => [`RENAMED/${name.toUpperCase()}`,bytes]));
    b.set('unrelated.shp',new Uint8Array([1,2,3]));
    const left = await compileClassicBundle(a), right = await compileClassicBundle(b);
    expect(left.id).toBe(right.id);
  });
  it('reports missing real map dependencies rather than substituting authored ground', async () => {
    const files = classicFixtureFiles(); files.delete('clear01.tem');
    await expect(compileClassicBundle(files,{mapFile:'fixture.map'})).rejects.toThrow(/clear01/);
    await expect(compileClassicBundle(new Map([['tanktur.vxl',new Uint8Array(1)]]))).rejects.toThrow('no-supported-peaceful-materials');
  });
  it('validates material cache image budgets and references before rendering', async () => {
    const bundle = await compileClassicBundle(classicFixtureFiles(false));
    expect(validateClassicBundle(structuredClone(bundle))).toEqual(bundle);
    const bad = structuredClone(bundle); bad.buildings.power!.image = 'missing'; expect(()=>validateClassicBundle(bad)).toThrow('classic-missing-image');
    const pixels = structuredClone(bundle); pixels.images['building:power']!.rgba = new Uint8ClampedArray(4); expect(()=>validateClassicBundle(pixels)).toThrow('classic-image-pixels');
    expect(CLASSIC_IMAGE_BUDGET).toBeLessThanOrEqual(128*1024*1024);
  });
  it('stops combined individually-valid large sprites at the shared image budget before hashing', async () => {
    const large = fixtureLargeShp(), files = new Map<string,Uint8Array>([['unittem.pal',fixturePalette()]]);
    for(const name of ['gacnst','gapowr','garefn','gaweap','cahse01','canewy01','cahosp'])files.set(`${name}.shp`,large);
    const hash = vi.spyOn(crypto.subtle,'digest');
    try { await expect(compileClassicBundle(files)).rejects.toThrow('classic-image-budget'); expect(hash).not.toHaveBeenCalled(); }
    finally { hash.mockRestore(); }
  });
  it('picks elevated original cells at the rendered height rather than the unraised plane', async () => {
    const bundle = await compileClassicBundle(classicFixtureFiles(),{mapFile:'fixture.map'});
    const world = createImportedWorld({mode:'session',economy:'classic'},bundle.map!,bundle.id);
    world.terrain[12*25+12]!.height=3;
    const camera={x:200,y:100,zoom:1.3}; const p=project(12.5,12.5,camera);p.y-=groundHeight(world,12,12)*15*camera.zoom;
    expect(pickTile(world,p.x,p.y,camera)).toEqual({x:12,y:12});
  });
});
