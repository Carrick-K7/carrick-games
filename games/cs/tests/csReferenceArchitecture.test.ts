import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as T from 'three';
import { AuthoredWorld } from '../src/csAuthoredWorld.js';

// Structural/physics regressions, NOT a substitute for parent-owned rendered
// comparisons against the inspected official reference images.
const worlds: Record<string, AuthoredWorld> = {};
beforeAll(async () => {
  for (const id of ['de_inferno', 'de_mirage']) {
    worlds[id] = new AuthoredWorld(new T.Scene(), { id });
    await worlds[id].load();
  }
});
afterAll(() => Object.values(worlds).forEach(w => w.dispose()));

function walk(w: AuthoredWorld, points: number[][]) {
  const body = { pos: new T.Vector3(points[0][0], points[0][1], points[0][2]), vy: 0, grounded: true };
  for (const raw of points.slice(1)) {
    const target = new T.Vector3(raw[0], raw[1], raw[2]);
    for (let i = 0; i < 650; i++) {
      const dx = target.x - body.pos.x, dz = target.z - body.pos.z, length = Math.hypot(dx, dz);
      if (length < .06 && Math.abs(body.pos.y - target.y) < .08) break;
      const step = Math.min(length, .1);
      w.move(body, length ? dx / length * step : 0, length ? dz / length * step : 0, 1 / 30);
      expect(w.canStand(body.pos.x, body.pos.y, body.pos.z)).toBe(true);
    }
    expect(body.pos.distanceTo(target), `Stopped at ${body.pos.toArray()} for ${raw}`).toBeLessThan(.1);
    expect(body.grounded).toBe(true);
  }
}

