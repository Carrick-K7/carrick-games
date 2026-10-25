import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as T from 'three';
import { AuthoredWorld } from '../src/csAuthoredWorld.js';
import { AUTHORED_MAP_SOURCES, CLASSIC_MAPS } from '../src/csClassicMaps.js';
import { reflectMapDefinitionX } from '../src/csAuthoredSpace.js';

let world: AuthoredWorld;
beforeAll(async () => { world = new AuthoredWorld(new T.Scene(), { id: 'de_mirage' }); await world.load(); });
afterAll(() => world.dispose());

describe('Mirage authored-space handedness bake', () => {
  it('puts blue Mid/catwalk left and Connector right in an ordinary unmodified camera', () => {
    const camera = new T.PerspectiveCamera(75, 16 / 9, .1, 200);
    camera.position.set(2, 3.7, -19.5);camera.lookAt(2, 3.7, 10);camera.updateMatrixWorld(true);
    expect(new T.Vector3(13, 4, -5).project(camera).x).toBeLessThan(0);
    expect(new T.Vector3(14, 1.5, -9).project(camera).x).toBeLessThan(0);
    expect(new T.Vector3(-5, 3, -9).project(camera).x).toBeGreaterThan(0);
    const blue = world.architectureFeatures.find(f => f.type === 'blueMid' && f.axis === 'z');
    expect(blue).toMatchObject({ axis: 'z', line: 8, start: -5, end: 18 });
    expect(world.definition.portals.find(p => p.name === 'Connector').x).toBe(-5);
    expect(world.definition.platforms).toEqual(expect.arrayContaining([expect.objectContaining({ rect: [7, -13, 21, -5], height: .9 })]));
    expect(world.mapGroup.scale.toArray()).toEqual([1, 1, 1]);
    for (const mesh of world.mapGroup.children) expect(mesh.matrixWorld.determinant()).toBe(1);
  });

  it('transforms the complete public definition without mutating source authoring data', () => {
    const source = AUTHORED_MAP_SOURCES.de_mirage, runtime = CLASSIC_MAPS.de_mirage;
    expect(reflectMapDefinitionX(runtime)).toEqual(source);
    expect(source.sites[0].position[0]).toBe(27);
    expect(runtime.sites[0].position[0]).toBe(-27);
    expect(world.definition).toBe(runtime);
    expect(world.tacticalRoutes).toBe(runtime.routes);
    expect(world.landmarks).toBe(runtime.landmarks);
    expect(world.previewCamera).toEqual({ position: [2, 3.7, -18.5], target: [2, 3.7, 10], fov: 74 });
    expect(world.definition.stairs.find(s => s.rect[0] === 1 && s.rect[1] === -12).direction).toBe('+x');
    for (const team of ['t', 'ct']) for (let i = 0; i < source.spawns[team].length; i++) {
      const original = source.spawns[team][i], live = world.spawns[team][i];
      expect(live.pos.toArray()).toEqual([-original.position[0], original.position[1], original.position[2]]);
      expect(Math.sin(live.yaw)).toBeCloseTo(-Math.sin(original.yaw));
      expect(Math.cos(live.yaw)).toBeCloseTo(Math.cos(original.yaw));
      expect(world.buyZones.some(zone => zone.team === team && zone.box.containsPoint(live.pos))).toBe(true);
    }
    expect(world.locationAt(new T.Vector3(29, 0, 4))).toBe('B Apartments');
    expect(world.locationAt(world.bombSites[0].pos)).toBe('Bombsite A');
    expect(world.locationAt(world.bombSites[1].pos)).toBe('Bombsite B');
  });

  it('agrees on transformed floor cells, bounds, cylinder centers and collision grid', () => {
    const expected = new Set<string>();
    for (const [x0, z0, x1, z1] of world.definition.floors) for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) expected.add(`${x},${z}`);
    expect(world.floorCells).toEqual(expected);
    expect(world.bounds.minX).toBe(-43.5);expect(world.bounds.maxX).toBe(38.5);
    expect(world.center.x).toBe(-2.5);
    for (const collider of world.collisionBoxes) {
      expect(world.collisionBounds.containsBox(collider.box)).toBe(true);
      const center = collider.box.getCenter(new T.Vector3());
      expect([...world.localColliders(center.x, center.z, 0)]).toContain(collider);
      if (collider.cylinder) {
        expect(collider.cylinder.x).toBeCloseTo(center.x, 8);
        expect(collider.cylinder.z).toBeCloseTo(center.z, 8);
      }
    }
    const barrel = world.collisionBoxes.find(c => c.cylinder?.x === -35 && c.cylinder?.z === 36);
    expect(barrel).toBeDefined();
    const hit = world.raycast(new T.Vector3(-35, 3, 36), new T.Vector3(0, -1, 0), 4);
    expect(hit.collider).toBe(barrel);expect(hit.point.y).toBeCloseTo(1.3);
    expect(world.reachable.size).toBe(world.nodes.length);
    for (const node of world.nodes) expect(world.footprintSupported(node.x, node.z)).toBe(true);
  });

  it('keeps every nondegenerate triangle front-facing with reflected normals and metre UVs', () => {
    let incorrect = 0;
    const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), cross = new T.Vector3(), normal = new T.Vector3();
    for (const mesh of world.materialMeshes.values()) {
      const { position: p, normal: n, uv } = mesh.geometry.attributes;
      for (let i = 0; i < p.count; i += 3) {
        a.fromBufferAttribute(p, i);b.fromBufferAttribute(p, i + 1);c.fromBufferAttribute(p, i + 2);
        cross.crossVectors(b.sub(a), c.sub(a));
        normal.set(n.getX(i) + n.getX(i + 1) + n.getX(i + 2), n.getY(i) + n.getY(i + 1) + n.getY(i + 2), n.getZ(i) + n.getZ(i + 1) + n.getZ(i + 2));
        if (cross.lengthSq() > 1e-12 && cross.dot(normal) < -1e-7) incorrect++;
      }
      for (let i = 0; i < p.count; i += 31) {
        if(!mesh.userData.uvMeters){expect(uv.getX(i)).toBeGreaterThanOrEqual(0);expect(uv.getX(i)).toBeLessThanOrEqual(1);expect(uv.getY(i)).toBeGreaterThanOrEqual(0);expect(uv.getY(i)).toBeLessThanOrEqual(1);continue;}
        expect(uv.getX(i)).toBeCloseTo(Math.abs(n.getY(i)) > .6 ? p.getX(i) : Math.abs(n.getX(i)) > .6 ? p.getZ(i) : p.getX(i), 5);
        expect(uv.getY(i)).toBeCloseTo(Math.abs(n.getY(i)) > .6 ? p.getZ(i) : p.getY(i), 5);
      }
    }
    expect(incorrect).toBe(0);
  });

  it('generates a readable asymmetric B glyph after the world reflection', () => {
    const site = world.bombSites.find(s => s.id === 'B'), p = world.materialMeshes.get('brick').geometry.attributes.position;
    const left: number[] = [], right: number[] = [];
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(p.getY(i) - .034) > 1e-5) continue;
      if (Math.abs(p.getX(i) - (site.pos.x - .63)) < 1e-5) left.push(Math.abs(p.getZ(i) - site.pos.z));
      if (Math.abs(p.getX(i) - (site.pos.x + .63)) < 1e-5) right.push(Math.abs(p.getZ(i) - site.pos.z));
    }
    expect(Math.max(...left)).toBeCloseTo(.8, 4); // full left stem
    expect(Math.max(...right)).toBeCloseTo(.64, 4); // two shorter right lobes, NOT a mirrored stem
    expect(world.stats.drawCalls).toBeLessThanOrEqual(12);
    expect(world.stats.triangles).toBeLessThan(50000);
  });
});