describe('reference-led original architecture', () => {
  it('authors broad named Inferno compositions instead of identical frontage tiles', () => {
    const w = worlds.de_inferno;
    const warehouse = w.architectureFeatures.find(f => f.name === 'A dual-arch warehouse');
    expect(warehouse).toMatchObject({ type: 'warehouse', start: 14, end: 29, height: 5.7 });
    expect(w.architectureFeatures).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'orangeApartment', height: 8.8 }),
      expect.objectContaining({ type: 'bananaHouse' }),
      expect.objectContaining({ type: 'twoTierStoneBelfry', height: 15 }),
    ]));
    // Two open belfry tiers above the solid lower stone shaft; no four-post cap.
    expect(w.lineClear(new T.Vector3(8, 8.7, -32), new T.Vector3(8, 8.7, -26))).toBe(false); // twin arches' centre pier
    expect(w.lineClear(new T.Vector3(7.15, 8.7, -32), new T.Vector3(7.15, 8.7, -26))).toBe(true);
    expect(w.lineClear(new T.Vector3(8, 12.7, -32), new T.Vector3(8, 12.7, -26))).toBe(true);
    const stoneMesh = w.materialMeshes.get('sandstone');
    expect(stoneMesh.geometry.attributes.position.count).toBeGreaterThan(1000);
    expect(w.definition.frontages.filter(f => f.height > 7).length).toBeGreaterThan(4);
  });

  it('separates the Mirage rectangular Window and pointed Connector profiles', () => {
    const w = worlds.de_mirage;
    expect(w.architectureFeatures).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Mid blue plaster landmark', type: 'blueMid' }),
      expect.objectContaining({ name: 'A north palace', type: 'palace' }),
      expect.objectContaining({ name: 'Window', type: 'portal', shape: 'rectangular' }),
      expect.objectContaining({ name: 'Connector', type: 'portal', shape: 'pointed' }),
      expect.objectContaining({ type: 'ordnance', x: -22, z: -16 }),
    ]));
    // High corner is open in a rectangle; the old rounded Window blocked it.
    expect(w.lineClear(new T.Vector3(.5, 3.7, -18), new T.Vector3(.5, 3.7, -16))).toBe(true);
    expect(w.lineClear(new T.Vector3(-4, 3.4, -9), new T.Vector3(-6, 3.4, -9))).toBe(true);
    expect(w.lineClear(new T.Vector3(-4, 3.4, -7.5), new T.Vector3(-6, 3.4, -7.5))).toBe(false);
  });

  it('gives Window a supported raised eye, visible blue front and street-facing Connector', () => {
    const w=worlds.de_mirage,eye=new T.Vector3(2,3.7,-19.5);
    expect(w.ground(2,-19.5,3)).toBeCloseTo(2.1);expect(w.canStand(2,2.101,-19.5)).toBe(true);
    expect(w.definition.portals.find(p=>p.name==='Window')).toMatchObject({sill:2.65,peak:4.75,opening:4});
    expect(w.definition.frontages).toEqual(expect.arrayContaining([expect.objectContaining({axis:'x',line:-5,start:8,end:18,type:'blueMid'})]));
    expect(w.definition.stairs).toEqual(expect.arrayContaining([expect.objectContaining({rect:[1,-12,4,-9],height:.9})]));
    // The old perpendicular 8m staircase is gone; Mid stays at street grade.
    expect(w.ground(2,-8,1)).toBe(0);expect(w.ground(6,8,2)).toBeCloseTo(.9);
    expect(w.lineClear(eye,new T.Vector3(10,4,-5.2))).toBe(true);
    expect(w.lineClear(eye,new T.Vector3(-4.6,3,-9))).toBe(true);
    const banana=worlds.de_inferno;
    expect(banana.canStand(-28,0,1)).toBe(true);
    expect(banana.raycast(new T.Vector3(-28,1.6,1),new T.Vector3(0,1,0),3)).toBeNull();
  });

  it('physically climbs both Inferno terrace stair approaches in both directions', () => {
    const w = worlds.de_inferno;
    walk(w, [[15, 0, -18], [21, .72, -18], [15, 0, -18]]);
    walk(w, [[22, 0, -9], [22, .72, -15], [22, 0, -9]]);
    expect(w.bombSites[0].pos.y).toBe(.72);
    expect(w.ground(22, -18, 1)).toBeCloseTo(.72);
    expect(w.ground(27, -10, .1)).toBe(0); // low pit/street remains lower
  });

  it('physically traverses lower Mid, raised catwalk and the rising T approach', () => {
    const w = worlds.de_mirage;
    walk(w, [[-1, 0, -10.5], [6, .9, -10.5], [6, .9, 16], [6, 0, 23], [6, .9, 16], [6, .9, -10.5], [-1, 0, -10.5]]);
    walk(w, [[19, 0, -18], [19, .9, -11], [19, 0, -18]]);
    walk(w, [[-1, 0, 5], [-1, .6, 15], [-1, 0, 27], [-1, .6, 15], [-1, 0, 5]]);
    expect(w.reachable.size).toBe(w.nodes.length);
    expect(w.nodes.some(n => Math.abs(n.y - .93) < .001)).toBe(true);
    expect(w.nodes.some(n => Math.abs(n.y - .63) < .001)).toBe(true);
  });

  it.each(['de_inferno', 'de_mirage'])('%s retains finite opaque geometry, static form shading and original budgets', id => {
    const w = worlds[id];
    expect(w.stats.drawCalls).toBeLessThanOrEqual(12);
    expect(w.stats.triangles).toBeLessThan(50000);
    for (const mesh of w.materialMeshes.values()) {
      const { position, normal, color } = mesh.geometry.attributes;
      expect([...position.array, ...normal.array, ...color.array].every(Number.isFinite)).toBe(true);
      expect(mesh.material.vertexColors).toBe(true);
      expect(mesh.material.transparent).toBe(false);
    }
    const colors = w.materialMeshes.get('plaster').geometry.attributes.color;
    expect(new Set(Array.from(colors.array).map(v => Math.round(v * 100))).size).toBeGreaterThan(15);
    expect(w.mapGroup.children.every(o => o.type === 'Mesh')).toBe(true); // no added dynamic lights
  });

  it.each(['de_inferno', 'de_mirage'])('%s bounds DDA even for huge finite or malformed requests', id => {
    const w = worlds[id],origin = new T.Vector3(0, 1, 0),dir = new T.Vector3(1, 0, 0);
    const cells = [...w.rayCells(origin, dir, 1e20)];
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBeLessThan(60);
    expect([...w.rayCells(origin, new T.Vector3(0, 1, 0), 1e20)]).toHaveLength(1);
    expect([...w.rayCells(origin, dir, Infinity)]).toHaveLength(0);
    expect(w.raycast(origin, new T.Vector3(NaN, 0, 1), 150)).toBeNull();
    expect(w.raycast(origin, dir, Infinity)).toBeNull();
    expect(w.raycast(origin, new T.Vector3(), 150)).toBeNull();
    // Outside-origin clipping must still hit the same real perimeter masonry.
    const far = w.raycast(new T.Vector3(-200, 1, 20), dir, 500);
    expect(far).not.toBeNull();
    expect(Number.isFinite(far.distance)).toBe(true);
  });
});
